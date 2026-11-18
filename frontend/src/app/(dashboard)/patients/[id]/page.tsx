import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shared/access-denied";
import { PatientsWorkspace, type PatientsSearchParams } from "@/features/patients/components/patients-workspace";
import { patientIdSchema } from "@backend/features/patients/patient.schema";
import { pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Patients" };

export default async function PatientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PatientsSearchParams> }) {
  const { user, allowed } = await pageCan("patients.read");
  if (!allowed) return <AccessDenied />;
  const { id } = await params;
  if (!patientIdSchema.safeParse(id).success) notFound();
  return <PatientsWorkspace user={user} params={await searchParams} selectedId={id} />;
}
