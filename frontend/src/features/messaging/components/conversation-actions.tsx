"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/styles";
import { assignConversationAction, markMessageSentAction, setConversationStatusAction } from "@backend/features/messaging/messaging.controller";
import type { ConversationStatus } from "@backend/features/messaging/messaging.types";
import type { NamedRef } from "@backend/features/patients/patients.types";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ success: boolean; message?: string; error?: { message: string } }>) =>
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error?.message ?? "Something went wrong.");
        return;
      }
      if (result.message) toast.success(result.message);
      router.refresh();
    });
  return { pending, run };
}

export function AssignSelect({ conversationId, assigneeId, staff }: { conversationId: string; assigneeId: string | null; staff: NamedRef[] }) {
  const { pending, run } = useRun();
  return (
    <label className="flex flex-col gap-1.5 text-sm text-[#46566B]">
      Handled by
      <select value={assigneeId ?? ""} disabled={pending} onChange={(e) => run(() => assignConversationAction(conversationId, e.target.value || null))} className={selectClass}>
        <option value="">Unassigned</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StatusButton({ conversationId, status }: { conversationId: string; status: ConversationStatus }) {
  const { pending, run } = useRun();
  const next: ConversationStatus = status === "open" ? "done" : "open";
  return (
    <button type="button" disabled={pending} onClick={() => run(() => setConversationStatusAction(conversationId, next))} className="h-10 rounded-full border border-[#D5DCE5] bg-white px-4 text-sm disabled:opacity-50">
      {status === "open" ? "Mark as done" : "Reopen"}
    </button>
  );
}

export function MarkSentButton({ messageId }: { messageId: string }) {
  const { pending, run } = useRun();
  return (
    <button type="button" disabled={pending} onClick={() => run(() => markMessageSentAction(messageId))} className="text-xs text-[#1D5296] underline disabled:opacity-50">
      I sent it from the app
    </button>
  );
}
