import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@backend/generated/prisma/client";
import { CLINIC_A, makeUser, userIdFor } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  repo: {
    findFile: vi.fn(),
    treatmentHistory: vi.fn(),
    exists: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    maxPatientNumber: vi.fn(),
    isClinicDentist: vi.fn(),
    isClinicHmo: vi.fn(),
  },
  audit: vi.fn(),
}));

vi.mock("@backend/features/patients/patients.repository", () => ({
  patientsRepository: mocks.repo,
  toDateString: (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null),
}));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));
vi.mock("@backend/lib/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) } }));

const { createPatient, getPatientFile, updatePatient } = await import("@backend/features/patients/patients.service");

const PATIENT_ID = "00000000-0000-4000-8000-800000000001";
const DENTIST_ID = userIdFor("DENTIST");
const owner = makeUser("OWNER");
const frontDesk = makeUser("FRONT_DESK");
const dentist = makeUser("DENTIST");

const input = {
  fullName: "Andrea Santos",
  dob: "2018-11-20",
  sex: "female",
  civilStatus: "",
  occupation: "",
  phone: "+63 917 555 0101",
  email: "",
  address: "",
  preferredChannel: "viber",
  primaryDentistId: DENTIST_ID,
  payerId: "",
  hmoMemberNo: "",
  scPwdId: "",
  emergencyName: "",
  emergencyRelationship: "",
  emergencyPhone: "",
} as const;
const clinical = { allergies: "Penicillin", medicalConditions: "", medications: "" };

const fileRow = {
  id: PATIENT_ID,
  clinicId: CLINIC_A,
  patientNo: "P-0001",
  dob: new Date("2018-11-20T00:00:00Z"),
  sex: "female",
  civilStatus: null,
  occupation: null,
  hmoMemberNo: null,
  scPwdId: null,
  status: "active",
  createdAt: new Date(),
  primaryDentistId: null,
  medicalAlerts: "Penicillin",
  medicalConditions: null,
  medications: null,
  contact: { fullName: "Andrea Santos", phone: null, email: null, address: null, preferredChannel: null },
  primaryDentist: null,
  payer: null,
  patientGuardians: [{ relationship: "Mother", guardianContact: { fullName: "Liza Santos", phone: "+63 918 555 0202" } }],
  appointments: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.maxPatientNumber.mockResolvedValue(41);
  mocks.repo.isClinicDentist.mockResolvedValue(1);
  mocks.repo.isClinicHmo.mockResolvedValue(1);
  mocks.repo.create.mockResolvedValue({ id: PATIENT_ID });
  mocks.repo.exists.mockResolvedValue({ id: PATIENT_ID, contactId: "contact-1" });
  mocks.repo.findFile.mockResolvedValue(fileRow);
  mocks.repo.treatmentHistory.mockResolvedValue([[], []]);
});

describe("createPatient", () => {
  it("assigns the next patient number and stores NULL for empty fields", async () => {
    await createPatient(owner, input, clinical);
    const [, patientNo, data, savedClinical] = mocks.repo.create.mock.calls[0];
    expect(patientNo).toBe("P-0042");
    expect(data).toMatchObject({ fullName: "Andrea Santos", email: null, civilStatus: null, primaryDentistId: DENTIST_ID });
    expect(savedClinical).toEqual({ allergies: "Penicillin", medicalConditions: null, medications: null });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "patient.created", metadata: { patientNo: "P-0042" } }), {});
  });

  it("accepts its own parsed output, as the form sends it", async () => {
    await createPatient(owner, { ...input, email: null, civilStatus: null } as never);
    expect(mocks.repo.create).toHaveBeenCalled();
  });

  it("retries once when two registrations pick the same number", async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "7" });
    mocks.repo.create.mockRejectedValueOnce(duplicate);
    await expect(createPatient(owner, input)).resolves.toEqual({ id: PATIENT_ID });
    expect(mocks.repo.create).toHaveBeenCalledTimes(2);
  });

  it("files a dentist's new patient under that dentist", async () => {
    await createPatient(dentist, { ...input, primaryDentistId: "" });
    expect(mocks.repo.create.mock.calls[0][2]).toMatchObject({ primaryDentistId: DENTIST_ID });
  });

  it("rejects a dentist from outside the clinic", async () => {
    mocks.repo.isClinicDentist.mockResolvedValue(0);
    await expect(createPatient(owner, input)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.repo.create).not.toHaveBeenCalled();
  });

  it("does not let the front desk write clinical data", async () => {
    await expect(createPatient(frontDesk, input, clinical)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createPatient(frontDesk, input)).resolves.toEqual({ id: PATIENT_ID });
  });

  it.each([
    ["a future birth date", { dob: "2999-01-01" }],
    ["an HMO number without an HMO", { hmoMemberNo: "MX-1" }],
    ["an emergency phone without a name", { emergencyPhone: "+63 918 555 0202" }],
  ])("rejects %s", async (_label, patch) => {
    await expect(createPatient(owner, { ...input, ...patch })).rejects.toThrow();
    expect(mocks.repo.create).not.toHaveBeenCalled();
  });
});

describe("updatePatient", () => {
  it("audits clinical changes separately", async () => {
    await updatePatient(owner, PATIENT_ID, input, clinical);
    const actions = mocks.audit.mock.calls.map(([entry]) => entry.action);
    expect(actions).toEqual(["patient.updated", "patient.medical.updated"]);
  });

  it("returns not found outside the user's scope", async () => {
    mocks.repo.exists.mockResolvedValue(null);
    await expect(updatePatient(owner, PATIENT_ID, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.repo.update).not.toHaveBeenCalled();
  });
});

describe("getPatientFile", () => {
  it("hides clinical data and history from the front desk", async () => {
    const file = await getPatientFile(frontDesk, PATIENT_ID);
    expect(mocks.repo.findFile).toHaveBeenCalledWith(expect.anything(), PATIENT_ID, false, expect.any(Date));
    expect(file).toMatchObject({ clinical: null, visits: null, chart: null, dob: "2018-11-20" });
    expect(mocks.repo.treatmentHistory).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("shows clinical data to dentists and audits the view", async () => {
    const file = await getPatientFile(dentist, PATIENT_ID);
    expect(file.clinical).toEqual({ allergies: "Penicillin", medicalConditions: null, medications: null });
    expect(file.emergencyContact).toEqual({ name: "Liza Santos", relationship: "Mother", phone: "+63 918 555 0202" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "patient.medical.viewed" }));
  });

  it("charts done work over planned work, and keeps extractions", async () => {
    const item = (toothCode: string, name: string, encounterId: string | null) => ({ toothCode, encounterId, service: { name } });
    mocks.repo.treatmentHistory.mockResolvedValue([
      [],
      [
        item("16", "Composite restoration, 1 surface", "e1"),
        item("16", "Porcelain-fused-to-metal crown", null),
        item("36", "Simple extraction", "e2"),
        item("36", "Composite restoration, 1 surface", null),
        item("47", "Porcelain-fused-to-metal crown", "e3"),
        item("21", "Root canal treatment, molar", null),
      ],
    ]);
    const file = await getPatientFile(owner, PATIENT_ID);
    expect(file.chart).toEqual({ "16": "treated", "36": "extracted", "47": "crown", "21": "planned" });
  });
});
