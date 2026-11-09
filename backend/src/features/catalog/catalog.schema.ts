import { z } from "zod";

export const TAX_TYPES = ["exempt", "vat"] as const;

const MAX_PRICE = 10_000_000;

export const serviceIdSchema = z.uuid("Invalid service identifier");

export const serviceInputSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(z.string().min(3, "Type the service or item name.").max(120)),
  price: z.coerce
    .number({ error: "Enter a price above ₱0." })
    .gt(0, "Enter a price above ₱0.")
    .max(MAX_PRICE, "That price is too high.")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most 2 decimal places."),
  taxType: z.enum(TAX_TYPES),
  hmoCoverable: z.boolean(),
});
