import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { clinicToday } from "@/config/clinic";
import { cn } from "@/lib/utils";
import { VIEWS, calendarHref, formatLongDate, formatMonth, formatShortDate, shiftDate, type CalendarState, viewRange } from "../calendar-state";

function title(state: CalendarState) {
  if (state.view === "day") return formatLongDate(state.date);
  if (state.view === "month") return formatMonth(state.date);
  const { from, to } = viewRange("week", state.date);
  return `${formatShortDate(from)} – ${formatShortDate(to)}`;
}

const VIEW_LABELS = { day: "Day", week: "Week", month: "Month" } as const;

export function CalendarToolbar({ state, summary, canBook }: { state: CalendarState; summary: string; canBook: boolean }) {
  const today = clinicToday();
  const showsToday = state.view === "day" ? state.date === today : viewRange(state.view, state.date).from <= today && today <= viewRange(state.view, state.date).to;
  const iconButton = "grid size-10 shrink-0 place-items-center rounded-full border border-[#D5DCE5] bg-white hover:bg-[#F4F6F9]";
  return (
    <section aria-label="Calendar controls" className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link href={calendarHref(state, { date: shiftDate(state.view, state.date, -1), appt: undefined })} aria-label="Previous" className={iconButton}>
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-[22px] leading-tight sm:text-[26px]">{title(state)}</h1>
          <span className="truncate text-xs text-[#5E6B7E]">{summary}</span>
        </div>
        <Link href={calendarHref(state, { date: shiftDate(state.view, state.date, 1), appt: undefined })} aria-label="Next" className={iconButton}>
          <ChevronRight className="size-4" aria-hidden />
        </Link>
        {showsToday ? null : (
          <Link href={calendarHref(state, { date: today, appt: undefined })} className="h-10 rounded-full border border-[#D5DCE5] bg-white px-4 text-sm leading-10 hover:bg-[#F4F6F9]">
            Today
          </Link>
        )}
      </div>
      <nav aria-label="View" className="flex rounded-full bg-[#EEF1F5] p-1">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={calendarHref(state, { view: v, appt: undefined })}
            aria-current={state.view === v ? "page" : undefined}
            className={cn("rounded-full px-4 py-1.5 text-sm", state.view === v ? "bg-white font-medium shadow-sm" : "text-[#46566B]")}
          >
            {VIEW_LABELS[v]}
          </Link>
        ))}
      </nav>
      {canBook ? (
        <Link
          href={calendarHref(state, { form: "new", appt: undefined })}
          scroll={false}
          className="fill-orange inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-medium text-[#0E2A47] hover:brightness-105"
        >
          <Plus className="size-4" aria-hidden />
          New appointment
        </Link>
      ) : null}
    </section>
  );
}
