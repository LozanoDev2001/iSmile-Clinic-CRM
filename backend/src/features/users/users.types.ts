import type { z } from "zod";
import type { AccessMap } from "@backend/config/access";
import type { Role } from "@backend/config/permissions";
import type { inviteUserSchema, memberIdSchema, setUserActiveSchema, updateMemberSchema } from "./user.schema";

// ─── Inputs ─────────────────────────────────────────────────────────────────

export type InviteUserInput = z.input<typeof inviteUserSchema>;
export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;
export type MemberIdInput = z.infer<typeof memberIdSchema>;
export type UpdateMemberInput = z.input<typeof updateMemberSchema>;

// ─── Outputs / DTOs ─────────────────────────────────────────────────────────

export interface InviteOptions {
  roles: Role[];
}

export interface InviteUserResult {
  emailSent: boolean;
}

/** UI status: `users.status` suspended shows as Active + Locked. */
export type MemberStatus = "ACTIVE" | "INVITED" | "DEACTIVATED";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  jobTitle: string | null;
  staffCode: string | null;
  status: MemberStatus;
  locked: boolean;
  lastLoginAt: Date | null;
  /** The viewer may change this member's role, access and account. */
  editable: boolean;
}

export interface TeamOverview {
  members: TeamMember[];
  activeCount: number;
}

export interface MemberAccessDetail {
  member: TeamMember;
  access: AccessMap;
  /** Owner access cannot be narrowed. */
  fixedAccess: boolean;
}

export interface AccessLogEntry {
  id: string;
  text: string;
  tone: "grant" | "revoke" | "neutral" | "change";
  at: Date;
}
