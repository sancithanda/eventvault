
import { prisma } from "../../config/prisma";
import type { CreateOrganizationInput } from "./organization.validation";

export async function createOrganization(
  input: CreateOrganizationInput,
  userId: string
) {
  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: input.name,
        creator: {
          connect: { id: userId },
        },
      },
      select: {
        id: true,
        name: true,
        createdBy: true,
        createdAt: true,
      },
    });

    await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId,
        role: "OWNER",
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });

    return organization;
  });
}