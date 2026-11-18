"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/styles";
import { VOID_REASONS } from "@backend/features/billing/billing.schema";
import { cancelInvoiceAction, decideVoidRequestAction, recordPaymentAction } from "@backend/features/billing/billing.controller";
import type { InvoiceDetail } from "@backend/features/billing/billing.types";
import { formatWhen, peso } from "../format";
import { PaymentFields, emptyPayment, type PaymentDraft } from "./payment-fields";

interface InvoiceActionsProps {
  invoice: InvoiceDetail;
  canPay: boolean;
  canCancel: boolean;
  canApprove: boolean;
}

const panel = "glass-card flex flex-col gap-3 rounded-[24px] p-5 print:hidden";
const secondary = "h-10 rounded-full border border-[#D5DCE5] bg-white px-4 text-sm disabled:opacity-50";

export function InvoiceActions({ invoice: i, canPay, canCancel, canApprove }: InvoiceActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [payment, setPayment] = useState<PaymentDraft>(() => emptyPayment(i.balance));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const run = (action: () => Promise<{ success: boolean; message?: string; error?: { message: string; fields?: Record<string, string[]> } }>, fallback: string, after?: () => void) =>
    startTransition(async () => {
      setError("");
      const result = await action();
      if (!result.success) {
        setError(Object.values(result.error?.fields ?? {})[0]?.[0] ?? result.error?.message ?? "Something went wrong.");
        return;
      }
      toast.success(result.message ?? fallback);
      after?.();
      router.refresh();
    });

  const active = i.status !== "void";

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => window.print()} className={`${secondary} inline-flex items-center justify-center gap-2 print:hidden`}>
        <Printer className="size-4" aria-hidden />
        Print or save as PDF
      </button>

      {active && canPay && i.balance > 0 ? (
        <section aria-label="Record payment" className={panel}>
          <h2 className="text-lg">Record payment</h2>
          <p className="text-sm text-[#5E6B7E]">Balance {peso(i.balance)}</p>
          <PaymentFields value={payment} onChange={setPayment} idPrefix="pay" />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => recordPaymentAction(i.id, { amount: payment.amount, method: payment.method, reference: payment.reference || null }),
                "Payment recorded.",
                () => setPayment(emptyPayment(0)),
              )
            }
            className="fill-orange h-12 rounded-full text-[15px] font-medium text-[#0E2A47] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Record payment"}
          </button>
        </section>
      ) : null}

      {active && i.pendingVoid ? (
        <section aria-label="Cancellation request" className={panel}>
          <h2 className="text-lg">Cancellation requested</h2>
          <p className="text-sm">
            {i.pendingVoid.requestedBy} asked to cancel this invoice on {formatWhen(i.pendingVoid.createdAt)}: “{i.pendingVoid.reason}”.
          </p>
          {canApprove ? (
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={() => run(() => decideVoidRequestAction(i.id, true), "Invoice cancelled.")} className="h-10 flex-1 rounded-full bg-[#B3261E] text-sm text-white disabled:opacity-50">
                Approve and cancel
              </button>
              <button type="button" disabled={pending} onClick={() => run(() => decideVoidRequestAction(i.id, false), "Request declined.")} className={`${secondary} flex-1`}>
                Decline
              </button>
            </div>
          ) : (
            <p className="text-xs text-[#5E6B7E]">Waiting for the owner or general manager.</p>
          )}
        </section>
      ) : null}

      {active && canCancel && !i.pendingVoid ? (
        <section aria-label="Cancel invoice" className={panel}>
          <h2 className="text-lg">{canApprove ? "Cancel invoice" : "Request cancellation"}</h2>
          <p className="text-xs text-[#5E6B7E]">
            {canApprove
              ? "The invoice keeps its number and is marked cancelled. Any payment on it is flagged for refund."
              : "The owner or general manager approves cancellations. The invoice stays until they do."}
          </p>
          <select aria-label="Reason for cancelling" value={reason} onChange={(e) => setReason(e.target.value)} className={selectClass}>
            <option value="">Pick a reason…</option>
            {VOID_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !reason}
            onClick={() => run(() => cancelInvoiceAction(i.id, reason), canApprove ? "Invoice cancelled." : "Cancellation requested.")}
            className="h-10 rounded-full border border-[#F6C6BE] bg-white text-sm text-[#A1301F] disabled:opacity-50"
          >
            {canApprove ? "Cancel invoice" : "Send request"}
          </button>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl bg-[#FDECEA] px-3 py-2 text-sm text-[#A1301F] print:hidden">
          {error}
        </p>
      ) : null}
    </div>
  );
}
