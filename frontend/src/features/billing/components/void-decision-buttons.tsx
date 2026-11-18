"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { decideVoidRequestAction } from "@backend/features/billing/billing.controller";

export function VoidDecisionButtons({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const decide = (approve: boolean) =>
    startTransition(async () => {
      const result = await decideVoidRequestAction(invoiceId, approve);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(result.message ?? "Done.");
      router.refresh();
    });
  return (
    <span className="flex gap-2">
      <button type="button" disabled={pending} onClick={() => decide(true)} className="h-9 rounded-full bg-[#B3261E] px-3 text-sm text-white disabled:opacity-50">
        Approve
      </button>
      <button type="button" disabled={pending} onClick={() => decide(false)} className="h-9 rounded-full border border-[#D5DCE5] bg-white px-3 text-sm disabled:opacity-50">
        Decline
      </button>
    </span>
  );
}
