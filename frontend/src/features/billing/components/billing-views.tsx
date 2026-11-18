import type { ReactNode } from "react";
import Link from "next/link";
import { SearchBox } from "@/components/shared/search-box";
import { clinicDateOf, clinicToday } from "@/config/clinic";
import { cn } from "@/lib/utils";
import { INVOICE_FILTERS } from "@backend/features/billing/billing.schema";
import type { BillingOverview, InvoiceFilter, InvoiceSummary } from "@backend/features/billing/billing.types";
import { STATUS_META, formatOn, formatWhen, methodLabel, peso, statusLabel } from "../format";
import { billingHref } from "../billing-tabs";
import { VoidDecisionButtons } from "./void-decision-buttons";

const MS_PER_DAY = 86_400_000;
const AGING = [
  { label: "0–30 days", maxDays: 30, color: "#2F64A8" },
  { label: "31–60 days", maxDays: 60, color: "#F39A1E" },
  { label: "61–90 days", maxDays: 90, color: "#E07A1F" },
  { label: "Over 90 days", maxDays: Infinity, color: "#D9483B" },
] as const;

const card = "glass-card flex min-w-0 flex-col rounded-[26px] px-[22px] py-5";
const pillClass = "inline-flex h-[26px] items-center rounded-full px-[11px] text-xs whitespace-nowrap";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const invoicesHref = (filter: InvoiceFilter = "all", search?: string) => billingHref("invoices", { filter: filter === "all" ? undefined : filter, q: search });

function Kpi({ href, label, value, note, positive }: { href: string; label: string; value: string; note: string; positive?: boolean }) {
  return (
    <Link href={href} className="glass-card flex min-w-0 flex-col gap-1.5 rounded-[24px] p-[18px] hover:brightness-[1.02]">
      <span className="text-[13px] text-[#5E6B7E]">{label}</span>
      <span className="text-[30px] leading-tight font-light tabular-nums">{value}</span>
      <span className={cn("truncate text-xs", positive === undefined ? "text-[#5E6B7E]" : positive ? "text-[#2E8A57]" : "text-[#A1301F]")}>{note}</span>
    </Link>
  );
}

function agingBuckets(unpaid: InvoiceSummary[]) {
  const today = Date.parse(clinicToday());
  const totals = AGING.map(() => 0);
  for (const i of unpaid) {
    const days = (today - Date.parse(clinicDateOf(i.issuedAt))) / MS_PER_DAY;
    totals[AGING.findIndex((b) => days <= b.maxDays)] += i.balance;
  }
  const max = Math.max(...totals, 1);
  return AGING.map((b, k) => ({ ...b, total: totals[k], width: totals[k] ? Math.max(2, Math.round((totals[k] / max) * 100)) : 0 }));
}

function monthComparison(o: BillingOverview) {
  if (!o.collectedLastMonthToDate) return "Nothing collected by this day last month";
  const pct = ((o.collectedThisMonth - o.collectedLastMonthToDate) / o.collectedLastMonthToDate) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs the same days last month (${peso(o.collectedLastMonthToDate)})`;
}

export function OverviewView({ overview: o }: { overview: BillingOverview }) {
  const buckets = agingBuckets(o.unpaid);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi href={invoicesHref("paid")} label="Collected this month" value={peso(o.collectedThisMonth)} note={monthComparison(o)} positive={o.collectedThisMonth >= o.collectedLastMonthToDate} />
        <Kpi href={invoicesHref("paid")} label="Collected today" value={peso(o.collectedToday)} note="Payments received at the clinic" />
        <Kpi href={invoicesHref("unpaid")} label="Unpaid by patients" value={peso(o.unpaidBalance)} note={`${plural(o.unpaid.length, "invoice")} open`} />
        <Kpi href={invoicesHref()} label="Awaiting HMO payment" value={peso(o.hmoPending)} note="Billed to HMOs, not yet paid" />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Unpaid balances" className={cn(card, "flex-[1_1_380px] gap-3.5")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-normal">Unpaid balances</h2>
            <span className="text-xs text-[#5E6B7E]">Patients · {peso(o.unpaidBalance)}</span>
          </div>
          {buckets.map((b) => (
            <Link key={b.label} href={invoicesHref("unpaid")} className="grid grid-cols-[96px_minmax(0,1fr)_92px] items-center gap-3 py-1">
              <span className="text-[13px] text-[#46566B]">{b.label}</span>
              <span className="h-3.5 rounded-full bg-[#EDF0F4]">
                <span className="block h-3.5 rounded-full" style={{ width: `${b.width}%`, background: b.color }} />
              </span>
              <span className="text-right text-sm tabular-nums">{peso(b.total)}</span>
            </Link>
          ))}
          <Link href={invoicesHref("unpaid")} className="inline-flex h-[38px] items-center self-start rounded-full border border-[#D5DCE5] bg-white px-4 text-[13px] text-[#1D5296] hover:bg-[#F4F6F9]">
            View unpaid invoices
          </Link>
        </section>

        <section aria-label="Latest payments" className={cn(card, "flex-[1_1_380px] gap-1")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 pb-1.5">
            <h2 className="text-xl font-normal">Latest payments</h2>
            <Link href={invoicesHref()} className="text-[13px] text-[#1D5296]">
              All invoices ›
            </Link>
          </div>
          {o.latestPayments.length ? (
            <ul className="flex flex-col">
              {o.latestPayments.map((p) => {
                const body = (
                  <>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm">{p.patientName ?? "—"}</span>
                      <span className="truncate text-xs text-[#5E6B7E]">
                        {[p.invoiceNumber, formatWhen(p.receivedAt), methodLabel(p.method), p.status === "refund_due" ? "to refund" : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className={cn("text-sm whitespace-nowrap tabular-nums", p.status === "refund_due" ? "text-[#5E6B7E] line-through" : "text-[#1F7A4D]")}>{peso(p.amount)}</span>
                  </>
                );
                const row = "flex items-center justify-between gap-2.5 border-b border-[#EDF0F4] py-[9px]";
                return (
                  <li key={p.id}>
                    {p.invoiceId ? (
                      <Link href={`/billing/invoices/${p.invoiceId}`} className={cn(row, "hover:bg-[#F7F9FC]")}>
                        {body}
                      </Link>
                    ) : (
                      <div className={row}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-2 text-sm text-[#5E6B7E]">No payments yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function VoidRequests({ overview: o }: { overview: BillingOverview }) {
  if (!o.pendingVoids.length) return null;
  return (
    <section aria-label="Cancellation requests" className="flex flex-col gap-2 rounded-[26px] border border-[#FDE3BD] bg-[#FFF6EA] px-[22px] py-4">
      <h2 className="text-base font-medium text-[#5A3500]">
        {plural(o.pendingVoids.length, "cancellation request")} waiting for approval
      </h2>
      <ul className="flex flex-col divide-y divide-[#FDE3BD]">
        {o.pendingVoids.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span className="flex min-w-0 flex-col">
              <Link href={`/billing/invoices/${v.invoice.id}`} className="text-sm font-medium underline underline-offset-3">
                {v.invoice.number} · {v.invoice.patient.name} · {peso(v.invoice.total)}
              </Link>
              <span className="text-xs text-[#5E6B7E]">
                {v.reason} · requested by {v.requestedBy} {formatWhen(v.createdAt)}
              </span>
            </span>
            <VoidDecisionButtons invoiceId={v.invoice.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const FILTER_LABELS: Record<InvoiceFilter, string> = { all: "All", unpaid: "Unpaid", paid: "Paid", void: "Cancelled" };
const th = "border-b border-[#E3E7ED] px-3.5 py-3 text-left text-[11px] font-medium tracking-[0.06em] whitespace-nowrap text-[#5E6B7E] uppercase";
const td = "border-b border-[#EDF0F4] px-3.5 py-[11px] text-[13px] whitespace-nowrap";

interface InvoicesViewProps {
  result: { items: InvoiceSummary[]; total: number };
  filter: InvoiceFilter;
  search?: string;
  selectedId?: string;
  /** The selected invoice, shown beside the table. */
  aside: ReactNode;
}

export function InvoicesView({ result, filter, search, selectedId, aside }: InvoicesViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Filter invoices" className="flex flex-wrap gap-2">
          {INVOICE_FILTERS.map((f) => (
            <Link
              key={f}
              href={invoicesHref(f, search)}
              aria-current={filter === f ? "page" : undefined}
              className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[13px]", filter === f ? "border-[#1D5296] bg-[#1D5296] text-white" : "border-[#D5DCE5] bg-white text-[#46566B] hover:bg-[#F4F6F9]")}
            >
              {FILTER_LABELS[f]}
            </Link>
          ))}
        </nav>
        <div className="ml-auto min-w-60 flex-[0_1_340px]">
          <SearchBox id="invoice-search" label="Search invoices" placeholder="Search invoice no., patient or patient no." />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
      <section aria-label="Sales invoices" className="glass-card min-w-0 flex-[999_1_560px] overflow-hidden rounded-[26px]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Invoice no.</th>
                <th className={th}>Patient</th>
                <th className={th}>Payer</th>
                <th className={th}>Date</th>
                <th className={cn(th, "text-right")}>Amount</th>
                <th className={cn(th, "text-right")}>Balance</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((i) => (
                <tr key={i.id} className={i.id === selectedId ? "bg-[#EEF3FA]" : "hover:bg-[#F7F9FC]"}>
                  <td className={td}>
                    <Link href={`${invoicesHref(filter, search)}&inv=${i.id}`} scroll={false} aria-current={i.id === selectedId ? "true" : undefined} className="text-[#1D5296] tabular-nums underline underline-offset-3">
                      {i.number}
                    </Link>
                  </td>
                  <td className={td}>
                    {i.patient.name} <span className="text-xs text-[#5E6B7E]">{i.patient.patientNo}</span>
                  </td>
                  <td className={cn(td, "text-[#46566B]")}>{i.payerName ?? "Self-pay"}</td>
                  <td className={cn(td, "text-[#5E6B7E]")}>{formatOn(i.issuedAt)}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{peso(i.total)}</td>
                  <td className={cn(td, "text-right tabular-nums", i.balance > 0 ? "text-[#A1301F]" : "text-[#5E6B7E]")}>{i.balance > 0 ? peso(i.balance) : "—"}</td>
                  <td className={td}>
                    <span className={cn(pillClass, STATUS_META[i.status].className)}>{statusLabel(i)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.items.length === 0 ? <p className="px-3.5 py-8 text-center text-sm text-[#5E6B7E]">No invoices match.</p> : null}
        <p className="px-3.5 py-3 text-xs text-[#5E6B7E]">
          {result.total > result.items.length ? `Showing the latest ${result.items.length} of ${result.total}. Search to narrow it down.` : plural(result.total, "invoice")}
        </p>
      </section>
      {aside}
      </div>
    </div>
  );
}
