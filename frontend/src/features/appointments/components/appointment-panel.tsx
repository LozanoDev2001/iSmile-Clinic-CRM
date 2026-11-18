"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/shared/avatar";
import { clinicDateOf, clinicToday } from "@/config/clinic";
import { cn } from "@/lib/utils";
import { cancelAppointmentAction, changeAppointmentStatusAction } from "@backend/features/appointments/appointments.controller";
import type { AppointmentStatus, BookingSource, CalendarAppointment } from "@backend/features/appointments/appointments.types";
import type { InvoiceSummary } from "@backend/features/billing/billing.types";
import { SOURCE_LABELS, STATUS_META, formatShortDate } from "../calendar-state";
import { timeRange } from "./appointment-card";

type NextStatus = Exclude<AppointmentStatus, "booked" | "cancelled">;

const VISIT_STEPS: { label: string; reachedAt: AppointmentStatus[] }[] = [
  { label: "Booked", reachedAt: ["booked", "confirmed", "checked_in", "in_progress", "completed"] },
  { label: "Checked in", reachedAt: ["checked_in", "in_progress", "completed"] },
  { label: "In the chair", reachedAt: ["in_progress", "completed"] },
  { label: "Visit finished", reachedAt: ["completed"] },
];

/** The visit's steps, then invoicing and payment. */
function journey(status: AppointmentStatus, invoice: InvoiceSummary | null) {
  return [
    ...VISIT_STEPS.map((s) => ({ label: s.label, done: s.reachedAt.includes(status) })),
    { label: invoice ? `Invoiced · ${invoice.number}` : "Invoiced", done: !!invoice },
    { label: invoice && invoice.balance > 0 ? `Paid · ${invoice.balance.toFixed(2)} still due` : "Paid", done: !!invoice && invoice.balance === 0 },
  ];
}

interface AppointmentPanelProps {
  appointment: CalendarAppointment;
  closeHref: string;
  moveHref: string;
  canUpdate: boolean;
  canCancel: boolean;
  invoice: InvoiceSummary | null;
  canInvoice: boolean;
}

export function AppointmentPanel({ appointment: a, closeHref, moveHref, canUpdate, canCancel, invoice, canInvoice }: AppointmentPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const meta = STATUS_META[a.status];
  const first = a.patient.name.split(" ")[0];
  const isToday = clinicDateOf(a.startsAt) <= clinicToday();

  const run = (action: () => Promise<{ success: boolean; message?: string; error?: { message: string } }>, done: string) =>
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error?.message ?? "Something went wrong.");
        return;
      }
      toast.success(result.message ?? done);
      router.refresh();
    });

  const setStatus = (status: NextStatus, done: string) => run(() => changeAppointmentStatusAction(a.id, status), done);

  const primary: { label: string; status: NextStatus; done: string } | null = !canUpdate
    ? null
    : (a.status === "booked" || a.status === "confirmed") && isToday
      ? { label: `Check in ${first}`, status: "checked_in", done: `${first} checked in.` }
      : a.status === "checked_in"
        ? { label: `Seat ${first} in the chair`, status: "in_progress", done: `${first} is in the chair.` }
        : a.status === "in_progress"
          ? { label: "Finish visit", status: "completed", done: "Visit finished. It's now on the patient's history." }
          : null;

  const secondary = "h-10 flex-1 rounded-full border px-3 text-sm disabled:opacity-50";

  return (
    <aside aria-label="Appointment details" className="glass-card flex flex-col gap-4 rounded-[24px] p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] tracking-[0.08em] text-[#5E6B7E] uppercase">Appointment</span>
        <span className="flex items-center gap-2">
          <span className={cn("rounded-full border px-2.5 py-0.5 text-xs no-underline", meta.card)}>{meta.label}</span>
          <Link href={closeHref} scroll={false} aria-label="Close" className="grid size-8 place-items-center rounded-full hover:bg-[#F4F6F9]">
            <X className="size-4" aria-hidden />
          </Link>
        </span>
      </div>

      <Link href={`/patients/${a.patient.id}`} className="flex items-center gap-3 rounded-2xl p-1 hover:bg-[#F4F6F9]">
        <Avatar name={a.patient.name} letters={2} className="size-11" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-lg">{a.patient.name}</span>
          <span className="truncate text-xs text-[#5E6B7E]">{[a.patient.patientNo, a.patient.phone].filter(Boolean).join(" · ")}</span>
        </span>
      </Link>

      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-[#5E6B7E]">When</dt>
        <dd>
          {formatShortDate(clinicDateOf(a.startsAt))} · {timeRange(a)}
        </dd>
        <dt className="text-[#5E6B7E]">Treatment</dt>
        <dd>{a.service?.name ?? "Not set"}</dd>
        <dt className="text-[#5E6B7E]">Dentist</dt>
        <dd>{a.dentist?.name ?? "Not assigned"}</dd>
        <dt className="text-[#5E6B7E]">Payer on file</dt>
        <dd>{a.patient.payerName ?? "Self-pay"}</dd>
        <dt className="text-[#5E6B7E]">Booked via</dt>
        <dd>{a.bookingSource ? (SOURCE_LABELS[a.bookingSource as BookingSource] ?? a.bookingSource) : "—"}</dd>
        {a.notes ? (
          <>
            <dt className="text-[#5E6B7E]">Notes</dt>
            <dd className="whitespace-pre-line">{a.notes}</dd>
          </>
        ) : null}
      </dl>

      {a.status === "no_show" ? null : (
        <ol aria-label="Patient journey" className="flex flex-col gap-2">
          {journey(a.status, invoice).map((step, i, steps) => {
            const done = step.done;
            const current = !done && (i === 0 || steps[i - 1].done);
            return (
              <li key={step.label} className={cn("flex items-center gap-2.5 text-sm", done || current ? "text-[#0E2A47]" : "text-[#5E6B7E]")}>
                <span className={cn("grid size-5 place-items-center rounded-full text-[11px] text-white", done ? "bg-[#2E9E63]" : current ? "bg-[#1D5296]" : "bg-[#D5DCE5]")} aria-hidden>
                  {done ? "✓" : current ? "•" : ""}
                </span>
                <span className={done || current ? "font-medium" : undefined}>{step.label}</span>
                <span className="sr-only">{done ? "done" : current ? "next" : "not yet"}</span>
              </li>
            );
          })}
        </ol>
      )}

      {primary ? (
        <button type="button" disabled={pending} onClick={() => setStatus(primary.status, primary.done)} className="h-12 rounded-2xl bg-[#0E2A47] text-sm font-semibold text-white disabled:opacity-60">
          {primary.label}
        </button>
      ) : null}
      {canUpdate && (a.status === "booked" || a.status === "confirmed") && !isToday ? (
        <p className="text-xs text-[#5E6B7E]">Check-in opens on the day of the appointment.</p>
      ) : null}

      {canUpdate || canCancel ? (
        <div className="flex flex-wrap gap-2">
          {canUpdate && a.status === "booked" ? (
            <button type="button" disabled={pending} onClick={() => setStatus("confirmed", `${first}'s appointment is confirmed.`)} className={cn(secondary, "border-[#D5DCE5] bg-white")}>
              Mark confirmed
            </button>
          ) : null}
          {canUpdate && (a.status === "booked" || a.status === "confirmed" || a.status === "no_show") ? (
            <Link href={moveHref} scroll={false} className={cn(secondary, "border-[#D5DCE5] bg-white text-center leading-10")}>
              {a.status === "no_show" ? "Rebook" : "Reschedule"}
            </Link>
          ) : null}
          {canUpdate && (a.status === "booked" || a.status === "confirmed") && isToday ? (
            <button type="button" disabled={pending} onClick={() => setStatus("no_show", `${first} marked as no-show.`)} className={cn(secondary, "border-[#F6C6BE] bg-white text-[#A1301F]")}>
              No-show
            </button>
          ) : null}
          {canCancel && (a.status === "booked" || a.status === "confirmed") ? (
            confirmingCancel ? (
              <span className="flex w-full items-center gap-2 rounded-2xl bg-[#FDF0EE] p-2 text-sm">
                <span className="flex-1">Cancel this appointment?</span>
                <button type="button" disabled={pending} onClick={() => run(() => cancelAppointmentAction(a.id), "Appointment cancelled.")} className="h-8 rounded-full bg-[#B3261E] px-3 text-white disabled:opacity-50">
                  Cancel it
                </button>
                <button type="button" disabled={pending} onClick={() => setConfirmingCancel(false)} className="h-8 rounded-full border border-[#D5DCE5] bg-white px-3">
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" disabled={pending} onClick={() => setConfirmingCancel(true)} className={cn(secondary, "border-[#F6C6BE] bg-white text-[#A1301F]")}>
                Cancel
              </button>
            )
          ) : null}
        </div>
      ) : null}
      {a.status === "completed" && invoice ? (
        <Link href={`/billing/invoices/${invoice.id}`} className="h-12 rounded-2xl bg-[#0E2A47] text-center text-sm leading-[48px] font-semibold text-white">
          {invoice.balance > 0 ? `Collect balance on ${invoice.number}` : `View invoice ${invoice.number}`}
        </Link>
      ) : null}
      {a.status === "completed" && !invoice && canInvoice ? (
        <Link href={`/billing/checkout?appointment=${a.id}`} className="fill-orange h-12 rounded-2xl text-center text-sm leading-[48px] font-semibold text-[#0E2A47]">
          Create invoice
        </Link>
      ) : null}
    </aside>
  );
}
