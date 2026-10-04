
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";

const password = "EventVault-Transaction-Test-2026";

let ownerId = "";
let memberId = "";
let outsiderId = "";

let ownerToken = "";
let memberToken = "";
let outsiderToken = "";

let organizationId = "";
let eventId = "";
let walletId = "";
let originalTransactionId = "";

const organizationName = `Transaction Test Org ${Date.now()}`;

const base = () =>
  `/api/v1/organizations/${organizationId}/events/${eventId}`;

async function registerAndLogin(name: string) {
  const unique = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  const email = `${name.replace(/\s+/g, "").toLowerCase()}-${unique}@gmail.com`;

  const registerResponse = await request(app)
    .post("/api/v1/auth/register")
    .send({ name, email, password });

  expect(
    registerResponse.status,
    `Registration failed: ${JSON.stringify(registerResponse.body)}`,
  ).toBe(201);

  const loginResponse = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password });

  expect(
    loginResponse.status,
    `Login failed: ${JSON.stringify(loginResponse.body)}`,
  ).toBe(200);

  return {
    userId: loginResponse.body.data.user.id as string,
    token: loginResponse.body.data.accessToken as string,
  };
}

async function createIncomeTransaction(
  category: string,
): Promise<string> {
  const response = await request(app)
    .post(`${base()}/transactions`)
    .set("Authorization", `Bearer ${memberToken}`)
    .send({
      type: "INCOME",
      amountPaise: 10000,
      category,
      description: `Independent reversal test transaction: ${category}`,
    });

  expect(
    response.status,
    `Transaction creation failed: ${JSON.stringify(response.body)}`,
  ).toBe(201);

  return response.body.data.id as string;
}

describe("Transaction API", () => {
  beforeAll(async () => {
    const owner = await registerAndLogin("Transaction Owner");
    ownerId = owner.userId;
    ownerToken = owner.token;

    const member = await registerAndLogin("Transaction Organizer");
    memberId = member.userId;
    memberToken = member.token;

    const outsider = await registerAndLogin("Transaction Outsider");
    outsiderId = outsider.userId;
    outsiderToken = outsider.token;

    const organizationResponse = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: organizationName });

    expect(
      organizationResponse.status,
      `Organization creation failed: ${JSON.stringify(
        organizationResponse.body,
      )}`,
    ).toBe(201);

    organizationId = organizationResponse.body.data.organization.id;

    expect(
      organizationId,
      `Invalid organization ID: ${JSON.stringify(organizationResponse.body)}`,
    ).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const eventResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/events`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: `Transaction Test Event ${Date.now()}`,
        currency: "INR",
      });

    expect(
      eventResponse.status,
      `Event creation failed: ${JSON.stringify(eventResponse.body)}`,
    ).toBe(201);

    eventId = eventResponse.body.data.event.id;
    walletId = eventResponse.body.data.event.wallet.id;

    await prisma.eventMember.createMany({
      data: [
        {
          eventId,
          userId: ownerId,
          role: "ADMIN",
          status: "ACTIVE",
          transactionEnabled: true,
        },
        {
          eventId,
          userId: memberId,
          role: "ORGANIZER",
          status: "ACTIVE",
          transactionEnabled: true,
        },
      ],
    });

    const activateResponse = await request(app)
      .patch(`${base()}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send();

    expect(
      activateResponse.status,
      `Event activation failed: ${JSON.stringify(activateResponse.body)}`,
    ).toBe(200);

    originalTransactionId = await createIncomeTransaction(
      "Initial Funding",
    );
  });

  afterAll(async () => {
    try {
      if (!organizationId && ownerId) {
        const organization = await prisma.organization.findFirst({
          where: {
            name: organizationName,
            createdBy: ownerId,
          },
          select: { id: true },
        });

        organizationId = organization?.id ?? "";
      }

      const events = organizationId
        ? await prisma.event.findMany({
            where: { organizationId },
            select: { id: true },
          })
        : [];

      const eventIds = events.map((event) => event.id);

      if (eventId && !eventIds.includes(eventId)) {
        eventIds.push(eventId);
      }

      const wallets = eventIds.length
        ? await prisma.wallet.findMany({
            where: { eventId: { in: eventIds } },
            select: { id: true },
          })
        : [];

      const walletIds = new Set(wallets.map((wallet) => wallet.id));

      if (walletId) {
        walletIds.add(walletId);
      }

      if (eventIds.length > 0 || organizationId) {
        await prisma.auditLog.deleteMany({
          where: {
            OR: [
              ...(organizationId ? [{ organizationId }] : []),
              ...(eventIds.length ? [{ eventId: { in: eventIds } }] : []),
            ],
          },
        });
      }

      if (walletIds.size > 0) {
        await prisma.transaction.deleteMany({
          where: { walletId: { in: [...walletIds] } },
        });
      }

      if (eventIds.length > 0) {
        await prisma.eventMember.deleteMany({
          where: { eventId: { in: eventIds } },
        });

        await prisma.wallet.deleteMany({
          where: { eventId: { in: eventIds } },
        });

        await prisma.event.deleteMany({
          where: { id: { in: eventIds } },
        });
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

      if (userIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("rejects unauthenticated transaction creation", async () => {
    const response = await request(app)
      .post(`${base()}/transactions`)
      .send({
        type: "INCOME",
        amountPaise: 1000,
        category: "Funding",
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

  it("allows an organizer to create an income transaction and records an audit log", async () => {
    const response = await request(app)
      .post(`${base()}/transactions`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        type: "INCOME",
        amountPaise: 25000,
        category: "Ticket Sales",
        description: "Ticket revenue",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.type).toBe("INCOME");
    expect(response.body.data.amountPaise).toBe("25000");

    const audit = await prisma.auditLog.findFirst({
      where: {
        eventId,
        action: "TRANSACTION_CREATED",
        entityId: response.body.data.id,
      },
    });

    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(memberId);
  });

  it("allows an organizer to create an expense transaction", async () => {
    const response = await request(app)
      .post(`${base()}/transactions`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        type: "EXPENSE",
        amountPaise: 5000,
        category: "Refreshments",
        description: "Refreshments for attendees",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.type).toBe("EXPENSE");
    expect(response.body.data.amountPaise).toBe("5000");
  });

  it("rejects transaction creation by a user outside the event", async () => {
    const response = await request(app)
      .post(`${base()}/transactions`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({
        type: "INCOME",
        amountPaise: 1000,
        category: "Funding",
      });

    expect([403, 404]).toContain(response.status);
  });

  it("allows an organizer to list transactions with pagination", async () => {
    const response = await request(app)
      .get(`${base()}/transactions?page=1&limit=2`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.transactions).toHaveLength(2);
    expect(response.body.data.pagination).toMatchObject({
      page: 1,
      limit: 2,
    });
  });

  it("filters transactions by type", async () => {
    const response = await request(app)
      .get(`${base()}/transactions?type=INCOME`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.data.transactions.every(
        (transaction: { type: string }) => transaction.type === "INCOME",
      ),
    ).toBe(true);
  });

  it("filters transactions by category without case sensitivity", async () => {
    const response = await request(app)
      .get(`${base()}/transactions?category=tIcKeT sAlEs`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.transactions).toHaveLength(1);
    expect(response.body.data.transactions[0].category).toBe("Ticket Sales");
  });

  it("rejects invalid transaction list query parameters", async () => {
    const response = await request(app)
      .get(`${base()}/transactions?page=0&limit=1000`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(response.status).toBe(400);
  });

  it("allows an organizer to view the wallet balance", async () => {
    const response = await request(app)
      .get(`${base()}/wallet`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty("balancePaise");
    expect(response.body.data).toHaveProperty("totalIncomePaise");
    expect(response.body.data).toHaveProperty("totalExpensePaise");
    expect(response.body.data).toHaveProperty("transactionCount");
  });
    it("rejects transaction listing through a mismatched organization URL", async () => {
    const wrongOrganizationId =
      "00000000-0000-4000-8000-000000000001";

    const response = await request(app)
      .get(
        `/api/v1/organizations/${wrongOrganizationId}/events/${eventId}/transactions`,
      )
      .set("Authorization", `Bearer ${memberToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Event not found in this organization",
    );
  });

  it("rejects wallet balance access through a mismatched organization URL", async () => {
    const wrongOrganizationId =
      "00000000-0000-4000-8000-000000000001";

    const response = await request(app)
      .get(
        `/api/v1/organizations/${wrongOrganizationId}/events/${eventId}/wallet`,
      )
      .set("Authorization", `Bearer ${memberToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Event not found in this organization",
    );
  });

  it("rejects transaction creation through a mismatched organization URL", async () => {
    const wrongOrganizationId =
      "00000000-0000-4000-8000-000000000001";

    const beforeCount = await prisma.transaction.count({
      where: { walletId },
    });

    const response = await request(app)
      .post(
        `/api/v1/organizations/${wrongOrganizationId}/events/${eventId}/transactions`,
      )
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        type: "INCOME",
        amountPaise: 1000,
        category: "Wrong Organization Test",
        description: "Must not be created",
      });

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);

    const afterCount = await prisma.transaction.count({
      where: { walletId },
    });

    expect(afterCount).toBe(beforeCount);
  });

  it("rejects transaction reversal through a mismatched organization URL", async () => {
    const wrongOrganizationId =
      "00000000-0000-4000-8000-000000000001";

    const beforeCount = await prisma.transaction.count({
      where: { walletId },
    });

    const response = await request(app)
      .post(
        `/api/v1/organizations/${wrongOrganizationId}/events/${eventId}/transactions/${originalTransactionId}/reverse`,
      )
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ reason: "Wrong organization regression test" });

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);

    const afterCount = await prisma.transaction.count({
      where: { walletId },
    });

    expect(afterCount).toBe(beforeCount);

    const original = await prisma.transaction.findUnique({
      where: { id: originalTransactionId },
      select: { reversedBy: { select: { id: true } } },
    });

    expect(original?.reversedBy).toBeNull();
  });

  it("rejects reversal requests with an invalid reason", async () => {
    const response = await request(app)
      .post(`${base()}/transactions/${originalTransactionId}/reverse`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ reason: "" });

    expect(response.status).toBe(400);
  });

  it("rejects transaction reversal by an organizer", async () => {
    const response = await request(app)
      .post(`${base()}/transactions/${originalTransactionId}/reverse`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ reason: "Organizer reversal attempt" });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Your event role does not permit this financial action",
    );
  });

  it("allows an admin to reverse a transaction and records the correct actor", async () => {
    const transactionId = await createIncomeTransaction(
      "Admin Reversal Test",
    );

    const response = await request(app)
      .post(`${base()}/transactions/${transactionId}/reverse`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ reason: "Correcting the initial transaction" });

    expect(
      response.status,
      `Admin reversal failed: ${JSON.stringify(response.body)}`,
    ).toBe(201);

    expect(response.body.data.type).toBe("EXPENSE");
    expect(response.body.data.amountPaise).toBe("10000");
    expect(response.body.data.reversesId).toBe(transactionId);

    // The audit entry identifies the original transaction.
    const audit = await prisma.auditLog.findFirst({
      where: {
        eventId,
        action: "TRANSACTION_REVERSED",
        entityId: transactionId,
      },
    });

    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(ownerId);

    // The audit metadata should identify the newly created reversal.
    expect(audit?.metadata).toMatchObject({
      reversalTransactionId: response.body.data.id,
    });
  });

  it("prevents reversing the same transaction twice", async () => {
    const transactionId = await createIncomeTransaction(
      "Duplicate Reversal Test",
    );

    const firstResponse = await request(app)
      .post(`${base()}/transactions/${transactionId}/reverse`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ reason: "First reversal attempt" });

    expect(
      firstResponse.status,
      `First reversal failed: ${JSON.stringify(firstResponse.body)}`,
    ).toBe(201);

    const secondResponse = await request(app)
      .post(`${base()}/transactions/${transactionId}/reverse`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ reason: "Second reversal attempt" });

    expect(secondResponse.status).toBe(409);
  });

  it("prevents reversing a reversal transaction", async () => {
    const transactionId = await createIncomeTransaction(
      "Nested Reversal Test",
    );

    const reversalResponse = await request(app)
      .post(`${base()}/transactions/${transactionId}/reverse`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ reason: "Create reversal for nested reversal test" });

    expect(
      reversalResponse.status,
      `Initial reversal failed: ${JSON.stringify(reversalResponse.body)}`,
    ).toBe(201);

    const reversalId = reversalResponse.body.data.id;

    const nestedResponse = await request(app)
      .post(`${base()}/transactions/${reversalId}/reverse`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ reason: "Attempt nested reversal" });

    expect(
      nestedResponse.status,
      `Nested reversal should return 409: ${JSON.stringify(nestedResponse.body)}`,
    ).toBe(409);
  });
  
  it("serializes concurrent expenses so the wallet cannot be overspent", async () => {
    const balanceResponse = await request(app)
      .get(`${base()}/wallet`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(balanceResponse.status).toBe(200);

    const balance = BigInt(balanceResponse.body.data.balancePaise);
    expect(balance).toBeGreaterThan(1n);

    // Each request asks for slightly more than half the available balance.
    const amountPaise = Number(balance / 2n + 1n);

    const sendExpense = () =>
      request(app)
        .post(`${base()}/transactions`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({
          type: "EXPENSE",
          amountPaise,
          category: "Concurrent Expense Test",
        });

    const responses = await Promise.all([
      sendExpense(),
      sendExpense(),
    ]);

    expect(
      responses.map((response) => response.status).sort(),
    ).toEqual([201, 409]);

    const finalBalanceResponse = await request(app)
      .get(`${base()}/wallet`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(finalBalanceResponse.status).toBe(200);
    expect(BigInt(finalBalanceResponse.body.data.balancePaise))
      .toBeGreaterThanOrEqual(0n);
  });

  it("rejects an expense exceeding the balance without writing ledger or audit entries", async () => {
    const balanceResponse = await request(app)
      .get(`${base()}/wallet`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(balanceResponse.status).toBe(200);

    const balance = BigInt(balanceResponse.body.data.balancePaise);
    const amountPaise = Number(balance + 1n);

    const transactionsBefore = await prisma.transaction.count({
      where: { walletId },
    });

    const auditEntriesBefore = await prisma.auditLog.count({
      where: {
        eventId,
        action: "TRANSACTION_CREATED",
      },
    });

    const response = await request(app)
      .post(`${base()}/transactions`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        type: "EXPENSE",
        amountPaise,
        category: "Insufficient Funds Test",
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Insufficient wallet balance");

    const transactionsAfter = await prisma.transaction.count({
      where: { walletId },
    });

    const auditEntriesAfter = await prisma.auditLog.count({
      where: {
        eventId,
        action: "TRANSACTION_CREATED",
      },
    });

    expect(transactionsAfter).toBe(transactionsBefore);
    expect(auditEntriesAfter).toBe(auditEntriesBefore);
  });

  it("rejects reversing income when the remaining wallet balance is insufficient", async () => {
    const transactionId = await createIncomeTransaction(
      "Insufficient Reversal Test",
    );

    const balanceResponse = await request(app)
      .get(`${base()}/wallet`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(balanceResponse.status).toBe(200);

    const balance = BigInt(balanceResponse.body.data.balancePaise);
    expect(balance).toBeGreaterThan(0n);

    // Spend the entire available balance, leaving nothing to reverse
    // the income transaction into an expense.
    const spendResponse = await request(app)
      .post(`${base()}/transactions`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        type: "EXPENSE",
        amountPaise: Number(balance),
        category: "Balance Exhaustion Test",
      });

    expect(
      spendResponse.status,
      `Could not exhaust wallet balance: ${JSON.stringify(spendResponse.body)}`,
    ).toBe(201);

    const response = await request(app)
      .post(`${base()}/transactions/${transactionId}/reverse`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ reason: "Insufficient balance reversal test" });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Insufficient wallet balance");

    const reversal = await prisma.transaction.findFirst({
      where: { reversesId: transactionId },
    });

    expect(reversal).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: {
        eventId,
        action: "TRANSACTION_REVERSED",
        entityId: transactionId,
      },
    });

    expect(audit).toBeNull();
  });

  it("rejects wallet balance access by a user outside the event", async () => {
    const response = await request(app)
      .get(`${base()}/wallet`)
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect([403, 404]).toContain(response.status);
  });
});