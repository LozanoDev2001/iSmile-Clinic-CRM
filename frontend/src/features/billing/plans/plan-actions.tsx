"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/styles";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS } from "@backend/features/billing/billing.schema";
import type { PaymentMethod } from "@backend/features/billing/billing.types";
import { cancelPlanAction, payInstallmentAction } from "@backend/features/billing/plans/plans.controller";
import type { Installment } from "@backend/features/billing/plans/plans.types";
import { METHOD_LABELS, peso } from "../format";
import { formatDue } from "./format";

type Result = { success: boolean; message?: string; error?: { message: string; fields?: Record<string, string[]> } };

/** Records the next due installment, or cancels the plan. */
export function PlanActions({ planId, next, number, of }: { planId: string; next: Installment | null; number: number; of: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState("");

  const run = (action: () => Promise<Result>, fallback: string) =>
    startTransition(async () => {
      setError("");
      const result = await action();
      if (!result.success) {
        setError(Object.values(result.error?.fields ?? {})[0]?.[0] ?? result.error?.message ?? "Something went wrong.");
        return;
      }
      toast.success(result.message ?? fallback);
      setReference("");
      setConfirmCancel(false);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3 border-t border-[#EDF0F4] pt-3">
      {next ? (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              Record payment {number} of {of}
            </span>
            <span className="text-xs text-[#5E6B7E]">
              {peso(next.amount)} · due {formatDue(next.dueOn)}
              {next.overdue ? " · overdue" : ""}
            </span>
          </div>
          <div role="group" aria-label="Mode of payment" className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={method === m}
                onClick={() => setMethod(m)}
                className={cn("h-9 rounded-full border px-3 text-[13px]", method === m ? "border-[#0E2A47] bg-[#0E2A47] text-white" : "border-[#D5DCE5] bg-white")}
              >
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          {method === "cash" ? null : (
            <label className="flex flex-col gap-1.5 text-sm text-[#46566B]">
              Reference no.
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="From the receipt or app" className={selectClass} />
            </label>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => payInstallmentAction({ installmentId: next.id, method, reference: reference || null }), "Installment payment recorded.")}
            className="h-[42px] rounded-full bg-[#1D5296] text-[13px] text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : `Record ${peso(next.amount)} payment`}
          </button>
        </>
      ) : null}

      {confirmCancel ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-[#FDF0EE] p-3">
          <span className="text-xs text-[#7A1F12]">Unpaid installments are cancelled. Paid ones and the invoice balance stay as they are.</span>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => cancelPlanAction(planId), "Payment plan cancelled.")} className="h-9 flex-1 rounded-full bg-[#B3261E] text-[13px] text-white disabled:opacity-50">
              Cancel plan
            </button>
            <button type="button" onClick={() => setConfirmCancel(false)} className="h-9 flex-1 rounded-full border border-[#D5DCE5] bg-white text-[13px]">
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmCancel(true)} className="h-9 rounded-full border border-[#F6C6BE] bg-white text-[13px] text-[#A1301F]">
          Cancel plan
        </button>
      )}

      {error ? (
        <p role="alert" className="rounded-xl bg-[#FDECEA] px-3 py-2 text-sm text-[#A1301F]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
