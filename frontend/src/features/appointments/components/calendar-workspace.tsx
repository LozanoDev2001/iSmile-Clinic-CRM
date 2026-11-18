import { clinicToday } from "@/config/clinic";
import { getBookingOptions, listAppointments } from "@backend/features/appointments/appointments.service";
import { getInvoicesForAppointments } from "@backend/features/billing/billing.service";
import type { AppointmentStatus } from "@backend/features/appointments/appointments.types";
import { getPatientSummary } from "@backend/features/patients/patients.service";
import { openingHoursOn } from "@backend/features/settings/settings.types";
import { can, type AuthUser } from "@backend/lib/authorization";
import { calendarHref, parseCalendarState, type CalendarSearchParams, viewRange } from "../calendar-state";
import { AppointmentPanel } from "./appointment-panel";
import { BookingDialog } from "./booking-dialog";
import { CalendarSidebar } from "./calendar-sidebar";
import { CalendarToolbar } from "./calendar-toolbar";
import { DayGrid, MonthGrid, WeekList } from "./calendar-views";

/** Statuses still waiting to be seen, for the "Up next" card. */
const WAITING: AppointmentStatus[] = ["booked", "confirmed", "checked_in"];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export async function CalendarWorkspace({ user, params }: { user: AuthUser; params: CalendarSearchParams }) {
  const state = parseCalendarState(params);
  const range = viewRange(state.view, state.date);
  const [appointments, options] = await Promise.all([listAppointments(user, range), getBookingOptions(user)]);

  const dentists = options.dentists.filter((d) => (options.lockedDentistId ? d.id === options.lockedDentistId : !state.off.includes(d.id)));
  const visible = appointments.filter((a) => (!a.dentist || !state.off.includes(a.dentist.id)) && !state.hide.includes(a.status));
  const statusCounts = appointments.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }), {});
  const today = clinicToday();
  const now = new Date();
  const next = range.from <= today && today <= range.to ? visible.find((a) => WAITING.includes(a.status) && a.endsAt > now) : undefined;
  const selected = state.appt ? appointments.find((a) => a.id === state.appt) : undefined;
  const invoices = selected?.status === "completed" ? await getInvoicesForAppointments(user, [selected.id]) : {};
  const preselected = state.form === "new" && state.patient && can(user, "patients.read") ? await getPatientSummary(user, state.patient) : null;
  const hours = openingHoursOn(options.hours, state.date);
  const canBook = can(user, "appointments.create");
  const closeHref = calendarHref(state, { form: undefined, patient: undefined });

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)] xl:items-start">
      <CalendarSidebar state={state} dentists={options.lockedDentistId ? null : options.dentists} next={next} statusCounts={statusCounts} />
      <div className="flex min-w-0 flex-col gap-4">
        <CalendarToolbar state={state} summary={`${plural(visible.length, "appointment")} · ${plural(dentists.length, "dentist")}`} canBook={canBook} />
        <div className={selected ? "grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px] 2xl:items-start" : undefined}>
          {state.view === "day" ? <DayGrid state={state} appointments={visible} dentists={dentists} hours={hours} /> : null}
          {state.view === "week" ? <WeekList state={state} appointments={visible} /> : null}
          {state.view === "month" ? <MonthGrid state={state} appointments={visible} from={range.from} to={range.to} /> : null}
          {selected ? (
            <AppointmentPanel
              key={`${selected.id}-${selected.status}`}
              appointment={selected}
              closeHref={calendarHref(state, { appt: undefined })}
              moveHref={calendarHref(state, { form: "move" })}
              canUpdate={can(user, "appointments.update")}
              canCancel={can(user, "appointments.cancel")}
              invoice={invoices[selected.id] ?? null}
              canInvoice={can(user, "billing.create")}
            />
          ) : null}
        </div>
      </div>

      {state.form === "new" && canBook ? (
        <BookingDialog
          state={state}
          options={options}
          appointment={null}
          patient={preselected ? { id: preselected.id, name: preselected.fullName, patientNo: preselected.patientNo } : null}
          closeHref={closeHref}
        />
      ) : null}
      {state.form === "move" && selected && can(user, "appointments.update") ? (
        <BookingDialog state={state} options={options} appointment={selected} patient={null} closeHref={closeHref} />
      ) : null}
    </div>
  );
}
