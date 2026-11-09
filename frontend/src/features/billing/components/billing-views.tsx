import Link from "next/link";
import { SearchBox } from "@/components/shared/search-box";
import { cn } from "@/lib/utils";
import { INVOICE_FILTERS } from "@backend/features/billing/billing.schema";
import type { BillingOverview, InvoiceFilter, InvoiceSummary } from "@backend/features/billing/billing.types";
import { STATUS_META, formatOn, formatWhen, methodLabel, peso, statusLabel } from "../format";
import { VoidDecisionButtons } from "./void-decision-buttons";

function Stat({ label, value, note, highlight }: { label: string; value: string; note: string; highlight?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-[22px] px-4 py-3.5", highlight ? "bg-[#1D5296] text-white" : "glass-card")}>
      <span className={cn("text-xs", highlight ? "text-[#CFE0F5]" : "text-[#5E6B7E]")}>{label}</span>
      <span className="text-2xl tabular-nums">{value}</span>
      <span className={cn("text-xs", highlight ? "text-[#CFE0F5]" : "text-[#5E6B7E]")}>{note}</span>
    </div>
  );
}

function InvoiceRow({ invoice: i }: { invoice: InvoiceSummary }) {
  return (
    <li>
      <Link href={`/billing/invoices/${i.id}`} className="grid gap-1 rounded-xl px-2 py-2.5 hover:bg-[#F4F6F9] sm:grid-cols-[130px_minmax(0,1fr)_140px_120px] sm:items-center">
        <span className="text-sm font-medium">{i.number}</span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm">{i.patient.name}</span>
          <span className="text-xs text-[#5E6B7E]">
            {formatOn(i.issuedAt)}
            {i.payerName ? ` · ${i.payerName}` : ""}
          </span>
        </span>
        <span className={cn("justify-self-start rounded-full px-2 py-0.5 text-xs", STATUS_META[i.status].className)}>{statusLabel(i)}</span>
        <span className="flex flex-col text-right text-sm tabular-nums">
          {peso(i.total)}
          {i.balance > 0 ? <span className="text-xs text-[#B42318]">{peso(i.balance)} due</span> : null}
        </span>
      </Link>
    </li>
  );
}

export function OverviewView({ overview: o, canApprove }: { overview: BillingOverview; canApprove: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat highlight label="Collected today" value={peso(o.collectedToday)} note="Payments received at the clinic" />
        <Stat label="Collected this month" value={peso(o.collectedThisMonth)} note="All payment methods" />
        <Stat label="Owed by patients" value={peso(o.unpaidBalance)} note={`${o.unpaid.length} unpaid invoice${o.unpaid.length === 1 ? "" : "s"}`} />
        <Stat label="Owed by HMOs" value={peso(o.hmoPending)} note="Billed to HMOs, not yet paid" />
      </div>

      {canApprove && o.pendingVoids.length ? (
        <section aria-label="Cancellation requests" className="glass-card flex flex-col gap-2 rounded-[24px] p-5">
          <h2 className="text-lg">Cancellation requests</h2>
          <ul className="flex flex-col divide-y divide-[#EDF0F4]">
            {o.pendingVoids.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 flex-col">
                  <Link href={`/billing/invoices/${v.invoice.id}`} className="text-sm font-medium underline">
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
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <section aria-label="Unpaid balances" className="glass-card flex flex-col gap-2 rounded-[24px] p-5">
          <h2 className="text-lg">Unpaid balances</h2>
          {o.unpaid.length ? (
            <ul className="flex flex-col">
              {o.unpaid.map((i) => (
                <InvoiceRow key={i.id} invoice={i} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#5E6B7E]">Nothing owed. Every invoice is paid.</p>
          )}
        </section>
        <section aria-label="Latest payments" className="glass-card flex flex-col gap-2 rounded-[24px] p-5">
          <h2 className="text-lg">Latest payments</h2>
          {o.latestPayments.length ? (
            <ul className="flex flex-col divide-y divide-[#EDF0F4]">
              {o.latestPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">
                      {p.patientName ?? "—"}
                      {p.invoiceNumber ? (
                        <>
                          {" · "}
                          <Link href={`/billing/invoices/${p.invoiceId}`} className="underline">
                            {p.invoiceNumber}
                          </Link>
                        </>
                      ) : null}
                    </span>
                    <span className="text-xs text-[#5E6B7E]">
                      {formatWhen(p.receivedAt)} · {methodLabel(p.method)}
                      {p.status === "refund_due" ? " · to refund" : ""}
                    </span>
                  </span>
                  <span className={cn("text-sm tabular-nums", p.status === "refund_due" && "text-[#5E6B7E] line-through")}>{peso(p.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#5E6B7E]">No payments yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

const FILTER_LABELS: Record<InvoiceFilter, string> = { all: "All", unpaid: "Unpaid", paid: "Paid", void: "Cancelled" };

export function InvoicesView({ result, filter, search }: { result: { items: InvoiceSummary[]; total: number }; filter: InvoiceFilter; search?: string }) {
  const href = (f: InvoiceFilter) => {
    const params = new URLSearchParams({ tab: "invoices" });
    if (f !== "all") params.set("filter", f);
    if (search) params.set("q", search);
    return `/billing?${params.toString()}`;
  };
  return (
    <section aria-label="Sales invoices" className="glass-card flex flex-col gap-3 rounded-[24px] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1">
          <SearchBox id="invoice-search" label="Search invoices" placeholder="Search invoice no., patient or patient no." />
        </div>
        <nav aria-label="Filter invoices" className="flex flex-wrap gap-1.5">
          {INVOICE_FILTERS.map((f) => (
            <Link
              key={f}
              href={href(f)}
              aria-current={filter === f ? "page" : undefined}
              className={cn("inline-flex h-[30px] items-center rounded-full border px-3 text-xs font-medium", filter === f ? "border-[#0E2A47] bg-[#0E2A47] text-white" : "border-[#E3E7ED] bg-[#EEF1F5] text-[#46566B]")}
            >
              {FILTER_LABELS[f]}
            </Link>
          ))}
        </nav>
      </div>
      {result.items.length ? (
        <ul className="flex flex-col">
          {result.items.map((i) => (
            <InvoiceRow key={i.id} invoice={i} />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-[#5E6B7E]">No invoices match.</p>
      )}
      {result.total > result.items.length ? <p className="text-xs text-[#5E6B7E]">Showing the latest {result.items.length} of {result.total}. Search to narrow it down.</p> : null}
    </section>
  );
}
