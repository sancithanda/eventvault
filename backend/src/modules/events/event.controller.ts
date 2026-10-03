
import type { Request, Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { canCreateEvent } from "./event.authorization";
import { createEventSchema } from "./event.validation";
import { createEvent } from "./event.service";

const organizationIdSchema = z.string().uuid();

export async function createEventHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const organizationIdResult = organizationIdSchema.safeParse(
    req.params.organizationId
  );

  if (!organizationIdResult.success) {
    res.status(400).json({
      success: false,
      message: "Invalid organization ID",
    });
    return;
  }

  const bodyResult = createEventSchema.safeParse(req.body);

  if (!bodyResult.success) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: bodyResult.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const allowed = await canCreateEvent(
      organizationIdResult.data,
      req.userId
    );

    if (!allowed) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to create events in this organization",
      });
      return;
    }

    const event = await createEvent(
  bodyResult.data,
  organizationIdResult.data,
  req.userId
);

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: { event },
    });
  } catch (error: unknown) {
    console.error("Create event error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}