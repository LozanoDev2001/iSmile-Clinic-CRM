import "server-only";
import { assertPermission, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma } from "@backend/lib/prisma";
import { signInRulesSchema } from "./settings.schema";
import { settingsRepository } from "./settings.repository";
import { signInRulesFrom, type SignInRules } from "./settings.types";

export async function getSignInRules(actor: AuthUser): Promise<SignInRules> {
  assertPermission(actor, "settings.read");
  const clinic = await settingsRepository.findClinicSettings(actor.clinicId);
  if (!clinic) throw Errors.notFound("clinic");
  return signInRulesFrom(clinic.settings);
}

export async function updateSignInRules(actor: AuthUser, input: SignInRules): Promise<SignInRules> {
  assertPermission(actor, "settings.update");
  const data = signInRulesSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const clinic = await settingsRepository.findClinicSettings(actor.clinicId, tx);
    if (!clinic) throw Errors.notFound("clinic");
    const before = signInRulesFrom(clinic.settings);
    const current = (clinic.settings ?? {}) as Record<string, unknown>;
    await settingsRepository.updateClinicSettings(actor.clinicId, { ...current, signIn: data }, tx);
    await audit(
      { action: AUDIT_ACTIONS.SIGN_IN_RULES_UPDATED, resourceType: "clinic", resourceId: actor.clinicId, actorId: actor.id, clinicId: actor.clinicId, before, metadata: data },
      tx,
    );
    return data;
  });
}
