
import { prisma } from "../../config/prisma";
import { canReverseFinancialTransaction } from "./financial.authorization";

type ReverseTransactionInput = {
  organizationId: string;
  eventId: string;
  transactionId: string;
  userId: string;
  reason: string;
};

export async function reverseTransaction(
  input: ReverseTransactionInput,
) {
  const {
    organizationId,
    eventId,
    transactionId,
    userId,
    reason,
  } = input;

  return prisma.$transaction(async (tx) => {
    // Verify that the event belongs to the requested organization.
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

    // Verify active event membership and reversal permission.
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

    if (!canReverseFinancialTransaction(membership.role)) {
      throw new Error("FINANCIAL_ROLE_FORBIDDEN");
    }

    if (!membership.transactionEnabled) {
      throw new Error("TRANSACTIONS_DISABLED");
    }

    // Locate and validate the event wallet.
    const wallet = await tx.wallet.findUnique({
      where: { eventId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!wallet) {
      throw new Error("WALLET_NOT_FOUND");
    }

    if (wallet.status !== "ACTIVE") {
      throw new Error("WALLET_NOT_ACTIVE");
    }

    // Serialize financial writes by locking the wallet first.
    await tx.$queryRaw`
      SELECT id
      FROM wallets
      WHERE id = ${wallet.id}::uuid
      FOR UPDATE
    `;

    // Lock the original transaction after the wallet lock.
    await tx.$queryRaw`
      SELECT id
      FROM transactions
      WHERE id = ${transactionId}::uuid
        AND wallet_id = ${wallet.id}::uuid
      FOR UPDATE
    `;

    const original = await tx.transaction.findFirst({
      where: {
        id: transactionId,
        walletId: wallet.id,
      },
      select: {
        id: true,
        type: true,
        amountPaise: true,
        category: true,
        reversesId: true,
        reversedBy: {
          select: { id: true },
        },
      },
    });

    if (!original) {
      throw new Error("TRANSACTION_NOT_FOUND");
    }

    if (original.reversesId !== null) {
      throw new Error("CANNOT_REVERSE_REVERSAL");
    }

    if (original.reversedBy) {
      throw new Error("TRANSACTION_ALREADY_REVERSED");
    }

    const reversalType =
      original.type === "INCOME" ? "EXPENSE" : "INCOME";

    // Reversing income creates an expense and must not overspend.
    if (reversalType === "EXPENSE") {
      const totals = await tx.transaction.groupBy({
        by: ["type"],
        where: { walletId: wallet.id },
        _sum: { amountPaise: true },
      });

      const income = totals.find(
        (item) => item.type === "INCOME",
      );
      const expense = totals.find(
        (item) => item.type === "EXPENSE",
      );

      const availableBalance =
        (income?._sum.amountPaise ?? 0n) -
        (expense?._sum.amountPaise ?? 0n);

      if (original.amountPaise > availableBalance) {
        throw new Error("INSUFFICIENT_FUNDS");
      }
    }

    const reversal = await tx.transaction.create({
      data: {
        walletId: wallet.id,
        createdBy: userId,
        type: reversalType,
        amountPaise: original.amountPaise,
        category: original.category,
        description: `Reversal of transaction ${original.id}`,
        reversesId: original.id,
        reversalReason: reason,
      },
      select: {
        id: true,
        walletId: true,
        createdBy: true,
        type: true,
        amountPaise: true,
        category: true,
        description: true,
        reversesId: true,
        reversalReason: true,
        createdAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId,
        actorId: userId,
        action: "TRANSACTION_REVERSED",
        entityType: "TRANSACTION",
        entityId: original.id,
        metadata: {
          reversalTransactionId: reversal.id,
          originalTransactionId: original.id,
          originalType: original.type,
          reversalType: reversal.type,
          amountPaise: reversal.amountPaise.toString(),
          reason,
        },
      },
    });

    return reversal;
  });
}