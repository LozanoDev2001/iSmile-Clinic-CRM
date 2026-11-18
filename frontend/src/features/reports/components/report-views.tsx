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

type Cell = string | number;

const winRate = (won: number, lost: number) => (won + lost ? percent(Math.round((won / (won + lost)) * 100)) : "—");
const share = (part: number, whole: number) => (whole ? percent(Math.round((part / whole) * 100)) : "—");

/** "+17% vs Sep"; a month with nothing to compare against says so. */
function versus(current: number, previous: number, month: string) {
  if (!previous) return current ? `New vs ${monthShort(month)}` : `None in ${monthShort(month)} either`;
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change >= 0 ? "+" : ""}${change}% vs ${monthShort(month)}`;
}

/** A report table: first column is a label, the rest are right-aligned numbers, with an optional total row. */
function ReportTable({ head, rows, total, empty }: { head: string[]; rows: Cell[][]; total?: Cell[]; empty: string }) {
  if (!rows.length) return <p className="py-4 text-sm text-[#5E6B7E]">{empty}</p>;
  const cell = (i: number) => cn("py-2 tabular-nums", i === 0 ? "pr-3 text-left" : "pl-3 text-right whitespace-nowrap");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b-[1.5px] border-[#0E2A47] text-[11px] tracking-[0.06em] text-[#5E6B7E] uppercase">
            {head.map((h, i) => (
              <th key={h} className={cn(cell(i), "font-normal")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[0])} className="border-b border-[#EDF0F4] last:border-0">
              {row.map((c, i) => (
                <td key={i} className={cell(i)}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {total ? (
          <tfoot>
            <tr className="border-t-[1.5px] border-[#0E2A47] font-semibold">
              {total.map((c, i) => (
                <td key={i} className={cell(i)}>
                  {c}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export function LeadsView({ report: r }: { report: LeadsReport }) {
  const p = r.previous;
  const kpis: { label: string; value: string; sub: string; tone?: string }[] = [
    { label: "Leads received", value: count(r.received), sub: versus(r.received, p.received, p.month) },
    { label: "Won", value: count(r.won), sub: versus(r.won, p.won, p.month), tone: "text-[#1F7A4D]" },
    { label: "Terminated", value: count(r.lost), sub: versus(r.lost, p.lost, p.month), tone: "text-[#A1301F]" },
    { label: "Win rate", value: winRate(r.won, r.lost), sub: "Won ÷ (won + terminated)" },
    { label: "Won value", value: peso(r.wonValue), sub: versus(r.wonValue, p.wonValue, p.month) },
    {
      label: "Still open",
      value: count(r.stillOpen),
      sub: `Of this month’s leads${r.avgDaysToWin === null ? "" : ` · avg ${r.avgDaysToWin.toLocaleString("en-PH", { maximumFractionDigits: 1 })} days to win`}`,
    },
  ];
  const received = r.funnel[0]?.value ?? 0;
  const staffTotal = r.byStaff.reduce((t, s) => ({ assigned: t.assigned + s.assigned, calls: t.calls + s.calls }), { assigned: 0, calls: 0 });
  return (
    <div className="print-area flex flex-col gap-4">
      <h2 className="hidden text-xl print:block">Leads report · {monthLong(r.month)}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="glass-card flex min-w-0 flex-col gap-1 rounded-[22px] p-4">
            <span className="text-xs text-[#5E6B7E]">{k.label}</span>
            <span className={cn("text-[26px] leading-tight tabular-nums", k.tone)}>{k.value}</span>
            <span className="truncate text-xs text-[#5E6B7E]">{k.sub}</span>
          </div>
        ))}
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-2 2xl:grid-cols-[1.4fr_1.4fr_1fr_1fr]">
        <Card title="By platform" note="Where leads came from and how they closed">
          <ReportTable
            head={["Platform", "Received", "Won", "Terminated", "Win rate", "Won value"]}
            rows={r.bySource.map((s) => [s.source, s.received, s.won, s.lost, winRate(s.won, s.lost), peso(s.value)])}
            total={["Total", r.received, r.won, r.lost, winRate(r.won, r.lost), peso(r.wonValue)]}
            empty="No leads this month."
          />
        </Card>
        <Card title="By team member" note="Who was assigned and how their calls ended">
          <ReportTable
            head={["Called by", "Assigned", "Calls", "Won", "Terminated", "Win rate", "Won value"]}
            rows={r.byStaff.map((s) => [s.name, s.assigned, s.calls, s.won, s.lost, winRate(s.won, s.lost), peso(s.value)])}
            total={["Total", staffTotal.assigned, staffTotal.calls, r.won, r.lost, winRate(r.won, r.lost), peso(r.wonValue)]}
            empty="No calls or closed leads this month."
          />
        </Card>
        <Card title="Termination reasons" note={`${count(r.lost)} leads terminated`}>
          <ReportTable
            head={["Reason", "Leads", "Share"]}
            rows={r.lostReasons.map((b) => [b.label, b.value, share(b.value, r.lost)])}
            total={["Total", r.lost, "100%"]}
            empty="No leads terminated this month."
          />
        </Card>
        <Card title="Funnel for leads received this month" note="How far this month’s leads have got so far">
          <ReportTable head={["Step", "Leads", "Of received"]} rows={r.funnel.map((b) => [b.label, b.value, share(b.value, received)])} empty="No leads received this month." />
        </Card>
      </div>
      <p className="text-xs text-[#5E6B7E]">
        Leads received counts enquiries that came in during the month. Won and terminated count leads closed during the month, whenever they first came in. Win rate is won ÷ (won + terminated). Won value is the accepted treatment value; amounts billed appear in Billing as treatment is invoiced.
      </p>
    </div>
  );
}
