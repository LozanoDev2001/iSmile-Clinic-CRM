"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { decideDraft, draftReply, saveMiaSettings } from "./crwdforce.service";
import type { MiaDraft, MiaSettings, MiaSettingsInput } from "./crwdforce.types";

export async function draftReplyAction(conversationId: string): Promise<ActionResult<MiaDraft>> {
  return runAction(async () => {
    const draft = await draftReply(await requireAuth(), conversationId);
    revalidatePath("/", "layout");
    return draft;
  }, "Mia wrote a draft.");
}

export async function decideDraftAction(draftId: string, decision: "used" | "dismissed"): Promise<ActionResult> {
  return runAction(async () => {
    await decideDraft(await requireAuth(), draftId, { decision });
    revalidatePath("/", "layout");
    return undefined;
  });
}

export async function saveMiaSettingsAction(input: MiaSettingsInput): Promise<ActionResult<MiaSettings>> {
  return runAction(async () => {
    const saved = await saveMiaSettings(await requireAuth(), input);
    revalidatePath("/", "layout");
    return saved;
  }, "Mia's setup saved.");
}
