"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { isSimulatorOn } from "./messaging.delivery";
import {
  assignConversation,
  markMessageSent,
  receiveMessage,
  reply,
  saveGreeting,
  saveSavedReplies,
  sendBroadcast,
  sendGreeting,
  setConversationStatus,
} from "./messaging.service";
import type { BroadcastInput, ConversationStatus, IncomingMessageInput, SavedReply } from "./messaging.types";

// New chats also create leads and contacts, which show elsewhere.
const revalidate = () => revalidatePath("/", "layout");

export async function replyAction(conversationId: string, body: string): Promise<ActionResult> {
  return runAction(async () => {
    await reply(await requireAuth(), conversationId, { body });
    revalidate();
    return undefined;
  });
}

export async function markMessageSentAction(messageId: string): Promise<ActionResult> {
  return runAction(async () => {
    await markMessageSent(await requireAuth(), messageId);
    revalidate();
    return undefined;
  }, "Marked as sent.");
}

export async function assignConversationAction(conversationId: string, assigneeId: string | null): Promise<ActionResult> {
  return runAction(async () => {
    await assignConversation(await requireAuth(), conversationId, { assigneeId });
    revalidate();
    return undefined;
  }, "Conversation assigned.");
}

export async function setConversationStatusAction(conversationId: string, status: ConversationStatus): Promise<ActionResult<ConversationStatus>> {
  return runAction(async () => {
    const result = await setConversationStatus(await requireAuth(), conversationId, { status });
    revalidate();
    return result;
  }, status === "done" ? "Marked as done." : "Reopened.");
}

export async function logIncomingAction(input: IncomingMessageInput): Promise<ActionResult<{ conversationId: string; newLead: boolean }>> {
  return runAction(async () => {
    const result = await receiveMessage(await requireAuth(), input, "staff");
    revalidate();
    return result;
  }, "Message logged.");
}

/** Development only: pretends a message arrived from a chat app. */
export async function simulateIncomingAction(input: IncomingMessageInput): Promise<ActionResult<{ conversationId: string; newLead: boolean }>> {
  return runAction(async () => {
    if (!isSimulatorOn()) throw Errors.forbidden("The simulator only runs in development.");
    const result = await receiveMessage(await requireAuth(), input, "simulator");
    revalidate();
    return result;
  }, "Simulated message received.");
}

export async function saveSavedRepliesAction(replies: SavedReply[]): Promise<ActionResult<SavedReply[]>> {
  return runAction(async () => {
    const saved = await saveSavedReplies(await requireAuth(), replies);
    revalidate();
    return saved;
  }, "Saved replies updated.");
}

export async function saveGreetingAction(body: string): Promise<ActionResult<string>> {
  return runAction(async () => {
    const saved = await saveGreeting(await requireAuth(), { body });
    revalidate();
    return saved;
  }, "Greeting saved.");
}

export async function sendGreetingAction(patientId: string): Promise<ActionResult<{ conversationId: string }>> {
  return runAction(async () => {
    const result = await sendGreeting(await requireAuth(), patientId);
    revalidate();
    return result;
  }, "Greeting sent.");
}

export async function sendBroadcastAction(input: BroadcastInput): Promise<ActionResult<{ id: string; recipients: number }>> {
  return runAction(async () => {
    const result = await sendBroadcast(await requireAuth(), input);
    revalidate();
    return result;
  });
}
