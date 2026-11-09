import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarPlus, Pencil } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { Pill } from "@/components/shared/pill";
import { clinicDateOf } from "@/config/clinic";
import { cn } from "@/lib/utils";
import type { PatientFile as PatientFileData } from "@backend/features/patients/patients.types";
import { CHANNEL_LABELS, CIVIL_STATUS_LABELS, KID_MAX_AGE, SEX_LABELS, ageFrom, daysToBirthday, formatDate, formatDateTime, formatDay, labelOf } from "../format";
import { DentalChart } from "./dental-chart";

const BIRTHDAY_SOON_DAYS = 30;
const RECENT_VISITS = 3;

export type PatientTab = "profile" | "history";

function Field({ label, value, alert, wide }: { label: string; value: ReactNode; alert?: boolean; wide?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", wide && "sm:col-span-2")}>
      <dt className="text-xs text-[#5E6B7E]">{label}</dt>
      <dd className={cn("text-[15px] break-words", !value ? "text-[#9AA6B6]" : alert ? "text-[#B42318]" : "text-[#0E2A47]")}>{value || "Not recorded yet"}</dd>
    </div>
  );
}

function Card({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-label={title} className="glass-card flex min-w-0 flex-col gap-3 rounded-[24px] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, note, highlight }: { label: string; value: string; note: string; highlight?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-[22px] px-4 py-3.5", highlight ? "bg-[#1D5296] text-white" : "glass-card text-[#0E2A47]")}>
      <span className={cn("text-xs", highlight ? "text-[#CFE0F5]" : "text-[#5E6B7E]")}>{label}</span>
      <span className="text-xl">{value}</span>
      <span className={cn("truncate text-xs", highlight ? "text-[#CFE0F5]" : "text-[#5E6B7E]")}>{note}</span>
    </div>
  );
}

interface PatientFileProps {
  patient: PatientFileData;
  tab: PatientTab;
  tabHref: (tab: PatientTab) => string;
  canEdit: boolean;
  canBook: boolean;
}

export function PatientFile({ patient: p, tab, tabHref, canEdit, canBook }: PatientFileProps) {
  const age = ageFrom(p.dob);
  const child = age !== null && age <= KID_MAX_AGE;
  const birthdayIn = daysToBirthday(p.dob);
  const alerts = [p.clinical?.allergies, p.clinical?.medicalConditions].filter(Boolean) as string[];
  const lastVisit = p.visits?.[0];
  const next = p.upcoming[0];
  const tabs: { id: PatientTab; label: string }[] = [{ id: "profile", label: "Patient profile" }, ...(p.visits ? [{ id: "history" as const, label: "Procedure history" }] : [])];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section aria-label="Patient summary" className="glass-card flex flex-wrap items-center gap-4 rounded-[24px] p-5">
        <Avatar name={p.fullName} letters={2} className="size-14 text-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-2xl">{p.fullName}</h2>
            <span className="text-sm text-[#5E6B7E]">{p.patientNo}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {age !== null || p.sex ? <Pill tone="muted">{[age !== null ? `${age} yrs` : null, labelOf(SEX_LABELS, p.sex)].filter(Boolean).join(" · ")}</Pill> : null}
            <Pill tone="muted">Patient since {formatDay(p.createdAt)}</Pill>
            <Pill tone={p.payer ? "purple" : "muted"}>{p.payer ? p.payer.name : "Self-pay"}</Pill>
            {p.scPwdId ? <Pill tone="green">Senior / PWD</Pill> : null}
            {alerts.length ? <Pill tone="red">Alert: {alerts[0]}</Pill> : null}
            {birthdayIn !== null && birthdayIn <= BIRTHDAY_SOON_DAYS ? (
              <Pill tone="amber">{birthdayIn === 0 ? "Birthday today" : `Birthday in ${birthdayIn} day${birthdayIn === 1 ? "" : "s"}`}</Pill>
            ) : null}
          </div>
        </div>
        {canBook ? (
          <Link href={`/calendar?form=new&patient=${p.id}`} className="fill-orange inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-[#0E2A47] hover:brightness-105">
            <CalendarPlus className="size-4" aria-hidden />
            Book visit
          </Link>
        ) : null}
        {canEdit ? (
          <Link href={`/patients/${p.id}/edit`} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#D5DCE5] bg-white px-4 text-sm hover:bg-[#F4F6F9]">
            <Pencil className="size-4" aria-hidden />
            Edit details
          </Link>
        ) : null}
      </section>

      <nav aria-label="Patient sections" className="flex gap-1 border-b border-[#E3E7ED]">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn("-mb-px border-b-[3px] px-4 py-3 text-sm font-medium", tab === t.id ? "border-[#F39A1E] text-[#0E2A47]" : "border-transparent text-[#5E6B7E]")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "history" && p.visits ? (
        <Card title="History of procedures" aside={<span className="text-xs text-[#5E6B7E]">Newest first</span>}>
          {p.visits.length ? (
            <ul className="flex flex-col divide-y divide-[#EDF0F4]">
              {p.visits.map((v) => (
                <li key={v.id} className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)_160px]">
                  <span className="text-sm text-[#5E6B7E]">{formatDay(v.occurredAt)}</span>
                  <span className="text-[15px]">{v.procedures.length ? v.procedures.join(", ") : "Visit, no procedures recorded"}</span>
                  <span className="text-sm text-[#46566B]">{v.dentistName ?? "—"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#5E6B7E]">No procedures recorded yet. They appear here once visits are completed.</p>
          )}
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat highlight label="Visits on record" value={p.visits ? String(p.visits.length) : "—"} note={p.visits ? (p.visits.length ? `Since ${formatDay(p.visits[p.visits.length - 1].occurredAt)}` : "No visits yet") : "Needs visit history access"} />
            <Stat label="Last visit" value={lastVisit ? formatDay(lastVisit.occurredAt) : "—"} note={lastVisit?.dentistName ?? "No visits yet"} />
            <Stat label="Next appointment" value={next ? formatDateTime(next.startsAt) : "—"} note={next ? [next.serviceName, next.dentistName].filter(Boolean).join(" · ") || "Booked" : "Nothing booked yet"} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
            <div className="flex min-w-0 flex-col gap-4">
              <Card title="Basic information">
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Field label="Full name" value={p.fullName} />
                  <Field label="Patient no." value={p.patientNo} />
                  <Field label="Birthday" value={p.dob ? `${formatDate(p.dob)} · ${age} yrs` : null} />
                  <Field label="Sex" value={labelOf(SEX_LABELS, p.sex)} />
                  {child ? null : <Field label="Civil status" value={labelOf(CIVIL_STATUS_LABELS, p.civilStatus)} />}
                  <Field label={child ? "School" : "Occupation"} value={p.occupation} />
                  <Field label="Mobile" value={p.phone} />
                  <Field label="Email" value={p.email} />
                  <Field label="Preferred app for messages" value={labelOf(CHANNEL_LABELS, p.preferredChannel)} />
                  <Field label="Attending dentist" value={p.primaryDentist?.name} />
                  <Field label="Home address" value={p.address} wide />
                </dl>
              </Card>

              <Card title={p.clinical ? "Clinical, coverage and emergency contact" : "Coverage and emergency contact"}>
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  {p.clinical ? (
                    <>
                      <Field label="Allergies" value={p.clinical.allergies} alert />
                      <Field label="Medical conditions" value={p.clinical.medicalConditions} alert />
                      <Field label="Maintenance medicines" value={p.clinical.medications} wide />
                    </>
                  ) : null}
                  <Field label="Coverage" value={p.payer?.name ?? "Self-pay"} />
                  <Field label="HMO member no." value={p.hmoMemberNo} />
                  <Field label="Senior citizen / PWD ID" value={p.scPwdId} />
                  <Field
                    label={child ? "Parent / guardian" : "Emergency contact"}
                    value={p.emergencyContact ? [p.emergencyContact.name, p.emergencyContact.relationship].filter(Boolean).join(" · ") : null}
                  />
                  <Field label={child ? "Guardian mobile" : "Emergency mobile"} value={p.emergencyContact?.phone} />
                </dl>
              </Card>

              {p.chart ? <DentalChart chart={p.chart} child={child} /> : null}
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <Card title="Upcoming visits" aside={<span className="text-xs text-[#5E6B7E]">{p.upcoming.length}</span>}>
                {p.upcoming.length ? (
                  <ul className="flex flex-col gap-2.5">
                    {p.upcoming.map((a) => (
                      <li key={a.id}>
                        <Link href={`/calendar?date=${clinicDateOf(a.startsAt)}&appt=${a.id}`} className="flex flex-col rounded-xl p-1 hover:bg-[#F4F6F9]">
                          <span className="text-sm">{a.serviceName ?? "Appointment"}</span>
                          <span className="text-xs text-[#5E6B7E]">{[formatDateTime(a.startsAt), a.dentistName].filter(Boolean).join(" · ")}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[#5E6B7E]">Nothing booked yet.</p>
                )}
              </Card>
              {p.visits ? (
                <Card title="Recent procedures">
                  {p.visits.length ? (
                    <ul className="flex flex-col gap-2.5">
                      {p.visits.slice(0, RECENT_VISITS).map((v) => (
                        <li key={v.id} className="flex flex-col">
                          <span className="text-sm">{v.procedures.join(", ") || "Visit"}</span>
                          <span className="text-xs text-[#5E6B7E]">{[formatDay(v.occurredAt), v.dentistName].filter(Boolean).join(" · ")}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#5E6B7E]">No procedures recorded yet.</p>
                  )}
                  <Link href={tabHref("history")} className="text-xs text-[#1D5296] underline">
                    Full procedure history
                  </Link>
                </Card>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
