import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clinicToday } from "@/config/clinic";
import { cn } from "@/lib/utils";
import { PrintButton } from "@/features/reports/components/print-button";
import { monthLong } from "@/features/reports/components/report-views";
import { getBillingReport } from "@backend/features/billing/reports/billing-reports.service";
import type { AgeBucket, BillingReport, BillingReportId, RevenueRow } from "@backend/features/billing/reports/billing-reports.types";
import { addMonths } from "@backend/features/reports/reports.service";
import { can } from "@backend/lib/authorization";
import { billingHref, type BillingTabProps } from "../billing-tabs";
import { formatOn, formatWhen, methodLabel, peso } from "../format";
import { ExpensePanel } from "./expense-panel";

const REPORTS: { id: BillingReportId; group: string; title: string; desc: string }[] = [
  { id: "collections", group: "Collections", title: "Collections by method", desc: "Money received in the month by payment method, plus HMO payments." },
  { id: "aging", group: "Collections", title: "Unpaid balances by age", desc: "Patient balances and HMO claims by how long they have been open." },
  { id: "revenue", group: "Revenue", title: "Revenue by dentist and service", desc: "What each dentist and treatment billed, after discounts, before VAT." },
  { id: "pnl", group: "Accounting", title: "Profit and loss", desc: "Revenue less the expenses entered for the month." },
];

const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
const navButton = "grid size-9 place-items-center rounded-full border border-[#D5DCE5] bg-white hover:bg-[#F4F6F9]";

function Block({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-[18px] flex flex-col gap-1.5">
      {title ? <h3 className="text-[12.5px] font-semibold text-[#1D5296]">{title}</h3> : null}
      {children}
      {note ? <p className="text-[11px] leading-normal text-[#5E6B7E]">{note}</p> : null}
    </section>
  );
}

function Kv({ items }: { items: { label: string; value: string; tone?: "good" | "bad" }[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
      {items.map((k) => (
        <div key={k.label} className="flex flex-col gap-0.5 rounded-[10px] border border-[#E3E7ED] px-2.5 py-2">
          <span className="text-[9.5px] tracking-[0.07em] text-[#5E6B7E] uppercase">{k.label}</span>
          <span className={cn("text-[15px] font-medium tabular-nums", k.tone === "good" && "text-[#1F7A4D]", k.tone === "bad" && "text-[#A1301F]")}>{k.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Columns after the first are right-aligned figures. */
function Table({ head, rows, foot, empty }: { head: string[]; rows: ReactNode[][]; foot?: ReactNode[]; empty: string }) {
  const cell = (i: number) => cn("px-2 py-1.5", i > 0 && "text-right tabular-nums");
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-[#EEF3FA] text-left text-[10px] tracking-[0.06em] text-[#46566B] uppercase">
            {head.map((h, i) => (
              <th key={h} className={cn(cell(i), "font-semibold")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-[#EDF0F4]">
              {r.map((c, i) => (
                <td key={i} className={cell(i)}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-2 py-3 text-[#5E6B7E]">
                {empty}
              </td>
            </tr>
          ) : null}
        </tbody>
        {foot && rows.length ? (
          <tfoot>
            <tr className="border-t-2 border-[#0E2A47] font-semibold">
              {foot.map((c, i) => (
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

function revenueTable(rows: RevenueRow[], first: string, countLabel: string, total: number) {
  return (
    <Table
      head={[first, countLabel, "Net revenue", "Share"]}
      rows={rows.map((r) => [r.label, r.count.toLocaleString("en-PH"), peso(r.amount), total ? pct(r.amount / total) : "—"])}
      foot={["Total", "", peso(total), "100%"]}
      empty="Nothing invoiced this month."
    />
  );
}

function agingTable<T>(buckets: AgeBucket<T>[], total: number) {
  return (
    <Table
      head={["Age", "Items", "Amount", "Share"]}
      rows={buckets.map((b) => [b.label, String(b.items.length), peso(b.total), total ? pct(b.total / total) : "—"])}
      foot={["Total", String(buckets.reduce((s, b) => s + b.items.length, 0)), peso(total), "100%"]}
      empty="Nothing open."
    />
  );
}

function ReportBody({ report: r }: { report: BillingReport }) {
  switch (r.kind) {
    case "collections":
      return (
        <>
          <Block>
            <Kv
              items={[
                { label: "Total collected", value: peso(r.total), tone: "good" },
                { label: "From patients", value: peso(r.patientTotal) },
                { label: "From HMOs", value: peso(r.hmo.amount) },
                { label: "Payments", value: String(r.patientCount + r.hmo.count) },
              ]}
            />
          </Block>
          <Block title="Patient payments by method" note="Posted payments only; payments flagged for refund after a cancelled invoice are left out.">
            <Table
              head={["Method", "Payments", "Amount", "Share"]}
              rows={r.methods.map((m) => [methodLabel(m.method), String(m.count), peso(m.amount), pct(m.share)])}
              foot={["Total", String(r.patientCount), peso(r.patientTotal), "100%"]}
              empty="No patient payments this month."
            />
          </Block>
          <Block title="HMO payments" note="HMO claims marked paid in the month, at the amount the HMO paid.">
            <Table head={["Source", "Claims paid", "Amount"]} rows={[["HMO claims", String(r.hmo.count), peso(r.hmo.amount)]]} empty="No HMO payments this month." />
          </Block>
        </>
      );
    case "aging":
      return (
        <>
          <Block>
            <Kv
              items={[
                { label: "Owed by patients", value: peso(r.invoiceTotal), tone: r.invoiceTotal ? "bad" : undefined },
                { label: "Awaiting HMOs", value: peso(r.claimTotal) },
                { label: "Total open", value: peso(r.invoiceTotal + r.claimTotal) },
              ]}
            />
          </Block>
          <Block title="Patient balances by age" note="Age counts from the invoice date.">
            {agingTable(r.invoices, r.invoiceTotal)}
          </Block>
          <Block title="Open patient invoices">
            <Table
              head={["Invoice · patient", "Issued", "Days", "Balance"]}
              rows={r.invoices
                .flatMap((b) => b.items)
                .sort((a, b) => b.days - a.days)
                .map((i) => [
                  <Link key={i.id} href={`/billing/invoices/${i.id}`} className="text-[#1D5296] underline underline-offset-2">
                    {i.number} · {i.patientName} ({i.patientNo})
                  </Link>,
                  formatOn(i.issuedAt),
                  String(i.days),
                  peso(i.balance),
                ])}
              empty="No patient owes the clinic."
            />
          </Block>
          <Block title="HMO claims by age" note="Claims submitted or approved and not yet paid; age counts from the submission date.">
            {agingTable(r.claims, r.claimTotal)}
          </Block>
          <Block title="Open HMO claims">
            <Table
              head={["HMO · invoice · patient", "Submitted", "Days", "Amount"]}
              rows={r.claims
                .flatMap((b) => b.items)
                .sort((a, b) => b.days - a.days)
                .map((c) => [
                  <Link key={c.id} href={`/billing/invoices/${c.invoiceId}`} className="text-[#1D5296] underline underline-offset-2">
                    {c.payerName} · {c.invoiceNumber} · {c.patientName}
                  </Link>,
                  c.submittedAt ? formatOn(c.submittedAt) : "—",
                  String(c.days),
                  peso(c.amount),
                ])}
              empty="No HMO claims are waiting."
            />
          </Block>
        </>
      );
    case "revenue":
      return (
        <>
          <Block>
            <Kv
              items={[
                { label: "Net revenue", value: peso(r.total), tone: "good" },
                { label: "Invoices", value: String(r.invoiceCount) },
              ]}
            />
          </Block>
          <Block title="By dentist" note="The dentist on the appointment the invoice was issued for. Invoices issued without an appointment show as no dentist on file.">
            {revenueTable(r.byDentist, "Dentist", "Invoices", r.total)}
          </Block>
          <Block title="By service" note="Price-list amount less senior citizen and PWD discounts, before VAT. Cancelled invoices are left out.">
            {revenueTable(r.byService, "Service or item", "Units", r.total)}
          </Block>
        </>
      );
    case "pnl":
      return (
        <>
          <Block>
            <Kv
              items={[
                { label: "Net revenue", value: peso(r.revenue) },
                { label: "Expenses", value: peso(r.expenseTotal) },
                { label: "Net income", value: peso(r.netIncome), tone: r.netIncome >= 0 ? "good" : "bad" },
              ]}
            />
          </Block>
          <Block title="Statement" note="Revenue is invoices issued in the month, cancelled ones left out, net of VAT. Income tax is not accrued.">
            <Table
              head={["Line", "Amount"]}
              rows={[
                ["Invoiced, including VAT", peso(r.billed)],
                ["Less output VAT", `(${peso(r.vat)})`],
                [<strong key="rev">Net revenue</strong>, <strong key="revv">{peso(r.revenue)}</strong>],
                ...r.expenses.map((e) => [`Less ${e.category.toLowerCase()}`, `(${peso(e.amount)})`]),
              ]}
              foot={["Net income before income tax", peso(r.netIncome)]}
              empty=""
            />
          </Block>
        </>
      );
  }
}

/** Billing › Reports: pick a report and a month, preview it as a printable document. */
export async function BillingReportsTab({ user, params }: BillingTabProps) {
  const report = await getBillingReport(user, { report: params.report, month: params.month });
  const meta = REPORTS.find((r) => r.id === report.kind) ?? REPORTS[0];
  const month = report.kind === "aging" ? (params.month ?? clinicToday().slice(0, 7)) : report.month;
  const href = (id: BillingReportId, m = month) => billingHref("reports", { report: id, month: m === clinicToday().slice(0, 7) ? undefined : m });
  const period = report.kind === "aging" ? `As of ${formatOn(new Date(`${report.asOf}T12:00:00+08:00`))}` : monthLong(report.month);

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Reports" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
        {REPORTS.map((r) => (
          <Link
            key={r.id}
            href={href(r.id)}
            aria-current={r.id === meta.id ? "page" : undefined}
            className={cn("glass-card flex min-h-[132px] flex-col gap-2 rounded-[24px] border-2 p-4 hover:brightness-[1.02]", r.id === meta.id ? "border-[#1D5296]" : "border-transparent")}
          >
            <span className="self-start rounded-full bg-[#FDE3BD] px-2.5 py-0.5 text-[11px] text-[#5A3500]">{r.group}</span>
            <span className="text-[15px] font-medium">{r.title}</span>
            <span className="text-xs leading-normal text-[#5E6B7E]">{r.desc}</span>
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        {report.kind === "aging" ? (
          <span className="text-sm text-[#5E6B7E]">Balances open today</span>
        ) : (
          <nav aria-label="Report month" className="flex items-center gap-2">
            <Link href={href(meta.id, addMonths(month, -1))} aria-label="Previous month" className={navButton}>
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <span className="min-w-36 text-center text-sm font-medium">{monthLong(month)}</span>
            {month < clinicToday().slice(0, 7) ? (
              <Link href={href(meta.id, addMonths(month, 1))} aria-label="Next month" className={navButton}>
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <span className={cn(navButton, "opacity-40")} aria-hidden>
                <ChevronRight className="size-4" />
              </span>
            )}
          </nav>
        )}
        <PrintButton label="Print or save as PDF" />
      </div>

      <article aria-label={meta.title} className="print-area rounded-[26px] bg-white p-6 text-[#0E2A47] shadow-sm sm:p-8 print:rounded-none print:p-0 print:shadow-none">
        <header className="flex flex-col gap-1 sm:items-end sm:text-right">
          <span className="text-[10px] font-semibold tracking-[0.16em] text-[#F39A1E] uppercase">{meta.group}</span>
          <h2 className="text-[22px] font-medium">{meta.title}</h2>
          <span className="text-xs text-[#46566B]">{period}</span>
        </header>
        <div className="mt-3.5 flex h-[5px] overflow-hidden rounded-full">
          <span className="flex-[5] bg-[#1D5296]" />
          <span className="flex-1 bg-[#F39A1E]" />
        </div>
        <ReportBody report={report} />
        <footer className="mt-[22px] border-t border-[#E3E7ED] pt-2 text-[10px] leading-normal text-[#5E6B7E]">
          Generated from the iSmile CRM ledger on {formatWhen(new Date())} by {user.name} · Amounts in Philippine pesos · Confidential: contains patient data protected under the Data Privacy Act (RA 10173).
        </footer>
      </article>

      {report.kind === "pnl" ? <ExpensePanel entries={report.entries} canEdit={can(user, "billing.update")} /> : null}
    </div>
  );
}
