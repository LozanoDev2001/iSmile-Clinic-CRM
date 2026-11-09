import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { clinicToday } from "@/config/clinic";
import { PrintButton } from "@/features/reports/components/print-button";
import { LeadsView, OverviewView, SalesView, monthLong } from "@/features/reports/components/report-views";
import { cn } from "@/lib/utils";
import { REPORT_PERIODS } from "@backend/features/reports/reports.schema";
import { addMonths, getLeadsReport, getOverview, getSalesReport } from "@backend/features/reports/reports.service";
import type { ReportPeriod } from "@backend/features/reports/reports.types";
import { pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Reports" };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "sales", label: "Sales report" },
  { id: "leads", label: "Leads report" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const PERIOD_LABELS: Record<ReportPeriod, string> = { month: "This month", quarter: "Last 3 months", year: "This year" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; period?: string; month?: string }> }) {
  const { user, allowed } = await pageCan("reports.read");
  if (!allowed) return <AccessDenied />;
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === params.tab) ? (params.tab as Tab) : "overview";
  const period: ReportPeriod = (REPORT_PERIODS as readonly string[]).includes(params.period ?? "") ? (params.period as ReportPeriod) : "month";
  const thisMonth = clinicToday().slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") && (params.month ?? "") <= thisMonth ? (params.month as string) : thisMonth;
  const monthHref = (m: string) => `/reports?tab=${tab}&month=${m}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">Reports</h1>
          <p className="text-[13px] text-[#5E6B7E]">How the clinic is doing: revenue, collections, patients, bookings and leads</p>
        </div>
        {tab === "overview" ? (
          <nav aria-label="Period" className="flex rounded-full bg-[#EEF1F5] p-1">
            {REPORT_PERIODS.map((p) => (
              <Link key={p} href={`/reports?period=${p}`} aria-current={period === p ? "page" : undefined} className={cn("rounded-full px-4 py-1.5 text-sm", period === p ? "bg-white font-medium shadow-sm" : "text-[#46566B]")}>
                {PERIOD_LABELS[p]}
              </Link>
            ))}
          </nav>
        ) : (
          <div className="flex items-center gap-2">
            <Link href={monthHref(addMonths(month, -1))} aria-label="Previous month" className="grid size-10 place-items-center rounded-full border border-[#D5DCE5] bg-white">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <span className="min-w-36 text-center text-sm font-medium">{monthLong(month)}</span>
            {month < thisMonth ? (
              <Link href={monthHref(addMonths(month, 1))} aria-label="Next month" className="grid size-10 place-items-center rounded-full border border-[#D5DCE5] bg-white">
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <span className="size-10" aria-hidden />
            )}
            <PrintButton label="Print or save as PDF" />
          </div>
        )}
      </div>
      <nav aria-label="Report sections" className="flex gap-1 border-b border-[#E3E7ED] print:hidden">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "overview" ? "/reports" : `/reports?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn("-mb-px border-b-[3px] px-4 py-3 text-sm font-medium", tab === t.id ? "border-[#F39A1E] text-[#0E2A47]" : "border-transparent text-[#5E6B7E]")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "overview" ? <OverviewView overview={await getOverview(user, { period })} /> : null}
      {tab === "sales" ? <SalesView report={await getSalesReport(user, { month })} /> : null}
      {tab === "leads" ? <LeadsView report={await getLeadsReport(user, { month })} /> : null}
    </div>
  );
}
