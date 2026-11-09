import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@backend/generated/prisma/client";
import { calculateInvoice } from "@backend/features/billing/billing.calc";
import { CLINIC_A, makeUser, userIdFor } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  billing: {
    maxInvoiceNumber: vi.fn(),
    createInvoice: vi.fn(),
    createClaim: vi.fn(),
    createPayment: vi.fn(),
    activeForAppointment: vi.fn(),
    findEncounter: vi.fn(),
    recordTreatments: vi.fn(),
    lock: vi.fn(),
    findSummary: vi.fn(),
    setStatus: vi.fn(),
    voidInvoice: vi.fn(),
    decideVoidRequests: vi.fn(),
    pendingVoidRequest: vi.fn(),
    createVoidRequest: vi.fn(),
  },
  patients: { exists: vi.fn() },
  catalog: { findActiveByIds: vi.fn() },
  appointments: { findById: vi.fn() },
  settings: { findClinicSettings: vi.fn() },
  audit: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@backend/features/billing/billing.repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/features/billing/billing.repository")>()),
  billingRepository: mocks.billing,
}));
vi.mock("@backend/features/patients/patients.repository", () => ({ patientsRepository: mocks.patients }));
vi.mock("@backend/features/catalog/catalog.repository", () => ({ catalogRepository: mocks.catalog }));
vi.mock("@backend/features/appointments/appointments.repository", () => ({ appointmentsRepository: mocks.appointments }));
vi.mock("@backend/features/settings/settings.repository", () => ({ settingsRepository: mocks.settings }));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));
vi.mock("@backend/lib/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ $queryRaw: mocks.queryRaw }) } }));

const { cancelInvoice, checkout, decideVoidRequest, recordPayment } = await import("@backend/features/billing/billing.service");

const PATIENT_ID = "00000000-0000-4000-8000-800000000001";
const PAYER_ID = "00000000-0000-4000-8000-a00000000001";
const SERVICE_ID = "00000000-0000-4000-8000-700000000001";
const PRODUCT_ID = "00000000-0000-4000-8000-700000000002";
const APPT_ID = "00000000-0000-4000-8000-900000000001";
const INVOICE_ID = "00000000-0000-4000-8000-b00000000001";
const owner = makeUser("OWNER");
const accounts = makeUser("ACCOUNTS");
const frontDesk = makeUser("FRONT_DESK");

const service = (id: string, price: number, kind = "service", hmoCoverable = true) => ({ id, code: "X", name: id === SERVICE_ID ? "Composite restoration, 1 surface" : "Aftercare kit", price: new Prisma.Decimal(price), kind, hmoCoverable });

const input = (patch: Record<string, unknown> = {}) => ({
  patientId: PATIENT_ID,
  appointmentId: null,
  lines: [{ serviceId: SERVICE_ID, qty: 1, toothCode: "16" }],
  discountType: "none" as const,
  discountIdNo: null,
  hmo: false,
  loaNo: null,
  payment: null,
  ...patch,
});

const summaryRow = (patch: Record<string, unknown> = {}) => ({
  id: INVOICE_ID,
  number: "SI-0000001",
  issuedAt: new Date(),
  status: "issued",
  grandTotal: new Prisma.Decimal(1680),
  hmoDue: new Prisma.Decimal(0),
  discountType: "none",
  appointmentId: null,
  patient: { id: PATIENT_ID, patientNo: "P-0001", contact: { fullName: "Maria Lopez" } },
  payer: null,
  paymentAllocations: [{ amount: new Prisma.Decimal(500), payment: { status: "posted" } }],
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.findClinicSettings.mockResolvedValue({ name: "iSmile", settings: {} });
  mocks.patients.exists.mockResolvedValue({ id: PATIENT_ID, contactId: "c1", payerId: PAYER_ID });
  mocks.catalog.findActiveByIds.mockImplementation(async (_clinic: string, ids: string[]) =>
    [service(SERVICE_ID, 1500), service(PRODUCT_ID, 560, "product", false)].filter((s) => ids.includes(s.id)),
  );
  mocks.billing.maxInvoiceNumber.mockResolvedValue(41);
  mocks.billing.createInvoice.mockResolvedValue({ id: INVOICE_ID });
  mocks.billing.activeForAppointment.mockResolvedValue(null);
  mocks.billing.findSummary.mockResolvedValue(summaryRow());
  mocks.billing.pendingVoidRequest.mockResolvedValue(null);
});

describe("calculateInvoice", () => {
  const lines = [
    { unitPrice: 1500, qty: 1, hmoCoverable: true },
    { unitPrice: 560, qty: 2, hmoCoverable: false },
  ];

  it("adds 12% VAT for a VAT-registered clinic", () => {
    expect(calculateInvoice({ lines, discountType: "none", hmo: false, vatRegistered: true })).toMatchObject({
      subtotal: 2620,
      discountTotal: 0,
      vatableSales: 2620,
      vatExemptSales: 0,
      vat: 314.4,
      total: 2934.4,
      hmoDue: 0,
      patientDue: 2934.4,
    });
  });

  it("gives seniors and PWDs 20% off with no VAT", () => {
    expect(calculateInvoice({ lines, discountType: "sc", hmo: false, vatRegistered: true })).toMatchObject({
      discountTotal: 524,
      vatableSales: 0,
      vatExemptSales: 2096,
      vat: 0,
      total: 2096,
    });
  });

  it("charges no VAT when the clinic isn't VAT-registered", () => {
    expect(calculateInvoice({ lines, discountType: "none", hmo: false, vatRegistered: false })).toMatchObject({ vat: 0, total: 2620, vatableSales: 0, vatExemptSales: 0 });
  });

  it("bills the HMO only for covered items, with their VAT", () => {
    expect(calculateInvoice({ lines, discountType: "none", hmo: true, vatRegistered: true })).toMatchObject({ hmoDue: 1680, patientDue: 1254.4 });
  });
});

describe("checkout", () => {
  it("prices from the price list, numbers the invoice and records the payment", async () => {
    const result = await checkout(owner, input({ payment: { amount: 1680, method: "cash", reference: null } }));
    expect(result).toEqual({ id: INVOICE_ID, number: "SI-0000042" });
    const [, data] = mocks.billing.createInvoice.mock.calls[0];
    expect(data).toMatchObject({ number: "SI-0000042", status: "paid", payerId: null, totals: expect.objectContaining({ total: 1680 }) });
    expect(data.items[0]).toMatchObject({ description: "Composite restoration, 1 surface, tooth 16", unitPrice: 1500, taxType: "vat" });
    expect(mocks.billing.createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 1680, invoiceId: INVOICE_ID }), expect.anything());
  });

  it("files an HMO claim for the HMO's share", async () => {
    await checkout(owner, input({ hmo: true, loaNo: "LOA-1" }));
    expect(mocks.billing.createInvoice.mock.calls[0][1]).toMatchObject({ payerId: PAYER_ID, status: "paid" });
    expect(mocks.billing.createClaim).toHaveBeenCalledWith({ clinicId: CLINIC_A, invoiceId: INVOICE_ID, payerId: PAYER_ID, loaNo: "LOA-1", amount: 1680 }, expect.anything());
  });

  it("refuses to take more than the patient owes", async () => {
    await expect(checkout(owner, input({ payment: { amount: 2000, method: "cash", reference: null } }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.billing.createInvoice).not.toHaveBeenCalled();
  });

  it.each([
    ["an SC/PWD discount without an ID", { discountType: "sc" }],
    ["an HMO without an LOA number", { hmo: true }],
    ["an HMO with an SC/PWD discount", { hmo: true, loaNo: "L", discountType: "pwd", discountIdNo: "1" }],
    ["a non-cash payment without a reference", { payment: { amount: 100, method: "gcash", reference: null } }],
    ["a tooth number that doesn't exist", { lines: [{ serviceId: SERVICE_ID, qty: 1, toothCode: "19" }] }],
  ])("rejects %s", async (_label, patch) => {
    await expect(checkout(owner, input(patch))).rejects.toThrow();
    expect(mocks.billing.createInvoice).not.toHaveBeenCalled();
  });

  it("rejects a service that left the price list", async () => {
    mocks.catalog.findActiveByIds.mockResolvedValue([]);
    await expect(checkout(owner, input())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("invoices a finished visit once, and records its treatments", async () => {
    mocks.appointments.findById.mockResolvedValue({ id: APPT_ID, patientId: PATIENT_ID, dentistId: userIdFor("DENTIST"), status: "completed" });
    mocks.billing.findEncounter.mockResolvedValue({ id: "enc-1" });
    await checkout(owner, input({ appointmentId: APPT_ID, lines: [{ serviceId: SERVICE_ID, qty: 1, toothCode: "16" }, { serviceId: PRODUCT_ID, qty: 1, toothCode: null }] }));
    expect(mocks.queryRaw).toHaveBeenCalled();
    expect(mocks.billing.recordTreatments).toHaveBeenCalledWith(expect.objectContaining({ encounterId: "enc-1", items: [expect.objectContaining({ serviceId: SERVICE_ID, toothCode: "16" })] }), expect.anything());

    mocks.billing.activeForAppointment.mockResolvedValue({ id: "x", number: "SI-0000001" });
    await expect(checkout(owner, input({ appointmentId: APPT_ID }))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("needs permission to create invoices", async () => {
    await expect(checkout(frontDesk, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("recordPayment", () => {
  it("marks the invoice paid once the balance is covered", async () => {
    const result = await recordPayment(accounts, INVOICE_ID, { amount: 1180, method: "gcash", reference: "GC-1" });
    expect(mocks.billing.lock).toHaveBeenCalledWith(INVOICE_ID, expect.anything());
    expect(mocks.billing.setStatus).toHaveBeenCalledWith(INVOICE_ID, "paid", expect.anything());
    expect(result).toMatchObject({ paid: 1680, balance: 0, status: "paid" });
  });

  it("refuses more than the balance, and cancelled invoices", async () => {
    await expect(recordPayment(accounts, INVOICE_ID, { amount: 1181, method: "cash", reference: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    mocks.billing.findSummary.mockResolvedValue(summaryRow({ status: "void" }));
    await expect(recordPayment(accounts, INVOICE_ID, { amount: 10, method: "cash", reference: null })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.billing.createPayment).not.toHaveBeenCalled();
  });
});

describe("cancelling invoices", () => {
  const reason = "Duplicate invoice";

  it("lets an approver cancel straight away", async () => {
    await expect(cancelInvoice(owner, INVOICE_ID, { reason })).resolves.toEqual({ voided: true });
    expect(mocks.billing.voidInvoice).toHaveBeenCalledWith(INVOICE_ID, reason, expect.anything());
  });

  it("turns anyone else's cancellation into a request", async () => {
    await expect(cancelInvoice(accounts, INVOICE_ID, { reason })).resolves.toEqual({ voided: false });
    expect(mocks.billing.voidInvoice).not.toHaveBeenCalled();
    expect(mocks.billing.createVoidRequest).toHaveBeenCalledWith({ clinicId: CLINIC_A, invoiceId: INVOICE_ID, requestedById: accounts.id, reason }, expect.anything());
  });

  it("allows one waiting request per invoice, and needs a listed reason", async () => {
    mocks.billing.pendingVoidRequest.mockResolvedValue({ id: "r1", reason });
    await expect(cancelInvoice(accounts, INVOICE_ID, { reason })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(cancelInvoice(accounts, INVOICE_ID, { reason: "Because" })).rejects.toThrow();
  });

  it("only approvers decide requests", async () => {
    mocks.billing.pendingVoidRequest.mockResolvedValue({ id: "r1", reason });
    await expect(decideVoidRequest(accounts, INVOICE_ID, { approve: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await decideVoidRequest(owner, INVOICE_ID, { approve: false });
    expect(mocks.billing.decideVoidRequests).toHaveBeenCalledWith(INVOICE_ID, "declined", owner.id, expect.anything());
    expect(mocks.billing.voidInvoice).not.toHaveBeenCalled();
  });
});
