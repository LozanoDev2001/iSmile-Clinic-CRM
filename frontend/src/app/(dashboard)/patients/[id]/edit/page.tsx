import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shared/access-denied";
import { PatientForm } from "@/features/patients/components/patient-form";
import { patientIdSchema } from "@backend/features/patients/patient.schema";
import { getPatientFile, getPatientFormOptions } from "@backend/features/patients/patients.service";
import { can, pageCan, recordScope } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Edit patient" };

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, allowed } = await pageCan("patients.update");
  if (!allowed) return <AccessDenied />;
  const { id } = await params;
  if (!patientIdSchema.safeParse(id).success) notFound();
  const [patient, options] = await Promise.all([getPatientFile(user, id), getPatientFormOptions(user)]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">Edit {patient.fullName}</h1>
        <p className="text-[13px] text-[#5E6B7E]">{patient.patientNo}</p>
      </div>
      <PatientForm patient={patient} options={options} lockDentist={!!recordScope(user).assigneeId} canEditClinical={can(user, "patients.medical.update")} />
    </div>
  );
}
