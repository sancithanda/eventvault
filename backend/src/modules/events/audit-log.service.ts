
import { prisma } from "../../config/prisma";

type CreateAuditLogInput = {
  organizationId: string;
  eventId?: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

export async function createAuditLog(
  input: CreateAuditLogInput,
  db: typeof prisma = prisma,
) {
  return db.auditLog.create({
    data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata
        ? JSON.parse(JSON.stringify(input.metadata))
        : undefined,
    },
  });
}