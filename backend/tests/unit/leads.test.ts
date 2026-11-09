import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@backend/generated/prisma/client";
import { grantKey } from "@backend/config/access";
import { CLINIC_A, makeUser, userIdFor } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  leads: {
    findDetail: vi.fn(),
    staffWithAccess: vi.fn(),
    sourceExists: vi.fn(),
    contactByPhone: vi.fn(),
    createContact: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    addActivity: vi.fn(),
    createPatientFromContact: vi.fn(),
    markContactAsPatient: vi.fn(),
  },
  catalog: { findActive: vi.fn() },
  patients: { maxPatientNumber: vi.fn() },
  book: vi.fn(),
  audit: vi.fn(),
  findPatientByContact: vi.fn(),
}));

vi.mock("@backend/features/leads/leads.repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/features/leads/leads.repository")>()),
  leadsRepository: mocks.leads,
}));
vi.mock("@backend/features/catalog/catalog.repository", () => ({ catalogRepository: mocks.catalog }));
vi.mock("@backend/features/patients/patients.repository", () => ({ patientsRepository: mocks.patients }));
vi.mock("@backend/features/appointments/appointments.service", () => ({ bookInTransaction: mocks.book }));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));
vi.mock("@backend/lib/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ patient: { findUnique: mocks.findPatientByContact } }) } }));

const { createLead, updateLead } = await import("@backend/features/leads/leads.service");

const LEAD_ID = "00000000-0000-4000-8000-c00000000001";
const CONTACT_ID = "00000000-0000-4000-8000-c00000000002";
const FRONT_DESK_ID = userIdFor("FRONT_DESK");
const DENTIST_ID = userIdFor("DENTIST");
const SERVICE_ID = "00000000-0000-4000-8000-700000000001";
const frontDesk = makeUser("FRONT_DESK");
const accounts = makeUser("ACCOUNTS");

/** A staff row as the repository returns it, with role grants that do or don't include working leads. */
const staff = (id: string, name: string, leadsFull: boolean) => ({
  id,
  fullName: name,
  userRoles: [{ role: { code: leadsFull ? "FRONT_DESK" : "DENTIST", rolePermissions: (leadsFull ? [grantKey("leads", "view"), grantKey("leads", "full")] : [grantKey("calendar", "view")]).map((k) => ({ permission: { resource: k.split(":")[0], action: k.split(":").slice(1).join(":") } })) } }],
  userPermissionOverrides: [],
});

const leadRow = (patch: Record<string, unknown> = {}) => ({
  id: LEAD_ID,
  contactId: CONTACT_ID,
  stage: "new",
  status: "open",
  hot: false,
  nextActionAt: null,
  attempts: 0,
  createdAt: new Date(),
  closedAt: null,
  closedReason: null,
  wonValue: null,
  message: null,
  contact: { fullName: "Carla Mendoza", phone: "+63 917 555 0301", email: null, preferredChannel: "viber" },
  source: null,
  interestedService: null,
  assignedTo: null,
  convertedPatient: null,
  appointment: null,
  leadActivities: [],
  ...patch,
});

const soon = () => new Date(Date.now() + 3_600_000);
const input = { fullName: "Carla Mendoza", phone: "+63 917 555 0301", email: "", preferredChannel: "viber", sourceId: "", interestedServiceId: "", message: "", hot: true, assigneeId: "" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.leads.staffWithAccess.mockResolvedValue([staff(FRONT_DESK_ID, "Joy Ramirez", true), staff(DENTIST_ID, "Dr. Ana Reyes", false)]);
  mocks.leads.findDetail.mockResolvedValue(leadRow());
  mocks.leads.contactByPhone.mockResolvedValue(null);
  mocks.leads.createContact.mockResolvedValue({ id: CONTACT_ID });
  mocks.leads.create.mockResolvedValue({ id: LEAD_ID });
  mocks.catalog.findActive.mockResolvedValue({ id: SERVICE_ID, name: "Clear aligner treatment, monthly", price: new Prisma.Decimal(5000) });
  mocks.patients.maxPatientNumber.mockResolvedValue(7);
  mocks.leads.createPatientFromContact.mockResolvedValue({ id: "new-patient" });
  mocks.findPatientByContact.mockResolvedValue(null);
  mocks.book.mockResolvedValue({ id: "appt-1" });
});

describe("createLead", () => {
  it("creates a contact and an unassigned lead", async () => {
    await expect(createLead(frontDesk, input)).resolves.toEqual({ id: LEAD_ID, existingPatientNo: null });
    expect(mocks.leads.create).toHaveBeenCalledWith(expect.objectContaining({ contactId: CONTACT_ID, stage: "new", hot: true, assignedToId: null, nextActionAt: null }), expect.anything());
  });

  it("schedules the first call when someone is assigned", async () => {
    await createLead(frontDesk, { ...input, assigneeId: FRONT_DESK_ID });
    const [data] = mocks.leads.create.mock.calls[0];
    expect(data.stage).toBe("assigned");
    expect(data.nextActionAt.getTime() - Date.now()).toBeLessThanOrEqual(3_600_000);
  });

  it("reuses an existing patient's contact instead of creating a duplicate", async () => {
    mocks.leads.contactByPhone.mockResolvedValue({ id: "c-existing", phone: "0917 555 0301", patient: { id: "p1", patientNo: "P-0003" }, leads: [] });
    await expect(createLead(frontDesk, input)).resolves.toEqual({ id: LEAD_ID, existingPatientNo: "P-0003" });
    expect(mocks.leads.createContact).not.toHaveBeenCalled();
    expect(mocks.leads.create.mock.calls[0][0]).toMatchObject({ contactId: "c-existing" });
  });

  it("refuses a second open lead for the same number", async () => {
    mocks.leads.contactByPhone.mockResolvedValue({ id: "c-existing", phone: "+63 917 555 0301", patient: null, leads: [{ id: "other" }] });
    await expect(createLead(frontDesk, input)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("only assigns staff who can work leads", async () => {
    await expect(createLead(frontDesk, { ...input, assigneeId: DENTIST_ID })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("needs a way to reach them, and permission to add leads", async () => {
    await expect(createLead(frontDesk, { ...input, phone: "", email: "" })).rejects.toThrow();
    await expect(createLead(accounts, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("updateLead", () => {
  it("counts call attempts on a retry", async () => {
    mocks.leads.findDetail.mockResolvedValue(leadRow({ stage: "assigned", attempts: 2 }));
    await updateLead(frontDesk, LEAD_ID, { type: "retry", assigneeId: FRONT_DESK_ID, result: "no_answer", nextAt: soon() });
    expect(mocks.leads.update).toHaveBeenCalledWith(LEAD_ID, expect.objectContaining({ stage: "assigned", attempts: 3 }), expect.anything());
    expect(mocks.leads.addActivity.mock.calls[0][0].content).toContain("Call attempt 3 · no answer");
  });

  it("values a won lead at the accepted treatment's price", async () => {
    await updateLead(frontDesk, LEAD_ID, { type: "won", assigneeId: FRONT_DESK_ID, serviceId: SERVICE_ID });
    expect(mocks.leads.update).toHaveBeenCalledWith(LEAD_ID, expect.objectContaining({ status: "won", wonValue: 5000, interestedServiceId: SERVICE_ID }), expect.anything());
  });

  it("books a consult by turning the lead into a patient", async () => {
    await updateLead(frontDesk, LEAD_ID, { type: "book_consult", assigneeId: FRONT_DESK_ID, serviceId: SERVICE_ID, dentistId: DENTIST_ID, date: "2099-01-05", startMinutes: 540, durationMinutes: 30, note: null });
    expect(mocks.leads.createPatientFromContact).toHaveBeenCalledWith({ clinicId: CLINIC_A, contactId: CONTACT_ID, patientNo: "P-0008", primaryDentistId: DENTIST_ID }, expect.anything());
    expect(mocks.book).toHaveBeenCalledWith(frontDesk, expect.objectContaining({ patientId: "new-patient", bookingSource: "lead" }), expect.anything());
    expect(mocks.leads.update).toHaveBeenCalledWith(LEAD_ID, expect.objectContaining({ stage: "consult_booked", appointmentId: "appt-1", convertedPatientId: "new-patient" }), expect.anything());
  });

  it("books an existing patient without creating another record", async () => {
    mocks.findPatientByContact.mockResolvedValue({ id: "p-existing" });
    await updateLead(frontDesk, LEAD_ID, { type: "book_consult", assigneeId: FRONT_DESK_ID, serviceId: null, dentistId: DENTIST_ID, date: "2099-01-05", startMinutes: 540, durationMinutes: 30, note: null });
    expect(mocks.leads.createPatientFromContact).not.toHaveBeenCalled();
    expect(mocks.book.mock.calls[0][1]).toMatchObject({ patientId: "p-existing" });
  });

  it("protects closed leads until they are reopened", async () => {
    mocks.leads.findDetail.mockResolvedValue(leadRow({ status: "lost", closedReason: "Price or budget" }));
    await expect(updateLead(frontDesk, LEAD_ID, { type: "follow_up", assigneeId: FRONT_DESK_ID, reason: "Comparing two clinics", nextAt: soon() })).rejects.toMatchObject({ code: "CONFLICT" });
    await updateLead(frontDesk, LEAD_ID, { type: "reopen", assigneeId: FRONT_DESK_ID, nextAt: soon() });
    expect(mocks.leads.update).toHaveBeenCalledWith(LEAD_ID, expect.objectContaining({ status: "open", stage: "assigned", closedReason: null }), expect.anything());
  });

  it("refuses call-backs scheduled hours in the past", async () => {
    const past = new Date(Date.now() - 3 * 3_600_000);
    await expect(updateLead(frontDesk, LEAD_ID, { type: "assign", assigneeId: FRONT_DESK_ID, nextAt: past })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("allows notes on any lead without changing it", async () => {
    mocks.leads.findDetail.mockResolvedValue(leadRow({ status: "won" }));
    await updateLead(frontDesk, LEAD_ID, { type: "note", note: "Asked about HMO coverage" });
    expect(mocks.leads.update).not.toHaveBeenCalled();
    expect(mocks.leads.addActivity).toHaveBeenCalledWith(expect.objectContaining({ activityType: "note", content: "Asked about HMO coverage" }), expect.anything());
  });
});
