
import { prisma } from "../../config/prisma";

type WalletBalanceInput = {
  organizationId: string;
  eventId: string;
  userId: string;
};

export async function getWalletBalance({
  organizationId,
  eventId,
  userId,
}: WalletBalanceInput) {
  // Verify that the event belongs to the requested organization.
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      organizationId,
    },
    select: {
      id: true,
    },
  });

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  // Only active event members may view the wallet balance.
  const membership = await prisma.eventMember.findUnique({
    where: {
      eventId_userId: { eventId, userId },
    },
    select: { status: true },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw new Error("EVENT_MEMBERSHIP_REQUIRED");
  }

  const wallet = await prisma.wallet.findUnique({
    where: { eventId },
    select: {
      id: true,
      name: true,
      currency: true,
      status: true,
      createdAt: true,
    },
  });

  if (!wallet) {
    throw new Error("WALLET_NOT_FOUND");
  }

  const totals = await prisma.transaction.groupBy({
    by: ["type"],
    where: { walletId: wallet.id },
    _sum: { amountPaise: true },
    _count: { _all: true },
  });

  const income = totals.find(
    (item) => item.type === "INCOME",
  );

  const expense = totals.find(
    (item) => item.type === "EXPENSE",
  );

  const totalIncome = income?._sum.amountPaise ?? 0n;
  const totalExpense = expense?._sum.amountPaise ?? 0n;

  return {
    wallet: {
      id: wallet.id,
      name: wallet.name,
      currency: wallet.currency,
      status: wallet.status,
      createdAt: wallet.createdAt,
    },
    balancePaise: (totalIncome - totalExpense).toString(),
    totalIncomePaise: totalIncome.toString(),
    totalExpensePaise: totalExpense.toString(),
    transactionCount:
      (income?._count._all ?? 0) +
      (expense?._count._all ?? 0),
  };
}