
import { z } from "zod";

export const reverseTransactionSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(3, "Reversal reason must contain at least 3 characters")
      .max(500, "Reversal reason must not exceed 500 characters"),
  })
  .strict();