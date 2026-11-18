import Link from "next/link";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { InfoCard, StatTile } from "@/components/shared/info-card";
import { Pill } from "@/components/shared/pill";
import { cn } from "@/lib/utils";
import { STATUS_META, formatLongDate, formatMinutes, formatShortDate } from "@/features/appointments/calendar-state";
import { addDays, clinicMinutesOf, clinicToday } from "@backend/config/clinic";
import type { DentistDetail, DentistSummary, DentistsBoard as Board } from "@backend/features/dentists/dentists.types";

const navButton = "grid size-9 place-items-center rounded-full border border-[#D5DCE5] bg-white hover:bg-[#F4F6F9]";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function boardHref(dentist: string | undefined, date: string) {
  const params = new URLSearchParams();
  if (dentist) params.set("dentist", dentist);
  if (date !== clinicToday()) params.set("date", date);
  const qs = params.toString();
  return qs ? `/dentists?${qs}` : "/dentists";
}

function DentistList({ dentists, selectedId, date }: { dentists: DentistSummary[]; selectedId?: string; date: string }) {
  return (
    <section aria-label="Dentist list" className="glass-card flex min-w-0 flex-col gap-3 rounded-[24px] p-4">
      <ul className="-mx-1 flex max-h-[70vh] flex-col gap-0.5 overflow-y-auto px-1">
        {dentists.map((d) => {
          const selected = d.id === selectedId;
          return (
            <li key={d.id}>
              <Link
                href={boardHref(d.id, date)}
                aria-current={selected ? "page" : undefined}
                className={cn("flex items-center gap-3 rounded-[18px] border p-2.5", selected ? "border-[#BCD3F2] bg-[#E4EEFB]" : "border-transparent hover:bg-[#F4F6F9]")}
              >
                <Avatar name={d.name} letters={2} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px]">{d.name}</span>
                  <span className="truncate text-xs text-[#5E6B7E]">
                    {[plural(d.appointmentCount, "appointment"), d.patientCount !== null ? plural(d.patientCount, "patient") : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Schedule({ dentist: d, date }: { dentist: DentistDetail; date: string }) {
  const today = clinicToday();
  return (
    <InfoCard
      title={`Schedule · ${formatLongDate(date)}`}
      aside={
        <nav aria-label="Pick a day" className="flex items-center gap-1.5">
          <Link href={boardHref(d.id, addDays(date, -1))} aria-label="Previous day" className={navButton}>
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <Link
            href={boardHref(d.id, today)}
            aria-current={date === today ? "date" : undefined}
            className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[13px]", date === today ? "border-[#0E2A47] bg-[#0E2A47] text-white" : "border-[#D5DCE5] bg-white hover:bg-[#F4F6F9]")}
          >
            Today
          </Link>
          <Link href={boardHref(d.id, addDays(date, 1))} aria-label="Next day" className={navButton}>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </nav>
      }
    >
      {d.appointments.length ? (
        <ul className="flex flex-col divide-y divide-[#EDF0F4]">
          {d.appointments.map((a) => (
            <li key={a.id}>
              <Link href={`/calendar?date=${date}&appt=${a.id}`} className="grid items-center gap-1 rounded-xl px-1 py-3 hover:bg-[#F4F6F9] sm:grid-cols-[150px_minmax(0,1fr)_120px]">
                <span className="text-sm text-[#5E6B7E] tabular-nums">
                  {formatMinutes(clinicMinutesOf(a.startsAt))} – {formatMinutes(clinicMinutesOf(a.endsAt))}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn("truncate text-[15px]", a.status === "no_show" && "line-through")}>{a.patient.name}</span>
                  <span className="truncate text-xs text-[#5E6B7E]">{[a.patient.patientNo, a.service?.name ?? "Service not set"].join(" · ")}</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-[#46566B]">
                  <span className={cn("size-2 rounded-full", STATUS_META[a.status].dot)} aria-hidden />
                  {STATUS_META[a.status].label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#5E6B7E]">No appointments on {formatShortDate(date)}. Free all day.</p>
      )}
    </InfoCard>
  );
}

function DentistFile({ dentist: d, date, canBook }: { dentist: DentistDetail; date: string; canBook: boolean }) {
  const active = d.appointments.filter((a) => a.status !== "no_show");
  const done = active.filter((a) => a.status === "completed").length;
  const noShows = d.appointments.length - active.length;
  const first = active[0];
  const last = active[active.length - 1];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section aria-label="Dentist summary" className="glass-card flex flex-wrap items-center gap-4 rounded-[24px] p-5">
        <Avatar name={d.name} letters={2} className="size-14 text-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="text-2xl">{d.name}</h2>
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="muted">Dentist</Pill>
            <Pill tone={active.length ? "amber" : "green"}>{active.length ? `${plural(active.length, "appointment")} on ${formatShortDate(date)}` : `Free on ${formatShortDate(date)}`}</Pill>
          </div>
        </div>
        <Link href={`/calendar?date=${date}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#D5DCE5] bg-white px-4 text-sm hover:bg-[#F4F6F9]">
          <CalendarDays className="size-4" aria-hidden />
          Open calendar
        </Link>
        {canBook ? (
          <Link href={`/calendar?date=${date}&form=new`} className="fill-orange inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-[#0E2A47] hover:brightness-105">
            <CalendarPlus className="size-4" aria-hidden />
            Book visit
          </Link>
        ) : null}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile highlight label="Appointments" value={String(active.length)} note={noShows ? `${plural(noShows, "no-show")} not counted` : formatShortDate(date)} />
        <StatTile label="Completed" value={String(done)} note={active.length ? `${active.length - done} still to go` : "Nothing booked"} />
        <StatTile label="Working window" value={first ? `${formatMinutes(clinicMinutesOf(first.startsAt))} – ${formatMinutes(clinicMinutesOf(last.endsAt))}` : "—"} note={first ? "First to last appointment" : "No appointments"} />
        <StatTile label="Assigned patients" value={d.patientCount !== null ? String(d.patientCount) : "—"} note={d.patientCount !== null ? "Attending dentist on file" : "Needs patient access"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
        <Schedule dentist={d} date={date} />
        {d.patients ? (
          <InfoCard title="Assigned patients" aside={<span className="text-xs text-[#5E6B7E]">{d.patientCount}</span>}>
            {d.patients.length ? (
              <ul className="-mx-1 flex max-h-[420px] flex-col gap-0.5 overflow-y-auto px-1">
                {d.patients.map((p) => (
                  <li key={p.id}>
                    <Link href={`/patients/${p.id}`} className="flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-[#F4F6F9]">
                      <Avatar name={p.name} letters={2} className="size-8 text-xs" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm">{p.name}</span>
                        <span className="text-xs text-[#5E6B7E]">{p.patientNo}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#5E6B7E]">No patients assigned yet. Set the attending dentist in a patient&apos;s details.</p>
            )}
            {d.patientCount !== null && d.patientCount > d.patients.length ? <p className="text-xs text-[#5E6B7E]">Showing the newest {d.patients.length}.</p> : null}
          </InfoCard>
        ) : null}
      </div>
    </div>
  );
}

export function DentistsBoard({ board, canBook }: { board: Board; canBook: boolean }) {
  const busy = board.dentists.filter((d) => d.appointmentCount > 0).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">Dentists</h1>
        <p className="text-[13px] text-[#5E6B7E]">
          {plural(board.dentists.length, "dentist")} · schedules and assigned patients · {busy} with appointments on {formatShortDate(board.date)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:items-start">
        <DentistList dentists={board.dentists} selectedId={board.selected?.id} date={board.date} />
        {board.selected ? (
          <DentistFile dentist={board.selected} date={board.date} canBook={canBook} />
        ) : (
          <section className="glass-card rounded-[24px] p-10 text-center text-sm text-[#5E6B7E]">No active dentists yet. Add one in Settings → Team & roles.</section>
        )}
      </div>
    </div>
  );
}
