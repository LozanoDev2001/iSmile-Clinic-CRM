import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SOURCE_LABELS } from "@/features/appointments/calendar-state";
import { STATUS_META, formatOn, methodLabel, peso } from "@/features/billing/format";
import type { InvoiceStatus } from "@backend/features/billing/billing.types";
import type { BookingSource } from "@backend/features/appointments/appointments.types";
import type { Kpi, LeadsReport, Overview, SalesReport, SalesRow } from "@backend/features/reports/reports.types";
import { BarList, ColumnChart } from "./charts";

const MONTH_SHORT = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
export const monthShort = (m: string) => MONTH_SHORT.format(new Date(`${m}-01T00:00:00Z`));
export const monthLong = (m: string) => MONTH_LONG.format(new Date(`${m}-01T00:00:00Z`));

const count = (n: number) => n.toLocaleString("en-PH");
const percent = (n: number) => `${n.toLocaleString("en-PH", { maximumFractionDigits: 1 })}%`;
/** "₱12.5k" for chart caps; exact amounts are in the tooltip and table. */
const compactPeso = (n: number) => (n >= 1000 ? `₱${(n / 1000).toLocaleString("en-PH", { maximumFractionDigits: 1 })}k` : `₱${Math.round(n)}`);
const formatKpi = (k: Pick<Kpi, "format">, n: number) => (k.format === "peso" ? peso(n) : k.format === "percent" ? percent(n) : count(n));

const card = "glass-card flex min-w-0 flex-col gap-3 rounded-[24px] p-5";

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg">{title}</h2>
        {note ? <span className="text-xs text-[#5E6B7E]">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Delta({ k }: { k: Kpi }) {
  if (!k.previous) return <span className="text-xs text-[#5E6B7E]">{k.value ? "New this period" : "No change"}</span>;
  const change = ((k.value - k.previous) / k.previous) * 100;
  // A falling no-show rate is good news.
  const good = k.label === "No-show rate" ? change <= 0 : change >= 0;
  return (
    <span className={cn("text-xs", good ? "text-[#1F7A4D]" : "text-[#A1301F]")}>
      {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% vs {formatKpi(k, k.previous)} before
    </span>
  );
}

export function OverviewView({ overview: o }: { overview: Overview }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {o.kpis.map((k) => (
          <div key={k.label} className="glass-card flex min-w-0 flex-col gap-1 rounded-[22px] px-4 py-3.5">
            <span className="text-xs text-[#5E6B7E]">{k.label}</span>
            <span className="text-2xl tabular-nums">{formatKpi(k, k.value)}</span>
            <Delta k={k} />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <Card title="Revenue" note="After discounts, before VAT">
          <ColumnChart title="Revenue by month" bars={o.revenueByMonth.map((b) => ({ ...b, label: monthShort(b.label) }))} format={peso} compact={compactPeso} />
        </Card>
        <Card title="Revenue by dentist">
          <BarList title="Revenue by dentist" bars={o.revenueByDentist} format={peso} />
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card title="New patients by source" note="From the lead they came in on">
          <BarList title="New patients by source" bars={o.newPatientsBySource} format={count} />
        </Card>
        <Card title="Who booked the appointments">
          <BarList title="Appointments by who booked them" bars={o.bookingsBySource} format={count} label={(s) => SOURCE_LABELS[s as BookingSource] ?? s} />
        </Card>
      </div>
    </div>
  );
}

function SalesTable({ rows, label }: { rows: SalesRow[]; label: string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[#E3E7ED] text-left text-xs text-[#5E6B7E]">
          <th className="py-1.5 font-normal">{label}</th>
          <th className="py-1.5 text-right font-normal">Invoices</th>
          <th className="py-1.5 text-right font-normal">Billed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-[#EDF0F4]">
            <td className="py-1.5">{r.label}</td>
            <td className="py-1.5 text-right tabular-nums">{r.invoices}</td>
            <td className="py-1.5 text-right tabular-nums">{peso(r.billed)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SalesView({ report: r }: { report: SalesReport }) {
  const kpis: [string, string, string?][] = [
    ["Invoices issued", count(r.invoiceCount)],
    ["Gross sales", peso(r.gross), "Before discounts and VAT"],
    ["Senior / PWD discounts", peso(r.discounts)],
    ["VAT", peso(r.vat)],
    ["Total billed", peso(r.total)],
    ["Collected", peso(r.collected), "Payments received this month"],
    ["Still owed by patients", peso(r.unpaid), "On this month's invoices"],
  ];
  const totals = r.invoices.filter((i) => i.status !== "void");
  return (
    <div className="print-area flex flex-col gap-4">
      <h2 className="hidden text-xl print:block">Sales report · {monthLong(r.month)}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(([label, value, note]) => (
          <div key={label} className="glass-card flex min-w-0 flex-col gap-1 rounded-[22px] px-4 py-3.5">
            <span className="text-xs text-[#5E6B7E]">{label}</span>
            <span className="text-xl tabular-nums">{value}</span>
            {note ? <span className="text-xs text-[#5E6B7E]">{note}</span> : null}
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
        <Card title="Sales by dentist">
          <SalesTable rows={r.byDentist} label="Dentist" />
        </Card>
        <Card title="Sales by payer">
          <SalesTable rows={r.byPayer} label="Payer" />
        </Card>
        <Card title="Collections by payment method">
          <BarList title="Collections by payment method" bars={r.byMethod} format={peso} label={methodLabel} />
        </Card>
      </div>
      <Card title={`Sales invoices · ${monthLong(r.month)}`} note={`${r.invoices.length} invoices, cancelled ones included`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-[#E3E7ED] text-left text-xs text-[#5E6B7E]">
                {["Invoice", "Date", "Patient", "Dentist", "Payer", "Services"].map((h) => (
                  <th key={h} className="py-1.5 pr-2 font-normal">
                    {h}
                  </th>
                ))}
                {["Total", "Paid", "Balance"].map((h) => (
                  <th key={h} className="py-1.5 pr-2 text-right font-normal">
                    {h}
                  </th>
                ))}
                <th className="py-1.5 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {r.invoices.map((i) => (
                <tr key={i.id} className={cn("border-b border-[#EDF0F4]", i.status === "void" && "text-[#9AA6B6]")}>
                  <td className="py-1.5 pr-2">
                    <Link href={`/billing/invoices/${i.id}`} className="underline">
                      {i.number}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{formatOn(i.issuedAt)}</td>
                  <td className="py-1.5 pr-2">{i.patient}</td>
                  <td className="py-1.5 pr-2">{i.dentist ?? "—"}</td>
                  <td className="py-1.5 pr-2">{i.payer}</td>
                  <td className="max-w-60 truncate py-1.5 pr-2" title={i.services}>
                    {i.services}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{peso(i.total)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{peso(i.paid)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{peso(i.balance)}</td>
                  <td className="py-1.5">{STATUS_META[i.status as InvoiceStatus]?.label ?? i.status}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td className="py-2" colSpan={6}>
                  Total (not counting cancelled)
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{peso(totals.reduce((s, i) => s + i.total, 0))}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{peso(totals.reduce((s, i) => s + i.paid, 0))}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{peso(totals.reduce((s, i) => s + i.balance, 0))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {r.invoices.length === 0 ? <p className="text-sm text-[#5E6B7E]">No invoices this month.</p> : null}
      </Card>
    </div>
  );
}

export function LeadsView({ report: r }: { report: LeadsReport }) {
  const kpis: [string, string][] = [
    ["Leads received", count(r.received)],
    ["Won", count(r.won)],
    ["Lost", count(r.lost)],
    ["Win rate", r.winRate === null ? "—" : percent(r.winRate)],
    ["Won value", peso(r.wonValue)],
  ];
  return (
    <div className="print-area flex flex-col gap-4">
      <h2 className="hidden text-xl print:block">Leads report · {monthLong(r.month)}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map(([label, value]) => (
          <div key={label} className="glass-card flex min-w-0 flex-col gap-1 rounded-[22px] px-4 py-3.5">
            <span className="text-xs text-[#5E6B7E]">{label}</span>
            <span className="text-2xl tabular-nums">{value}</span>
          </div>
        ))}
      </div>
      <Card title="By platform" note="Received counts leads that came in this month; won and lost count leads closed this month">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E3E7ED] text-left text-xs text-[#5E6B7E]">
              <th className="py-1.5 font-normal">Platform</th>
              {["Received", "Won", "Lost", "Win rate", "Won value"].map((h) => (
                <th key={h} className="py-1.5 text-right font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.bySource.map((s) => (
              <tr key={s.source} className="border-b border-[#EDF0F4]">
                <td className="py-1.5">{s.source}</td>
                <td className="py-1.5 text-right tabular-nums">{s.received}</td>
                <td className="py-1.5 text-right tabular-nums">{s.won}</td>
                <td className="py-1.5 text-right tabular-nums">{s.lost}</td>
                <td className="py-1.5 text-right tabular-nums">{s.won + s.lost ? percent((s.won / (s.won + s.lost)) * 100) : "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{peso(s.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.bySource.length === 0 ? <p className="text-sm text-[#5E6B7E]">No leads this month.</p> : null}
      </Card>
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card title="By staff">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E3E7ED] text-left text-xs text-[#5E6B7E]">
                <th className="py-1.5 font-normal">Handled by</th>
                <th className="py-1.5 text-right font-normal">Won</th>
                <th className="py-1.5 text-right font-normal">Lost</th>
              </tr>
            </thead>
            <tbody>
              {r.byStaff.map((s) => (
                <tr key={s.name} className="border-b border-[#EDF0F4]">
                  <td className="py-1.5">{s.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.won}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.lost}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.byStaff.length === 0 ? <p className="text-sm text-[#5E6B7E]">No leads closed this month.</p> : null}
        </Card>
        <Card title="Why leads were lost">
          <BarList title="Why leads were lost" bars={r.lostReasons} format={count} />
        </Card>
      </div>
    </div>
  );
}
