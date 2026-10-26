
import { prisma } from "../../config/prisma";

export async function listOrganizationEvents(
  organizationId: string,
  userId: string,
) {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    select: {
      status: true,
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw new Error("ORGANIZATION_ACCESS_DENIED");
  }

  return prisma.event.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: "desc",
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
      
      _count: {
        select: {
          members: true,
        },
      },
    },
  });
}