import { prisma } from "../../config/prisma";

export async function removeEventMember(
  eventId: string,
  memberId: string,
  actorUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        organizationId: true,
      },
    });

    if (!event) {
      throw new Error("EVENT_NOT_FOUND");
    }

    const member = await tx.eventMember.findFirst({
      where: {
        id: memberId,
        eventId,
        status: { not: "REMOVED" },
      },
      select: {
        id: true,
        eventId: true,
        userId: true,
        role: true,
        status: true,
        transactionEnabled: true,
      },
    });

    if (!member) {
      throw new Error("EVENT_MEMBER_NOT_FOUND");
    }

    if (member.userId === actorUserId) {
      throw new Error("CANNOT_REMOVE_SELF");
    }

    if (member.role === "ADMIN" && member.status === "ACTIVE") {
      const activeAdminCount = await tx.eventMember.count({
        where: {
          eventId,
          role: "ADMIN",
          status: "ACTIVE",
        },
      });

      if (activeAdminCount <= 1) {
        throw new Error("CANNOT_REMOVE_LAST_EVENT_ADMIN");
      }
    }

    const removedMember = await tx.eventMember.update({
      where: { id: member.id },
      data: {
        status: "REMOVED",
        transactionEnabled: false,
      },
      select: {
        id: true,
        eventId: true,
        userId: true,
        role: true,
        status: true,
        transactionEnabled: true,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId,
        actorId: actorUserId,
        action: "EVENT_MEMBER_REMOVED",
        entityType: "EVENT_MEMBER",
        entityId: removedMember.id,
        metadata: {
          userId: removedMember.userId,
          previous: {
            role: member.role,
            status: member.status,
            transactionEnabled: member.transactionEnabled,
          },
          updated: {
            role: removedMember.role,
            status: removedMember.status,
            transactionEnabled: removedMember.transactionEnabled,
          },
        },
      },
    });

    return removedMember;
  });
}