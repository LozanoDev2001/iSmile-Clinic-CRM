"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { updateClinicProfile, updateSignInRules } from "./settings.service";
import type { ClinicProfile, SignInRules } from "./settings.types";

export async function updateSignInRulesAction(input: SignInRules): Promise<ActionResult<SignInRules>> {
  return runAction(async () => {
    const rules = await updateSignInRules(await requireAuth(), input);
    revalidatePath("/settings", "layout");
    return rules;
  }, "Sign-in rules saved.");
}

export async function updateClinicProfileAction(input: ClinicProfile): Promise<ActionResult<ClinicProfile>> {
  return runAction(async () => {
    const profile = await updateClinicProfile(await requireAuth(), input);
    revalidatePath("/", "layout");
    return profile;
  }, "Clinic profile saved.");
}
