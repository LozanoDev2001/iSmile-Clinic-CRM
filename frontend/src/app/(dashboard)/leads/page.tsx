import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { SearchBox } from "@/components/shared/search-box";
import { AddLeadDialog } from "@/features/leads/components/add-lead-dialog";
import { LeadPanel } from "@/features/leads/components/lead-panel";
import { ClosedView, MonthPills, PipelineView } from "@/features/leads/components/leads-views";
import { LEAD_TABS, leadsHref, parseLeadsState, recentMonths, type LeadsSearchParams } from "@/features/leads/leads-state";
import { PrintButton } from "@/features/reports/components/print-button";
import { LeadsView, monthLong } from "@/features/reports/components/report-views";
import { clinicToday } from "@/config/clinic";
import { cn } from "@/lib/utils";
import { ALL_MONTHS } from "@backend/features/leads/lead.schema";
import { getClosedLeads, getLead, getLeadBoard, getLeadCounts, getLeadOptions } from "@backend/features/leads/leads.service";
import { getLeadsReport } from "@backend/features/reports/reports.service";
import { can, pageCan } from "@backend/lib/authorization";
import { isAppError } from "@backend/lib/errors/app-error";

export const metadata: Metadata = { title: "Leads" };

const TABS = {
  pipeline: { label: "Pipeline", count: "open", badge: "bg-[#EEF1F5]" },
  won: { label: "Won", count: "won", badge: "bg-[#D7F2E5]" },
  lost: { label: "Terminated", count: "lost", badge: "bg-[#FBD9D4]" },
  report: { label: "Monthly report", count: null, badge: "" },
} as const;

const AS_OF = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const asOfLabel = (date: string) => AS_OF.format(new Date(`${date}T00:00:00Z`));

const tabClass = (on: boolean) =>
  cn("inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm", on ? "bg-[linear-gradient(135deg,#3478CC_0%,#1D5296_70%)] text-white shadow-[0_6px_16px_rgba(29,82,150,0.25)]" : "text-[#46566B] hover:text-[#0E2A47]");

export default async function LeadsPage({ searchParams }: { searchParams: Promise<LeadsSearchParams> }) {
  const { user, allowed } = await pageCan("leads.read");
  if (!allowed) return <AccessDenied />;
  const state = parseLeadsState(await searchParams);
  const canReport = can(user, "reports.read");
  const thisMonth = clinicToday().slice(0, 7);
  const reportMonth = state.month === ALL_MONTHS || state.month > thisMonth ? thisMonth : state.month;

  const [counts, options, board, closed, report, lead] = await Promise.all([
    getLeadCounts(user),
    getLeadOptions(user),
    state.tab === "pipeline" ? getLeadBoard(user, { source: state.source, who: state.who, search: state.q }) : null,
    state.tab === "won" || state.tab === "lost" ? getClosedLeads(user, { status: state.tab, month: state.month }) : null,
    state.tab === "report" && canReport ? getLeadsReport(user, { month: reportMonth }) : null,
    state.lead ? getLead(user, state.lead).catch((e) => (isAppError(e) && e.code === "NOT_FOUND" ? null : Promise.reject(e))) : null,
  ]);
  const closeHref = leadsHref(state, { lead: undefined, add: false });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">Leads</h1>
          <p className="text-[13px] text-[#5E6B7E]">Every enquiry from Facebook, Instagram, Google, TikTok, the website, chat apps, calls and walk-ins · as of {asOfLabel(clinicToday())}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-[280px] max-w-full">
            <SearchBox id="lead-search" label="Search leads" placeholder="Search name, mobile or treatment" />
          </div>
          {can(user, "leads.create") ? (
            <Link href={leadsHref(state, { add: true, lead: undefined })} scroll={false} className="fill-orange inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-medium text-[#0E2A47] hover:brightness-105">
              <Plus className="size-4" aria-hidden />
              Add lead
            </Link>
          ) : null}
        </div>
      </div>

      <nav aria-label="Lead views" className="glass-pill flex max-w-full flex-wrap gap-1 self-start rounded-full p-[5px]">
        {LEAD_TABS.filter((t) => t !== "report" || canReport).map((t) => {
          const on = state.tab === t;
          const count = TABS[t].count;
          return (
            <Link key={t} href={leadsHref(state, { tab: t, lead: undefined })} aria-current={on ? "page" : undefined} className={tabClass(on)}>
              {TABS[t].label}
              {count ? <span className={cn("inline-flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] text-[#0E2A47]", on ? "bg-white" : TABS[t].badge)}>{counts[count]}</span> : null}
            </Link>
          );
        })}
      </nav>

      {board ? <PipelineView state={state} board={board} staff={options.staff} userId={user.id} /> : null}
      {closed ? <ClosedView state={state} closed={closed} reportHref={canReport ? leadsHref(state, { tab: "report", month: reportMonth, lead: undefined }) : undefined} /> : null}
      {report ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <MonthPills
              label="Report month"
              items={recentMonths(thisMonth).map((m) => ({ href: leadsHref(state, { month: m, lead: undefined }), text: `${monthLong(m)}${m === thisMonth ? " to date" : ""}`, on: report.month === m }))}
            />
            <PrintButton label="Print or download PDF" className="btn-navy h-11 border-0 px-5 font-medium text-white" />
          </div>
          <LeadsView report={report} />
        </>
      ) : null}
      {state.tab === "report" && !canReport ? <AccessDenied /> : null}

      {lead ? (
        <LeadPanel
          key={`${lead.id}-${lead.status}-${lead.stage}`}
          lead={lead}
          options={options}
          userId={user.id}
          canUpdate={can(user, "leads.update")}
          canBook={can(user, "appointments.create") && can(user, "patients.create")}
          closeHref={closeHref}
        />
      ) : null}
      {state.add && can(user, "leads.create") ? <AddLeadDialog options={options} state={state} /> : null}
    </div>
  );
}
