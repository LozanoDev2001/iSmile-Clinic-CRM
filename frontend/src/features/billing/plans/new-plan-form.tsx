"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/styles";
import type { InvoiceSummary } from "@backend/features/billing/billing.types";
import { addMonths, splitInstallments } from "@backend/features/billing/plans/plans.calc";
import { createPlanAction } from "@backend/features/billing/plans/plans.controller";
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS } from "@backend/features/billing/plans/plans.schema";
import { billingHref } from "../billing-tabs";
import { peso } from "../format";
import { formatDue } from "./format";

const MONTH_OPTIONS = Array.from({ length: MAX_INSTALLMENTS - MIN_INSTALLMENTS + 1 }, (_, i) => MIN_INSTALLMENTS + i);
const DEFAULT_MONTHS = 6;

/** Splits an unpaid invoice's balance into monthly installments. */
export function NewPlanForm({ invoices, today }: { invoices: InvoiceSummary[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [months, setMonths] = useState(DEFAULT_MONTHS);
  const [firstDueOn, setFirstDueOn] = useState(today);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const invoice = invoices.find((i) => i.id === invoiceId);
  const split = invoice ? splitInstallments(invoice.balance, months) : null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-[#D5DCE5] bg-white px-4 text-sm hover:bg-[#F4F6F9]">
        <Plus className="size-4" aria-hidden />
        New payment plan
      </button>
    );
  }

  const save = () => {
    setError("");
    if (!invoiceId) return setError("Choose an unpaid invoice.");
    startTransition(async () => {
      const result = await createPlanAction({ invoiceId, installments: months, firstDueOn });
      if (!result.success) {
        setError(Object.values(result.error.fields ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      toast.success(result.message ?? "Payment plan created.");
      setOpen(false);
      setInvoiceId("");
      router.push(billingHref("plans", { plan: result.data.id }), { scroll: false });
      router.refresh();
    });
  };

  return (
    <section aria-label="New payment plan" className="glass-card flex flex-col gap-4 rounded-[26px] px-[22px] py-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-normal">New payment plan</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-[#F4F6F9]">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {invoices.length === 0 ? (
        <p className="text-sm text-[#5E6B7E]">No unpaid invoices without a plan. Issue an invoice first, or finish an existing plan.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_190px]">
            <label className="flex flex-col gap-1.5 text-sm text-[#46566B]">
              Unpaid invoice
              <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className={selectClass}>
                <option value="">Choose…</option>
                {invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.number} · {i.patient.name} · {peso(i.balance)} due
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-[#46566B]">
              Months
              <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={selectClass}>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} months
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-[#46566B]">
              First payment due
              <input type="date" value={firstDueOn} min={today} onChange={(e) => e.target.value && setFirstDueOn(e.target.value)} className={selectClass} />
            </label>
          </div>
          {invoice ? (
            <p className="rounded-2xl bg-[#F4F6F9] px-4 py-3 text-sm text-[#46566B]">
              {split
                ? `${months} monthly payments of ${peso(split[0])}${split[months - 1] !== split[0] ? ` (last one ${peso(split[months - 1])})` : ""} · ${formatDue(firstDueOn)} to ${formatDue(addMonths(firstDueOn, months - 1))} · total ${peso(invoice.balance)}`
                : "The balance is too small to split into that many payments."}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-xl bg-[#FDECEA] px-3 py-2 text-sm text-[#A1301F]">
              {error}
            </p>
          ) : null}
          <button type="button" disabled={pending || !split} onClick={save} className="h-11 self-start rounded-full bg-[#F39A1E] px-5 text-sm font-medium text-[#0E2A47] hover:brightness-105 disabled:opacity-60">
            {pending ? "Creating…" : "Create payment plan"}
          </button>
        </>
      )}
    </section>
  );
}
