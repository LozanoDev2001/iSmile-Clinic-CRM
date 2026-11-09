"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flame, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/styles";
import { addDays, clinicDateOf, clinicInstant, clinicToday, timeToMinutes } from "@/config/clinic";
import { cn } from "@/lib/utils";
import { formatMinutes } from "@/features/appointments/calendar-state";
import { CHANNEL_LABELS, labelOf } from "@/features/patients/format";
import { getOpenSlotsAction } from "@backend/features/appointments/appointments.controller";
import { updateLeadAction } from "@backend/features/leads/leads.controller";
import { CALL_RESULTS, FOLLOW_UP_REASONS, LOST_REASONS } from "@backend/features/leads/lead.schema";
import type { LeadActionInput, LeadDetail, LeadOptions, LeadStage } from "@backend/features/leads/leads.types";
import { CALL_RESULT_LABELS, STAGE_META, formatLeadTime } from "../format";

type ActionType = LeadActionInput["type"];

const ACTION_LABELS: Record<ActionType, string> = {
  assign: "Assigned · to call",
  retry: "Stay in Assigned · no answer, try again",
  follow_up: "Follow-up · spoke to them, call back",
  book_consult: "Consult booked · book it on the calendar",
  plan_sent: "Plan sent · waiting on their decision",
  won: "Won · they accepted a treatment",
  lost: "Lost",
  reopen: "Reopen this lead",
  note: "Just add a note",
};

/** Next steps offered from each stage, following the clinic's pipeline. */
const MOVES: Record<LeadStage, ActionType[]> = {
  new: ["assign", "follow_up", "book_consult", "lost", "note"],
  assigned: ["retry", "follow_up", "book_consult", "lost", "note"],
  follow_up: ["follow_up", "book_consult", "plan_sent", "lost", "note"],
  consult_booked: ["plan_sent", "won", "lost", "note"],
  plan_sent: ["follow_up", "won", "lost", "note"],
};

const JOURNEY: { stage: LeadStage | "won"; label: string }[] = [
  { stage: "new", label: "Lead" },
  { stage: "assigned", label: "Assigned" },
  { stage: "follow_up", label: "Spoke to them" },
  { stage: "consult_booked", label: "Consult" },
  { stage: "plan_sent", label: "Plan" },
  { stage: "won", label: "Won" },
];

const label = "flex flex-col gap-1.5 text-sm text-[#46566B]";
const chip = (on: boolean) => cn("h-9 rounded-full border px-3 text-[13px]", on ? "border-[#0E2A47] bg-[#0E2A47] text-white" : "border-[#D5DCE5] bg-white");

function useSlots(dentistId: string, date: string, duration: number) {
  const key = `${dentistId}|${date}|${duration}`;
  const [fetched, setFetched] = useState<{ key: string; slots: number[] } | null>(null);
  useEffect(() => {
    if (!dentistId || !date) return;
    let current = true;
    getOpenSlotsAction({ dentistId, date, durationMinutes: duration }).then((r) => current && setFetched({ key: `${dentistId}|${date}|${duration}`, slots: r.success ? r.data : [] }));
    return () => {
      current = false;
    };
  }, [dentistId, date, duration]);
  return fetched?.key === key ? fetched.slots : null;
}

interface LeadPanelProps {
  lead: LeadDetail;
  options: LeadOptions;
  userId: string;
  canUpdate: boolean;
  canBook: boolean;
  closeHref: string;
}

export function LeadPanel({ lead: l, options, userId, canUpdate, canBook, closeHref }: LeadPanelProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const moves = l.status === "open" ? MOVES[l.stage].filter((m) => m !== "book_consult" || canBook) : l.status === "lost" ? (["reopen", "note"] as ActionType[]) : (["note"] as ActionType[]);
  const [type, setType] = useState<ActionType>(moves[0]);
  const [assigneeId, setAssigneeId] = useState(l.assignee?.id ?? (options.staff.some((s) => s.id === userId) ? userId : ""));
  const [day, setDay] = useState(clinicToday());
  const [time, setTime] = useState("");
  const [choice, setChoice] = useState("");
  const [serviceId, setServiceId] = useState(l.interest?.id ?? "");
  const [dentistId, setDentistId] = useState(options.dentists[0]?.id ?? "");
  const [slot, setSlot] = useState<{ key: string; minutes: number } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const duration = options.services.find((s) => s.id === serviceId)?.durationMinutes ?? 30;
  const slotKey = `${dentistId}|${day}|${duration}`;
  const slots = useSlots(type === "book_consult" ? dentistId : "", day, duration);
  const picked = slot?.key === slotKey ? slot.minutes : null;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const needsTime = type === "assign" || type === "retry" || type === "follow_up" || type === "plan_sent" || type === "reopen";
  const nextAt = () => (time ? clinicInstant(day, timeToMinutes(time)).toISOString() : "");

  const buildAction = (): LeadActionInput | string => {
    if (type === "note") return note.trim().length >= 2 ? { type, note } : "Write the note.";
    if (!assigneeId) return "Choose who is handling this lead.";
    if (needsTime && !time) return "Pick the time for the next call.";
    const common = { assigneeId, note: note || null };
    switch (type) {
      case "assign":
      case "reopen":
        return { type, ...common, nextAt: nextAt() };
      case "retry":
        return { type, ...common, result: (choice || "no_answer") as (typeof CALL_RESULTS)[number], nextAt: nextAt() };
      case "follow_up":
        return choice ? { type, ...common, reason: choice as (typeof FOLLOW_UP_REASONS)[number], nextAt: nextAt() } : "Choose what they said.";
      case "plan_sent":
        return serviceId ? { type, ...common, serviceId, nextAt: nextAt() } : "Choose the treatment in the plan.";
      case "won":
        return serviceId ? { type, ...common, serviceId } : "Choose the accepted treatment.";
      case "lost":
        return choice ? { type, ...common, reason: choice as (typeof LOST_REASONS)[number] } : "Pick a reason.";
      case "book_consult":
        return picked !== null ? { type, ...common, serviceId: serviceId || null, dentistId, date: day, startMinutes: picked, durationMinutes: duration } : "Pick an open time.";
    }
  };

  const save = () => {
    setError("");
    const action = buildAction();
    if (typeof action === "string") return setError(action);
    startTransition(async () => {
      const result = await updateLeadAction(l.id, action);
      if (!result.success) {
        setError(Object.values(result.error.fields ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      toast.success(result.message ?? "Lead updated.");
      setNote("");
      router.refresh();
    });
  };

  const reached = l.status === "won" ? JOURNEY.length : JOURNEY.findIndex((j) => j.stage === l.stage) + 1;

  return (
    <dialog
      ref={dialogRef}
      aria-label={l.name}
      onClose={() => router.push(closeHref, { scroll: false })}
      className="m-0 ml-auto h-dvh max-h-dvh w-[min(560px,100vw)] max-w-none bg-[#F7F9FC] p-0 text-[#0E2A47] shadow-2xl backdrop:bg-[#0E2A47]/30"
    >
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs text-[#5E6B7E]">{l.source?.name ?? "Unknown platform"}</span>
            <span className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl">{l.name}</h2>
              <span className={cn("rounded-full px-2 py-0.5 text-xs", l.status === "won" ? "bg-[#E3F4EA] text-[#1F7A4D]" : l.status === "lost" ? "bg-[#EEF1F5] text-[#5E6B7E]" : "bg-[#E4EEFB] text-[#1D5296]")}>
                {l.status === "open" ? STAGE_META[l.stage].label : l.status === "won" ? "Won" : `Lost · ${l.closedReason}`}
              </span>
              {l.hot ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#FDECEA] px-1.5 text-[10px] font-semibold text-[#B42318]">
                  <Flame className="size-3" aria-hidden />
                  HOT
                </span>
              ) : null}
            </span>
            <span className="text-sm text-[#46566B]">
              {l.interest?.name ?? "Treatment not set"} · came in {formatLeadTime(l.createdAt)}
            </span>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close lead" className="grid size-9 place-items-center rounded-full hover:bg-white">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <ol aria-label="Patient journey" className="flex flex-wrap gap-1.5">
          {JOURNEY.map((j, i) => (
            <li key={j.stage} className={cn("rounded-full px-2.5 py-1 text-xs", i < reached ? "bg-[#1D5296] text-white" : "bg-[#EEF1F5] text-[#5E6B7E]")}>
              {j.label}
              <span className="sr-only">{i < reached ? " (done)" : ""}</span>
            </li>
          ))}
        </ol>
        {l.appointment ? (
          <Link href={`/calendar?date=${clinicDateOf(l.appointment.startsAt)}&appt=${l.appointment.id}`} className="text-sm text-[#1D5296] underline">
            Consult on {formatLeadTime(l.appointment.startsAt)} · open in Calendar
          </Link>
        ) : null}

        {canUpdate ? (
          <section aria-label="Update this lead" className="glass-card flex flex-col gap-3 rounded-[22px] p-4">
            <h3 className="text-base font-medium">Update this lead</h3>
            <label className={label}>
              Move this lead to
              <select value={type} onChange={(e) => {
                  setType(e.target.value as ActionType);
                  setChoice("");
                  setError("");
                }} className={selectClass}>
                {moves.map((m) => (
                  <option key={m} value={m}>
                    {ACTION_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            {type !== "note" ? (
              <label className={label}>
                Who is handling it
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={selectClass}>
                  <option value="">Choose someone…</option>
                  {options.staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {type === "retry" ? (
              <label className={label}>
                Call result
                <select value={choice || "no_answer"} onChange={(e) => setChoice(e.target.value)} className={selectClass}>
                  {CALL_RESULTS.map((r) => (
                    <option key={r} value={r}>
                      {CALL_RESULT_LABELS[r]}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[#5E6B7E]">This is call attempt {l.attempts + 1}{l.attempts + 1 >= 3 ? ". After 3 tries, consider marking it lost." : "."}</span>
              </label>
            ) : null}
            {type === "follow_up" || type === "lost" ? (
              <label className={label}>
                {type === "lost" ? "Reason" : "What they said"}
                <select value={choice} onChange={(e) => setChoice(e.target.value)} className={selectClass}>
                  <option value="">Choose…</option>
                  {(type === "lost" ? LOST_REASONS : FOLLOW_UP_REASONS).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {type === "plan_sent" || type === "won" || type === "book_consult" ? (
              <label className={label}>
                {type === "won" ? "Accepted treatment" : type === "plan_sent" ? "Treatment in the plan" : "Service"}
                <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={selectClass}>
                  <option value="">{type === "book_consult" ? "Not set yet" : "Choose…"}</option>
                  {options.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {type === "book_consult" ? ` · ${s.durationMinutes ?? 30} min` : ` · ₱${s.price.toLocaleString("en-PH")}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {type === "book_consult" ? (
              <>
                <div role="group" aria-label="Dentist" className="flex flex-wrap gap-2">
                  {options.dentists.map((d) => (
                    <button key={d.id} type="button" aria-pressed={dentistId === d.id} onClick={() => setDentistId(d.id)} className={chip(dentistId === d.id)}>
                      {d.name}
                    </button>
                  ))}
                </div>
                <label className={label}>
                  Day
                  <input type="date" value={day} min={clinicToday()} max={addDays(clinicToday(), 90)} onChange={(e) => e.target.value && setDay(e.target.value)} className={selectClass} />
                </label>
                <div role="group" aria-label="Open times" className="flex flex-wrap gap-2">
                  {slots === null ? <span className="text-sm text-[#5E6B7E]">Checking the schedule…</span> : null}
                  {slots?.map((m) => (
                    <button key={m} type="button" aria-pressed={picked === m} onClick={() => setSlot({ key: slotKey, minutes: m })} className={chip(picked === m)}>
                      {formatMinutes(m)}
                    </button>
                  ))}
                  {slots?.length === 0 ? <span className="text-sm text-[#5E6B7E]">No open times that day. Pick another day.</span> : null}
                </div>
                {l.patient ? null : <p className="text-xs text-[#5E6B7E]">Booking adds {l.name.split(" ")[0]} to Patients so the visit can go on the Calendar.</p>}
              </>
            ) : null}
            {needsTime ? (
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>
                  {type === "assign" ? "First call on" : type === "plan_sent" ? "Decision follow-up on" : "Call again on"}
                  <input type="date" value={day} min={clinicToday()} onChange={(e) => e.target.value && setDay(e.target.value)} className={selectClass} />
                </label>
                <label className={label}>
                  At
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={selectClass} />
                </label>
              </div>
            ) : null}
            <label className={label}>
              {type === "note" ? "Note" : "Note (optional)"}
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className="rounded-2xl border border-[#D5DCE5] bg-white px-4 py-2.5 text-sm" />
            </label>
            {error ? (
              <p role="alert" className="rounded-xl bg-[#FDECEA] px-3 py-2 text-sm text-[#A1301F]">
                {error}
              </p>
            ) : null}
            <button type="button" disabled={pending} onClick={save} className="fill-orange h-11 rounded-full text-sm font-medium text-[#0E2A47] disabled:opacity-60">
              {pending ? "Saving…" : "Save"}
            </button>
          </section>
        ) : null}

        <section aria-label="Lead information" className="glass-card flex flex-col gap-2 rounded-[22px] p-4 text-sm">
          <h3 className="text-base font-medium">Lead information</h3>
          <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
            <dt className="text-[#5E6B7E]">Mobile</dt>
            <dd>{l.phone ?? "—"}</dd>
            <dt className="text-[#5E6B7E]">Email</dt>
            <dd>{l.email ?? "—"}</dd>
            <dt className="text-[#5E6B7E]">Preferred app</dt>
            <dd>{labelOf(CHANNEL_LABELS, l.preferredChannel) ?? "—"}</dd>
            <dt className="text-[#5E6B7E]">Handled by</dt>
            <dd>{l.assignee?.name ?? "Unassigned"}</dd>
            {l.nextActionAt ? (
              <>
                <dt className="text-[#5E6B7E]">Next call</dt>
                <dd>{formatLeadTime(l.nextActionAt)}</dd>
              </>
            ) : null}
            {l.patient ? (
              <>
                <dt className="text-[#5E6B7E]">Patient</dt>
                <dd>
                  <Link href={`/patients/${l.patient.id}`} className="text-[#1D5296] underline">
                    {l.patient.patientNo}
                  </Link>
                </dd>
              </>
            ) : null}
          </dl>
          {l.phone ? (
            <a href={`tel:${l.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 self-start text-[#1D5296] underline">
              <Phone className="size-4" aria-hidden />
              Call {l.phone}
            </a>
          ) : null}
          {l.message ? <blockquote className="rounded-xl bg-[#F4F6F9] px-3 py-2 text-[#46566B]">“{l.message}”</blockquote> : null}
        </section>

        <section aria-label="Activity" className="glass-card flex flex-col gap-2 rounded-[22px] p-4">
          <h3 className="text-base font-medium">Activity</h3>
          <ol className="flex flex-col gap-2.5">
            {l.activities.map((a) => (
              <li key={a.id} className="flex flex-col border-l-2 border-[#D5DCE5] pl-3">
                <span className="text-sm">{a.content}</span>
                <span className="text-xs text-[#5E6B7E]">
                  {formatLeadTime(a.occurredAt)}
                  {a.actorName ? ` · ${a.actorName}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </dialog>
  );
}
