import { z } from "zod";
import { ACCESS_LEVELS, MODULE_KEYS } from "@backend/config/access";
import { ROLES } from "@backend/config/permissions";
import { emailSchema } from "@backend/features/auth/login.schema";

export const idSchema = z.uuid("Invalid identifier");

const jobTitleSchema = z
  .string()
  .trim()
  .max(120, "Job title is too long")
  .nullish()
  .transform((v) => v || null);

export const inviteUserSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(255, "Name is too long"),
  email: emailSchema,
  role: z.enum(ROLES, "Select a role"),
  jobTitle: jobTitleSchema,
});

export const setUserActiveSchema = z.object({
  userId: idSchema,
  active: z.boolean(),
});

export const memberIdSchema = z.object({ userId: idSchema });

export const updateMemberSchema = z.object({
  userId: idSchema,
  role: z.enum(ROLES, "Select a role"),
  jobTitle: jobTitleSchema,
  access: z
    .array(
      z.object({
        module: z.enum(MODULE_KEYS as [string, ...string[]]),
        level: z.enum(ACCESS_LEVELS),
        tabs: z.array(z.string().max(40)).max(10).default([]),
      }),
    )
    .max(MODULE_KEYS.length),
});
