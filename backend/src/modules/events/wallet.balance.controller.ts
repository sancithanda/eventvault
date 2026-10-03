
import type { Request, Response } from "express";
import { getWalletBalance } from "./wallet.balance.service";

export async function getWalletBalanceHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const eventId = req.params.eventId;
  const userId = req.userId;

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

  try {
    const balance = await getWalletBalance({
      eventId,
      userId,
    });

    res.status(200).json({
      success: true,
      data: balance,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
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

    console.error("Get wallet balance failed:", error);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve wallet balance",
    });
  }
}