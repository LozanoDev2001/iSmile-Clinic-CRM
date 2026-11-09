"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { updateSignInRules } from "./settings.service";
import type { SignInRules } from "./settings.types";

export async function updateSignInRulesAction(input: SignInRules): Promise<ActionResult<SignInRules>> {
  return runAction(async () => {
    const rules = await updateSignInRules(await requireAuth(), input);
    revalidatePath("/settings", "layout");
    return rules;
  }, "Sign-in rules saved.");
}
