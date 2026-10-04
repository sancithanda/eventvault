
import { prisma } from "../../config/prisma";
import { canCreateFinancialTransaction } from "./financial.authorization";

type CreateTransactionInput = {
  type: "INCOME" | "EXPENSE";
  amountPaise: number;
  category: string;
  description?: string;
};

export async function createTransaction(
  organizationId: string,
  eventId: string,
  userId: string,
  input: CreateTransactionInput,
) {
  return prisma.$transaction(async (tx) => {
    // Confirm that the event belongs to the requested organization.
    const event = await tx.event.findFirst({
      where: {
        id: eventId,
        organizationId,
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
      },
    });

    if (!event) {
      throw new Error("EVENT_NOT_FOUND");
    }

    if (event.status !== "ACTIVE") {
      throw new Error("EVENT_NOT_ACTIVE");
    }

    // Verify that the event has an active wallet.
    const wallet = await tx.wallet.findUnique({
      where: { eventId },
      select: {
        id: true,
        status: true,
        currency: true,
      },
    });

    if (!wallet) {
      throw new Error("WALLET_NOT_FOUND");
    }

    if (wallet.status !== "ACTIVE") {
      throw new Error("WALLET_NOT_ACTIVE");
    }

    // Confirm the user is an active member of this event.
    const membership = await tx.eventMember.findUnique({
      where: {
        eventId_userId: { eventId, userId },
      },
      select: {
        status: true,
        transactionEnabled: true,
        role: true,
      },
    });

    if (!membership || membership.status !== "ACTIVE") {
      throw new Error("EVENT_MEMBERSHIP_REQUIRED");
    }

    if (!canCreateFinancialTransaction(membership.role)) {
      throw new Error("FINANCIAL_ROLE_FORBIDDEN");
    }

    if (!membership.transactionEnabled) {
      throw new Error("TRANSACTIONS_DISABLED");
    }

    // Serialize financial operations for this wallet.
    await tx.$queryRaw`
      SELECT id
      FROM wallets
      WHERE id = ${wallet.id}::uuid
      FOR UPDATE
    `;

    // Calculate the available balance from ledger entries.
    const totals = await tx.transaction.groupBy({
      by: ["type"],
      where: { walletId: wallet.id },
      _sum: { amountPaise: true },
    });

    const income = totals.find((item) => item.type === "INCOME");
    const expense = totals.find((item) => item.type === "EXPENSE");

    const availableBalance =
      (income?._sum.amountPaise ?? 0n) -
      (expense?._sum.amountPaise ?? 0n);

    const requestedAmount = BigInt(input.amountPaise);

    if (
      input.type === "EXPENSE" &&
      requestedAmount > availableBalance
    ) {
      throw new Error("INSUFFICIENT_FUNDS");
    }

    // Create the financial ledger entry.
    const transaction = await tx.transaction.create({
      data: {
        walletId: wallet.id,
        createdBy: userId,
        type: input.type,
        amountPaise: requestedAmount,
        category: input.category,
        description: input.description,
      },
      select: {
        id: true,
        walletId: true,
        createdBy: true,
        type: true,
        amountPaise: true,
        category: true,
        description: true,
        createdAt: true,
      },
    });

    // Record the action in the audit log.
    await tx.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId,
        actorId: userId,
        action: "TRANSACTION_CREATED",
        entityType: "TRANSACTION",
        entityId: transaction.id,
        metadata: {
          type: transaction.type,
          amountPaise: transaction.amountPaise.toString(),
          category: transaction.category,
          currency: wallet.currency,
        },
      },
    });

    return transaction;
  });
}