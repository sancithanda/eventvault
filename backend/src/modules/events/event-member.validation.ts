
import { z } from "zod";

export const addEventMemberSchema = z
  .object({
    userId: z.string().uuid("A valid user ID is required"),
    role: z
      .enum([
        "ADMIN",
        "FINANCE_MANAGER",
        "ORGANIZER",
        "VIEWER",
      ])
      .default("ORGANIZER"),
  })
  .strict();

export const updateEventMemberSchema = z
  .object({
    role: z
      .enum([
        "ADMIN",
        "FINANCE_MANAGER",
        "ORGANIZER",
        "VIEWER",
      ])
      .optional(),
    transactionEnabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.role !== undefined ||
      data.transactionEnabled !== undefined,
    { message: "Provide a role or transaction permission to update" },
  );