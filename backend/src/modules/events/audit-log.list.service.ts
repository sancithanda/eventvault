
import { prisma } from "../../config/prisma";

type ListAuditLogsInput = {
  organizationId: string;
  eventId: string;
  userId: string;
  page: number;
  limit: number;
  action?: string;
  actorId?: string;
  entityType?: string;
};

export async function listAuditLogs(input: ListAuditLogsInput) {
  const event = await prisma.event.findFirst({
    where: {
      id: input.eventId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
    },
  });

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  const [organizationMembership, eventMembership] = await Promise.all([
    prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: input.userId,
        },
      },
      select: {
        status: true,
      },
    }),
    prisma.eventMember.findUnique({
      where: {
        eventId_userId: {
          eventId: input.eventId,
          userId: input.userId,
        },
      },
      select: {
        status: true,
      },
    }),
  ]);

  const canViewAuditLogs =
    organizationMembership?.status === "ACTIVE" ||
    eventMembership?.status === "ACTIVE";

  if (!canViewAuditLogs) {
    throw new Error("AUDIT_ACCESS_DENIED");
  }

  const where = {
    organizationId: input.organizationId,
    eventId: input.eventId,
    ...(input.action ? { action: input.action } : {}),
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(input.entityType ? { entityType: input.entityType } : {}),
  };

  const [auditLogs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    auditLogs,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}