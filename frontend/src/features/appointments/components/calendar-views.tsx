import Link from "next/link";
import { addDays, clinicDateOf, clinicMinutesOf, clinicToday, timeToMinutes } from "@/config/clinic";
import { cn } from "@/lib/utils";
import type { CalendarAppointment } from "@backend/features/appointments/appointments.types";
import type { NamedRef } from "@backend/features/patients/patients.types";
import type { OpeningHours } from "@backend/features/settings/settings.types";
import { calendarHref, formatMinutes, formatShortDate, type CalendarState, weekStart } from "../calendar-state";
import { AppointmentCard, minutesOf } from "./appointment-card";

const PX_PER_MINUTE = 1.4;
const DEFAULT_OPEN = 8 * 60;
const DEFAULT_CLOSE = 18 * 60;
const MONTH_CHIPS = 3;
const UNASSIGNED: NamedRef = { id: "unassigned", name: "No dentist" };

const byDate = (appointments: CalendarAppointment[], date: string) => appointments.filter((a) => clinicDateOf(a.startsAt) === date);

/** Day view: one column per dentist on a time grid. */
export function DayGrid({ state, appointments, dentists, hours }: { state: CalendarState; appointments: CalendarAppointment[]; dentists: NamedRef[]; hours: OpeningHours | undefined }) {
  const day = byDate(appointments, state.date);
  const columns = [...dentists, ...(day.some((a) => !a.dentist) ? [UNASSIGNED] : [])];
  const spans = day.map(minutesOf);
  const open = hours && !hours.closed ? timeToMinutes(hours.open) : DEFAULT_OPEN;
  const close = hours && !hours.closed ? timeToMinutes(hours.close) : DEFAULT_CLOSE;
  const gridStart = Math.floor(Math.min(open, ...spans.map((s) => s.start)) / 60) * 60;
  const gridEnd = Math.ceil(Math.max(close, ...spans.map((s) => s.start + s.duration)) / 60) * 60;
  const hourMarks = Array.from({ length: (gridEnd - gridStart) / 60 }, (_, i) => gridStart + i * 60);
  const now = clinicMinutesOf(new Date());
  const showNow = state.date === clinicToday() && now >= gridStart && now <= gridEnd;

  if (!columns.length) return <p className="glass-card rounded-[24px] p-10 text-center text-sm text-[#5E6B7E]">No dentists selected. Turn one on in the filters.</p>;

  return (
    <section aria-label="Day schedule" className="glass-card overflow-x-auto rounded-[24px] p-3">
      <div className="min-w-fit" style={{ minWidth: 64 + columns.length * 180 }}>
        <div className="grid border-b border-[#E3E7ED] pb-2" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(180px, 1fr))` }}>
          <span className="self-end text-[11px] text-[#5E6B7E]">PHT</span>
          {columns.map((d) => (
            <span key={d.id} className="px-2 text-sm font-medium">
              {d.name}
              <span className="block text-xs font-normal text-[#5E6B7E]">{day.filter((a) => (a.dentist?.id ?? UNASSIGNED.id) === d.id).length} appointments</span>
            </span>
          ))}
        </div>
        <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(180px, 1fr))`, height: (gridEnd - gridStart) * PX_PER_MINUTE }}>
          {hourMarks.map((m) => (
            <div key={m} aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-[#EDF0F4]" style={{ top: (m - gridStart) * PX_PER_MINUTE }}>
              <span className="absolute -top-2 left-0 bg-[#F7F9FC] pr-1 text-[11px] text-[#5E6B7E]">{formatMinutes(m)}</span>
            </div>
          ))}
          {hours && !hours.closed ? null : (
            <p className="absolute inset-x-16 top-4 rounded-xl bg-[#FDE3BD] px-3 py-2 text-xs text-[#7A4300]">The clinic is closed on this day in Settings › Clinic profile.</p>
          )}
          <span />
          {columns.map((d) => (
            <div key={d.id} className="relative border-l border-[#EDF0F4]">
              {day
                .filter((a) => (a.dentist?.id ?? UNASSIGNED.id) === d.id)
                .map((a) => {
                  const { start, duration } = minutesOf(a);
                  const height = Math.max(26, duration * PX_PER_MINUTE - 4);
                  return (
                    <AppointmentCard
                      key={a.id}
                      appointment={a}
                      href={calendarHref(state, { appt: a.id, form: undefined })}
                      selected={state.appt === a.id}
                      compact={height < 60}
                      className="absolute inset-x-1"
                      style={{ top: (start - gridStart) * PX_PER_MINUTE + 2, height }}
                    />
                  );
                })}
            </div>
          ))}
          {showNow ? (
            <div aria-hidden className="pointer-events-none absolute right-0 left-14 border-t-2 border-[#E5484D]" style={{ top: (now - gridStart) * PX_PER_MINUTE }} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Week view: Monday to Sunday, appointments listed per day. */
export function WeekList({ state, appointments }: { state: CalendarState; appointments: CalendarAppointment[] }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(state.date), i));
  const today = clinicToday();
  return (
    <section aria-label="Week schedule" className="grid gap-2 md:grid-cols-7">
      {days.map((date) => {
        const list = byDate(appointments, date);
        return (
          <div key={date} className={cn("glass-card flex min-w-0 flex-col gap-1.5 rounded-[20px] p-2", date === today && "ring-2 ring-[#F39A1E]")}>
            <Link href={calendarHref(state, { view: "day", date, appt: undefined })} className="rounded-xl px-1.5 py-1 hover:bg-[#F4F6F9]">
              <span className="block text-sm font-medium">{formatShortDate(date)}</span>
              <span className="text-xs text-[#5E6B7E]">{list.length} appointments</span>
            </Link>
            {list.map((a) => (
              <AppointmentCard key={a.id} appointment={a} href={calendarHref(state, { appt: a.id, form: undefined })} selected={state.appt === a.id} compact />
            ))}
          </div>
        );
      })}
    </section>
  );
}

/** Month view: whole weeks, with a few appointments per day and a count. */
export function MonthGrid({ state, appointments, from, to }: { state: CalendarState; appointments: CalendarAppointment[]; from: string; to: string }) {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const month = state.date.slice(0, 7);
  const today = clinicToday();
  return (
    <section aria-label="Month schedule" className="glass-card rounded-[24px] p-3">
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs text-[#5E6B7E]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const list = byDate(appointments, date);
          return (
            <Link
              key={date}
              href={calendarHref(state, { view: "day", date, appt: undefined })}
              className={cn(
                "flex min-h-24 min-w-0 flex-col gap-1 rounded-xl border p-1.5 hover:bg-[#F4F6F9]",
                date.startsWith(month) ? "border-[#E3E7ED] bg-white" : "border-transparent bg-[#F4F6F9]/60 text-[#9AA6B6]",
                date === today && "ring-2 ring-[#F39A1E]",
              )}
            >
              <span className="flex items-center justify-between text-xs">
                <span className="font-medium">{Number(date.slice(8))}</span>
                {list.length ? <span className="rounded-full bg-[#E4EEFB] px-1.5 text-[11px] text-[#1D5296]">{list.length}</span> : null}
              </span>
              {list.slice(0, MONTH_CHIPS).map((a) => (
                <span key={a.id} className="truncate text-[11px] text-[#46566B]">
                  {formatMinutes(minutesOf(a).start)} {a.patient.name.split(" ")[0]}
                </span>
              ))}
              {list.length > MONTH_CHIPS ? <span className="text-[11px] text-[#5E6B7E]">+{list.length - MONTH_CHIPS} more</span> : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
