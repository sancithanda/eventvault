
import { prisma } from "../../config/prisma";

export async function canManageEventMembers(
  eventId: string,
  userId: string,
): Promise<boolean> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      organization: {
        select: {
          members: {
            where: {
              userId,
              status: "ACTIVE",
            },
            select: {
              role: true,
            },
          },
        },
      },
      members: {
        where: {
          userId,
          status: "ACTIVE",
        },
        select: {
          role: true,
        },
      },
    },
  });

  if (!event) {
    return false;
  }

  const organizationRole = event.organization.members[0]?.role;
  const eventRole = event.members[0]?.role;

  const isOrganizationAdmin =
    organizationRole === "OWNER" || organizationRole === "ADMIN";

  const isEventAdmin = eventRole === "ADMIN";

  return isOrganizationAdmin || isEventAdmin;
}

export async function canViewEventMembers(
  eventId: string,
  userId: string,
): Promise<boolean> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      organization: {
        select: {
          members: {
            where: {
              userId,
              status: "ACTIVE",
            },
            select: { id: true },
          },
        },
      },
      members: {
        where: {
          userId,
          status: "ACTIVE",
        },
        select: { id: true },
      },
    },
  });

  if (!event) {
    return false;
  }

  return (
    event.organization.members.length > 0 ||
    event.members.length > 0
  );
}