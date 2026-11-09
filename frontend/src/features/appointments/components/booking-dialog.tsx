"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { clinicDateOf, clinicToday } from "@/config/clinic";
import { selectClass } from "@/components/forms/styles";
import { cn } from "@/lib/utils";
import { BOOKING_SOURCES, MAX_DURATION, MIN_DURATION } from "@backend/features/appointments/appointment.schema";
import { bookAppointmentAction, getOpenSlotsAction, rescheduleAppointmentAction } from "@backend/features/appointments/appointments.controller";
import type { BookingOptions, BookingSource, CalendarAppointment } from "@backend/features/appointments/appointments.types";
import { PatientPicker, type PatientChoice } from "@/features/patients/components/patient-picker";
import { SOURCE_LABELS, calendarHref, formatMinutes, type CalendarState } from "../calendar-state";
import { minutesOf } from "./appointment-card";

const DEFAULT_DURATION = 30;
const DURATION_STEP = 15;
const DURATIONS = Array.from({ length: (MAX_DURATION - MIN_DURATION) / DURATION_STEP + 1 }, (_, i) => MIN_DURATION + i * DURATION_STEP);

const chip = (on: boolean) =>
  cn("h-9 rounded-full border px-3 text-[13px] disabled:opacity-50", on ? "border-[#0E2A47] bg-[#0E2A47] text-white" : "border-[#D5DCE5] bg-white text-[#0E2A47] hover:bg-[#F4F6F9]");

interface BookingDialogProps {
  state: CalendarState;
  options: BookingOptions;
  /** Set when rescheduling. */
  appointment: CalendarAppointment | null;
  patient: PatientChoice | null;
  closeHref: string;
}

export function BookingDialog({ state, options, appointment, patient: initialPatient, closeHref }: BookingDialogProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const today = clinicToday();
  const moving = appointment !== null;

  const [patient, setPatient] = useState<PatientChoice | null>(
    appointment ? { id: appointment.patient.id, name: appointment.patient.name, patientNo: appointment.patient.patientNo } : initialPatient,
  );
  const [serviceId, setServiceId] = useState(appointment?.service?.id ?? "");
  const [duration, setDuration] = useState(appointment ? minutesOf(appointment).duration : DEFAULT_DURATION);
  const [dentistId, setDentistId] = useState(options.lockedDentistId ?? appointment?.dentist?.id ?? options.dentists[0]?.id ?? "");
  const [date, setDate] = useState(() => {
    const start = appointment ? clinicDateOf(appointment.startsAt) : state.date;
    return start < today ? today : start;
  });
  // Fetched slots and the picked time belong to one dentist/day/length; they reset when that changes.
  const slotKey = `${dentistId}|${date}|${duration}`;
  const [fetched, setFetched] = useState<{ key: string; slots: number[] } | null>(null);
  const [picked, setPicked] = useState<{ key: string; minutes: number } | null>(null);
  const slots = fetched?.key === slotKey ? fetched.slots : null;
  const slot = picked?.key === slotKey ? picked.minutes : null;
  const setSlot = (minutes: number) => setPicked({ key: slotKey, minutes });
  const [source, setSource] = useState<BookingSource>("front_desk");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (!dentistId || !date) return;
    let current = true;
    const key = `${dentistId}|${date}|${duration}`;
    getOpenSlotsAction({ dentistId, date, durationMinutes: duration, excludeAppointmentId: appointment?.id }).then((result) => {
      if (!current) return;
      if (result.success) setFetched({ key, slots: result.data });
      else setError(result.error.message);
    });
    return () => {
      current = false;
    };
  }, [dentistId, date, duration, appointment?.id]);

  const pickService = (id: string) => {
    setServiceId(id);
    const minutes = options.services.find((s) => s.id === id)?.durationMinutes;
    if (minutes && DURATIONS.includes(minutes)) setDuration(minutes);
  };

  const save = () => {
    setError("");
    if (!patient) return setError("Choose a patient.");
    if (!dentistId) return setError("Choose a dentist.");
    if (slot === null) return setError("Pick an open time.");
    const slotInput = { dentistId, date, startMinutes: slot, durationMinutes: duration };
    startSaving(async () => {
      const result = moving
        ? await rescheduleAppointmentAction(appointment.id, slotInput)
        : await bookAppointmentAction({ ...slotInput, patientId: patient.id, serviceId: serviceId || null, bookingSource: source, notes: notes || null });
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      toast.success(result.message ?? "Saved.");
      router.push(calendarHref(state, { view: "day", date, appt: result.data.id, form: undefined, patient: undefined }), { scroll: false });
      router.refresh();
    });
  };

  const title = moving ? `Move ${appointment.patient.name}'s appointment` : "New appointment";
  const dentistName = options.dentists.find((d) => d.id === dentistId)?.name;

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onClose={() => router.push(closeHref, { scroll: false })}
      className="m-auto w-[min(640px,calc(100vw-32px))] rounded-[28px] bg-[#F7F9FC] p-0 text-[#0E2A47] shadow-2xl backdrop:bg-[#0E2A47]/40"
    >
      <div className="flex max-h-[85vh] flex-col gap-5 overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl">{title}</h2>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-white">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {moving ? null : (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="booking-patient" className="text-sm text-[#46566B]">
                Patient
              </label>
              <PatientPicker value={patient} onChange={setPatient} inputId="booking-patient" />
            </div>
            <label className="flex flex-col gap-2 text-sm text-[#46566B]">
              Service
              <select value={serviceId} onChange={(e) => pickService(e.target.value)} className={selectClass}>
                <option value="">Not set yet</option>
                {options.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label className="flex flex-col gap-2 text-sm text-[#46566B]">
          Length
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={selectClass}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} minutes
              </option>
            ))}
          </select>
        </label>

        {options.lockedDentistId ? null : (
          <div role="group" aria-labelledby="booking-dentist" className="flex flex-col gap-2">
            <span id="booking-dentist" className="text-sm text-[#46566B]">
              Dentist
            </span>
            <div className="flex flex-wrap gap-2">
              {options.dentists.map((d) => (
                <button key={d.id} type="button" aria-pressed={dentistId === d.id} onClick={() => setDentistId(d.id)} className={chip(dentistId === d.id)}>
                  {d.name}
                </button>
              ))}
              {options.dentists.length ? null : <span className="text-sm text-[#5E6B7E]">No dentists yet. Invite one in Settings › Team &amp; roles.</span>}
            </div>
          </div>
        )}

        <label className="flex flex-col gap-2 text-sm text-[#46566B]">
          Day
          <input type="date" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} className={selectClass} />
        </label>

        <div role="group" aria-labelledby="booking-times" className="flex flex-col gap-2">
          <span id="booking-times" className="text-sm text-[#46566B]">
            Open times{dentistName ? ` for ${dentistName}` : ""}
          </span>
          <div className="flex flex-wrap gap-2">
            {slots === null ? <span className="text-sm text-[#5E6B7E]">Checking the schedule…</span> : null}
            {slots?.map((m) => (
              <button key={m} type="button" aria-pressed={slot === m} onClick={() => setSlot(m)} className={chip(slot === m)}>
                {formatMinutes(m)}
              </button>
            ))}
            {slots?.length === 0 ? <span className="text-sm text-[#5E6B7E]">No open times. The clinic may be closed, or this day is fully booked. Pick another day.</span> : null}
          </div>
        </div>

        {moving ? null : (
          <>
            <div role="group" aria-labelledby="booking-source" className="flex flex-col gap-2">
              <span id="booking-source" className="text-sm text-[#46566B]">
                Booked via
              </span>
              <div className="flex flex-wrap gap-2">
                {BOOKING_SOURCES.map((s) => (
                  <button key={s} type="button" aria-pressed={source === s} onClick={() => setSource(s)} className={chip(source === s)}>
                    {SOURCE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-2 text-sm text-[#46566B]">
              Notes for the team
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={1000}
                className="rounded-2xl border border-[#D5DCE5] bg-white px-4 py-3 text-[15px] outline-none focus-visible:border-[#1D5296] focus-visible:ring-3 focus-visible:ring-[#1D5296]/15"
              />
            </label>
          </>
        )}

        {error ? (
          <p role="alert" className="rounded-xl bg-[#FDECEA] px-3 py-2 text-sm text-[#A1301F]">
            {error}
          </p>
        ) : null}

        <button type="button" disabled={saving} onClick={save} className="fill-orange h-12 rounded-full text-[15px] font-medium text-[#0E2A47] hover:brightness-105 disabled:opacity-60">
          {saving ? "Saving…" : moving ? "Move appointment" : "Book appointment"}
        </button>
      </div>
    </dialog>
  );
}
