import type { CSSProperties } from "react";
import Link from "next/link";
import { clinicMinutesOf } from "@/config/clinic";
import { cn } from "@/lib/utils";
import type { CalendarAppointment } from "@backend/features/appointments/appointments.types";
import { STATUS_META, formatMinutes } from "../calendar-state";

export const minutesOf = (a: CalendarAppointment) => ({
  start: clinicMinutesOf(a.startsAt),
  duration: Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000),
});

export function timeRange(a: CalendarAppointment) {
  const { start, duration } = minutesOf(a);
  return `${formatMinutes(start)} – ${formatMinutes(start + duration)}`;
}

export function appointmentLabel(a: CalendarAppointment) {
  return `${a.patient.name}, ${a.service?.name ?? "Appointment"}, ${timeRange(a)}, ${a.dentist?.name ?? "No dentist"}, ${STATUS_META[a.status].label}`;
}

interface AppointmentCardProps {
  appointment: CalendarAppointment;
  href: string;
  selected: boolean;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function AppointmentCard({ appointment: a, href, selected, compact, className, style }: AppointmentCardProps) {
  const meta = STATUS_META[a.status];
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={appointmentLabel(a)}
      aria-current={selected ? "true" : undefined}
      style={style}
      className={cn(
        "flex min-w-0 gap-0.5 overflow-hidden rounded-xl border-l-4 px-2.5 py-1.5 text-left shadow-[0_1px_2px_rgba(14,42,71,0.06)] hover:brightness-[0.98]",
        compact ? "flex-row items-baseline justify-between gap-2" : "flex-col",
        meta.card,
        selected && "ring-2 ring-[#1D5296]",
        className,
      )}
    >
      <span className="truncate text-[13px] font-semibold">{a.patient.name}</span>
      {compact ? null : <span className="truncate text-xs opacity-80">{a.service?.name ?? "Appointment"}</span>}
      <span className="shrink-0 truncate text-[11px] opacity-70">{compact ? formatMinutes(minutesOf(a).start) : `${timeRange(a)} · ${meta.label}`}</span>
    </Link>
  );
}
