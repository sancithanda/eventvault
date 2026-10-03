
import type { Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { listAuditLogs } from "./audit-log.list.service";

const uuidSchema = z.string().uuid();

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().min(1).max(100).optional(),
  actorId: z.string().uuid().optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
}).strict();

export async function listAuditLogsHandler(
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
  const queryResult = querySchema.safeParse(req.query);

  if (!organizationIdResult.success || !eventIdResult.success) {
    res.status(400).json({
      success: false,
      message: "Invalid organization ID or event ID",
    });
    return;
  }

  if (!queryResult.success) {
    res.status(400).json({
      success: false,
      message: "Invalid query parameters",
      errors: queryResult.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const result = await listAuditLogs({
      organizationId: organizationIdResult.data,
      eventId: eventIdResult.data,
      userId: req.userId,
      ...queryResult.data,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "EVENT_NOT_FOUND") {
      res.status(404).json({
        success: false,
        message: "Event not found in this organization",
      });
      return;
    }

    if (
      error instanceof Error &&
      error.message === "AUDIT_ACCESS_DENIED"
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to view these audit logs",
      });
      return;
    }

    console.error("List audit logs error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}