"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { inputClass, selectClass } from "@/components/forms/styles";
import { clinicToday } from "@/config/clinic";
import { addExpenseAction, deleteExpenseAction } from "@backend/features/billing/reports/billing-reports.controller";
import { EXPENSE_CATEGORIES } from "@backend/features/billing/reports/billing-reports.schema";
import type { Expense, ExpenseCategory } from "@backend/features/billing/reports/billing-reports.types";
import { formatOn, peso } from "../format";

const label = "flex flex-col gap-1.5 text-sm text-[#46566B]";

/** Expense entry for the profit and loss report; entries are listed for the month shown. */
export function ExpensePanel({ entries, canEdit }: { entries: Expense[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<ExpenseCategory | "">("");
  const [amount, setAmount] = useState("");
  const [incurredOn, setIncurredOn] = useState(clinicToday());
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const save = () => {
    setError("");
    if (!category) return setError("Choose a category.");
    startTransition(async () => {
      const result = await addExpenseAction({ category, amount, incurredOn, description });
      if (!result.success) {
        setError(Object.values(result.error.fields ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      toast.success(result.message ?? "Expense recorded.");
      setAmount("");
      setDescription("");
      router.refresh();
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      const result = await deleteExpenseAction(id);
      if (!result.success) return void toast.error(result.error.message);
      toast.success(result.message ?? "Expense removed.");
      router.refresh();
    });

  return (
    <section aria-label="Expenses" className="glass-card flex flex-col gap-4 rounded-[26px] px-[22px] py-5 print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-normal">Expenses this month</h2>
        <span className="text-xs text-[#5E6B7E]">Feeds the profit and loss above</span>
      </div>

      {canEdit ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_160px_170px_minmax(0,1.4fr)_auto] xl:items-end">
          <label className={label}>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={selectClass}>
              <option value="">Choose…</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Amount (₱)
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
          </label>
          <label className={label}>
            Date
            <input type="date" value={incurredOn} max={clinicToday()} onChange={(e) => setIncurredOn(e.target.value)} className={inputClass} />
          </label>
          <label className={label}>
            Description (optional)
            <input type="text" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. November clinic rent" className={inputClass} />
          </label>
          <button type="button" disabled={pending} onClick={save} className="h-12 rounded-full bg-[#F39A1E] px-5 text-sm font-medium text-[#0E2A47] hover:brightness-105 disabled:opacity-60">
            {pending ? "Saving…" : "Add expense"}
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-[#FDECEA] px-3 py-2 text-sm text-[#A1301F]">
          {error}
        </p>
      ) : null}

      {entries.length ? (
        <ul className="flex flex-col">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 border-b border-[#EDF0F4] py-2.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm">{e.description ?? e.category}</span>
                <span className="text-xs text-[#5E6B7E]">
                  {e.category} · {formatOn(new Date(`${e.incurredOn}T00:00:00+08:00`))}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-sm whitespace-nowrap tabular-nums">{peso(e.amount)}</span>
                {canEdit ? (
                  <button type="button" disabled={pending} onClick={() => remove(e.id)} aria-label={`Remove ${e.category} expense of ${peso(e.amount)}`} className="grid size-9 place-items-center rounded-full text-[#A1301F] hover:bg-[#FDECEA] disabled:opacity-60">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#5E6B7E]">No expenses entered for this month yet.</p>
      )}
    </section>
  );
}
