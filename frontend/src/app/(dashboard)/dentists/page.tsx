import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { DentistsBoard } from "@/features/dentists/components/dentists-board";
import { getDentistsBoard } from "@backend/features/dentists/dentists.service";
import { can, pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Dentists" };

export default async function DentistsPage({ searchParams }: { searchParams: Promise<{ dentist?: string; date?: string }> }) {
  const { user, allowed } = await pageCan("appointments.read");
  if (!allowed) return <AccessDenied />;
  const board = await getDentistsBoard(user, await searchParams);
  return <DentistsBoard board={board} canBook={can(user, "appointments.create")} />;
}
