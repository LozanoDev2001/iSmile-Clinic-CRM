import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { SearchBox } from "@/components/shared/search-box";
import { AddLeadDialog } from "@/features/leads/components/add-lead-dialog";
import { LeadPanel } from "@/features/leads/components/lead-panel";
import { ClosedView, PipelineView } from "@/features/leads/components/leads-views";
import { LEAD_TABS, leadsHref, parseLeadsState, type LeadsSearchParams } from "@/features/leads/leads-state";
import { cn } from "@/lib/utils";
import { getClosedLeads, getLead, getLeadBoard, getLeadOptions } from "@backend/features/leads/leads.service";
import { can, pageCan } from "@backend/lib/authorization";
import { isAppError } from "@backend/lib/errors/app-error";

export const metadata: Metadata = { title: "Leads" };

const TAB_LABELS = { pipeline: "Pipeline", won: "Won", lost: "Lost" } as const;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<LeadsSearchParams> }) {
  const { user, allowed } = await pageCan("leads.read");
  if (!allowed) return <AccessDenied />;
  const state = parseLeadsState(await searchParams);

  const [options, board, closed, lead] = await Promise.all([
    getLeadOptions(user),
    state.tab === "pipeline" ? getLeadBoard(user, { source: state.source, who: state.who, search: state.q }) : null,
    state.tab !== "pipeline" ? getClosedLeads(user, { status: state.tab, month: state.month }) : null,
    state.lead ? getLead(user, state.lead).catch((e) => (isAppError(e) && e.code === "NOT_FOUND" ? null : Promise.reject(e))) : null,
  ]);
  const closeHref = leadsHref(state, { lead: undefined, add: false });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">Leads</h1>
          <p className="text-[13px] text-[#5E6B7E]">Every enquiry from social media, the website, chat apps, calls and walk-ins, from first message to won</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-72">
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

      <nav aria-label="Lead views" className="flex gap-1 border-b border-[#E3E7ED]">
        {LEAD_TABS.map((t) => (
          <Link
            key={t}
            href={leadsHref(state, { tab: t, lead: undefined })}
            aria-current={state.tab === t ? "page" : undefined}
            className={cn("-mb-px border-b-[3px] px-4 py-3 text-sm font-medium", state.tab === t ? "border-[#F39A1E] text-[#0E2A47]" : "border-transparent text-[#5E6B7E]")}
          >
            {TAB_LABELS[t]}
            {t === "pipeline" && board ? <span className="ml-1.5 rounded-full bg-[#E4EEFB] px-1.5 text-xs text-[#1D5296]">{board.openCount}</span> : null}
          </Link>
        ))}
      </nav>

      {board ? <PipelineView state={state} board={board} staff={options.staff} userId={user.id} /> : null}
      {closed ? <ClosedView state={state} closed={closed} /> : null}

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
