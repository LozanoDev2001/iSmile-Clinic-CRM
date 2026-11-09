import "server-only";
import { ASSIGNABLE_ROLES } from "@backend/config/permissions";
import { authRepository } from "@backend/features/auth/auth.repository";
import { createInviteToken, sendInviteEmail } from "@backend/features/auth/password-reset.service";
import { assertPermission, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { logger } from "@backend/lib/logging/logger";
import { prisma } from "@backend/lib/prisma";
import { loadEditableMember } from "./team.service";
import { inviteUserSchema, setUserActiveSchema } from "./user.schema";
import { usersRepository } from "./users.repository";
import type { InviteOptions, InviteUserInput, InviteUserResult, SetUserActiveInput } from "./users.types";

/** Roles the actor may choose from when inviting. */
export function getInviteOptions(actor: AuthUser): InviteOptions {
  assertPermission(actor, "users.create");
  return { roles: [...ASSIGNABLE_ROLES[actor.role]] };
}

/**
 * Creates an invited account in the actor's clinic and emails a single-use
 * link to set the password. There is no public sign-up.
 */
export async function inviteUser(actor: AuthUser, input: InviteUserInput): Promise<InviteUserResult & { userId: string }> {
  assertPermission(actor, "users.create");
  const data = inviteUserSchema.parse(input);
  if (!ASSIGNABLE_ROLES[actor.role].includes(data.role)) throw Errors.forbidden("You cannot assign this role.");
  if (await usersRepository.emailTaken(actor.clinicId, data.email)) {
    throw Errors.validation({ email: ["Someone in this clinic already uses this email"] });
  }

  const { user, token } = await prisma.$transaction(async (tx) => {
    const role = await usersRepository.findSystemRole(data.role, tx);
    if (!role) throw new Error(`System role ${data.role} is missing; re-run the seed.`);
    // Invited users start from their role template; overrides are added later in Settings.
    const user = await usersRepository.create(
      { clinicId: actor.clinicId, fullName: data.name, email: data.email, jobTitle: data.jobTitle, roleId: role.id },
      tx,
    );
    const token = await createInviteToken(user.id, tx);
    await audit(
      { action: AUDIT_ACTIONS.USER_INVITED, resourceType: "user", resourceId: user.id, actorId: actor.id, clinicId: actor.clinicId, metadata: { role: data.role } },
      tx,
    );
    return { user, token };
  });

  let emailSent = true;
  try {
    await sendInviteEmail({ email: user.email, name: user.fullName }, token);
  } catch (error) {
    emailSent = false;
    logger.error("Invitation email failed", { userId: user.id, error });
  }
  return { userId: user.id, emailSent };
}

/** Deactivating ends every session; reactivating restores "invited" if no password was ever set. */
export async function setUserActive(actor: AuthUser, input: SetUserActiveInput): Promise<void> {
  const { userId, active } = setUserActiveSchema.parse(input);
  const target = await loadEditableMember(actor, userId);

  await prisma.$transaction(async (tx) => {
    await usersRepository.setStatus(userId, active ? (target.hasPassword ? "active" : "invited") : "disabled", tx);
    if (!active) await authRepository.revokeUserSessions(userId, tx);
    await audit(
      {
        action: active ? AUDIT_ACTIONS.USER_ACTIVATED : AUDIT_ACTIONS.USER_DEACTIVATED,
        resourceType: "user",
        resourceId: userId,
        actorId: actor.id,
        clinicId: target.clinicId,
        before: { status: target.status },
      },
      tx,
    );
  });
}
