
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";

const testEmail = `auth-test-${randomUUID()}@example.com`;
const testPassword = "EventVault-Test-Password-2026";

describe("Authentication API", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });

    await prisma.$disconnect();
  });

  it("rejects registration with invalid input", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "A",
        email: "invalid-email",
        password: "short",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Validation failed");
  });

  it("registers a new user without returning the password hash", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Auth Test User",
        email: testEmail,
        password: testPassword,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(testEmail);
    expect(response.body.data.user.name).toBe("Auth Test User");
    expect(response.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("rejects registration when the email already exists", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Duplicate Test User",
        email: testEmail,
        password: testPassword,
      });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
  });

  it("logs in with valid credentials and returns an access token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testEmail,
        password: testPassword,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.tokenType).toBe("Bearer");
    expect(response.body.data.expiresIn).toBe(900);
    expect(response.body.data).not.toHaveProperty("user.passwordHash");
  });

  it("rejects login with an incorrect password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testEmail,
        password: "Wrong-Password-2026",
      });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
  });

  it("rejects access to /me without a token", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Authentication required");
  });

  it("allows an authenticated user to access /me", async () => {
    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testEmail,
        password: testPassword,
      });

    expect(loginResponse.status).toBe(200);

    const token = loginResponse.body.data.accessToken as string;

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(testEmail);
    expect(response.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("rejects an invalid access token", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      "Invalid or expired access token",
    );
  });
});