
import type { Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { canCreateEvent } from "./event.authorization";
import { activateEvent } from "./event.status.service";

const uuidSchema = z.string().uuid();

export async function activateEventHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  if (!req.userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const organizationIdResult = uuidSchema.safeParse(
    req.params.organizationId,
  );
  const eventIdResult = uuidSchema.safeParse(req.params.eventId);

  if (!organizationIdResult.success || !eventIdResult.success) {
    res.status(400).json({
      success: false,
      message: "Invalid organization ID or event ID",
    });
    return;
  }

  try {
    const organizationId = organizationIdResult.data;
    const eventId = eventIdResult.data;

    const allowed = await canCreateEvent(
      organizationId,
      req.userId,
    );

    if (!allowed) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to activate events in this organization",
      });
      return;
    }

const event = await activateEvent(
  organizationId,
  eventId,
  req.userId,
);
    res.status(200).json({
      success: true,
      message: "Event activated successfully",
      data: { event },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "EVENT_NOT_FOUND") {
      res.status(404).json({
        success: false,
        message: "Event not found in this organization",
      });
      return;
    }

    if (error instanceof Error && error.message === "EVENT_NOT_DRAFT") {
      res.status(409).json({
        success: false,
        message: "Only draft events can be activated",
      });
      return;
    }

    console.error("Activate event error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}