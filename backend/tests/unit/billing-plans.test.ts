import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@backend/generated/prisma/client";
import { makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  billing: { lock: vi.fn(), findSummary: vi.fn(), unpaid: vi.fn() },
  plans: { list: vi.fn(), find: vi.fn(), activeInvoiceIds: vi.fn(), activeForInvoice: vi.fn(), create: vi.fn(), findInstallment: vi.fn(), markPaid: vi.fn(), setStatus: vi.fn(), cancelRemaining: vi.fn() },
  recordPaymentInTransaction: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@backend/features/billing/billing.repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/features/billing/billing.repository")>()),
  billingRepository: mocks.billing,
}));
vi.mock("@backend/features/billing/billing.service", () => ({ recordPaymentInTransaction: mocks.recordPaymentInTransaction }));
vi.mock("@backend/features/billing/plans/plans.repository", () => ({ plansRepository: mocks.plans }));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));
vi.mock("@backend/lib/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) } }));

const { cancelPlan, createPlan, getPlansBoard, payInstallment } = await import("@backend/features/billing/plans/plans.service");
const { addMonths, splitInstallments } = await import("@backend/features/billing/plans/plans.calc");

const INVOICE_ID = "00000000-0000-4000-8000-b00000000001";
const PLAN_ID = "00000000-0000-4000-8000-c00000000001";
const INST_1 = "00000000-0000-4000-8000-d00000000001";
const INST_2 = "00000000-0000-4000-8000-d00000000002";
const accounts = makeUser("ACCOUNTS");
const frontDesk = makeUser("FRONT_DESK");
const dentist = makeUser("DENTIST");

const summaryRow = (patch: Record<string, unknown> = {}) => ({
  id: INVOICE_ID,
  number: "SI-0000001",
  issuedAt: new Date(),
  status: "issued",
  grandTotal: new Prisma.Decimal(10000),
  hmoDue: new Prisma.Decimal(0),
  discountType: "none",
  appointmentId: null,
  patient: { id: "p1", patientNo: "P-0001", contact: { fullName: "Maria Lopez" } },
  payer: null,
  paymentAllocations: [],
  ...patch,
});

const installment = (id: string, dueOn: string, status = "due", amount = 5000) => ({ id, dueOn: new Date(`${dueOn}T00:00:00Z`), amount: new Prisma.Decimal(amount), status, paidAt: null });
const planRow = (patch: Record<string, unknown> = {}) => ({
  id: PLAN_ID,
  status: "active",
  createdAt: new Date(),
  invoiceId: INVOICE_ID,
  patient: { id: "p1", patientNo: "P-0001", contact: { fullName: "Maria Lopez" } },
  invoice: { id: INVOICE_ID, number: "SI-0000001" },
  paymentInstallments: [installment(INST_1, "2099-01-10"), installment(INST_2, "2099-02-10")],
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.billing.findSummary.mockResolvedValue(summaryRow());
  mocks.plans.activeForInvoice.mockResolvedValue(null);
  mocks.plans.create.mockResolvedValue({ id: PLAN_ID });
  mocks.plans.findInstallment.mockResolvedValue({ id: INST_1, planId: PLAN_ID, plan: { invoiceId: INVOICE_ID } });
  mocks.plans.find.mockResolvedValue(planRow());
  mocks.recordPaymentInTransaction.mockResolvedValue({ invoice: { balance: 5000 }, paymentId: "pay1" });
});

describe("splitInstallments", () => {
  it("splits evenly to the centavo and puts the remainder on the last", () => {
    expect(splitInstallments(1000, 3)).toEqual([333.33, 333.33, 333.34]);
    expect(splitInstallments(1000, 4)).toEqual([250, 250, 250, 250]);
    const parts = splitInstallments(12345.67, 7);
    expect(parts).toHaveLength(7);
    expect(Math.round((parts ?? []).reduce((s, p) => s + p, 0) * 100)).toBe(1234567);
  });

  it("returns null for a balance too small to split", () => {
    expect(splitInstallments(0.01, 2)).toBeNull();
  });
});

describe("addMonths", () => {
  it("clamps to the end of shorter months", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
  });
});

describe("createPlan", () => {
  it("creates monthly installments that add up to the balance", async () => {
    await createPlan(accounts, { invoiceId: INVOICE_ID, installments: 3, firstDueOn: "2099-01-31" });
    expect(mocks.billing.lock).toHaveBeenCalledWith(INVOICE_ID, expect.anything());
    const data = mocks.plans.create.mock.calls[0][0];
    expect(data.installments.map((i: { amount: number }) => i.amount)).toEqual([3333.33, 3333.33, 3333.34]);
    expect(data.installments.map((i: { dueOn: Date }) => i.dueOn.toISOString().slice(0, 10))).toEqual(["2099-01-31", "2099-02-28", "2099-03-31"]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "payment_plan.created" }), expect.anything());
  });

  it("refuses a second active plan, a paid invoice and a past first due date", async () => {
    mocks.plans.activeForInvoice.mockResolvedValueOnce({ id: "other" });
    await expect(createPlan(accounts, { invoiceId: INVOICE_ID, installments: 3, firstDueOn: "2099-01-31" })).rejects.toThrow(/already has an active/);
    mocks.billing.findSummary.mockResolvedValueOnce(summaryRow({ status: "paid", paymentAllocations: [{ amount: new Prisma.Decimal(10000), payment: { status: "posted" } }] }));
    await expect(createPlan(accounts, { invoiceId: INVOICE_ID, installments: 3, firstDueOn: "2099-01-31" })).rejects.toThrow(/nothing left/);
    await expect(createPlan(accounts, { invoiceId: INVOICE_ID, installments: 3, firstDueOn: "2000-01-01" })).rejects.toThrow();
    expect(mocks.plans.create).not.toHaveBeenCalled();
  });

  it("needs billing update rights and the payment plans tab", async () => {
    await expect(createPlan(frontDesk, { invoiceId: INVOICE_ID, installments: 3, firstDueOn: "2099-01-31" })).rejects.toThrow();
    await expect(getPlansBoard(dentist, {})).rejects.toThrow();
  });
});

describe("payInstallment", () => {
  it("records the installment amount as an invoice payment and marks it paid", async () => {
    await payInstallment(accounts, { installmentId: INST_1, method: "cash", reference: null });
    expect(mocks.recordPaymentInTransaction).toHaveBeenCalledWith(accounts, INVOICE_ID, { amount: 5000, method: "cash", reference: null }, expect.anything());
    expect(mocks.plans.markPaid).toHaveBeenCalledWith(INST_1, "pay1", expect.anything());
    expect(mocks.plans.setStatus).not.toHaveBeenCalled();
  });

  it("completes the plan when the last installment is paid", async () => {
    mocks.plans.findInstallment.mockResolvedValue({ id: INST_2, planId: PLAN_ID, plan: { invoiceId: INVOICE_ID } });
    mocks.plans.find.mockResolvedValue(planRow({ paymentInstallments: [installment(INST_1, "2099-01-10", "paid"), installment(INST_2, "2099-02-10")] }));
    mocks.recordPaymentInTransaction.mockResolvedValue({ invoice: { balance: 0 }, paymentId: "pay2" });
    await payInstallment(accounts, { installmentId: INST_2, method: "gcash", reference: "GC-1" });
    expect(mocks.plans.setStatus).toHaveBeenCalledWith(PLAN_ID, "completed", expect.anything());
  });

  it("only takes the earliest unpaid installment, on an active plan", async () => {
    mocks.plans.findInstallment.mockResolvedValue({ id: INST_2, planId: PLAN_ID, plan: { invoiceId: INVOICE_ID } });
    await expect(payInstallment(accounts, { installmentId: INST_2, method: "cash", reference: null })).rejects.toThrow(/earliest/);
    mocks.plans.find.mockResolvedValue(planRow({ status: "cancelled" }));
    await expect(payInstallment(accounts, { installmentId: INST_1, method: "cash", reference: null })).rejects.toThrow(/no longer active/);
    expect(mocks.recordPaymentInTransaction).not.toHaveBeenCalled();
  });

  it("requires a reference for non-cash payments", async () => {
    await expect(payInstallment(accounts, { installmentId: INST_1, method: "gcash", reference: null })).rejects.toThrow();
  });

  it("passes the invoice's overpay guard through", async () => {
    mocks.recordPaymentInTransaction.mockRejectedValue(new Error("The balance is 100.00; take that amount or less."));
    await expect(payInstallment(accounts, { installmentId: INST_1, method: "cash", reference: null })).rejects.toThrow(/balance/);
    expect(mocks.plans.markPaid).not.toHaveBeenCalled();
  });

  it("is view-only for the front desk", async () => {
    await expect(payInstallment(frontDesk, { installmentId: INST_1, method: "cash", reference: null })).rejects.toThrow();
  });
});

describe("cancelPlan and the board", () => {
  it("cancels the unpaid installments of an active plan", async () => {
    await cancelPlan(accounts, PLAN_ID);
    expect(mocks.plans.cancelRemaining).toHaveBeenCalledWith(PLAN_ID, expect.anything());
    expect(mocks.plans.setStatus).toHaveBeenCalledWith(PLAN_ID, "cancelled", expect.anything());
  });

  it("flags plans with a past-due installment as overdue", async () => {
    mocks.plans.list.mockResolvedValue([planRow({ paymentInstallments: [installment(INST_1, "2000-01-10"), installment(INST_2, "2099-02-10")] }), planRow({ id: "p2", status: "completed" })]);
    mocks.billing.unpaid.mockResolvedValue([]);
    mocks.plans.activeInvoiceIds.mockResolvedValue(new Set());
    const board = await getPlansBoard(accounts, { status: "overdue" });
    expect(board.plans.map((p) => p.status)).toEqual(["overdue"]);
    expect(board.counts).toEqual({ active: 1, overdue: 1, completed: 1, all: 2 });
    expect(board.selected?.nextDue?.id).toBe(INST_1);
  });
});
