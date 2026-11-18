import { z } from "zod";

export const signInRulesSchema = z.object({
  lockAfterFailedLogins: z.boolean(),
  idleSignOut: z.boolean(),
});

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:00");

const openingHoursSchema = z
  .object({ day: z.enum(WEEKDAYS), closed: z.boolean(), open: timeSchema, close: timeSchema })
  .refine((h) => h.closed || h.open < h.close, { message: "Closing time must be after opening time", path: ["close"] });

export const clinicProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter the clinic name").max(120),
  tagline: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(255),
  // Missing in profiles saved before the switch existed; VAT-registered is the usual case.
  vatRegistered: z.boolean().default(true),
  hours: z
    .array(openingHoursSchema)
    .length(WEEKDAYS.length)
    .refine((list) => list.every((h, i) => h.day === WEEKDAYS[i]), "Opening hours must list Monday to Sunday in order"),
});
