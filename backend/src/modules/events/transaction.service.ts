
import { prisma } from "../../config/prisma";

type CreateTransactionInput = {
  type: "INCOME" | "EXPENSE";
  amountPaise: number;
  category: string;
  description?: string;
};

export async function createTransaction(
  eventId: string,
  userId: string,
  input: CreateTransactionInput,
) {
  return prisma.$transaction(async (tx) => {
    // Verify that the event has a wallet and that it is active.
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

    if (!membership.transactionEnabled) {
      throw new Error("TRANSACTIONS_DISABLED");
    }

    // Prevent posting against a closed or archived event.
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
    // Store the amount as an integer number of paise.
    
const transaction = await tx.transaction.create({
  data: {
    walletId: wallet.id,
    createdBy: userId,
    type: input.type,
    amountPaise: BigInt(input.amountPaise),
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