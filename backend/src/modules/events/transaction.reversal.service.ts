
import { prisma } from "../../config/prisma";
import { canReverseFinancialTransaction } from "./financial.authorization";
type ReverseTransactionInput = {
  eventId: string;
  transactionId: string;
  userId: string;
  reason: string;
};

export async function reverseTransaction(
  input: ReverseTransactionInput,
) {
  const { eventId, transactionId, userId, reason } = input;

  return prisma.$transaction(async (tx) => {
    // Verify active event membership and transaction permission.
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

    // Locate the wallet for this event.
    const wallet = await tx.wallet.findUnique({
      where: { eventId },
      select: { id: true, status: true },
    });

    if (!wallet) {
      throw new Error("WALLET_NOT_FOUND");
    }

    if (wallet.status !== "ACTIVE") {
      throw new Error("WALLET_NOT_ACTIVE");
    }

    // Prevent reversals against closed or archived events.
    const event = await tx.event.findUnique({
  where: { id: eventId },
  select: {
    status: true,
    organizationId: true,
  },
});

    if (!event) {
      throw new Error("EVENT_NOT_FOUND");
    }

    if (event.status !== "ACTIVE") {
        throw new Error("EVENT_NOT_ACTIVE");
    }

    // Only reverse transactions belonging to this event's wallet.
    await tx.$queryRaw`
  SELECT id
  FROM transactions
  WHERE id = ${transactionId}::uuid
    AND wallet_id = ${wallet.id}::uuid
  FOR UPDATE
`;

const original = await tx.transaction.findFirst({
  where: { id: transactionId, walletId: wallet.id },
  select: {
    id: true,
    type: true,
    amountPaise: true,
    category: true,
    reversesId: true,
    reversedBy: { select: { id: true } },
  },
});

    if (!original) {
      throw new Error("TRANSACTION_NOT_FOUND");
    }

    // A reversal cannot itself be reversed by this endpoint.
    if (original.reversesId !== null) {
      throw new Error("CANNOT_REVERSE_REVERSAL");
    }

    // An original transaction may only be reversed once.
    if (original.reversedBy) {
      throw new Error("TRANSACTION_ALREADY_REVERSED");
    }

    const reversalType =
      original.type === "INCOME" ? "EXPENSE" : "INCOME";

    // The unique reversesId constraint also protects against duplicate
    // reversals at the database level.
    
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