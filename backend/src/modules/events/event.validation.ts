
import { z } from "zod";

export const createEventSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Event name must be at least 2 characters")
      .max(150, "Event name must not exceed 150 characters"),

    description: z
      .string()
      .trim()
      .max(2000, "Description must not exceed 2000 characters")
      .optional(),

    startDate: z
      .string()
      .datetime({ offset: true })
      .optional(),

    endDate: z
      .string()
      .datetime({ offset: true })
      .optional(),

    currency: z
      .string()
      .trim()
      .length(3, "Currency must be a 3-letter code")
      .regex(/^[A-Za-z]{3}$/, "Currency must contain only letters")
      .transform((value) => value.toUpperCase())
      .default("INR"),
  })
  .strict()
  .refine(
    (data) =>
      !data.startDate ||
      !data.endDate ||
      new Date(data.endDate) >= new Date(data.startDate),
    {
      message: "End date must be on or after start date",
      path: ["endDate"],
    }
  );

export type CreateEventInput = z.infer<typeof createEventSchema>;