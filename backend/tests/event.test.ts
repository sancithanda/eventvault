
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";

const testEmail = `event-test-${randomUUID()}@example.com`;
const testPassword = "EventVault-Event-Test-2026";

let testUserId: string;
let token: string;
let organizationId: string;
let eventId: string;

describe("Event API", () => {
  beforeAll(async () => {
    const registration = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Event Test User",
        email: testEmail,
        password: testPassword,
      });

    expect(registration.status).toBe(201);
    testUserId = registration.body.data.user.id;

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testEmail, password: testPassword });

    expect(login.status).toBe(200);
    token = login.body.data.accessToken;

    const organizationResponse = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Event Test Organization" });

    expect(organizationResponse.status).toBe(201);
    organizationId = organizationResponse.body.data.organization.id;
  });

  afterAll(async () => {
    if (organizationId) {
      const events = await prisma.event.findMany({
        where: { organizationId },
        select: { id: true },
      });

      const eventIds = events.map((event) => event.id);

      await prisma.auditLog.deleteMany({
        where: { organizationId },
      });

      await prisma.transaction.deleteMany({
        where: {
          wallet: { eventId: { in: eventIds } },
        },
      });

      await prisma.eventMember.deleteMany({
        where: { eventId: { in: eventIds } },
      });

      await prisma.wallet.deleteMany({
        where: { eventId: { in: eventIds } },
      });

      await prisma.event.deleteMany({
        where: { organizationId },
      });

      await prisma.organizationMember.deleteMany({
        where: { organizationId },
      });

      await prisma.organization.deleteMany({
        where: { id: organizationId },
      });
    }

    if (testUserId) {
      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
    }

    await prisma.$disconnect();
  });

  it("rejects event creation without authentication", async () => {
    const response = await request(app)
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({ name: "Annual Fest" });

    expect(response.status).toBe(401);
  });

  it("rejects event creation with an invalid name", async () => {
    const response = await request(app)
      .post(`/api/v1/organizations/${organizationId}/events`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "A" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed");
  });

  it("creates an event with a wallet and audit log", async () => {
    const response = await request(app)
      .post(`/api/v1/organizations/${organizationId}/events`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Annual College Fest",
        description: "Event API integration test",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    const event = response.body.data.event;
    eventId = event.id;

    expect(event.name).toBe("Annual College Fest");
    expect(event.organizationId).toBe(organizationId);
    expect(event.status).toBe("DRAFT");
    expect(event.currency).toBe("INR");

    expect(event.wallet).toMatchObject({
      name: "Main Wallet",
      currency: "INR",
      status: "ACTIVE",
    });

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        eventId,
        action: "EVENT_CREATED",
      },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog?.actorId).toBe(testUserId);
  });


it("lists events belonging to the organization", async () => {
  const response = await request(app)
    .get(`/api/v1/organizations/${organizationId}/events`)
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);

  expect(response.body.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: eventId,
        name: "Annual College Fest",
        status: "DRAFT",
      }),
    ]),
  );
});

  it("activates a draft event and records the audit log", async () => {
    const response = await request(app)
      .patch(
        `/api/v1/organizations/${organizationId}/events/${eventId}/status`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.event.status).toBe("ACTIVE");

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        eventId,
        action: "EVENT_ACTIVATED",
      },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog?.actorId).toBe(testUserId);
  });

  it("rejects activating an event that is already active", async () => {
    const response = await request(app)
      .patch(
        `/api/v1/organizations/${organizationId}/events/${eventId}/status`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      "Only draft events can be activated",
    );
  });
});