import Link from "next/link";
import { AlarmClock, ArrowUpRight } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/utils";
import { peso } from "@/features/billing/format";
import { clinicToday } from "@/config/clinic";
import { ALL_MONTHS, LEAD_STAGES } from "@backend/features/leads/lead.schema";
import type { ClosedLeads, LeadBoard, LeadCard, LeadStage, Tally } from "@backend/features/leads/leads.types";
import { STAGE_META, formatDayMonth, nextStep, sourceColor, whenLabel, type NextTone } from "../format";
import { leadsHref, recentMonths, type LeadsState } from "../leads-state";

const MONTH = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = (month: string) => MONTH.format(new Date(`${month}-01T00:00:00Z`));

const chip = (on: boolean, selected: string) => cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs", on ? `${selected} text-white` : "border-[#D5DCE5] bg-white text-[#46566B] hover:border-[#B5C7DE]");
const SOURCE_ON = "btn-navy border-[#0E2A47]";
const WHO_ON = "border-[#1D5296] bg-[linear-gradient(135deg,#3478CC_0%,#1D5296_70%)] shadow-[0_6px_16px_rgba(29,82,150,0.25)]";

const NEXT_TONE: Record<NextTone, string> = {
  unassigned: "bg-[#FDE3BD] text-[#5A3500]",
  due: "bg-[#FBD9D4] text-[#A1301F]",
  later: "bg-[#EEF3FA] text-[#1D5296]",
};

const Dot = ({ color }: { color: string }) => <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />;

function Kpi({ href, label, value, note, active, tone }: { href: string; label: string; value: string; note: string; active?: boolean; tone?: "amber" | "red" | "green" }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined} className={cn("glass-card flex min-w-0 flex-col gap-1 rounded-[22px] p-4 hover:brightness-[0.98]", active && "outline-2 -outline-offset-2 outline-[#1D5296]")}>
      <span className="text-xs text-[#5E6B7E]">{label}</span>
      <span className={cn("text-[28px] leading-tight tabular-nums", tone === "amber" && "text-[#A55A00]", tone === "red" && "text-[#A1301F]", tone === "green" && "text-[#1F7A4D]")}>{value}</span>
      <span className="truncate text-xs text-[#5E6B7E]">{note}</span>
    </Link>
  );
}

function Card({ lead: l, href, selected }: { lead: LeadCard; href: string; selected: boolean }) {
  const next = nextStep(l);
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={`${l.name}${l.hot ? ", hot" : ""}, ${l.interest?.name ?? "no treatment yet"}, from ${l.source?.name ?? "unknown"}`}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "glass-card flex flex-col gap-2 rounded-[18px] p-3 text-left hover:shadow-[0_6px_18px_rgba(14,42,71,0.12)]",
        selected && "outline-2 -outline-offset-2 outline-[#1D5296]",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="truncate text-sm font-medium">{l.name}</span>
        {l.hot ? <span className="shrink-0 rounded-md bg-[#FDECEA] px-1.5 py-0.5 text-[10px] font-semibold text-[#B42318]">HOT</span> : null}
      </span>
      <span className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-lg bg-[#E4EEFB] px-2 py-0.5">{l.interest?.name ?? "Treatment not set"}</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#F4F6F9] px-2 py-0.5">
          <Dot color={sourceColor(l.source?.name)} />
          {l.source?.name ?? "Unknown platform"}
        </span>
      </span>
      {l.message ? <span className="line-clamp-2 text-xs leading-relaxed text-[#5E6B7E]">{l.message}</span> : null}
      <span className={cn("inline-flex items-center gap-1 self-start rounded-lg px-2 py-1 text-[11px]", NEXT_TONE[next.tone])}>
        {next.tone === "due" ? <AlarmClock className="size-3" aria-hidden /> : null}
        {next.text}
      </span>
      <span className="flex items-center gap-2 border-t border-[#EDF0F4] pt-2 text-[11px] text-[#5E6B7E]">
        {l.assignee ? (
          <Avatar name={l.assignee.name} letters={2} className="size-[22px] text-[9px]" />
        ) : (
          <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-[#FDE3BD] text-[11px] text-[#A55A00]" aria-hidden>
            ?
          </span>
        )}
        <span className="flex-1 truncate">{l.assignee?.name ?? "Unassigned"}</span>
        <span className="shrink-0">{whenLabel(l.createdAt)}</span>
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
          <span className="w-[76px] text-xs text-[#46566B]">Platform</span>
          <Link href={leadsHref(state, { source: "all", lead: undefined })} aria-current={state.source === "all" ? "true" : undefined} className={chip(state.source === "all", SOURCE_ON)}>
            All · {board.openCount}
          </Link>
          {board.sources.map((s) => {
            const on = state.source === s.id;
            return (
              <Link key={s.id} href={leadsHref(state, { source: s.id, lead: undefined })} aria-current={on ? "true" : undefined} className={chip(on, SOURCE_ON)}>
                <Dot color={on ? "#FFFFFF" : sourceColor(s.name)} />
                {s.name} · {s.open}
              </Link>
            );
          })}
        </div>
        <div role="group" aria-label="Assigned to" className="flex flex-wrap items-center gap-1.5">
          <span className="w-[76px] text-xs text-[#46566B]">Assigned to</span>
          {[
            { id: "all", name: "Everyone" },
            { id: "none", name: "Unassigned" },
            { id: "due", name: "Calls due today" },
            { id: "me", name: "Assigned to me" },
            ...staff.filter((s) => s.id !== userId),
          ].map((w) => (
            <Link key={w.id} href={leadsHref(state, { who: w.id, lead: undefined })} aria-current={state.who === w.id ? "true" : undefined} className={chip(state.who === w.id, WHO_ON)}>
              {w.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-3.5 overflow-x-auto pb-2">
        {LEAD_STAGES.map((stage) => {
          const leads = board.columns[stage];
          return (
            <section key={stage} aria-label={STAGE_META[stage].label} className="flex min-h-[520px] min-w-[226px] flex-1 flex-col gap-2.5 rounded-[24px] border border-white/70 bg-white/45 p-3">
              <div className="flex items-center gap-2 px-1 pt-0.5">
                <span className={cn("size-2.5 rounded-full", STAGE_META[stage].dot)} aria-hidden />
                <h2 className="flex-1 truncate text-sm font-semibold">{STAGE_META[stage].label}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-[#46566B]">{leads.length}</span>
              </div>
              <span className="-mt-1.5 px-1 text-[11px] text-[#5E6B7E]">{STAGE_META[stage].hint}</span>
              {leads.map((l) => (
                <Card key={l.id} lead={l} href={leadsHref(state, { lead: l.id })} selected={state.lead === l.id} />
              ))}
              {leads.length === 0 ? <span className="px-1.5 py-[18px] text-center text-xs text-[#5E6B7E]">No leads here</span> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Month buttons in a glass pill; the selected one is navy. */
export function MonthPills({ label, items }: { label: string; items: { href: string; text: string; on: boolean }[] }) {
  return (
    <nav aria-label={label} className="glass-pill flex max-w-full flex-wrap gap-1 rounded-full p-[5px]">
      {items.map((m) => (
        <Link key={m.href} href={m.href} aria-current={m.on ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full px-4 text-[13px]", m.on ? "btn-navy text-white" : "text-[#46566B] hover:text-[#0E2A47]")}>
          {m.text}
        </Link>
      ))}
    </nav>
  );
}

const MONTH_NAME = new Intl.DateTimeFormat("en-PH", { month: "long", timeZone: "UTC" });
const monthName = (month: string) => MONTH_NAME.format(new Date(`${month}-01T00:00:00Z`));
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");
const leadCount = (t: Tally | undefined) => (t ? `${t.count} ${t.count === 1 ? "lead" : "leads"}` : "Nothing yet");
const stageName = (stage: string) => STAGE_META[stage as LeadStage]?.label.split(" · ")[0] ?? stage;

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <div className="glass-card flex min-w-0 flex-col gap-1.5 rounded-[22px] px-5 py-4">
      <span className="text-[13px] text-[#5E6B7E]">{label}</span>
      <span className={cn("truncate text-[28px] leading-tight tabular-nums", tone)}>{value}</span>
      <span className="truncate text-xs text-[#5E6B7E]">{note}</span>
    </div>
  );
}

export function ClosedView({ state, closed, reportHref }: { state: LeadsState; closed: ClosedLeads; reportHref?: string }) {
  const won = state.tab === "won";
  const period = state.month === ALL_MONTHS ? "All months" : monthLabel(state.month);
  const months = [
    ...recentMonths(clinicToday().slice(0, 7)).map((m) => ({ href: leadsHref(state, { month: m, lead: undefined }), text: monthName(m), on: state.month === m })),
    { href: leadsHref(state, { month: ALL_MONTHS, lead: undefined }), text: "All months", on: state.month === ALL_MONTHS },
  ];
  const breakdown = won ? closed.sources : closed.reasons;
  const top = breakdown[0]?.count ?? 0;
  const stats = won
    ? [
        { label: "Leads won", value: String(closed.total), note: period, tone: "text-[#1F7A4D]" },
        { label: "Won value", value: peso(closed.value), note: "Accepted treatment value" },
        { label: "Average time to win", value: closed.avgDaysToWin === null ? "—" : `${closed.avgDaysToWin} ${closed.avgDaysToWin === 1 ? "day" : "days"}`, note: "From enquiry to won" },
        { label: "Top platform", value: closed.sources[0]?.label ?? "—", note: leadCount(closed.sources[0]) },
      ]
    : [
        { label: "Leads terminated", value: String(closed.total), note: period, tone: "text-[#A1301F]" },
        { label: "Share of closed leads", value: pct(closed.total, closed.total + closed.otherTotal), note: "Terminated ÷ (won + terminated)" },
        { label: "Top reason", value: closed.reasons[0]?.label ?? "—", note: leadCount(closed.reasons[0]) },
        { label: "Most often lost at", value: closed.stages[0] ? stageName(closed.stages[0].label) : "—", note: leadCount(closed.stages[0]) },
      ];
  const head = won ? ["Date", "Lead", "Platform", "Treatment", "Value", "By"] : ["Date", "Lead", "Platform", "Treatment", "Lost at", "Reason", "By"];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPills label={won ? "Won month" : "Terminated month"} items={months} />
        {reportHref ? (
          <Link href={reportHref} className="glass-pill inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-sm text-[#0E2A47] hover:brightness-[0.98]">
            Monthly report
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <section aria-label={won ? "Won by platform" : "Why leads were terminated"} className="glass-card flex flex-col gap-3 rounded-[24px] px-6 py-5">
          <h2 className="text-lg font-medium">{won ? "Won by platform" : "Why leads were terminated"}</h2>
          {breakdown.map((t) => (
            <div key={t.label} className="flex flex-col gap-1.5">
              <span className="flex justify-between gap-2 text-sm">
                <span className="truncate">{t.label}</span>
                <span className="shrink-0 text-xs text-[#5E6B7E] tabular-nums">
                  {t.count} · {pct(t.count, closed.total)}
                </span>
              </span>
              <span className="h-2 rounded-full bg-[#EEF1F5]" aria-hidden>
                <span className="block h-full rounded-full" style={{ width: `${(t.count / top) * 100}%`, background: won ? sourceColor(t.label) : "#D9442F" }} />
              </span>
            </div>
          ))}
          {breakdown.length ? null : <p className="text-sm text-[#9AA6B6]">Nothing {won ? "won" : "terminated"} in this period.</p>}
        </section>

        <section aria-label={won ? "Won leads" : "Terminated leads"} className="glass-card flex min-w-0 flex-col gap-3 rounded-[24px] px-5 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h2 className="text-lg font-medium">
              {won ? "Won leads" : "Terminated leads"} · {period}
            </h2>
            <span className="text-xs text-[#5E6B7E]">Select a row to open the full lead</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-[1.5px] border-[#0E2A47]">
                  {head.map((h) => (
                    <th key={h} scope="col" className="px-3 pb-2.5 text-[11px] font-normal tracking-[0.08em] text-[#46566B] uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closed.leads.map((l) => (
                  <tr key={l.id} className={cn("relative border-b border-[#E6EBF1] hover:bg-white/60", state.lead === l.id && "bg-[#EEF3FA]")}>
                    <td className="px-3 py-3.5 whitespace-nowrap">{l.closedAt ? formatDayMonth(l.closedAt) : "—"}</td>
                    <td className="px-3 py-3.5 font-medium">
                      <Link href={leadsHref(state, { lead: l.id })} scroll={false} className="after:absolute after:inset-0">
                        {l.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3.5">{l.source?.name ?? "—"}</td>
                    <td className="px-3 py-3.5">{l.interest?.name ?? "—"}</td>
                    {won ? (
                      <td className="px-3 py-3.5 text-[#1F7A4D] tabular-nums">{l.wonValue === null ? "—" : peso(l.wonValue)}</td>
                    ) : (
                      <>
                        <td className="px-3 py-3.5">{stageName(l.stage)}</td>
                        <td className="px-3 py-3.5 text-[#C2402C]">{l.closedReason ?? "—"}</td>
                      </>
                    )}
                    <td className="px-3 py-3.5 whitespace-nowrap">{l.assignee?.name ?? "Unassigned"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {closed.leads.length === 0 ? <p className="py-8 text-center text-sm text-[#5E6B7E]">Nothing in this period.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
