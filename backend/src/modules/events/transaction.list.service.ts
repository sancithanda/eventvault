
import { prisma } from "../../config/prisma";

type ListTransactionsInput = {
  eventId: string;
  userId: string;
  page: number;
  limit: number;
  type?: "INCOME" | "EXPENSE";
  category?: string;
};

export async function listTransactions(
  input: ListTransactionsInput,
) {
  const {
    eventId,
    userId,
    page,
    limit,
    type,
    category,
  } = input;

  // Confirm that the requester is an active event member.
  const membership = await prisma.eventMember.findUnique({
    where: {
      eventId_userId: { eventId, userId },
    },
    select: {
      status: true,
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw new Error("EVENT_MEMBERSHIP_REQUIRED");
  }

  // Find the wallet belonging to this event.
  const wallet = await prisma.wallet.findUnique({
    where: { eventId },
    select: { id: true },
  });

  if (!wallet) {
    throw new Error("WALLET_NOT_FOUND");
  }

  const where = {
    walletId: wallet.id,
    ...(type ? { type } : {}),
    ...(category
      ? {
          category: {
            equals: category,
            mode: "insensitive" as const,
          },
        }
      : {}),
  };

  const skip = (page - 1) * limit;

  const [transactions, total] = await prisma.$transaction([
    prisma.transaction.findMany({
      where,
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      skip,
      take: limit,
      select: {
        id: true,
        walletId: true,
        createdBy: true,
        type: true,
        amountPaise: true,
        category: true,
        description: true,
        reversesId: true,
        createdAt: true,
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    transactions: transactions.map((transaction) => ({
      ...transaction,
      amountPaise: transaction.amountPaise.toString(),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}