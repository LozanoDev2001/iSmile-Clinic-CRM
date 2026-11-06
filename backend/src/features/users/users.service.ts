import "server-only";
import { ASSIGNABLE_ROLES } from "@backend/config/permissions";
import { createInviteToken, sendInviteEmail } from "@backend/features/auth/password-reset.service";
import {
  assertClinicAccess,
  assertPermission,
  isClinicWide,
  resolveClinicId,
  type AuthUser,
} from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { logger } from "@backend/lib/logging/logger";
import { prisma } from "@backend/lib/prisma";
import { inviteUserSchema, setUserActiveSchema } from "./user.schema";
import { usersRepository } from "./users.repository";
import type {
  InviteOptions,
  InviteUserInput,
  InviteUserResult,
  SetUserActiveInput,
  UserListItem,
  UserListResult,
} from "./users.types";

const PAGE_SIZE = 50;

export async function listUsers(actor: AuthUser, page = 1): Promise<UserListResult> {
  assertPermission(actor, "users.read");
  const safePage = Math.max(1, Math.floor(page) || 1);
  const clinicId = actor.role === "SUPER_ADMIN" ? undefined : resolveClinicId(actor);
  const [items, total] = await usersRepository.list(clinicId, { skip: (safePage - 1) * PAGE_SIZE, take: PAGE_SIZE });
  return { items, total, page: safePage, pageSize: PAGE_SIZE };
}

/** Roles, clinics and branches the actor may choose from when inviting. */
export async function getInviteOptions(actor: AuthUser): Promise<InviteOptions> {
  assertPermission(actor, "users.create");
  const isSuper = actor.role === "SUPER_ADMIN";
  const [clinics, branches] = await Promise.all([
    isSuper ? usersRepository.listClinics() : Promise.resolve([]),
    usersRepository.listBranches(isSuper ? undefined : resolveClinicId(actor)),
  ]);
  return { roles: [...ASSIGNABLE_ROLES[actor.role]], clinics, branches, chooseClinic: isSuper };
}

/**
 * Creates an account and emails a single-use link to set the password.
 * There is no public sign-up: only users with `users.create` can do this.
 */
export async function inviteUser(
  actor: AuthUser,
  input: InviteUserInput,
): Promise<InviteUserResult & { user: UserListItem }> {
  assertPermission(actor, "users.create");
  const data = inviteUserSchema.parse(input);

  if (!ASSIGNABLE_ROLES[actor.role].includes(data.role)) {
    throw Errors.forbidden("You cannot assign this role.");
  }

  const clinicId = data.role === "SUPER_ADMIN" ? null : resolveClinicId(actor, data.clinicId);
  const branchIds = clinicId && !isClinicWide({ role: data.role }) ? [...new Set(data.branchIds)] : [];

  if (clinicId && !isClinicWide({ role: data.role })) {
    if (!branchIds.length) throw Errors.validation({ branchIds: ["Assign at least one branch"] });
    // Never trust client-supplied branch IDs: they must belong to this clinic.
    const valid = await usersRepository.countBranchesInClinic(clinicId, branchIds);
    if (valid !== branchIds.length) throw Errors.validation({ branchIds: ["One or more branches are invalid"] });
  }

  const { user, token } = await prisma.$transaction(async (tx) => {
    const user = await usersRepository.create({ ...data, clinicId, branchIds }, tx);
    const token = await createInviteToken(user.id, tx);
    await audit(
      {
        action: AUDIT_ACTIONS.USER_INVITED,
        resourceType: "user",
        resourceId: user.id,
        actorId: actor.id,
        clinicId,
        metadata: { role: data.role, branchCount: branchIds.length },
      },
      tx,
    );
    return { user, token };
  });

  let emailSent = true;
  try {
    await sendInviteEmail(user, token);
  } catch (error) {
    emailSent = false;
    logger.error("Invitation email failed", { userId: user.id, error });
  }
  return { user, emailSent };
}

export async function setUserActive(actor: AuthUser, input: SetUserActiveInput): Promise<UserListItem> {
  assertPermission(actor, "users.update");
  const { userId, active } = setUserActiveSchema.parse(input);

  if (userId === actor.id) throw Errors.forbidden("You cannot change the status of your own account.");

  const target = await usersRepository.findForAdmin(userId);
  if (!target) throw Errors.notFound("user");
  if (target.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") throw Errors.forbidden();
  if (target.clinicId) assertClinicAccess(actor, target.clinicId);
  else if (actor.role !== "SUPER_ADMIN") throw Errors.forbidden();

  return prisma.$transaction(async (tx) => {
    const updated = await usersRepository.setActive(userId, active, tx);
    await audit(
      {
        action: active ? AUDIT_ACTIONS.USER_ACTIVATED : AUDIT_ACTIONS.USER_DEACTIVATED,
        resourceType: "user",
        resourceId: userId,
        actorId: actor.id,
        clinicId: target.clinicId,
      },
      tx,
    );
    return updated;
  });
}
