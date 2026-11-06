"use server";

/**
 * Users controller — entry layer for staff-account mutations (Server Actions).
 * Authenticates the caller, delegates to the service (which validates input
 * and enforces permissions), refreshes the affected page and returns an
 * ActionResult. No business rules or database access here.
 */
import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { inviteUser, setUserActive } from "./users.service";
import type { InviteUserInput, InviteUserResult, SetUserActiveInput } from "./users.types";

export async function inviteUserAction(input: InviteUserInput): Promise<ActionResult<InviteUserResult>> {
  return runAction(async () => {
    const { emailSent } = await inviteUser(await requireAuth(), input);
    revalidatePath("/users");
    return { emailSent };
  }, "Invitation sent.");
}

export async function setUserActiveAction(input: SetUserActiveInput): Promise<ActionResult> {
  return runAction(async () => {
    await setUserActive(await requireAuth(), input);
    revalidatePath("/users");
    return undefined;
  }, input.active ? "Account activated." : "Account deactivated. The user has been signed out.");
}
