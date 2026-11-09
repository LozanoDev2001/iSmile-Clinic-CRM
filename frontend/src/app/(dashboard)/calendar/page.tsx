import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import type { CalendarSearchParams } from "@/features/appointments/calendar-state";
import { CalendarWorkspace } from "@/features/appointments/components/calendar-workspace";
import { pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<CalendarSearchParams> }) {
  const { user, allowed } = await pageCan("appointments.read");
  if (!allowed) return <AccessDenied />;
  return <CalendarWorkspace user={user} params={await searchParams} />;
}
