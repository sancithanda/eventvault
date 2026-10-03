
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";

const unique = randomUUID();
const ownerEmail = `transaction-owner-${unique}@example.com`;
const memberEmail = `transaction-member-${unique}@example.com`;
const outsiderEmail = `transaction-outsider-${unique}@example.com`;
const password = "EventVault-Transaction-Test-2026";

let ownerId: string;
let memberId: string;
let outsiderId: string;
let ownerToken: string;
let memberToken: string;
let outsiderToken: string;
let organizationId: string;
let eventId: string;
let walletId: string;
let originalTransactionId: string;

const base = () =>
  `/api/v1/organizations/${organizationId}/events/${eventId}`;

async function registerAndLogin(name: string, email: string) {
  const registration = await request(app)
    .post("/api/v1/auth/register")
    .send({ name, email, password });

  expect(registration.status).toBe(201);

  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password });

  expect(login.status).toBe(200);

  return {
    id: registration.body.data.user.id as string,
    token: login.body.data.accessToken as string,
  };
}

describe("Transaction API", () => {
  beforeAll(async () => {
    const owner = await registerAndLogin("Transaction Owner", ownerEmail);
    ownerId = owner.id;
    ownerToken = owner.token;

    const member = await registerAndLogin("Transaction Member", memberEmail);
    memberId = member.id;
    memberToken = member.token;

    const outsider = await registerAndLogin(
      "Transaction Outsider",
      outsiderEmail,
    );
    outsiderId = outsider.id;
    outsiderToken = outsider.token;

    const organization = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Transaction Test Organization" });

    expect(organization.status).toBe(201);
    organizationId = organization.body.data.organization.id;

    const event = await request(app)
      .post(`${baseOrganizationPath()}/events`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Transaction Test Event" });

    expect(event.status).toBe(201);
    eventId = event.body.data.event.id;
    walletId = event.body.data.event.wallet.id;

    await prisma.eventMember.createMany({
      data: [
        {
          eventId,
          userId: ownerId,
          role: "ADMIN",
          status: "ACTIVE",
          transactionEnabled: true,
          joinedAt: new Date(),
        },
        {
          eventId,
          userId: memberId,
          role: "ORGANIZER",
          status: "ACTIVE",
          transactionEnabled: true,
          joinedAt: new Date(),
        },
      ],
    });

    const activation = await request(app)
      .patch(`${base()}/status`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(activation.status).toBe(200);
  });

  afterAll(async () => {
    if (eventId) {
      await prisma.auditLog.deleteMany({ where: { eventId } });

      await prisma.transaction.deleteMany({
        where: { walletId },
      });

      await prisma.eventMember.deleteMany({ where: { eventId } });
      await prisma.wallet.deleteMany({ where: { eventId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
    }

    if (organizationId) {
      await prisma.organizationMember.deleteMany({
        where: { organizationId },
      });
      await prisma.organization.deleteMany({
        where: { id: organizationId },
      });
    }

    const userIds = [ownerId, memberId, outsiderId].filter(
      (id): id is string => Boolean(id),
    );

    if (userIds.length) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }

    await prisma.$disconnect();
  });

  it("rejects transaction creation without authentication", async () => {
    const response = await request(app)
      .post(`${base()}/transactions`)
      .send({
        type: "INCOME",
        amountPaise: 10000,
        category: "Sponsorship",
      });

    expect(response.status).toBe(401);
  });

  it("rejects invalid transaction data", async () => {
    const response = await request(app)
      .post(`${base()}/transactions`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        type: "INCOME",
        amountPaise: -100,
        category: "",
      });

    expect(response.status).toBe(400);
  });

  it("creates an income transaction and records an audit log", async () => {
    const response = await request(app)
      .post(`${base()}/transactions`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        type: "INCOME",
        amountPaise: 100000,
        category: "Sponsorship",
        description: "Main sponsor contribution",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.amountPaise).toBe("100000");
    expect(response.body.data.type).toBe("INCOME");

    originalTransactionId = response.body.data.id;

    const audit = await prisma.auditLog.findFirst({
      where: {
        eventId,
        action: "TRANSACTION_CREATED",
        entityId: originalTransactionId,
      },
    });

    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(memberId);
  });

  it("rejects transactions from a non-member", async () => {
    const response = await request(app)
      .post(`${base()}/transactions`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({
        type: "INCOME",
        amountPaise: 1000,
        category: "Donation",
      });

    expect(response.status).toBe(403);
  });

  it("creates an expense transaction", async () => {
    const response = await request(app)
      .post(`${base()}/transactions`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        type: "EXPENSE",
        amountPaise: 25000,
        category: "Decoration",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.type).toBe("EXPENSE");
    expect(response.body.data.amountPaise).toBe("25000");
  });

  it("lists transactions with pagination metadata", async () => {
    const response = await request(app)
      .get(`${base()}/transactions?page=1&limit=1`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.transactions).toHaveLength(1);
    expect(response.body.data.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
  });

  it("filters transactions by type", async () => {
    const response = await request(app)
      .get(`${base()}/transactions?type=INCOME`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.transactions.length).toBe(1);
    expect(response.body.data.transactions[0].type).toBe("INCOME");
  });

  it("filters transactions by category case-insensitively", async () => {
    const response = await request(app)
      .get(`${base()}/transactions?category=sPoNsOrShIp`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.transactions).toHaveLength(1);
    expect(response.body.data.transactions[0].category).toBe("Sponsorship");
  });

  it("rejects invalid transaction list query parameters", async () => {
    const response = await request(app)
      .get(`${base()}/transactions?page=0`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(response.status).toBe(400);
  });

  it("returns the correct wallet balance", async () => {
    const response = await request(app)
      .get(`${base()}/wallet`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.balancePaise).toBe("75000");
    expect(response.body.data.totalIncomePaise).toBe("100000");
    expect(response.body.data.totalExpensePaise).toBe("25000");
    expect(response.body.data.transactionCount).toBe(2);
  });

  it("rejects reversal requests with an invalid reason", async () => {
    const response = await request(app)
      .post(`${base()}/transactions/${originalTransactionId}/reverse`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ reason: "No" });

    expect(response.status).toBe(400);
  });

  it("reverses a transaction and offsets its balance impact", async () => {
    const response = await request(app)
      .post(`${base()}/transactions/${originalTransactionId}/reverse`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ reason: "Recorded against the wrong sponsor" });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.type).toBe("EXPENSE");
    expect(response.body.data.amountPaise).toBe("100000");
    expect(response.body.data.reversesId).toBe(originalTransactionId);
    expect(response.body.data.reversalReason).toBe(
      "Recorded against the wrong sponsor",
    );

    const balance = await request(app)
      .get(`${base()}/wallet`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(balance.status).toBe(200);
    expect(balance.body.data.balancePaise).toBe("-25000");
    expect(balance.body.data.totalIncomePaise).toBe("100000");
    expect(balance.body.data.totalExpensePaise).toBe("125000");
    expect(balance.body.data.transactionCount).toBe(3);

    const audit = await prisma.auditLog.findFirst({
      where: {
        eventId,
        action: "TRANSACTION_REVERSED",
        entityId: originalTransactionId,
      },
    });

    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(memberId);
  });

  it("prevents reversing the same transaction twice", async () => {
    const response = await request(app)
      .post(`${base()}/transactions/${originalTransactionId}/reverse`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ reason: "Attempted duplicate reversal" });

    expect(response.status).toBe(409);
  });

  it("prevents reversing a reversal transaction", async () => {
    const reversal = await prisma.transaction.findUniqueOrThrow({
      where: { reversesId: originalTransactionId },
      select: { id: true },
    });

    const response = await request(app)
      .post(`${base()}/transactions/${reversal.id}/reverse`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ reason: "Attempt to reverse a reversal" });

    expect(response.status).toBe(400);
  });

  it("rejects wallet access for a non-member", async () => {
    const response = await request(app)
      .get(`${base()}/wallet`)
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(response.status).toBe(403);
  });
});

function baseOrganizationPath() {
  return `/api/v1/organizations/${organizationId}`;
}