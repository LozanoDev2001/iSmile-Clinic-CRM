import { z } from "zod";
import { ROLES } from "@backend/config/permissions";
import { emailSchema } from "@backend/features/auth/login.schema";

export const idSchema = z.cuid("Invalid identifier");

export const inviteUserSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120, "Name is too long"),
  email: emailSchema,
  role: z.enum(ROLES, "Select a role"),
  branchIds: z.array(idSchema).max(50).default([]),
  /** Only honoured for Super Admins; everyone else invites into their own clinic. */
  clinicId: idSchema.optional(),
});

export const setUserActiveSchema = z.object({
  userId: idSchema,
  active: z.boolean(),
});
