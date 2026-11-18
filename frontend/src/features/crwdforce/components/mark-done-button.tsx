"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { setConversationStatusAction } from "@backend/features/messaging/messaging.controller";

export function MarkDoneButton({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const done = () =>
    start(async () => {
      const result = await setConversationStatusAction(conversationId, "done");
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Marked as done.");
      router.refresh();
    });
  return (
    <button
      type="button"
      onClick={done}
      disabled={pending}
      aria-label="Mark as done"
      className="grid h-[52px] place-items-center rounded-full bg-white disabled:opacity-60"
    >
      <CircleCheck className="size-5" aria-hidden />
    </button>
  );
}
