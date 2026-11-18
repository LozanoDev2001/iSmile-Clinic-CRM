import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PatientsWorkspace, type PatientsSearchParams } from "@/features/patients/components/patients-workspace";
import { pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Patients" };

export default async function PatientsPage({ searchParams }: { searchParams: Promise<PatientsSearchParams> }) {
  const { user, allowed } = await pageCan("patients.read");
  if (!allowed) return <AccessDenied />;
  return <PatientsWorkspace user={user} params={await searchParams} />;
}
