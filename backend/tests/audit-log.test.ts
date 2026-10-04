
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";

const unique = randomUUID();
const password = "EventVault-Audit-Test-2026";

const ownerEmail = `audit-owner-${unique}@example.com`;
const memberEmail = `audit-member-${unique}@example.com`;
const outsiderEmail = `audit-outsider-${unique}@example.com`;

let ownerId: string;
let memberId: string;
let outsiderId: string;
let ownerToken: string;
let memberToken: string;
let outsiderToken: string;
let organizationId: string;
let eventId: string;
let walletId: string;

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

describe("Audit Log API", () => {
  beforeAll(async () => {
    const owner = await registerAndLogin("Audit Owner", ownerEmail);
    ownerId = owner.id;
    ownerToken = owner.token;

    const member = await registerAndLogin("Audit Member", memberEmail);
    memberId = member.id;
    memberToken = member.token;

    const outsider = await registerAndLogin(
      "Audit Outsider",
      outsiderEmail,
    );
    outsiderId = outsider.id;
    outsiderToken = outsider.token;

    const organization = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Audit Test Organization" });

    expect(organization.status).toBe(201);
    organizationId = organization.body.data.organization.id;

    const event = await request(app)
      .post(`/api/v1/organizations/${organizationId}/events`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Audit Test Event" });

    expect(event.status).toBe(201);
    eventId = event.body.data.event.id;
    walletId = event.body.data.event.wallet.id;

    await prisma.eventMember.create({
      data: {
        eventId,
        userId: memberId,
        role: "VIEWER",
        status: "ACTIVE",
        transactionEnabled: false,
        joinedAt: new Date(),
      },
    });

    await prisma.auditLog.createMany({
      data: [
        {
          organizationId,
          eventId,
          actorId: ownerId,
          action: "AUDIT_TEST_CREATED",
          entityType: "TEST_RECORD",
          entityId: randomUUID(),
          metadata: { testRecord: 1 },
        },
        {
          organizationId,
          eventId,
          actorId: memberId,
          action: "AUDIT_TEST_UPDATED",
          entityType: "TEST_RECORD",
          entityId: randomUUID(),
          metadata: { testRecord: 2 },
        },
        {
          organizationId,
          eventId,
          actorId: ownerId,
          action: "AUDIT_TEST_CREATED",
          entityType: "TEST_EVENT",
          entityId: randomUUID(),
          metadata: { testRecord: 3 },
        },
      ],
    });
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.auditLog.deleteMany({
        where: { organizationId },
      });

      if (eventId) {
        await prisma.transaction.deleteMany({
          where: { walletId },
        });

        await prisma.eventMember.deleteMany({
          where: { eventId },
        });

        await prisma.wallet.deleteMany({
          where: { eventId },
        });

        await prisma.event.deleteMany({
          where: { id: eventId },
        });
      }

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

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }

    await prisma.$disconnect();
  });

  it("rejects requests without authentication", async () => {
    const response = await request(app).get(`${base()}/audit-logs`);

    expect(response.status).toBe(401);
  });

  it("rejects invalid organization and event IDs", async () => {
    const response = await request(app)
      .get(`/api/v1/organizations/invalid/events/${eventId}/audit-logs`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Invalid organization ID or event ID",
    );
  });

  it("rejects invalid query parameters", async () => {
    const response = await request(app)
      .get(`${base()}/audit-logs?page=0&limit=101`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid query parameters");
  });

  it("allows an active organization owner to view audit logs", async () => {
    const response = await request(app)
      .get(`${base()}/audit-logs`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.auditLogs).toHaveLength(4);
    expect(response.body.data.pagination.total).toBe(4);
  });

it("denies a regular active event member from viewing audit logs", async () => {
  const response = await request(app)
    .get(`${base()}/audit-logs`)
    .set("Authorization", `Bearer ${memberToken}`);

  expect(response.status).toBe(403);
  expect(response.body.message).toBe(
    "You do not have permission to view these audit logs",
  );
});
  it("denies users without active membership", async () => {
    const response = await request(app)
      .get(`${base()}/audit-logs`)
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe(
      "You do not have permission to view these audit logs",
    );
  });

  it("returns only records matching the action filter", async () => {
    const response = await request(app)
      .get(`${base()}/audit-logs?action=AUDIT_TEST_CREATED`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.auditLogs).toHaveLength(2);

    expect(
      response.body.data.auditLogs.every(
        (log: { action: string }) => log.action === "AUDIT_TEST_CREATED",
      ),
    ).toBe(true);

    expect(response.body.data.pagination.total).toBe(2);
  });

  it("filters audit logs by actor ID", async () => {
    const response = await request(app)
      .get(`${base()}/audit-logs`)
      .query({ actorId: memberId })
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.auditLogs).toHaveLength(1);
    expect(response.body.data.auditLogs[0].actorId).toBe(memberId);
  });

  it("filters audit logs by entity type", async () => {
    const response = await request(app)
      .get(`${base()}/audit-logs`)
      .query({ entityType: "TEST_RECORD" })
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.auditLogs).toHaveLength(2);

    expect(
      response.body.data.auditLogs.every(
        (log: { entityType: string }) => log.entityType === "TEST_RECORD",
      ),
    ).toBe(true);
  });

  it("supports pagination", async () => {
    const response = await request(app)
      .get(`${base()}/audit-logs?page=1&limit=2`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.auditLogs).toHaveLength(2);

    expect(response.body.data.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 4,
      totalPages: 2,
    });
  });

  it("returns 404 when the event does not belong to the organization", async () => {
    const otherOrganizationId = randomUUID();

    const response = await request(app)
      .get(
        `/api/v1/organizations/${otherOrganizationId}/events/${eventId}/audit-logs`,
      )
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe(
      "Event not found in this organization",
    );
  });
});