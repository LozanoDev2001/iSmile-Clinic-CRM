"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { bookAppointment, cancelAppointment, changeAppointmentStatus, getOpenSlots, rescheduleAppointment } from "./appointments.service";
import type { AppointmentStatus, BookAppointmentInput, CalendarAppointment, RescheduleAppointmentInput } from "./appointments.types";

// Appointments also show on patient files and the dashboard.
const revalidate = () => revalidatePath("/", "layout");

export async function getOpenSlotsAction(query: { dentistId: string; date: string; durationMinutes: number; excludeAppointmentId?: string }): Promise<ActionResult<number[]>> {
  return runAction(async () => getOpenSlots(await requireAuth(), query));
}

export async function bookAppointmentAction(input: BookAppointmentInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const booked = await bookAppointment(await requireAuth(), input);
    revalidate();
    return booked;
  }, "Appointment booked.");
}

export async function rescheduleAppointmentAction(id: string, input: RescheduleAppointmentInput): Promise<ActionResult<CalendarAppointment>> {
  return runAction(async () => {
    const moved = await rescheduleAppointment(await requireAuth(), id, input);
    revalidate();
    return moved;
  }, "Appointment moved.");
}

export async function changeAppointmentStatusAction(id: string, status: Exclude<AppointmentStatus, "booked" | "cancelled">): Promise<ActionResult<CalendarAppointment>> {
  return runAction(async () => {
    const updated = await changeAppointmentStatus(await requireAuth(), id, { status });
    revalidate();
    return updated;
  });
}

export async function cancelAppointmentAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await cancelAppointment(await requireAuth(), id);
    revalidate();
    return undefined;
  }, "Appointment cancelled.");
}
