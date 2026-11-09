"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { replyAction } from "@backend/features/messaging/messaging.controller";
import { fillTemplate, type TemplateValues } from "@backend/features/messaging/messaging.templates";
import type { SavedReply } from "@backend/features/messaging/messaging.types";

/** Reply box with saved replies; fill-ins like {first_name} are filled from the conversation. */
export function Composer({ conversationId, savedReplies, fill, channelLabel }: { conversationId: string; savedReplies: SavedReply[]; fill: TemplateValues; channelLabel: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  const send = () =>
    startTransition(async () => {
      const result = await replyAction(conversationId, body);
      if (!result.success) {
        toast.error(Object.values(result.error.fields ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      setBody("");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2 border-t border-[#E3E7ED] pt-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saved replies">
        {savedReplies.map((r) => (
          <button key={r.title} type="button" onClick={() => setBody(fillTemplate(r.body, fill))} className="h-8 rounded-full border border-[#D5DCE5] bg-white px-3 text-xs hover:bg-[#F4F6F9]">
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
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && body.trim()) send();
          }}
          rows={3}
          maxLength={2000}
          placeholder={`Reply on ${channelLabel}… (Ctrl+Enter to send)`}
          className="min-h-20 flex-1 rounded-2xl border border-[#D5DCE5] bg-white px-4 py-3 text-[15px] outline-none focus-visible:border-[#1D5296] focus-visible:ring-3 focus-visible:ring-[#1D5296]/15"
        />
        <button type="button" disabled={pending || !body.trim()} onClick={send} aria-label="Send" className="fill-orange grid size-12 place-items-center rounded-full text-[#0E2A47] disabled:opacity-50">
          <Send className="size-5" aria-hidden />
        </button>
      </div>
      {/\{\w+\}/.test(body) ? <p className="text-xs text-[#A55A00]">Some fill-ins have no value yet (shown in braces). Edit them before sending.</p> : null}
    </div>
  );
}
