import "server-only";
import { assertPermission, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma } from "@backend/lib/prisma";
import { clinicProfileSchema, signInRulesSchema } from "./settings.schema";
import { settingsRepository } from "./settings.repository";
import { clinicProfileFrom, signInRulesFrom, type ClinicProfile, type SignInRules, type StoredClinicProfile } from "./settings.types";

export async function getClinicProfile(actor: AuthUser): Promise<ClinicProfile> {
  assertPermission(actor, "settings.read");
  const clinic = await settingsRepository.findClinicSettings(actor.clinicId);
  if (!clinic) throw Errors.notFound("clinic");
  return clinicProfileFrom(clinic.name, clinic.settings);
}

export async function updateClinicProfile(actor: AuthUser, input: ClinicProfile): Promise<ClinicProfile> {
  assertPermission(actor, "settings.update");
  const { name, ...profile } = clinicProfileSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const clinic = await settingsRepository.findClinicSettings(actor.clinicId, tx);
    if (!clinic) throw Errors.notFound("clinic");
    const before = clinicProfileFrom(clinic.name, clinic.settings);
    const changedFields = (Object.keys(before) as (keyof ClinicProfile)[]).filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(key === "name" ? name : profile[key]),
    );
    if (changedFields.length === 0) return before;

    const current = (clinic.settings ?? {}) as Record<string, unknown>;
    const stored: StoredClinicProfile = profile;
    await settingsRepository.updateClinicProfile(actor.clinicId, { name, settings: { ...current, profile: stored } }, tx);
    await audit(
      { action: AUDIT_ACTIONS.CLINIC_PROFILE_UPDATED, resourceType: "clinic", resourceId: actor.clinicId, actorId: actor.id, clinicId: actor.clinicId, metadata: { changedFields } },
      tx,
    );
    return { name, ...profile };
  });
}

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
