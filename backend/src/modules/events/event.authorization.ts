
import { prisma } from "../../config/prisma";

export async function canCreateEvent(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    select: {
      role: true,
      status: true,
    },
  });

  return (
    membership?.status === "ACTIVE" &&
    (membership.role === "OWNER" || membership.role === "ADMIN")
  );
}