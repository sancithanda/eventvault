
import type { Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import {
  canManageEventMembers,
  canViewEventMembers,
} from "./event-member.authorization";
import {
  addEventMember,
  listEventMembers,
  updateEventMember,
} from "./event-member.service";
import {
  addEventMemberSchema,
  updateEventMemberSchema,
} from "./event-member.validation";
import { removeEventMember } from "./event-member.remove.service";

const uuidSchema = z.string().uuid();

async function validateEventScope(
  organizationId: string,
  eventId: string,
): Promise<boolean> {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      organizationId,
    },
    select: { id: true },
  });

  return event !== null;
}

function handleServerError(res: Response, error: unknown): void {
  console.error("Event membership request failed:", error);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

export async function addEventMemberHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const userId = req.userId;

  const organizationId = uuidSchema.safeParse(
    req.params.organizationId,
  );
  const eventId = uuidSchema.safeParse(req.params.eventId);
  const body = addEventMemberSchema.safeParse(req.body);

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  if (!organizationId.success || !eventId.success) {
    res.status(400).json({
      success: false,
      message: "Invalid organization or event ID",
    });
    return;
  }

  if (!body.success) {
    res.status(400).json({
      success: false,
      message: "Invalid request body",
      errors: body.error.issues,
    });
    return;
  }

  try {
    const inScope = await validateEventScope(
      organizationId.data,
      eventId.data,
    );

    if (!inScope) {
      res.status(404).json({
        success: false,
        message: "Event not found in this organization",
      });
      return;
    }

    const allowed = await canManageEventMembers(
      eventId.data,
      userId,
    );

    if (!allowed) {
      res.status(403).json({
        success: false,
        message: "You cannot manage event members",
      });
      return;
    }

    // Only organization owners and admins can assign the event ADMIN role.
    if (body.data.role === "ADMIN") {
      const organizationMembership =
        await prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: organizationId.data,
              userId,
            },
          },
          select: {
            role: true,
            status: true,
          },
        });

      const isOrganizationAdmin =
        organizationMembership?.status === "ACTIVE" &&
        (
          organizationMembership.role === "OWNER" ||
          organizationMembership.role === "ADMIN"
        );

      if (!isOrganizationAdmin) {
        res.status(403).json({
          success: false,
          message:
            "Only organization owners or admins can assign the event ADMIN role",
        });
        return;
      }
    }

    const member = await addEventMember(
  eventId.data,
  body.data.userId,
  body.data.role,
  userId,
);

    res.status(201).json({
      success: true,
      data: member,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "EVENT_NOT_FOUND") {
        res.status(404).json({
          success: false,
          message: "Event not found",
        });
        return;
      }

      if (error.message === "USER_NOT_FOUND_OR_INACTIVE") {
        res.status(404).json({
          success: false,
          message: "Active user not found",
        });
        return;
      }

      if (error.message === "EVENT_MEMBER_ALREADY_EXISTS") {
        res.status(409).json({
          success: false,
          message: "User is already a member of this event",
        });
        return;
      }
    }

    handleServerError(res, error);
  }
}

export async function listEventMembersHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const userId = req.userId;
  const organizationId = uuidSchema.safeParse(
    req.params.organizationId,
  );
  const eventId = uuidSchema.safeParse(req.params.eventId);

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  if (!organizationId.success || !eventId.success) {
    res.status(400).json({
      success: false,
      message: "Invalid organization or event ID",
    });
    return;
  }

  try {
    const inScope = await validateEventScope(
      organizationId.data,
      eventId.data,
    );

    if (!inScope) {
      res.status(404).json({
        success: false,
        message: "Event not found in this organization",
      });
      return;
    }

    const allowed = await canViewEventMembers(
      eventId.data,
      userId,
    );

    if (!allowed) {
      res.status(403).json({
        success: false,
        message: "You cannot view this event's members",
      });
      return;
    }

    const members = await listEventMembers(eventId.data);

    res.status(200).json({
      success: true,
      data: members,
    });
  } catch (error: unknown) {
    handleServerError(res, error);
  }
}


export async function updateEventMemberHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const userId = req.userId;

  const organizationId = uuidSchema.safeParse(
    req.params.organizationId,
  );
  const eventId = uuidSchema.safeParse(req.params.eventId);
  const memberId = uuidSchema.safeParse(req.params.memberId);
  const body = updateEventMemberSchema.safeParse(req.body);

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  if (
    !organizationId.success ||
    !eventId.success ||
    !memberId.success
  ) {
    res.status(400).json({
      success: false,
      message: "Invalid organization, event, or member ID",
    });
    return;
  }

  if (!body.success) {
    res.status(400).json({
      success: false,
      message: "Invalid request body",
      errors: body.error.issues,
    });
    return;
  }

  try {
    const inScope = await validateEventScope(
      organizationId.data,
      eventId.data,
    );

    if (!inScope) {
      res.status(404).json({
        success: false,
        message: "Event not found in this organization",
      });
      return;
    }
    const allowed = await canManageEventMembers(
      eventId.data,
      userId,
    );

    if (!allowed) {
      res.status(403).json({
        success: false,
        message: "You cannot manage event members",
      });
      return;
    }

    // Find the member being updated.
    const targetMember = await prisma.eventMember.findFirst({
      where: {
        id: memberId.data,
        eventId: eventId.data,
        status: { not: "REMOVED" },
      },
      select: {
        userId: true,
        role: true,
      },
    });

    if (!targetMember) {
      res.status(404).json({
        success: false,
        message: "Event member not found",
      });
      return;
    }

    // Check whether the person making the request is an organization owner/admin.
    const organizationMembership =
      await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: organizationId.data,
            userId,
          },
        },
        select: {
          role: true,
          status: true,
        },
      });

    const isOrganizationAdmin =
      organizationMembership?.status === "ACTIVE" &&
      (
        organizationMembership.role === "OWNER" ||
        organizationMembership.role === "ADMIN"
      );

    // Event admins cannot modify another event admin.
    if (
      targetMember.role === "ADMIN" &&
      !isOrganizationAdmin
    ) {
      res.status(403).json({
        success: false,
        message:
          "Only organization owners or admins can modify an event admin",
      });
      return;
    }

    // Event admins cannot promote members to ADMIN.
    if (
      body.data.role === "ADMIN" &&
      !isOrganizationAdmin
    ) {
      res.status(403).json({
        success: false,
        message:
          "Only organization owners or admins can assign the event ADMIN role",
      });
      return;
    }

    // Update the existing member; do not add a new member here.
    const member = await updateEventMember(
  eventId.data,
  memberId.data,
  body.data,
  userId,
);

    res.status(200).json({
      success: true,
      data: member,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "EVENT_MEMBER_NOT_FOUND") {
        res.status(404).json({
          success: false,
          message: "Event member not found",
        });
        return;
      }

      if (error.message === "CANNOT_DEMOTE_LAST_EVENT_ADMIN") {
        res.status(409).json({
          success: false,
          message: "Cannot demote the last active event admin",
        });
        return;
      }
    }

    handleServerError(res, error);
  }
}

export async function removeEventMemberHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const userId = req.userId;
  const organizationId = uuidSchema.safeParse(
    req.params.organizationId,
  );
  const eventId = uuidSchema.safeParse(req.params.eventId);
  const memberId = uuidSchema.safeParse(req.params.memberId);

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  if (
    !organizationId.success ||
    !eventId.success ||
    !memberId.success
  ) {
    res.status(400).json({
      success: false,
      message: "Invalid organization, event, or member ID",
    });
    return;
  }

  try {
    const inScope = await validateEventScope(
      organizationId.data,
      eventId.data,
    );

    if (!inScope) {
      res.status(404).json({
        success: false,
        message: "Event not found in this organization",
      });
      return;
    }

    const allowed = await canManageEventMembers(
      eventId.data,
      userId,
    );

    if (!allowed) {
      res.status(403).json({
        success: false,
        message: "You cannot manage event members",
      });
      return;
    }

    const organizationMembership =
      await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: organizationId.data,
            userId,
          },
        },
        select: {
          role: true,
          status: true,
        },
      });

    const isOrganizationAdmin =
      organizationMembership?.status === "ACTIVE" &&
      (organizationMembership.role === "OWNER" ||
        organizationMembership.role === "ADMIN");

    const targetMember = await prisma.eventMember.findFirst({
        where: {
    id: memberId.data,
    eventId: eventId.data,
    status: { not: "REMOVED" },
  },
  select: {
    userId: true,
    role: true,
  },
});
    if (!targetMember) {
      res.status(404).json({
        success: false,
        message: "Event member not found",
      });
      return;
    }
    if (targetMember.userId === userId) {
        res.status(403).json({
        success: false,
        message: "You cannot remove yourself from the event",
        });
    return;
    }

    if (targetMember.role === "ADMIN" && !isOrganizationAdmin) {
      res.status(403).json({
        success: false,
        message: "Only organization owners or admins can remove an event admin",
      });
      return;
    }

    const member = await removeEventMember(
      eventId.data,
      memberId.data,
      userId,
    );

    res.status(200).json({
      success: true,
      data: member,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "EVENT_MEMBER_NOT_FOUND") {
        res.status(404).json({
          success: false,
          message: "Event member not found",
        });
        return;
      }

      if (error.message === "CANNOT_REMOVE_SELF") {
        res.status(403).json({
          success: false,
          message: "You cannot remove yourself from the event",
        });
        return;
      }

      if (error.message === "CANNOT_REMOVE_LAST_EVENT_ADMIN") {
        res.status(409).json({
          success: false,
          message: "Cannot remove the last active event admin",
        });
        return;
      }
    }

    handleServerError(res, error);
  }
}