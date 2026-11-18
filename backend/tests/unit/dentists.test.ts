import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLINIC_A, makeUser, userIdFor } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  dentists: { list: vi.fn(), assignedCounts: vi.fn(), recentAssigned: vi.fn() },
  listInRange: vi.fn(),
}));

vi.mock("@backend/features/dentists/dentists.repository", () => ({ dentistsRepository: mocks.dentists }));
vi.mock("@backend/features/appointments/appointments.repository", () => ({ appointmentsRepository: { listInRange: mocks.listInRange } }));

const { getDentistsBoard } = await import("@backend/features/dentists/dentists.service");

const DENTIST_ID = userIdFor("DENTIST");
const OTHER_ID = "00000000-0000-4000-8000-d00000000002";
const appt = (id: string, dentistId: string, status = "booked") => ({ id, status, dentist: { id: dentistId, name: "x" } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dentists.list.mockResolvedValue([
    { id: DENTIST_ID, fullName: "Dr. Ana Reyes" },
    { id: OTHER_ID, fullName: "Dr. Ben Cruz" },
  ]);
  mocks.listInRange.mockResolvedValue([appt("a1", DENTIST_ID), appt("a2", OTHER_ID), appt("a3", DENTIST_ID, "no_show")]);
  mocks.dentists.assignedCounts.mockResolvedValue([{ primaryDentistId: DENTIST_ID, _count: 7 }]);
  mocks.dentists.recentAssigned.mockResolvedValue([{ id: "p1", patientNo: "P-0001", contact: { fullName: "Maria Lopez" } }]);
});

describe("getDentistsBoard", () => {
  it("summarises every dentist's day and details the first by default", async () => {
    const board = await getDentistsBoard(makeUser("OWNER"), { date: "2026-11-18" });
    expect(board.date).toBe("2026-11-18");
    expect(board.dentists).toEqual([
      { id: DENTIST_ID, name: "Dr. Ana Reyes", appointmentCount: 1, patientCount: 7 },
      { id: OTHER_ID, name: "Dr. Ben Cruz", appointmentCount: 1, patientCount: 0 },
    ]);
    expect(board.selected?.appointments.map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(board.selected?.patients).toEqual([{ id: "p1", name: "Maria Lopez", patientNo: "P-0001" }]);
    expect(mocks.dentists.recentAssigned).toHaveBeenCalledTimes(1);
  });

  it("details the dentist picked in the query", async () => {
    const board = await getDentistsBoard(makeUser("OWNER"), { dentist: OTHER_ID, date: "2026-11-18" });
    expect(board.selected?.id).toBe(OTHER_ID);
    expect(board.selected?.appointments.map((a) => a.id)).toEqual(["a2"]);
  });

  it("limits a dentist to their own schedule", async () => {
    await getDentistsBoard(makeUser("DENTIST"), { dentist: OTHER_ID });
    expect(mocks.dentists.list).toHaveBeenCalledWith({ clinicId: CLINIC_A, assigneeId: DENTIST_ID });
    expect(mocks.listInRange).toHaveBeenCalledWith({ clinicId: CLINIC_A, assigneeId: DENTIST_ID }, expect.any(Date), expect.any(Date));
  });

  it("falls back to today for an invalid date", async () => {
    const board = await getDentistsBoard(makeUser("OWNER"), { date: "not-a-date" });
    expect(board.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
