import type { z } from "zod";
import type { Role } from "@backend/generated/prisma/enums";
import type { inviteUserSchema, setUserActiveSchema } from "./user.schema";

// ─── Inputs ─────────────────────────────────────────────────────────────────

/** `z.input`: branchIds is optional for callers (the schema defaults it to []). */
export type InviteUserInput = z.input<typeof inviteUserSchema>;
export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;

// ─── Outputs / DTOs ─────────────────────────────────────────────────────────

/** Public-safe staff account. Mirrors `userListSelect` — never contains the password hash. */
export interface UserListItem {
  id: string;
  email: string;
  name: string;
  role: Role;
  clinicId: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface UserListResult {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InviteOptions {
  roles: Role[];
  clinics: { id: string; name: string }[];
  branches: { id: string; name: string; clinicId: string }[];
  /** Only Super Admins pick a clinic; everyone else invites into their own. */
  chooseClinic: boolean;
}

export interface InviteUserResult {
  emailSent: boolean;
}
