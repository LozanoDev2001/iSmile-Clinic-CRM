import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, clinicInstant, clinicToday } from "@backend/config/clinic";
import { WEEKDAYS } from "@backend/features/settings/settings.schema";
import { CLINIC_A, makeUser, userIdFor } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  repo: { busy: vi.fn(), lockDentist: vi.fn(), create: vi.fn(), findById: vi.fn(), reschedule: vi.fn(), setStatus: vi.fn(), createEncounter: vi.fn(), listInRange: vi.fn() },
  patients: { exists: vi.fn(), isClinicDentist: vi.fn(), formOptions: vi.fn() },
  catalog: { findActive: vi.fn(), listBookable: vi.fn() },
  settings: { findClinicSettings: vi.fn() },
  audit: vi.fn(),
}));

vi.mock("@backend/features/appointments/appointments.repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/features/appointments/appointments.repository")>()),
  appointmentsRepository: mocks.repo,
}));
vi.mock("@backend/features/patients/patients.repository", () => ({ patientsRepository: mocks.patients }));
vi.mock("@backend/features/catalog/catalog.repository", () => ({ catalogRepository: mocks.catalog }));
vi.mock("@backend/features/settings/settings.repository", () => ({ settingsRepository: mocks.settings }));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));
vi.mock("@backend/lib/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) } }));

const { bookAppointment, cancelAppointment, changeAppointmentStatus, computeOpenSlots, rescheduleAppointment } = await import("@backend/features/appointments/appointments.service");

const APPT_ID = "00000000-0000-4000-8000-900000000001";
const PATIENT_ID = "00000000-0000-4000-8000-800000000001";
const DENTIST_ID = userIdFor("DENTIST");
const OTHER_DENTIST = "00000000-0000-4000-8000-100000000099";
const frontDesk = makeUser("FRONT_DESK");
const dentist = makeUser("DENTIST");
const accounts = makeUser("ACCOUNTS");

const ALL_DAYS_OPEN = WEEKDAYS.map((day) => ({ day, closed: false, open: "09:00", close: "18:00" }));
const tomorrow = addDays(clinicToday(), 1);
const NINE = 9 * 60;

const booking = (patch: Record<string, unknown> = {}) => ({
  dentistId: DENTIST_ID,
  date: tomorrow,
  startMinutes: NINE,
  durationMinutes: 60,
  patientId: PATIENT_ID,
  serviceId: "",
  bookingSource: "front_desk" as const,
  notes: "",
  ...patch,
});

const row = (patch: Record<string, unknown> = {}) => ({
  id: APPT_ID,
  startsAt: clinicInstant(clinicToday(), NINE),
  endsAt: clinicInstant(clinicToday(), NINE + 30),
  status: "booked",
  bookingSource: "front_desk",
  notes: null,
  patientId: PATIENT_ID,
  dentistId: DENTIST_ID,
  patient: { id: PATIENT_ID, patientNo: "P-0001", contact: { fullName: "Maria Lopez", phone: null }, payer: null },
  dentist: { id: DENTIST_ID, fullName: "Dr. Ana Reyes" },
  service: null,
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.findClinicSettings.mockResolvedValue({ name: "iSmile", settings: { profile: { tagline: "", phone: "", address: "", hours: ALL_DAYS_OPEN } } });
  mocks.repo.busy.mockResolvedValue([]);
  mocks.repo.create.mockResolvedValue({ id: APPT_ID });
  mocks.repo.findById.mockResolvedValue(row());
  mocks.patients.exists.mockResolvedValue({ id: PATIENT_ID, contactId: "c1" });
  mocks.patients.isClinicDentist.mockResolvedValue(1);
});

describe("computeOpenSlots", () => {
  const hours = { day: "Mon" as const, closed: false, open: "09:00", close: "12:00" };

  it("steps every 30 minutes and keeps the visit inside opening hours", () => {
    expect(computeOpenSlots(hours, 60, [], null)).toEqual([540, 570, 600, 630, 660]);
  });

  it("skips times that overlap a booking, but allows back-to-back visits", () => {
    expect(computeOpenSlots(hours, 60, [{ start: 600, end: 660 }], null)).toEqual([540, 660]);
  });

  it("leaves out times already past, and closed days", () => {
    expect(computeOpenSlots(hours, 30, [], 640)).toEqual([660, 690]);
    expect(computeOpenSlots({ ...hours, closed: true }, 30, [], null)).toEqual([]);
    expect(computeOpenSlots(undefined, 30, [], null)).toEqual([]);
  });
});

describe("bookAppointment", () => {
  it("books an open slot under a dentist lock and audits it", async () => {
    await expect(bookAppointment(frontDesk, booking())).resolves.toEqual({ id: APPT_ID });
    expect(mocks.repo.lockDentist).toHaveBeenCalledWith(DENTIST_ID, {});
    const [, data] = mocks.repo.create.mock.calls[0];
    expect(data).toMatchObject({ dentistId: DENTIST_ID, startsAt: clinicInstant(tomorrow, NINE), endsAt: clinicInstant(tomorrow, NINE + 60), serviceId: null, notes: null });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "appointment.booked", clinicId: CLINIC_A }), {});
  });

  it("refuses a slot the dentist already has", async () => {
    mocks.repo.busy.mockResolvedValueOnce([{ startsAt: clinicInstant(tomorrow, NINE + 30), endsAt: clinicInstant(tomorrow, NINE + 60) }]);
    await expect(bookAppointment(frontDesk, booking())).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.repo.create).not.toHaveBeenCalled();
  });

  it("refuses when the patient is booked elsewhere at that time", async () => {
    mocks.repo.busy.mockResolvedValueOnce([]).mockResolvedValueOnce([{ startsAt: clinicInstant(tomorrow, NINE), endsAt: clinicInstant(tomorrow, NINE + 30) }]);
    await expect(bookAppointment(frontDesk, booking())).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("patient") });
  });

  it("refuses times outside opening hours or in the past", async () => {
    await expect(bookAppointment(frontDesk, booking({ startMinutes: 17 * 60 + 30 }))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(bookAppointment(frontDesk, booking({ date: addDays(clinicToday(), -1) }))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lets a dentist book only themselves", async () => {
    await expect(bookAppointment(dentist, booking({ dentistId: OTHER_DENTIST }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(bookAppointment(dentist, booking())).resolves.toEqual({ id: APPT_ID });
  });

  it("refuses a patient outside the user's scope", async () => {
    mocks.patients.exists.mockResolvedValue(null);
    await expect(bookAppointment(frontDesk, booking())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("needs booking permission", async () => {
    await expect(bookAppointment(accounts, booking())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("rescheduleAppointment", () => {
  it("excludes the appointment itself when checking the new slot, and rebooks a no-show", async () => {
    mocks.repo.findById.mockResolvedValue(row({ status: "no_show" }));
    await rescheduleAppointment(frontDesk, APPT_ID, { dentistId: DENTIST_ID, date: tomorrow, startMinutes: NINE, durationMinutes: 30 });
    expect(mocks.repo.busy).toHaveBeenCalledWith(CLINIC_A, { dentistId: DENTIST_ID }, expect.any(Date), expect.any(Date), APPT_ID, {});
    expect(mocks.repo.reschedule).toHaveBeenCalledWith(APPT_ID, expect.objectContaining({ dentistId: DENTIST_ID }), {});
  });

  it("refuses to move a finished visit", async () => {
    mocks.repo.findById.mockResolvedValue(row({ status: "completed" }));
    await expect(rescheduleAppointment(frontDesk, APPT_ID, { dentistId: DENTIST_ID, date: tomorrow, startMinutes: NINE, durationMinutes: 30 })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("changeAppointmentStatus", () => {
  it("records a visit when it is finished", async () => {
    mocks.repo.findById.mockResolvedValue(row({ status: "in_progress" }));
    const updated = await changeAppointmentStatus(frontDesk, APPT_ID, { status: "completed" });
    expect(updated.status).toBe("completed");
    expect(mocks.repo.createEncounter).toHaveBeenCalledWith({ clinicId: CLINIC_A, patientId: PATIENT_ID, appointmentId: APPT_ID, dentistId: DENTIST_ID }, {});
  });

  it("only allows the next steps of the visit", async () => {
    await expect(changeAppointmentStatus(frontDesk, APPT_ID, { status: "completed" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(changeAppointmentStatus(frontDesk, APPT_ID, { status: "booked" })).rejects.toThrow();
    expect(mocks.repo.setStatus).not.toHaveBeenCalled();
  });

  it("allows confirming ahead of time but not checking in", async () => {
    mocks.repo.findById.mockResolvedValue(row({ startsAt: clinicInstant(tomorrow, NINE) }));
    await expect(changeAppointmentStatus(frontDesk, APPT_ID, { status: "checked_in" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(changeAppointmentStatus(frontDesk, APPT_ID, { status: "no_show" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(changeAppointmentStatus(frontDesk, APPT_ID, { status: "confirmed" })).resolves.toMatchObject({ status: "confirmed" });
  });
});

describe("cancelAppointment", () => {
  it("cancels upcoming appointments only", async () => {
    await cancelAppointment(frontDesk, APPT_ID);
    expect(mocks.repo.setStatus).toHaveBeenCalledWith(APPT_ID, "cancelled", {});
    mocks.repo.findById.mockResolvedValue(row({ status: "checked_in" }));
    await expect(cancelAppointment(frontDesk, APPT_ID)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
