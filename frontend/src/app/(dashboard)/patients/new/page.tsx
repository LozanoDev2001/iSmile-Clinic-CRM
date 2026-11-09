import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PatientForm } from "@/features/patients/components/patient-form";
import { getPatientFormOptions } from "@backend/features/patients/patients.service";
import { can, pageCan, recordScope } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "New patient" };

export default async function NewPatientPage() {
  const { user, allowed } = await pageCan("patients.create");
  if (!allowed) return <AccessDenied />;
  const options = await getPatientFormOptions(user);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">New patient</h1>
        <p className="text-[13px] text-[#5E6B7E]">Creates the patient profile and dental chart. The patient number is assigned automatically.</p>
      </div>
      <PatientForm patient={null} options={options} lockDentist={!!recordScope(user).assigneeId} canEditClinical={can(user, "patients.medical.update")} />
    </div>
  );
}
