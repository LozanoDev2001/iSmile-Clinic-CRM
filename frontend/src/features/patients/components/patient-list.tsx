import Link from "next/link";
import { Avatar } from "@/components/shared/avatar";
import { CLINIC_TIME_ZONE } from "@/config/clinic";
import { cn } from "@/lib/utils";
import { PATIENT_FILTERS } from "@backend/features/patients/patient.schema";
import type { PatientFilter, PatientListResult } from "@backend/features/patients/patients.types";
import { KID_MAX_AGE, ageFrom, daysToBirthday } from "../format";
import { SearchBox } from "@/components/shared/search-box";

const BIRTHDAY_SOON_DAYS = 30;


function filterLabel(filter: PatientFilter) {
  if (filter === "birthdays") return `Birthdays in ${new Intl.DateTimeFormat("en-PH", { month: "long", timeZone: CLINIC_TIME_ZONE }).format(new Date())}`;
  return { all: "All", kids: "Kids", seniors: "Seniors & PWD" }[filter];
}

export interface PatientListQuery {
  q?: string;
  filter: PatientFilter;
  page: number;
}

/** Builds a patients URL that keeps the current search and filter. */
export function patientsHref(path: string, query: PatientListQuery, patch: Partial<PatientListQuery> = {}) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.filter !== "all") params.set("filter", next.filter);
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function birthdayTag(dob: string | null) {
  const days = daysToBirthday(dob);
  if (days === null || days > BIRTHDAY_SOON_DAYS) return null;
  return days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

interface PatientListProps {
  result: PatientListResult;
  counts: Record<PatientFilter, number>;
  query: PatientListQuery;
  selectedId?: string;
}

export function PatientList({ result, counts, query, selectedId }: PatientListProps) {
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <section aria-label="Patient list" className="glass-card flex min-w-0 flex-col gap-3 rounded-[24px] p-4">
      <SearchBox id="patient-search" label="Search patients" placeholder="Search name, patient no. or mobile" />
      <nav aria-label="Filter patients" className="flex flex-wrap gap-1.5">
        {PATIENT_FILTERS.map((f) => (
          <Link
            key={f}
            href={patientsHref("/patients", query, { filter: f, page: 1 })}
            aria-current={query.filter === f ? "page" : undefined}
            className={cn(
              "inline-flex h-[30px] items-center rounded-full border px-[11px] text-xs font-medium",
              query.filter === f ? "border-[#0E2A47] bg-[#0E2A47] text-white" : "border-[#E3E7ED] bg-[#EEF1F5] text-[#46566B]",
            )}
          >
            {filterLabel(f)} {counts[f]}
          </Link>
        ))}
      </nav>

      <ul className="-mx-1 flex max-h-[70vh] flex-col gap-0.5 overflow-y-auto px-1">
        {result.items.map((p) => {
          const age = ageFrom(p.dob);
          const tag = birthdayTag(p.dob);
          const selected = p.id === selectedId;
          return (
            <li key={p.id}>
              <Link
                href={patientsHref(`/patients/${p.id}`, query)}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-[18px] border p-2.5",
                  selected ? "border-[#BCD3F2] bg-[#E4EEFB]" : "border-transparent hover:bg-[#F4F6F9]",
                )}
              >
                <Avatar name={p.fullName} letters={2} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px]">{p.fullName}</span>
                  <span className="truncate text-xs text-[#5E6B7E]">
                    {[p.patientNo, age !== null ? `${age} yrs` : null, age !== null && age <= KID_MAX_AGE ? "Kid" : null].filter(Boolean).join(" · ")}
                  </span>
                  {tag ? <span className="mt-0.5 self-start rounded-full bg-[#FDE3BD] px-2 text-[11px] text-[#7A4300]">Birthday {tag}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {result.items.length === 0 ? <p className="px-2 py-6 text-center text-sm text-[#5E6B7E]">No patients match. Try another name or clear the filter.</p> : null}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-xs text-[#5E6B7E]">
          <span>
            Page {query.page} of {pages} · {result.total} patients
          </span>
          <span className="flex gap-2">
            {query.page > 1 ? <Link href={patientsHref("/patients", query, { page: query.page - 1 })} className="underline">Previous</Link> : null}
            {query.page < pages ? <Link href={patientsHref("/patients", query, { page: query.page + 1 })} className="underline">Next</Link> : null}
          </span>
        </div>
      ) : null}
    </section>
  );
}
