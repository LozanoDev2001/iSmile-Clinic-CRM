"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { NEXT_STEP_LABELS } from "@/features/crwdforce/format";
import {
  decideDraftAction,
  draftReplyAction,
} from "@backend/features/crwdforce/crwdforce.controller";
import type { MiaDraft } from "@backend/features/crwdforce/crwdforce.types";
import { replyAction } from "@backend/features/messaging/messaging.controller";
import {
  fillTemplate,
  type TemplateValues,
} from "@backend/features/messaging/messaging.templates";
import type { SavedReply } from "@backend/features/messaging/messaging.types";

/** Mia's state for the composer; the composer gets null when the user can't use crwdForce. */
export interface MiaAssist {
  connected: boolean;
  draft: MiaDraft | null;
}

function MiaDraftCard({
  draft,
  onUse,
  onDismiss,
  pending,
}: {
  draft: MiaDraft;
  onUse: () => void;
  onDismiss: () => void;
  pending: boolean;
}) {
  return (
    <section
      id="mia-draft"
      aria-label="Mia's draft"
      className="flex flex-col gap-2 rounded-2xl border border-[#F6C27A] bg-[#FFF8EC] p-3 text-sm"
    >
      <span className="flex items-center gap-2 text-xs text-[#7A4300]">
        <span
          className="fill-orange grid size-5 place-items-center rounded-full text-[10px] font-medium text-[#0E2A47]"
          aria-hidden
        >
          M
        </span>
        Mia&apos;s draft · {draft.summary}
      </span>
      {draft.handover ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-xl bg-[#FDECEA] px-2.5 py-1.5 text-[#A1301F]"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Hand over to the team:{" "}
          {draft.handoverReason ?? "Mia thinks a person should take this."}
        </p>
      ) : null}
      <p className="whitespace-pre-line">{draft.reply}</p>
      <span className="text-xs text-[#5E6B7E]">
        Next step: {NEXT_STEP_LABELS[draft.nextStep]}
        {draft.slotLabel ? ` · offers ${draft.slotLabel}` : ""}
        {draft.slotLabel ? " (book it in the Calendar once they agree)" : ""}
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onUse}
          className="h-9 rounded-full bg-[#0E2A47] px-4 text-white disabled:opacity-50"
        >
          Use this reply
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onDismiss}
          className="h-9 rounded-full border border-[#D5DCE5] bg-white px-4 disabled:opacity-50"
        >
          Dismiss
        </button>
      </span>
    </section>
  );
}

/** Reply box with saved replies and Mia's drafts; fill-ins like {first_name} are filled from the conversation. */
export function Composer({
  conversationId,
  savedReplies,
  fill,
  channelLabel,
  mia,
}: {
  conversationId: string;
  savedReplies: SavedReply[];
  fill: TemplateValues;
  channelLabel: string;
  mia: MiaAssist | null;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [drafting, startDrafting] = useTransition();
  const draft = mia?.draft ?? null;

  const send = () =>
    startTransition(async () => {
      const result = await replyAction(conversationId, body);
      if (!result.success) {
        toast.error(
          Object.values(result.error.fields ?? {})[0]?.[0] ??
            result.error.message,
        );
        return;
      }
      setBody("");
      router.refresh();
    });

  const askMia = () =>
    startDrafting(async () => {
      const result = await draftReplyAction(conversationId);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });

  const decide = (d: MiaDraft, decision: "used" | "dismissed") =>
    startTransition(async () => {
      const result = await decideDraftAction(d.id, decision);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      if (decision === "used") setBody(d.reply);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2 border-t border-[#E3E7ED] pt-3">
      {draft ? (
        <MiaDraftCard
          draft={draft}
          pending={pending}
          onUse={() => decide(draft, "used")}
          onDismiss={() => decide(draft, "dismissed")}
        />
      ) : null}
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Saved replies"
      >
        {mia ? (
          <button
            type="button"
            disabled={!mia.connected || drafting}
            title={
              mia.connected
                ? undefined
                : "Mia isn't connected yet. Add the clinic's ANTHROPIC_API_KEY to the server settings."
            }
            onClick={askMia}
            className="fill-orange inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-[#0E2A47] disabled:opacity-50"
          >
            <Sparkles className="size-3.5" aria-hidden />
            {drafting
              ? "Mia is writing…"
              : mia.draft
                ? "Ask Mia again"
                : "Ask Mia for a draft"}
          </button>
        ) : null}
        {savedReplies.map((r) => (
          <button
            key={r.title}
            type="button"
            onClick={() => setBody(fillTemplate(r.body, fill))}
            className="h-8 rounded-full border border-[#D5DCE5] bg-white px-3 text-xs hover:bg-[#F4F6F9]"
          >
            {r.title}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <label htmlFor="reply-body" className="sr-only">
          Reply on {channelLabel}
        </label>
        <textarea
          id="reply-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && body.trim())
              send();
          }}
          rows={3}
          maxLength={2000}
          placeholder={`Reply on ${channelLabel}… (Ctrl+Enter to send)`}
          className="min-h-20 flex-1 rounded-2xl border border-[#D5DCE5] bg-white px-4 py-3 text-[15px] outline-none focus-visible:border-[#1D5296] focus-visible:ring-3 focus-visible:ring-[#1D5296]/15"
        />
        <button
          type="button"
          disabled={pending || !body.trim()}
          onClick={send}
          aria-label="Send"
          className="fill-orange grid size-12 place-items-center rounded-full text-[#0E2A47] disabled:opacity-50"
        >
          <Send className="size-5" aria-hidden />
        </button>
      </div>
      {/\{\w+\}/.test(body) ? (
        <p className="text-xs text-[#A55A00]">
          Some fill-ins have no value yet (shown in braces). Edit them before
          sending.
        </p>
      ) : null}
    </div>
  );
}
