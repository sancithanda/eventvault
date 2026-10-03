
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";

const ownerEmail = `member-owner-${randomUUID()}@example.com`;
const memberEmail = `member-user-${randomUUID()}@example.com`;
const outsiderEmail = `member-outsider-${randomUUID()}@example.com`;
const password = "EventVault-Member-Test-2026";

let ownerId: string;
let memberUserId: string;
let outsiderId: string;
let ownerToken: string;
let outsiderToken: string;
let organizationId: string;
let eventId: string;
let memberId: string;

describe("Event Member API", () => {
  beforeAll(async () => {
    const ownerRegistration = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Member Test Owner",
        email: ownerEmail,
        password,
      });

    expect(ownerRegistration.status).toBe(201);
    ownerId = ownerRegistration.body.data.user.id;

    const memberRegistration = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Member Test User",
        email: memberEmail,
        password,
      });

    expect(memberRegistration.status).toBe(201);
    memberUserId = memberRegistration.body.data.user.id;

    const outsiderRegistration = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Member Test Outsider",
        email: outsiderEmail,
        password,
      });

    expect(outsiderRegistration.status).toBe(201);
    outsiderId = outsiderRegistration.body.data.user.id;

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ownerEmail, password });

    expect(login.status).toBe(200);
    ownerToken = login.body.data.accessToken;

    const outsiderLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: outsiderEmail, password });

    expect(outsiderLogin.status).toBe(200);
    outsiderToken = outsiderLogin.body.data.accessToken;

    const organizationResponse = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Member Test Organization" });

    expect(organizationResponse.status).toBe(201);
    organizationId =
      organizationResponse.body.data.organization.id;

    const eventResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/events`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Member Test Event" });

    expect(eventResponse.status).toBe(201);
    eventId = eventResponse.body.data.event.id;

    // Seed one existing event member for update, list, and removal tests.
    const existingMember = await prisma.eventMember.create({
      data: {
        eventId,
        userId: memberUserId,
        role: "ORGANIZER",
        status: "ACTIVE",
        transactionEnabled: true,
        joinedAt: new Date(),
      },
    });

    memberId = existingMember.id;
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.auditLog.deleteMany({
        where: { organizationId },
      });

      if (eventId) {
        await prisma.transaction.deleteMany({
          where: {
            wallet: { eventId },
          },
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

    const userIds = [ownerId, memberUserId, outsiderId].filter(
      (id): id is string => Boolean(id),
    );

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }

    await prisma.$disconnect();
  });

  it("rejects adding a member without authentication", async () => {
    const response = await request(app)
      .post(
        `/api/v1/organizations/${organizationId}/events/${eventId}/members`,
      )
      .send({ userId: outsiderId, role: "ORGANIZER" });

    expect(response.status).toBe(401);
  });

  it("rejects an invalid member request body", async () => {
    const response = await request(app)
      .post(
        `/api/v1/organizations/${organizationId}/events/${eventId}/members`,
      )
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ userId: "not-a-uuid", role: "ORGANIZER" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid request body");
  });

  it("rejects adding an existing event member", async () => {
    const response = await request(app)
      .post(
        `/api/v1/organizations/${organizationId}/events/${eventId}/members`,
      )
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ userId: memberUserId, role: "ORGANIZER" });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      "User is already a member of this event",
    );
  });

  it("lists active event members for an authorized user", async () => {
    const response = await request(app)
      .get(
        `/api/v1/organizations/${organizationId}/events/${eventId}/members`,
      )
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: memberId,
          userId: memberUserId,
          role: "ORGANIZER",
          status: "ACTIVE",
          user: expect.objectContaining({
            email: memberEmail,
          }),
        }),
      ]),
    );
  });

  it("rejects member listing for a user without access", async () => {
    const response = await request(app)
      .get(
        `/api/v1/organizations/${organizationId}/events/${eventId}/members`,
      )
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe(
      "You cannot view this event's members",
    );
  });

  it("updates a member's transaction permission", async () => {
    const response = await request(app)
      .patch(
        `/api/v1/organizations/${organizationId}/events/${eventId}/members/${memberId}`,
      )
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ transactionEnabled: false });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.transactionEnabled).toBe(false);

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        eventId,
        entityId: memberId,
        action: "EVENT_MEMBER_UPDATED",
      },
    });

    expect(auditLog).not.toBeNull();
  });

  it("rejects an empty member update", async () => {
    const response = await request(app)
      .patch(
        `/api/v1/organizations/${organizationId}/events/${eventId}/members/${memberId}`,
      )
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid request body");
  });

  it("removes a member without deleting the record", async () => {
    const response = await request(app)
      .delete(
        `/api/v1/organizations/${organizationId}/events/${eventId}/members/${memberId}`,
      )
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("REMOVED");
    expect(response.body.data.transactionEnabled).toBe(false);

    const storedMember = await prisma.eventMember.findUnique({
      where: { id: memberId },
    });

    expect(storedMember).not.toBeNull();
    expect(storedMember?.status).toBe("REMOVED");

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        eventId,
        entityId: memberId,
        action: "EVENT_MEMBER_REMOVED",
      },
    });

    expect(auditLog).not.toBeNull();
  });

  it("reactivates a removed member instead of creating a duplicate", async () => {
    const response = await request(app)
      .post(
        `/api/v1/organizations/${organizationId}/events/${eventId}/members`,
      )
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ userId: memberUserId, role: "VIEWER" });

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(memberId);
    expect(response.body.data.status).toBe("ACTIVE");
    expect(response.body.data.role).toBe("VIEWER");
    expect(response.body.data.transactionEnabled).toBe(true);

    const memberCount = await prisma.eventMember.count({
      where: { eventId, userId: memberUserId },
    });

    expect(memberCount).toBe(1);
  });

  it("rejects adding members from an unauthorized user", async () => {
    const response = await request(app)
      .post(
        `/api/v1/organizations/${organizationId}/events/${eventId}/members`,
      )
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ userId: outsiderId, role: "ORGANIZER" });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe(
      "You cannot manage event members",
    );
  });
});