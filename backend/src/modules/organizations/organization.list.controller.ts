
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { listUserOrganizations } from "./organization.list.service";

export async function listOrganizationsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  try {
    const organizations = await listUserOrganizations(req.userId);

    res.status(200).json({
      success: true,
      data: { organizations },
    });
  } catch (error: unknown) {
    console.error("List organizations error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}