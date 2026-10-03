import { prisma } from "../../config/prisma";

type EventMemberRole =
  | "ADMIN"
  | "FINANCE_MANAGER"
  | "ORGANIZER"
  | "VIEWER";

type EventMemberUpdates = {
  role?: EventMemberRole;
  transactionEnabled?: boolean;
};

const eventMemberSelect = {
  id: true,
  eventId: true,
  userId: true,
  role: true,
  status: true,
  transactionEnabled: true,
  joinedAt: true,
  createdAt: true,
};

export async function addEventMember(
  eventId: string,
  userId: string,
  role: EventMemberRole,
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

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!user || user.status !== "ACTIVE") {
      throw new Error("USER_NOT_FOUND_OR_INACTIVE");
    }

    const existingMembership = await tx.eventMember.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (
      existingMembership &&
      existingMembership.status !== "REMOVED"
    ) {
      throw new Error("EVENT_MEMBER_ALREADY_EXISTS");
    }

    const member = existingMembership
      ? await tx.eventMember.update({
          where: { id: existingMembership.id },
          data: {
            role,
            status: "ACTIVE",
            transactionEnabled: true,
            joinedAt: new Date(),
          },
          select: eventMemberSelect,
        })
      : await tx.eventMember.create({
          data: {
            eventId,
            userId,
            role,
            status: "ACTIVE",
            transactionEnabled: true,
            joinedAt: new Date(),
          },
          select: eventMemberSelect,
        });

    await tx.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId,
        actorId: actorUserId,
        action: "EVENT_MEMBER_ADDED",
        entityType: "EVENT_MEMBER",
        entityId: member.id,
        metadata: {
          userId: member.userId,
          role: member.role,
          status: member.status,
          transactionEnabled: member.transactionEnabled,
          reactivated: Boolean(existingMembership),
        },
      },
    });

    return member;
  });
}

export async function listEventMembers(eventId: string) {
  return prisma.eventMember.findMany({
    where: {
      eventId,
      status: {
        not: "REMOVED",
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      eventId: true,
      userId: true,
      role: true,
      status: true,
      transactionEnabled: true,
      joinedAt: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function updateEventMember(
  eventId: string,
  memberId: string,
  updates: EventMemberUpdates,
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
        userId: true,
        role: true,
        status: true,
        transactionEnabled: true,
      },
    });

    if (!member) {
      throw new Error("EVENT_MEMBER_NOT_FOUND");
    }

    if (
      member.role === "ADMIN" &&
      updates.role !== undefined &&
      updates.role !== "ADMIN" &&
      member.status === "ACTIVE"
    ) {
      const activeAdminCount = await tx.eventMember.count({
        where: {
          eventId,
          role: "ADMIN",
          status: "ACTIVE",
        },
      });

      if (activeAdminCount <= 1) {
        throw new Error("CANNOT_DEMOTE_LAST_EVENT_ADMIN");
      }
    }

    const updatedMember = await tx.eventMember.update({
      where: { id: member.id },
      data: updates,
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
        action: "EVENT_MEMBER_UPDATED",
        entityType: "EVENT_MEMBER",
        entityId: updatedMember.id,
        metadata: {
          userId: updatedMember.userId,
          previous: {
            role: member.role,
            status: member.status,
            transactionEnabled: member.transactionEnabled,
          },
          updated: {
            role: updatedMember.role,
            status: updatedMember.status,
            transactionEnabled: updatedMember.transactionEnabled,
          },
        },
      },
    });

    return updatedMember;
  });
}