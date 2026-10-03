
import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client";
import { reverseTransaction } from "./transaction.reversal.service";
import { reverseTransactionSchema } from "./transaction.reversal.validation";

export async function reverseTransactionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const eventId = req.params.eventId;
  const transactionId = req.params.transactionId;

  if (
    typeof eventId !== "string" ||
    typeof transactionId !== "string"
  ) {
    res.status(400).json({
      success: false,
      message: "Invalid route parameters",
    });
    return;
  }

  const parsed = reverseTransactionSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten(),
    });
    return;
  }

  if (!req.userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  try {
    const reversal = await reverseTransaction({
      eventId,
      transactionId,
      userId: req.userId,
      reason: parsed.data.reason,
    });

    res.status(201).json({
      success: true,
      message: "Transaction reversed successfully",
      data: {
        ...reversal,
        amountPaise: reversal.amountPaise.toString(),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        res.status(409).json({
          success: false,
          message: "This transaction has already been reversed",
        });
        return;
      }
    }

    if (error instanceof Error) {
      const errors: Record<
        string,
        { status: number; message: string }
      > = {
        EVENT_MEMBERSHIP_REQUIRED: {
          status: 403,
          message: "Active event membership required",
        },
        FINANCIAL_ROLE_FORBIDDEN: {
          status: 403,
          message: "Your event role does not permit this financial action",
        },
        TRANSACTIONS_DISABLED: {
          status: 403,
          message: "Transactions are disabled for this member",
        },
        WALLET_NOT_FOUND: {
          status: 404,
          message: "Wallet not found",
        },
        WALLET_NOT_ACTIVE: {
          status: 409,
          message: "Wallet is not active",
        },
        EVENT_NOT_FOUND: {
          status: 404,
          message: "Event not found",
        },
        EVENT_NOT_ACTIVE: {
          status: 409,
          message: "Event is not active",
        },
        TRANSACTION_NOT_FOUND: {
          status: 404,
          message: "Transaction not found in this wallet",
        },
        CANNOT_REVERSE_REVERSAL: {
          status: 409,
          message: "A reversal transaction cannot itself be reversed",
        },
        TRANSACTION_ALREADY_REVERSED: {
          status: 409,
          message: "This transaction has already been reversed",
        },
        INSUFFICIENT_FUNDS: {
        status: 409,
        message: "Insufficient wallet balance",
},
      };

      const mapped = errors[error.message];

      if (mapped) {
        res.status(mapped.status).json({
          success: false,
          message: mapped.message,
        });
        return;
      }

      console.error("Unmapped reversal error:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    } else {
      console.error("Unknown reversal error:", error);
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}