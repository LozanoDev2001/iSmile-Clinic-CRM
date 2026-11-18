import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shared/access-denied";
import { Avatar } from "@/components/shared/avatar";
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
      <Link href={`/patients/${patient.id}`} className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-[#D5DCE5] bg-white px-4 text-sm text-[#1D5296] hover:bg-[#F2F6FB]">
        <ArrowLeft className="size-4" aria-hidden />
        Back to patient
      </Link>
      <div className="glass-card flex items-center gap-4 rounded-[24px] p-5">
        <Avatar name={patient.fullName} letters={2} className="size-14 text-lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-[24px] leading-tight font-normal tracking-[-0.01em] sm:text-[28px]">Edit {patient.fullName}</h1>
          <p className="text-[13px] text-[#5E6B7E]">{patient.patientNo} · Update personal details, contact info and coverage</p>
        </div>
      </div>
      <PatientForm patient={patient} options={options} lockDentist={!!recordScope(user).assigneeId} canEditClinical={can(user, "patients.medical.update")} />
    </div>
  );
}
