"use client";

import { selectClass } from "@/components/forms/styles";
import { cn } from "@/lib/utils";
import { round2 } from "@backend/features/billing/billing.calc";
import { PAYMENT_METHODS } from "@backend/features/billing/billing.schema";
import type { PaymentMethod } from "@backend/features/billing/billing.types";
import { METHOD_LABELS, peso } from "../format";

export interface PaymentDraft {
  method: PaymentMethod;
  amount: string;
  reference: string;
  /** Cash handed over, only to work out change. */
  tendered: string;
}

export const emptyPayment = (amount: number): PaymentDraft => ({ method: "cash", amount: amount > 0 ? amount.toFixed(2) : "", reference: "", tendered: "" });

/** Method, amount, reference and (for cash) change. Shared by checkout and "Record payment". */
export function PaymentFields({ value, onChange, idPrefix }: { value: PaymentDraft; onChange: (next: PaymentDraft) => void; idPrefix: string }) {
  const set = (patch: Partial<PaymentDraft>) => onChange({ ...value, ...patch });
  const change = round2(Number(value.tendered) - Number(value.amount));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div role="group" aria-label="Mode of payment" className="flex flex-wrap gap-2 sm:col-span-2">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={value.method === m}
            onClick={() => set({ method: m })}
            className={cn("h-9 rounded-full border px-3 text-[13px]", value.method === m ? "border-[#0E2A47] bg-[#0E2A47] text-white" : "border-[#D5DCE5] bg-white")}
          >
            {METHOD_LABELS[m]}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-2 text-sm text-[#46566B]" htmlFor={`${idPrefix}-amount`}>
        Amount paid now (₱)
        <input id={`${idPrefix}-amount`} inputMode="decimal" value={value.amount} onChange={(e) => set({ amount: e.target.value })} className={selectClass} />
      </label>
      {value.method === "cash" ? (
        <label className="flex flex-col gap-2 text-sm text-[#46566B]" htmlFor={`${idPrefix}-tendered`}>
          Cash received (₱)
          <input id={`${idPrefix}-tendered`} inputMode="decimal" value={value.tendered} onChange={(e) => set({ tendered: e.target.value })} className={selectClass} />
          {value.tendered && change >= 0 ? <span className="text-xs text-[#1F7A4D]">Change to give: {peso(change)}</span> : null}
          {value.tendered && change < 0 ? <span className="text-xs text-[#B42318]">That&apos;s less than the amount paid.</span> : null}
        </label>
      ) : (
        <label className="flex flex-col gap-2 text-sm text-[#46566B]" htmlFor={`${idPrefix}-reference`}>
          Reference no.
          <input id={`${idPrefix}-reference`} value={value.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="From the receipt or app" className={selectClass} />
        </label>
      )}
    </div>
  );
}
