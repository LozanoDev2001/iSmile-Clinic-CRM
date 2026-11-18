import Link from "next/link";
import { CLINIC_TIME_ZONE, clinicInstant } from "@/config/clinic";
import { cn } from "@/lib/utils";
import type { BillingTabProps } from "@/features/billing/billing-tabs";
import { getCollections } from "@backend/features/billing/bank/bank.service";
import type { DepositRow, MatchablePayment } from "@backend/features/billing/bank/bank.types";
import { formatOn, methodLabel, peso } from "../format";
import { AddAccountForm, AddDepositForm, MatchControl, UnmatchButton, type PaymentOption } from "./bank-forms";

const card = "glass-card flex min-w-0 flex-col rounded-[26px]";
const pill = "inline-flex h-[26px] items-center rounded-full px-[11px] text-xs whitespace-nowrap";
const th = "border-b border-[#E3E7ED] px-3.5 py-3 text-left text-[11px] font-medium tracking-[0.06em] whitespace-nowrap text-[#5E6B7E] uppercase";
const td = "border-b border-[#EDF0F4] px-3.5 py-[11px] text-[13px] whitespace-nowrap";
const METHOD_BAR = ["#1D5296", "#F39A1E", "#2E9E63", "#7A5AF8", "#5E6B7E"];

const monthName = (monthStart: string) => new Intl.DateTimeFormat("en-PH", { month: "long", timeZone: CLINIC_TIME_ZONE }).format(clinicInstant(monthStart));
const onDay = (date: string) => formatOn(clinicInstant(date));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function paymentLabel(p: MatchablePayment) {
  return [formatOn(p.receivedAt), p.patientName ?? "No patient", methodLabel(p.method), peso(p.amount), p.reference].filter(Boolean).join(" · ");
}

function AppliedTo({ payment: p }: { payment: MatchablePayment }) {
  return (
    <span className="flex flex-col">
      <span>{p.patientName ?? "—"}</span>
      <span className="text-xs text-[#5E6B7E]">
        {p.invoiceId ? (
          <Link href={`/billing/invoices/${p.invoiceId}`} className="text-[#1D5296] underline underline-offset-3">
            {p.invoiceNumber}
          </Link>
        ) : null}
        {p.invoiceId ? " · " : ""}
        {methodLabel(p.method)} · {formatOn(p.receivedAt)}
      </span>
    </span>
  );
}

function DepositResult({ deposit: d, canEdit, others }: { deposit: DepositRow; canEdit: boolean; others: PaymentOption[] }) {
  if (d.matched) {
    const diff = Math.round((d.amount - d.matched.amount) * 100) / 100;
    return (
      <span className="flex items-center gap-3">
        <span className={cn(pill, "bg-[#9EDBC0] text-[#0B3D26]")}>{diff === 0 ? "Matched" : `Matched · ${diff > 0 ? "+" : ""}${peso(diff)}`}</span>
        {canEdit ? <UnmatchButton transactionId={d.id} /> : null}
      </span>
    );
  }
  const suggestionIds = new Set(d.suggestions.map((s) => s.id));
  return (
    <span className="flex flex-wrap items-center gap-3">
      <span className={cn(pill, "bg-[#F9B4AA] text-[#5A1308]")}>Unmatched</span>
      {canEdit ? (
        <MatchControl
          transactionId={d.id}
          suggestions={d.suggestions.map((s) => ({ id: s.id, label: paymentLabel(s) }))}
          others={others.filter((o) => !suggestionIds.has(o.id))}
        />
      ) : null}
    </span>
  );
}

export async function CollectionsTab({ user }: BillingTabProps) {
  const b = await getCollections(user);
  const month = monthName(b.monthStart);
  const cash = b.byMethod.find((m) => m.method === "cash")?.amount ?? 0;
  const others = b.unseenPayments.map((p) => ({ id: p.id, label: paymentLabel(p) }));
  const summary = [
    { label: `Collected in ${month}`, value: peso(b.total), strong: true },
    { label: "Cash at the clinic", value: peso(cash) },
    { label: "Card, e-wallet and bank", value: peso(Math.round((b.total - cash) * 100) / 100) },
    { label: `Deposits not matched · ${b.unmatchedDeposits.count}`, value: peso(b.unmatchedDeposits.amount), alert: b.unmatchedDeposits.count > 0 },
    { label: "Payments not yet in the bank", value: String(b.unseenPayments.length), alert: b.unseenPayments.length > 0 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        {b.byMethod.length ? (
          b.byMethod.map((m, i) => (
            <div key={m.method} className="glass-card flex min-w-0 flex-col gap-1 rounded-[22px] p-4">
              <span className="text-[13px] text-[#5E6B7E]">
                {methodLabel(m.method)} · {month}
              </span>
              <span className="text-2xl font-light tabular-nums">{peso(m.amount)}</span>
              <span className="text-xs text-[#5E6B7E]">
                {plural(m.count, "payment")} · {m.share}%
              </span>
              <span className="mt-1 h-2 rounded-full bg-[#EDF0F4]">
                <span className="block h-2 rounded-full" style={{ width: `${Math.max(2, m.share)}%`, background: METHOD_BAR[i % METHOD_BAR.length] }} />
              </span>
            </div>
          ))
        ) : (
          <p className="glass-card rounded-[22px] p-4 text-sm text-[#5E6B7E] sm:col-span-2 xl:col-span-5">No payments received in {month} yet.</p>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Bank deposits" className={cn(card, "flex-[999_1_560px] overflow-hidden")}>
          <div className="flex flex-col gap-0.5 px-5 pt-[18px] pb-3">
            <h2 className="text-xl font-normal">Bank deposits</h2>
            <span className="text-xs text-[#5E6B7E]">Money that reached the clinic&apos;s bank or e-wallet, matched against payments recorded at the desk</span>
          </div>
          {b.canEdit && b.accounts.length ? <AddDepositForm accounts={b.accounts} /> : null}
          {b.canEdit && !b.accounts.length ? <p className="px-5 pb-4 text-[13px] text-[#5E6B7E]">Add the clinic&apos;s bank or e-wallet account first, on the right.</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Account</th>
                  <th className={th}>Reference</th>
                  <th className={th}>Applied to</th>
                  <th className={cn(th, "text-right")}>Deposited</th>
                  <th className={th}>Result</th>
                </tr>
              </thead>
              <tbody>
                {b.deposits.map((d) => (
                  <tr key={d.id} className="align-top hover:bg-[#F7F9FC]">
                    <td className={td}>{onDay(d.postedOn)}</td>
                    <td className={cn(td, "text-[#46566B]")}>
                      {d.account.label}
                      {d.account.lastFour ? ` ··${d.account.lastFour}` : ""}
                    </td>
                    <td className={cn(td, "text-[#46566B]")}>
                      {d.reference ?? "—"}
                      {d.description ? <span className="block text-xs whitespace-normal text-[#5E6B7E]">{d.description}</span> : null}
                    </td>
                    <td className={td}>{d.matched ? <AppliedTo payment={d.matched} /> : <span className="text-[#5E6B7E]">Can&apos;t tie to an invoice yet</span>}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{peso(d.amount)}</td>
                    <td className={td}>
                      <DepositResult deposit={d} canEdit={b.canEdit} others={others} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {b.deposits.length === 0 ? <p className="px-5 py-8 text-center text-sm text-[#5E6B7E]">No deposits recorded yet.</p> : null}
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <section aria-label="This month" className={cn(card, "gap-2 p-5")}>
            <span className="text-xs text-[#5E6B7E]">Collection summary</span>
            <h2 className="mb-1.5 text-xl font-normal">{month}</h2>
            {summary.map((s) => (
              <div
                key={s.label}
                className={cn("flex justify-between gap-2.5 text-[13px]", s.strong ? "border-b border-[#E3E7ED] pb-2 text-[15px]" : "text-[#46566B]", s.alert && "text-[#A1301F]")}
              >
                <span>{s.label}</span>
                <span className="tabular-nums">{s.value}</span>
              </div>
            ))}
          </section>

          <section aria-label="Bank and e-wallet accounts" className={cn(card, "gap-2.5 p-5")}>
            <h2 className="text-lg font-normal">Bank and e-wallet accounts</h2>
            {b.accounts.length ? (
              <ul className="flex flex-col">
                {b.accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 border-b border-[#EDF0F4] py-2 text-sm last:border-0">
                    <span>
                      {a.label}
                      {a.lastFour ? <span className="text-[#5E6B7E]"> ··{a.lastFour}</span> : null}
                    </span>
                    <span className="text-xs text-[#5E6B7E]">{plural(a.deposits, "deposit")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#5E6B7E]">No accounts yet.</p>
            )}
            {b.canEdit ? <AddAccountForm /> : null}
          </section>
        </aside>
      </div>

      <section aria-label="Payments not yet in the bank" className={cn(card, "overflow-hidden")}>
        <div className="flex flex-col gap-0.5 px-5 pt-[18px] pb-3">
          <h2 className="text-xl font-normal">Not yet seen in the bank</h2>
          <span className="text-xs text-[#5E6B7E]">Card, GCash, Maya and bank transfer payments with no matching deposit yet</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Received</th>
                <th className={th}>Patient</th>
                <th className={th}>Invoice</th>
                <th className={th}>Method</th>
                <th className={th}>Reference</th>
                <th className={cn(th, "text-right")}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {b.unseenPayments.map((p) => (
                <tr key={p.id} className="hover:bg-[#F7F9FC]">
                  <td className={td}>{formatOn(p.receivedAt)}</td>
                  <td className={td}>{p.patientName ?? "—"}</td>
                  <td className={td}>
                    {p.invoiceId ? (
                      <Link href={`/billing/invoices/${p.invoiceId}`} className="text-[#1D5296] tabular-nums underline underline-offset-3">
                        {p.invoiceNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={cn(td, "text-[#46566B]")}>{methodLabel(p.method)}</td>
                  <td className={cn(td, "text-[#46566B]")}>{p.reference ?? "—"}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{peso(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {b.unseenPayments.length === 0 ? <p className="px-5 py-8 text-center text-sm text-[#5E6B7E]">Every card, e-wallet and bank payment is matched to a deposit.</p> : null}
      </section>
    </div>
  );
}
