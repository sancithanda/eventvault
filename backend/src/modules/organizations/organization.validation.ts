import { z } from "zod";

export const createOrganizationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Organization name must be at least 2 characters")
      .max(150, "Organization name must not exceed 150 characters"),
  })
  .strict();

export type CreateOrganizationInput = z.infer<
  typeof createOrganizationSchema
>;