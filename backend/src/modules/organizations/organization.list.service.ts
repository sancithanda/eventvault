
import { prisma } from "../../config/prisma";

export async function listUserOrganizations(userId: string) {
  return prisma.organization.findMany({
    where: {
      members: {
        some: {
          userId,
          status: "ACTIVE",
        },
      },
    },
    select: {
      id: true,
      name: true,
      createdBy: true,
      createdAt: true,
      members: {
        where: {
          userId,
          status: "ACTIVE",
        },
        select: {
          role: true,
          status: true,
          joinedAt: true,
        },
      },
      _count: {
        select: {
          members: {
            where: {
              status: "ACTIVE",
            },
          },
          events: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}