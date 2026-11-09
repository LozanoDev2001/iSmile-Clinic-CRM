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
import { revokeMemberSessions, sendMemberPasswordReset, unlockMember, updateMember } from "./team.service";
import { inviteUser, setUserActive } from "./users.service";
import type { InviteUserInput, InviteUserResult, MemberIdInput, SetUserActiveInput, UpdateMemberInput } from "./users.types";

const TEAM_PATH = "/settings/team";

export async function inviteUserAction(input: InviteUserInput): Promise<ActionResult<InviteUserResult & { userId: string }>> {
  return runAction(async () => {
    const { emailSent, userId } = await inviteUser(await requireAuth(), input);
    revalidatePath(TEAM_PATH);
    return { emailSent, userId };
  }, "Invitation sent.");
}

export async function setUserActiveAction(input: SetUserActiveInput): Promise<ActionResult> {
  return runAction(async () => {
    await setUserActive(await requireAuth(), input);
    revalidatePath(TEAM_PATH);
    return undefined;
  }, input.active ? "Account activated." : "Account deactivated. They have been signed out.");
}

export async function updateMemberAction(input: UpdateMemberInput): Promise<ActionResult> {
  return runAction(async () => {
    await updateMember(await requireAuth(), input);
    revalidatePath(TEAM_PATH);
    return undefined;
  }, "Changes saved.");
}

export async function sendMemberPasswordResetAction(input: MemberIdInput): Promise<ActionResult<{ emailSent: boolean }>> {
  return runAction(async () => {
    const emailSent = await sendMemberPasswordReset(await requireAuth(), input);
    revalidatePath(TEAM_PATH);
    return { emailSent };
  });
}

export async function revokeMemberSessionsAction(input: MemberIdInput): Promise<ActionResult> {
  return runAction(async () => {
    await revokeMemberSessions(await requireAuth(), input);
    revalidatePath(TEAM_PATH);
    return undefined;
  }, "Signed out of all devices.");
}

export async function unlockMemberAction(input: MemberIdInput): Promise<ActionResult> {
  return runAction(async () => {
    await unlockMember(await requireAuth(), input);
    revalidatePath(TEAM_PATH);
    return undefined;
  }, "Account unlocked.");
}
