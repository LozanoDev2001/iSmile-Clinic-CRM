import type { ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, clinicToday } from "@/config/clinic";
import { cn } from "@/lib/utils";
import type { AppointmentStatus, CalendarAppointment } from "@backend/features/appointments/appointments.types";
import type { NamedRef } from "@backend/features/patients/patients.types";
import { FILTER_STATUSES, STATUS_META, calendarHref, formatMonth, shiftDate, type CalendarState, viewRange } from "../calendar-state";
import { timeRange } from "./appointment-card";

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

function MonthPicker({ state }: { state: CalendarState }) {
  const { from, to } = viewRange("month", state.date);
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const today = clinicToday();
  const month = state.date.slice(0, 7);
  return (
    <section aria-label="Month picker" className="glass-card flex flex-col gap-2 rounded-[24px] p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{formatMonth(state.date)}</span>
        <span className="flex gap-1">
          <Link href={calendarHref(state, { date: shiftDate("month", state.date, -1), appt: undefined })} aria-label="Previous month" className="grid size-7 place-items-center rounded-full hover:bg-[#F4F6F9]">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <Link href={calendarHref(state, { date: shiftDate("month", state.date, 1), appt: undefined })} aria-label="Next month" className="grid size-7 place-items-center rounded-full hover:bg-[#F4F6F9]">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="text-[#5E6B7E]">
            {d}
          </span>
        ))}
        {days.map((date) => (
          <Link
            key={date}
            href={calendarHref(state, { date, appt: undefined })}
            aria-label={date}
            aria-current={date === state.date ? "date" : undefined}
            className={cn(
              "grid aspect-square place-items-center rounded-full text-xs",
              date === state.date ? "bg-[#0E2A47] text-white" : date === today ? "font-semibold text-[#F39A1E]" : "hover:bg-[#F4F6F9]",
              !date.startsWith(month) && date !== state.date && "text-[#B5BFCC]",
            )}
          >
            {Number(date.slice(8))}
          </Link>
        ))}
      </div>
    </section>
  );
}

function UpNext({ state, next }: { state: CalendarState; next: CalendarAppointment | undefined }) {
  if (!next) return null;
  return (
    <Link href={calendarHref(state, { appt: next.id, form: undefined })} className="flex flex-col gap-1 rounded-[24px] bg-[#1D5296] p-4 text-white hover:brightness-110">
      <span className="text-[11px] tracking-[0.08em] text-[#CFE0F5] uppercase">Up next</span>
      <span className="text-lg">{next.patient.name}</span>
      <span className="text-sm text-[#CFE0F5]">{next.service?.name ?? "Appointment"}</span>
      <span className="text-sm">{timeRange(next)}</span>
      <span className="text-xs text-[#CFE0F5]">{next.dentist?.name ?? "No dentist"}</span>
    </Link>
  );
}

/** `dentists` is null for dentists themselves, who only ever see their own column. */
function Filters({ state, dentists, counts }: { state: CalendarState; dentists: NamedRef[] | null; counts: Record<string, number> }) {
  const option = (href: string, on: boolean, label: string, extra?: ReactNode) => (
    <Link key={href + label} href={href} role="checkbox" aria-checked={on} className="flex items-center gap-2 rounded-xl px-1.5 py-1 text-sm hover:bg-[#F4F6F9]">
      <span className={cn("grid size-[18px] shrink-0 place-items-center rounded-[5px] border-2", on ? "border-[#1D5296] bg-[#1D5296] text-white" : "border-[#C3CCD8] bg-white")}>
        {on ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
      </span>
      {extra}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
  return (
    <section aria-label="Filters" className="glass-card flex flex-col gap-1 rounded-[24px] p-4">
      {dentists ? (
        <>
          <span className="text-xs text-[#5E6B7E]">Dentists</span>
          {dentists.map((d) => option(calendarHref(state, { off: toggle(state.off, d.id), appt: undefined }), !state.off.includes(d.id), d.name))}
          {dentists.length ? null : <span className="text-sm text-[#5E6B7E]">No dentists yet. Invite one in Settings › Team &amp; roles.</span>}
        </>
      ) : null}
      <span className={cn("text-xs text-[#5E6B7E]", dentists && "mt-2")}>Status</span>
      {FILTER_STATUSES.map((s: AppointmentStatus) =>
        option(
          calendarHref(state, { hide: toggle(state.hide, s), appt: undefined }),
          !state.hide.includes(s),
          `${STATUS_META[s].label}${counts[s] ? ` · ${counts[s]}` : ""}`,
          <span className={cn("size-3 shrink-0 rounded-[4px]", STATUS_META[s].dot)} aria-hidden />,
        ),
      )}
    </section>
  );
}

interface CalendarSidebarProps {
  state: CalendarState;
  dentists: NamedRef[] | null;
  next: CalendarAppointment | undefined;
  statusCounts: Record<string, number>;
}

export function CalendarSidebar({ state, dentists, next, statusCounts }: CalendarSidebarProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <MonthPicker state={state} />
      <UpNext state={state} next={next} />
      <Filters state={state} dentists={dentists} counts={statusCounts} />
    </div>
  );
}
