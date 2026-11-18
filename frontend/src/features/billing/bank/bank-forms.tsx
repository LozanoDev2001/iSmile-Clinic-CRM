"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clinicToday } from "@/config/clinic";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@backend/lib/api/response";
import { addBankAccountAction, addDepositAction, matchDepositAction, unmatchDepositAction } from "@backend/features/billing/bank/bank.controller";
import type { BankAccountRow } from "@backend/features/billing/bank/bank.types";

const field = "h-10 min-w-0 rounded-full border border-[#D5DCE5] bg-white px-4 text-sm outline-none placeholder:text-[#8A97A8] focus-visible:border-[#1D5296] focus-visible:ring-3 focus-visible:ring-[#1D5296]/15";
const label = "flex min-w-0 flex-col gap-1.5 text-[13px] text-[#46566B]";
const primary = "h-10 rounded-full bg-[#1D5296] px-4 text-[13px] text-white disabled:opacity-60";
const secondary = "h-9 rounded-full border border-[#D5DCE5] bg-white px-3.5 text-[13px] text-[#0E2A47] hover:bg-[#F4F6F9] disabled:opacity-60";

/** Runs a server action, then toasts and refreshes; returns the first error so the form can show it. */
function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const run = (action: () => Promise<ActionResult<unknown>>, onDone?: () => void) => {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(Object.values(result.error.fields ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      toast.success(result.message ?? "Saved.");
      onDone?.();
      router.refresh();
    });
  };
  return { pending, error, run };
}

function FormError({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="rounded-xl bg-[#FDECEA] px-3 py-2 text-[13px] text-[#A1301F]">
      {error}
    </p>
  ) : null;
}

export function AddAccountForm() {
  const { pending, error, run } = useAction();
  const [name, setName] = useState("");
  const [lastFour, setLastFour] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(() => addBankAccountAction({ label: name, lastFour }), () => {
      setName("");
      setLastFour("");
    });
  };
  return (
    <form onSubmit={submit} aria-label="Add a bank or e-wallet account" className="flex flex-col gap-2.5 border-t border-[#EDF0F4] pt-3">
      <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2">
        <label className={label}>
          Bank or e-wallet
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. BDO Savings, GCash" className={field} />
        </label>
        <label className={label}>
          Last 4
          <input value={lastFour} onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={4} placeholder="1234" className={field} />
        </label>
      </div>
      <FormError error={error} />
      <button type="submit" disabled={pending} className={cn(secondary, "self-start")}>
        {pending ? "Adding…" : "Add account"}
      </button>
    </form>
  );
}

export function AddDepositForm({ accounts }: { accounts: BankAccountRow[] }) {
  const { pending, error, run } = useAction();
  const today = clinicToday();
  const [bankAccountId, setAccount] = useState(accounts[0]?.id ?? "");
  const [postedOn, setPostedOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(() => addDepositAction({ bankAccountId, postedOn, amount, reference }), () => {
      setAmount("");
      setReference("");
    });
  };
  return (
    <form onSubmit={submit} aria-label="Add a bank deposit" className="flex flex-col gap-2.5 px-5 pb-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_150px_130px_minmax(0,1fr)_auto] sm:items-end">
        <label className={label}>
          Account
          <select value={bankAccountId} onChange={(e) => setAccount(e.target.value)} className={field}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.lastFour ? ` ··${a.lastFour}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Date in bank
          <input type="date" value={postedOn} max={today} onChange={(e) => setPostedOn(e.target.value)} className={field} />
        </label>
        <label className={label}>
          Amount
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={field} />
        </label>
        <label className={label}>
          Reference
          <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} placeholder="From the bank statement" className={field} />
        </label>
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Adding…" : "Add deposit"}
        </button>
      </div>
      <FormError error={error} />
    </form>
  );
}

export interface PaymentOption {
  id: string;
  label: string;
}

export function MatchControl({ transactionId, suggestions, others }: { transactionId: string; suggestions: PaymentOption[]; others: PaymentOption[] }) {
  const { pending, error, run } = useAction();
  const [paymentId, setPaymentId] = useState(suggestions[0]?.id ?? "");
  if (!suggestions.length && !others.length) return <span className="text-xs text-[#5E6B7E]">No payments to match</span>;
  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5">
        <select value={paymentId} onChange={(e) => setPaymentId(e.target.value)} aria-label="Payment to match" className={cn(field, "h-9 max-w-[240px] px-3 text-[13px]")}>
          <option value="">Choose a payment…</option>
          {suggestions.length ? (
            <optgroup label="Same amount, within a week">
              {suggestions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          ) : null}
          {others.length ? (
            <optgroup label="Other payments not yet in the bank">
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <button type="button" disabled={pending || !paymentId} onClick={() => run(() => matchDepositAction({ transactionId, paymentId }))} className={secondary}>
          Match
        </button>
      </span>
      {error ? (
        <span role="alert" className="text-xs text-[#A1301F]">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function UnmatchButton({ transactionId }: { transactionId: string }) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex flex-col gap-1">
      <button type="button" disabled={pending} onClick={() => run(() => unmatchDepositAction(transactionId))} className="self-start text-[13px] text-[#1D5296] underline underline-offset-3 disabled:opacity-60">
        Unmatch
      </button>
      {error ? (
        <span role="alert" className="text-xs text-[#A1301F]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
