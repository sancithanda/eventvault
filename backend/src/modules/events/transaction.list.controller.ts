
import type { Request, Response } from "express";
import { z } from "zod";
import { listTransactions } from "./transaction.list.service";

const listTransactionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    type: z.enum(["INCOME", "EXPENSE"]).optional(),
    category: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export async function listTransactionsHandler(
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

  const parsed = listTransactionsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid query parameters",
      errors: parsed.error.issues,
    });
    return;
  }

  try {
    const result = await listTransactions({
      organizationId,
      eventId,
      userId,
      ...parsed.data,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "EVENT_NOT_FOUND") {
        res.status(404).json({
          success: false,
          message: "Event not found in this organization",
        });
        return;
      }

      if (error.message === "EVENT_MEMBERSHIP_REQUIRED") {
        res.status(403).json({
          success: false,
          message: "Active event membership is required",
        });
        return;
      }

      if (error.message === "WALLET_NOT_FOUND") {
        res.status(404).json({
          success: false,
          message: "Wallet not found",
        });
        return;
      }
    }

    console.error("List transactions failed:", error);

    res.status(500).json({
      success: false,
      message: "Failed to list transactions",
    });
  }
}