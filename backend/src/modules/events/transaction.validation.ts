
import { z } from "zod";

export const createTransactionSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE"]),
    // Amount is expressed in paise. Accept a safe integer only.
    amountPaise: z
      .number()
      .int("Amount must be a whole number of paise")
      .positive("Amount must be greater than zero")
      .max(Number.MAX_SAFE_INTEGER, "Amount is too large"),
    category: z
      .string()
      .trim()
      .min(1, "Category is required")
      .max(100, "Category must not exceed 100 characters"),
    description: z
      .string()
      .trim()
      .max(2000, "Description must not exceed 2000 characters")
      .optional(),
  })
  .strict();