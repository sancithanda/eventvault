
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";

const testEmail = `org-test-${randomUUID()}@example.com`;
const testPassword = "EventVault-Org-Test-2026";

let testUserId: string;
let token: string;
let organizationId: string;

describe("Organization API", () => {
  beforeAll(async () => {
    const registration = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Organization Test User",
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
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.organizationMember.deleteMany({
        where: { userId: testUserId },
      });

      await prisma.organization.deleteMany({
        where: { createdBy: testUserId },
      });

      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
    }

    await prisma.$disconnect();
  });

  it("rejects organization creation without authentication", async () => {
    const response = await request(app)
      .post("/api/v1/organizations")
      .send({ name: "Test Organization" });

    expect(response.status).toBe(401);
  });

  it("rejects organization listing without authentication", async () => {
    const response = await request(app).get("/api/v1/organizations");

    expect(response.status).toBe(401);
  });

  it("rejects organization creation with invalid input", async () => {
    const response = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "A" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed");
  });

  it("creates an organization and assigns the creator as OWNER", async () => {
    const response = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "EventVault Test Organization" });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    const organization = response.body.data.organization;
    organizationId = organization.id;

    expect(organization.name).toBe("EventVault Test Organization");
    expect(organization.createdBy).toBe(testUserId);

    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: testUserId,
        },
      },
    });

    expect(membership?.role).toBe("OWNER");
    expect(membership?.status).toBe("ACTIVE");
  });

  it("lists the organization for its active member", async () => {
    const response = await request(app)
      .get("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.organizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: organizationId,
          name: "EventVault Test Organization",
        }),
      ]),
    );
  });
});