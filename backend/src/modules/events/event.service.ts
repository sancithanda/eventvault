
import { prisma } from "../../config/prisma";
import type { CreateEventInput } from "./event.validation";

export async function createEvent(
  input: CreateEventInput,
  organizationId: string,
  actorId: string
) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description,
        startDate: input.startDate
          ? new Date(input.startDate)
          : undefined,
        endDate: input.endDate
          ? new Date(input.endDate)
          : undefined,
        currency: input.currency,
        status: "DRAFT",
        
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        description: true,
        startDate: true,
        endDate: true,
        status: true,
        currency: true,
        createdAt: true,
        
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        eventId: event.id,
        actorId,
        action: "EVENT_CREATED",
        entityType: "EVENT",
        entityId: event.id,
        metadata: {
          name: event.name,
          status: event.status,
          currency: event.currency,
        },
      },
    });

    return event;
  });
}