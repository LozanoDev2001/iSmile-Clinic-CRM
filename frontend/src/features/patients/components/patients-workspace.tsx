import Link from "next/link";
import { Plus } from "lucide-react";
import { PATIENT_FILTERS } from "@backend/features/patients/patient.schema";
import { getPatientBilling } from "@backend/features/billing/billing.service";
import { getPatientFile, getPatientFilterCounts, listPatients } from "@backend/features/patients/patients.service";
import type { PatientFilter } from "@backend/features/patients/patients.types";
import { can, type AuthUser } from "@backend/lib/authorization";
import { PatientFile, type PatientTab } from "./patient-file";
import { PatientList, patientsHref, type PatientListQuery } from "./patient-list";

const PAGE_SIZE = 50;
const MAX_PAGE = 10_000;
const MAX_SEARCH = 100;

export interface PatientsSearchParams {
  q?: string;
  filter?: string;
  page?: string;
  tab?: string;
}

function queryFrom(params: PatientsSearchParams): PatientListQuery {
  const filter = (PATIENT_FILTERS as readonly string[]).includes(params.filter ?? "") ? (params.filter as PatientFilter) : "all";
  const page = Math.min(MAX_PAGE, Math.max(1, Math.floor(Number(params.page)) || 1));
  return { q: params.q?.trim().slice(0, MAX_SEARCH) || undefined, filter, page };
}

/** The Patients screen: searchable list on the left, the selected patient's file on the right. */
export async function PatientsWorkspace({ user, params, selectedId }: { user: AuthUser; params: PatientsSearchParams; selectedId?: string }) {
  const query = queryFrom(params);
  const [result, counts] = await Promise.all([
    listPatients(user, { search: query.q, filter: query.filter, page: query.page, pageSize: PAGE_SIZE }),
    getPatientFilterCounts(user),
  ]);
  const fileId = selectedId ?? result.items[0]?.id;
  const patient = fileId ? await getPatientFile(user, fileId) : null;
  const billing = patient ? await getPatientBilling(user, patient.id) : null;
  const tab: PatientTab = params.tab === "history" && patient?.visits ? "history" : "profile";

  const tabHref = (id: string) => (t: PatientTab) => {
    const href = patientsHref(`/patients/${id}`, query);
    return t === "history" ? `${href}${href.includes("?") ? "&" : "?"}tab=history` : href;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">Patients</h1>
          <p className="text-[13px] text-[#5E6B7E]">
            {counts.all} patient {counts.all === 1 ? "profile" : "profiles"} · personal details, procedure history and dental charts · {counts.birthdays}{" "}
            {counts.birthdays === 1 ? "birthday" : "birthdays"} this month
          </p>
        </div>
        {can(user, "patients.create") ? (
          <Link href="/patients/new" className="fill-orange inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-medium text-[#0E2A47] hover:brightness-105">
            <Plus className="size-4" aria-hidden />
            New patient
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:items-start">
        <PatientList result={result} counts={counts} query={query} selectedId={patient?.id} />
        {patient ? (
          <PatientFile patient={patient} tab={tab} tabHref={tabHref(patient.id)} canEdit={can(user, "patients.update")} canBook={can(user, "appointments.create")} billing={billing} />
        ) : (
          <section className="glass-card rounded-[24px] p-10 text-center text-sm text-[#5E6B7E]">
            {counts.all ? "Pick a patient from the list." : "No patients yet. Add the first one with New patient."}
          </section>
        )}
      </div>
    </div>
  );
}
