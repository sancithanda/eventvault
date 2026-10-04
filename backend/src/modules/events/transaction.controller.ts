
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { createTransactionSchema } from "./transaction.validation";
import { createTransaction } from "./transaction.service";

export async function createTransactionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const organizationId = req.params.organizationId;
  const eventId = req.params.eventId;
  const userId = req.userId;

  if (
    typeof organizationId !== "string" ||
    organizationId.length === 0
  ) {
    res.status(400).json({
      success: false,
      message: "Invalid organization ID",
    });
    return;
  }

  if (typeof eventId !== "string" || eventId.length === 0) {
    res.status(400).json({
      success: false,
      message: "Invalid event ID",
    });
    return;
  }

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const parsed = createTransactionSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid transaction data",
      errors: parsed.error.issues,
    });
    return;
  }

  try {
    const transaction = await createTransaction(
      organizationId,
      eventId,
      userId,
      parsed.data,
    );

    // BigInt cannot be serialized directly by JSON.stringify.
    res.status(201).json({
      success: true,
      data: {
        ...transaction,
        amountPaise: transaction.amountPaise.toString(),
      },
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: "Invalid transaction data",
      });
      return;
    }

    if (error instanceof Error) {
      const errors: Record<
        string,
        { status: number; message: string }
      > = {
        WALLET_NOT_FOUND: {
          status: 404,
          message: "Wallet not found",
        },
        EVENT_NOT_FOUND: {
          status: 404,
          message: "Event not found in this organization",
        },
        WALLET_NOT_ACTIVE: {
          status: 409,
          message: "Wallet is not active",
        },
        EVENT_NOT_ACTIVE: {
          status: 409,
          message: "Event is closed or archived",
        },
        EVENT_MEMBERSHIP_REQUIRED: {
          status: 403,
          message: "Active event membership is required",
        },
        FINANCIAL_ROLE_FORBIDDEN: {
          status: 403,
          message: "Your event role does not permit this financial action",
        },
        TRANSACTIONS_DISABLED: {
          status: 403,
          message: "Transaction permission is disabled",
        },
        INSUFFICIENT_FUNDS: {
          status: 409,
          message: "Insufficient wallet balance",
        },
      };

      const knownError = errors[error.message];

      if (knownError) {
        res.status(knownError.status).json({
          success: false,
          message: knownError.message,
        });
        return;
      }
    }

    console.error("Create transaction failed:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create transaction",
    });
  }
}