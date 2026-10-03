
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";

describe("GET /health", () => {
  it("returns healthy when the database is connected", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      service: "EventVault API",
      status: "healthy",
      database: "connected",
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});