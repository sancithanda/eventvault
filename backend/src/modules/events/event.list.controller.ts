
import type { Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { listOrganizationEvents } from "./event.list.service";

const organizationIdSchema = z.string().uuid();

export async function listOrganizationEventsHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const parsedId = organizationIdSchema.safeParse(
    req.params.organizationId,
  );

  if (!parsedId.success) {
    res.status(400).json({
      success: false,
      message: "Invalid organization ID",
    });
    return;
  }

  try {
    const events = await listOrganizationEvents(
      parsedId.data,
      userId,
    );

    res.status(200).json({
      success: true,
      data: events,
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "ORGANIZATION_ACCESS_DENIED"
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have access to this organization",
      });
      return;
    }

    console.error("Failed to list organization events:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

