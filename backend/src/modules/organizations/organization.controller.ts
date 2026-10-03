import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { createOrganizationSchema } from "./organization.validation";
import { createOrganization } from "./organization.service";

export async function createOrganizationHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const validation = createOrganizationSchema.safeParse(req.body);

  if (!validation.success) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    if (!req.userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const organization = await createOrganization(
      validation.data,
      req.userId,
    );

    res.status(201).json({
      success: true,
      message: "Organization created successfully",
      data: { organization },
    });
  } catch (error: unknown) {
    console.error("Create organization error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}