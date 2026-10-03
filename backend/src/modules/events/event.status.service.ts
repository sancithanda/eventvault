
import { prisma } from "../../config/prisma";

export async function activateEvent(
  organizationId: string,
  eventId: string,
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.event.updateMany({
      where: {
        id: eventId,
        organizationId,
        status: "DRAFT",
      },
      data: {
        status: "ACTIVE",
      },
    });

    if (result.count === 0) {
      const event = await tx.event.findFirst({
        where: {
          id: eventId,
          organizationId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!event) {
        throw new Error("EVENT_NOT_FOUND");
      }

      throw new Error("EVENT_NOT_DRAFT");
    }

    const event = await tx.event.findFirstOrThrow({
      where: {
        id: eventId,
        organizationId,
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        status: true,
        currency: true,
        startDate: true,
        endDate: true,
        updatedAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        eventId,
        actorId,
        action: "EVENT_ACTIVATED",
        entityType: "EVENT",
        entityId: eventId,
        metadata: {
          previousStatus: "DRAFT",
          newStatus: "ACTIVE",
        },
      },
    });

    return event;
  });
}