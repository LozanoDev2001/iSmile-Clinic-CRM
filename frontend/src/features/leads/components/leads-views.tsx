import Link from "next/link";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/utils";
import { peso } from "@/features/billing/format";
import { LEAD_STAGES } from "@backend/features/leads/lead.schema";
import type { ClosedLeads, LeadBoard, LeadCard } from "@backend/features/leads/leads.types";
import { STAGE_META, ago, formatLeadDay, nextLabel } from "../format";
import { leadsHref, shiftMonth, type LeadsState } from "../leads-state";

const MONTH = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = (month: string) => MONTH.format(new Date(`${month}-01T00:00:00Z`));

const chip = (on: boolean) => cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs", on ? "border-[#0E2A47] bg-[#0E2A47] text-white" : "border-[#D5DCE5] bg-white text-[#46566B]");

function Kpi({ href, label, value, note, active, tone }: { href: string; label: string; value: string; note: string; active?: boolean; tone?: "amber" | "red" | "green" }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined} className={cn("glass-card flex min-w-0 flex-col gap-1 rounded-[22px] px-4 py-3.5 hover:brightness-[0.98]", active && "ring-2 ring-[#1D5296]")}>
      <span className="text-xs text-[#5E6B7E]">{label}</span>
      <span className={cn("text-2xl tabular-nums", tone === "amber" && "text-[#A55A00]", tone === "red" && "text-[#A1301F]", tone === "green" && "text-[#1F7A4D]")}>{value}</span>
      <span className="truncate text-xs text-[#5E6B7E]">{note}</span>
    </Link>
  );
}

function Card({ lead: l, href, selected }: { lead: LeadCard; href: string; selected: boolean }) {
  const next = nextLabel(l.nextActionAt);
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={`${l.name}${l.hot ? ", hot" : ""}, ${l.interest?.name ?? "no treatment yet"}, from ${l.source?.name ?? "unknown"}`}
      aria-current={selected ? "true" : undefined}
      className={cn("flex flex-col gap-1.5 rounded-2xl border bg-white p-3 text-left shadow-[0_1px_2px_rgba(14,42,71,0.06)] hover:border-[#BCD3F2]", selected ? "border-[#1D5296] ring-1 ring-[#1D5296]" : "border-[#E3E7ED]")}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{l.name}</span>
        {l.hot ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-[#FDECEA] px-1.5 text-[10px] font-semibold text-[#B42318]">
            <Flame className="size-3" aria-hidden />
            HOT
          </span>
        ) : null}
      </span>
      <span className="truncate text-xs text-[#46566B]">
        {l.interest?.name ?? "Treatment not set"} · {l.source?.name ?? "Unknown platform"}
      </span>
      {next ? <span className={cn("text-xs", next.overdue ? "font-medium text-[#A1301F]" : "text-[#1D5296]")}>{next.text}</span> : null}
      <span className="flex items-center gap-1.5 text-[11px] text-[#5E6B7E]">
        {l.assignee ? <Avatar name={l.assignee.name} letters={2} className="size-5 text-[9px]" /> : null}
        <span className="truncate">{l.assignee?.name ?? "Unassigned"}</span>
        <span className="ml-auto shrink-0">{ago(l.createdAt)}</span>
      </span>
    </Link>
  );
}

export function PipelineView({ state, board, staff, userId }: { state: LeadsState; board: LeadBoard; staff: { id: string; name: string }[]; userId: string }) {
  const toggleWho = (who: string) => leadsHref(state, { who: state.who === who ? "all" : who, lead: undefined });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi href={leadsHref(state, { who: "all", lead: undefined })} active={state.who === "all"} label="Open leads" value={String(board.openCount)} note={`${board.hotCount} hot`} />
        <Kpi href={toggleWho("none")} active={state.who === "none"} label="Waiting to be assigned" value={String(board.unassignedCount)} note="Select to show them" tone={board.unassignedCount ? "amber" : undefined} />
        <Kpi href={toggleWho("due")} active={state.who === "due"} label="Calls due today" value={String(board.dueCount)} note="First calls, retries and call-backs" tone={board.dueCount ? "red" : undefined} />
        <Kpi href={leadsHref(state, { tab: "won", lead: undefined })} label="Won this month" value={String(board.wonThisMonth)} note={peso(board.wonValueThisMonth)} tone="green" />
      </div>

      <div className="flex flex-col gap-2">
        <div role="group" aria-label="Platform" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-[#5E6B7E]">Platform</span>
          <Link href={leadsHref(state, { source: "all", lead: undefined })} aria-current={state.source === "all" ? "true" : undefined} className={chip(state.source === "all")}>
            All · {board.openCount}
          </Link>
          {board.sources
            .filter((s) => s.open > 0 || s.id === state.source)
            .map((s) => (
              <Link key={s.id} href={leadsHref(state, { source: s.id, lead: undefined })} aria-current={state.source === s.id ? "true" : undefined} className={chip(state.source === s.id)}>
                {s.name} · {s.open}
              </Link>
            ))}
        </div>
        <div role="group" aria-label="Assigned to" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-[#5E6B7E]">Assigned to</span>
          {[
            { id: "all", name: "Everyone" },
            { id: "none", name: "Unassigned" },
            { id: "me", name: "Me" },
            ...staff.filter((s) => s.id !== userId),
          ].map((w) => (
            <Link key={w.id} href={leadsHref(state, { who: w.id, lead: undefined })} aria-current={state.who === w.id ? "true" : undefined} className={chip(state.who === w.id)}>
              {w.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 overflow-x-auto pb-2 lg:grid-cols-5">
        {LEAD_STAGES.map((stage) => {
          const leads = board.columns[stage];
          return (
            <section key={stage} aria-label={STAGE_META[stage].label} className="flex min-w-[220px] flex-col gap-2 rounded-[22px] bg-[#EEF1F5]/70 p-2.5">
              <div className="flex items-center gap-2 px-1">
                <span className={cn("size-2 rounded-full", STAGE_META[stage].dot)} aria-hidden />
                <h2 className="flex-1 truncate text-sm font-medium">{STAGE_META[stage].label}</h2>
                <span className="text-xs text-[#5E6B7E]">{leads.length}</span>
              </div>
              <span className="px-1 text-[11px] text-[#5E6B7E]">{STAGE_META[stage].hint}</span>
              {leads.map((l) => (
                <Card key={l.id} lead={l} href={leadsHref(state, { lead: l.id })} selected={state.lead === l.id} />
              ))}
              {leads.length === 0 ? <span className="px-1 py-4 text-center text-xs text-[#9AA6B6]">No leads here</span> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function ClosedView({ state, closed }: { state: LeadsState; closed: ClosedLeads }) {
  const won = state.tab === "won";
  const top = closed.reasons[0]?.count ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href={leadsHref(state, { month: shiftMonth(state.month, -1), lead: undefined })} aria-label="Previous month" className="grid size-9 place-items-center rounded-full border border-[#D5DCE5] bg-white">
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <span className="min-w-36 text-center text-sm font-medium">{monthLabel(state.month)}</span>
        <Link href={leadsHref(state, { month: shiftMonth(state.month, 1), lead: undefined })} aria-label="Next month" className="grid size-9 place-items-center rounded-full border border-[#D5DCE5] bg-white">
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="glass-card flex flex-col gap-1 rounded-[22px] px-4 py-3.5">
          <span className="text-xs text-[#5E6B7E]">{won ? "Won" : "Lost"} in {monthLabel(state.month)}</span>
          <span className="text-2xl tabular-nums">{closed.total}</span>
        </div>
        {won ? (
          <div className="glass-card flex flex-col gap-1 rounded-[22px] px-4 py-3.5">
            <span className="text-xs text-[#5E6B7E]">Accepted treatment value</span>
            <span className="text-2xl tabular-nums text-[#1F7A4D]">{peso(closed.value)}</span>
          </div>
        ) : (
          <section aria-label="Why leads were lost" className="glass-card flex flex-col gap-1.5 rounded-[22px] px-4 py-3.5">
            <span className="text-xs text-[#5E6B7E]">Why leads were lost</span>
            {closed.reasons.map((r) => (
              <div key={r.reason} className="flex flex-col gap-0.5">
                <span className="flex justify-between text-xs">
                  <span>{r.reason}</span>
                  <span className="tabular-nums">{r.count}</span>
                </span>
                <span className="h-1.5 rounded-full bg-[#F9B4AA]" style={{ width: `${(r.count / top) * 100}%` }} aria-hidden />
              </div>
            ))}
            {closed.reasons.length ? null : <span className="text-xs text-[#9AA6B6]">No lost leads this month.</span>}
          </section>
        )}
      </div>
      <section aria-label={won ? "Won leads" : "Lost leads"} className="glass-card flex flex-col rounded-[24px] p-3">
        {closed.leads.map((l) => (
          <Link key={l.id} href={leadsHref(state, { lead: l.id })} scroll={false} className="grid gap-1 rounded-xl px-2 py-2.5 hover:bg-[#F4F6F9] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_120px] sm:items-center">
            <span className="truncate text-sm font-medium">{l.name}</span>
            <span className="truncate text-xs text-[#46566B]">
              {won ? (l.interest?.name ?? "—") : (l.closedReason ?? "—")} · {l.source?.name ?? "Unknown platform"}
            </span>
            <span className="text-xs text-[#5E6B7E]">{l.closedAt ? formatLeadDay(l.closedAt) : ""}</span>
            <span className="text-right text-sm tabular-nums">{won && l.wonValue !== null ? peso(l.wonValue) : (l.assignee?.name ?? "")}</span>
          </Link>
        ))}
        {closed.leads.length === 0 ? <p className="py-6 text-center text-sm text-[#5E6B7E]">Nothing in this month.</p> : null}
      </section>
    </div>
  );
}
