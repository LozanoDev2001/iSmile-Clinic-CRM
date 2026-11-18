import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@backend/generated/prisma/client";
import { CLINIC_A, makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  repo: {
    paymentsByMethod: vi.fn(),
    hmoPaid: vi.fn(),
    openClaims: vi.fn(),
    revenueInvoices: vi.fn(),
    billedTotals: vi.fn(),
    expensesByCategory: vi.fn(),
    expenses: vi.fn(),
    createExpense: vi.fn(),
    findExpense: vi.fn(),
    deleteExpense: vi.fn(),
  },
  unpaid: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@backend/features/billing/reports/billing-reports.repository", () => ({ billingReportsRepository: mocks.repo }));
vi.mock("@backend/features/billing/billing.repository", () => ({ billingRepository: { unpaid: mocks.unpaid } }));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));
vi.mock("@backend/lib/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) } }));

const { addExpense, bucketByAge, daysSince, deleteExpense, getBillingReport, monthDates, monthInstants, profitAndLoss } = await import(
  "@backend/features/billing/reports/billing-reports.service"
);

const dec = (n: number) => new Prisma.Decimal(n);
const accounts = makeUser("ACCOUNTS");
const viewOnly = makeUser("ACCOUNTS", {
  permissions: ["billing.read"],
  access: { ...accounts.access, billing: { level: "VIEW", tabs: ["reports"] } },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T04:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("month ranges", () => {
  it("bounds a month in clinic time (UTC+8) for timestamps", () => {
    expect(monthInstants("2026-11")).toEqual({ from: new Date("2026-10-31T16:00:00Z"), to: new Date("2026-11-30T16:00:00Z") });
  });

  it("rolls December into January and uses UTC midnights for DATE columns", () => {
    expect(monthDates("2026-12")).toEqual({ from: new Date("2026-12-01T00:00:00Z"), to: new Date("2027-01-01T00:00:00Z") });
  });
});

describe("aging", () => {
  it("counts whole clinic days and puts day 30 in the first bucket and day 91 in the last", () => {
    expect(daysSince(new Date("2026-10-19T02:00:00Z"), "2026-11-18")).toBe(30);
    const buckets = bucketByAge([{ d: 0, a: 100 }, { d: 30, a: 50.5 }, { d: 31, a: 10 }, { d: 91, a: 7 }], (x) => x.d, (x) => x.a);
    expect(buckets.map((b) => b.total)).toEqual([150.5, 10, 0, 7]);
    expect(buckets[3].label).toBe("Over 90 days");
  });

  it("ages open invoices and HMO claims as of today", async () => {
    mocks.unpaid.mockResolvedValue([{ id: "i1", number: "SI-0000001", patient: { name: "Ana", patientNo: "P-0001" }, issuedAt: new Date("2026-08-01T02:00:00Z"), balance: 1500 }]);
    mocks.repo.openClaims.mockResolvedValue([
      { id: "c1", submittedAt: new Date("2026-11-10T02:00:00Z"), approvedAmount: dec(4000), payer: { name: "Maxicare" }, invoice: { id: "i2", number: "SI-0000002", patient: { contact: { fullName: "Ben" } } } },
    ]);
    const r = await getBillingReport(accounts, { report: "aging" });
    expect(r.kind).toBe("aging");
    if (r.kind !== "aging") return;
    expect(r.asOf).toBe("2026-11-18");
    expect(r.invoices[3].items.map((i) => i.number)).toEqual(["SI-0000001"]);
    expect(r.claims[0].total).toBe(4000);
    expect(r.invoiceTotal).toBe(1500);
  });
});

describe("collections", () => {
  it("splits patient payments by method and adds HMO payments received", async () => {
    mocks.repo.paymentsByMethod.mockResolvedValue([
      { method: "cash", _sum: { amount: dec(1000) }, _count: 2 },
      { method: "gcash", _sum: { amount: dec(3000) }, _count: 1 },
    ]);
    mocks.repo.hmoPaid.mockResolvedValue({ _sum: { paidAmount: dec(500) }, _count: 1 });
    const r = await getBillingReport(accounts, { report: "collections", month: "2026-10" });
    if (r.kind !== "collections") throw new Error("wrong report");
    expect(mocks.repo.paymentsByMethod).toHaveBeenCalledWith(CLINIC_A, new Date("2026-09-30T16:00:00Z"), new Date("2026-10-31T16:00:00Z"));
    expect(r.methods.map((m) => [m.method, m.share])).toEqual([["gcash", 0.75], ["cash", 0.25]]);
    expect(r.total).toBe(4500);
    expect(r.patientCount).toBe(3);
  });

  it("defaults to the current clinic month for a bad month", async () => {
    mocks.repo.paymentsByMethod.mockResolvedValue([]);
    mocks.repo.hmoPaid.mockResolvedValue({ _sum: { paidAmount: null }, _count: 0 });
    const r = await getBillingReport(accounts, { report: "collections", month: "2026-13" });
    expect(r.kind === "collections" && r.month).toBe("2026-11");
  });
});

describe("revenue", () => {
  it("uses line amounts less SC/PWD discounts, grouped by dentist and service", async () => {
    mocks.repo.revenueInvoices.mockResolvedValue([
      { appointment: { dentist: { fullName: "Dr. Ana Reyes" } }, invoiceItems: [{ description: "Cleaning", qty: dec(1), lineTotal: dec(1000), discount: dec(200) }] },
      { appointment: null, invoiceItems: [{ description: "Cleaning", qty: dec(2), lineTotal: dec(2000), discount: dec(0) }] },
    ]);
    const r = await getBillingReport(accounts, { report: "revenue", month: "2026-11" });
    if (r.kind !== "revenue") throw new Error("wrong report");
    expect(r.byDentist).toEqual([
      { label: "No dentist on file", count: 1, amount: 2000 },
      { label: "Dr. Ana Reyes", count: 1, amount: 800 },
    ]);
    expect(r.byService).toEqual([{ label: "Cleaning", count: 3, amount: 2800 }]);
    expect(r.total).toBe(2800);
  });
});

describe("profit and loss", () => {
  it("takes VAT out of billed sales and subtracts expenses", () => {
    expect(profitAndLoss(11_200, 1_200, [{ category: "Rent", amount: 6_000.5 }, { category: "Utilities", amount: 999.25 }])).toEqual({
      revenue: 10_000,
      expenseTotal: 6_999.75,
      netIncome: 3_000.25,
    });
  });

  it("reads expenses by DATE bounds and invoices by clinic-time bounds", async () => {
    mocks.repo.billedTotals.mockResolvedValue({ _sum: { grandTotal: dec(5600), taxTotal: dec(600) } });
    mocks.repo.expensesByCategory.mockResolvedValue([{ category: "Rent", _sum: { amount: dec(7000) } }]);
    mocks.repo.expenses.mockResolvedValue([{ id: "e1", category: "Rent", amount: dec(7000), incurredOn: new Date("2026-11-05T00:00:00Z"), description: null }]);
    const r = await getBillingReport(accounts, { report: "pnl", month: "2026-11" });
    if (r.kind !== "pnl") throw new Error("wrong report");
    expect(mocks.repo.expensesByCategory).toHaveBeenCalledWith(CLINIC_A, new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z"));
    expect(r.netIncome).toBe(-2000);
    expect(r.entries[0].incurredOn).toBe("2026-11-05");
  });
});

describe("expenses", () => {
  const valid = { category: "Rent" as const, amount: 15000, incurredOn: "2026-11-01", description: "" };

  it("records an expense on its clinic date and audits it", async () => {
    mocks.repo.createExpense.mockResolvedValue({ id: "e1" });
    await addExpense(accounts, valid);
    expect(mocks.repo.createExpense).toHaveBeenCalledWith(
      { clinicId: CLINIC_A, category: "Rent", amount: 15000, incurredOn: new Date("2026-11-01T00:00:00Z"), description: null },
      expect.anything(),
    );
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "expense.recorded", resourceId: "e1" }), expect.anything());
  });

  it.each([
    ["a future date", { incurredOn: "2026-11-19" }],
    ["more than 2 decimals", { amount: 10.555 }],
    ["a zero amount", { amount: 0 }],
    ["an unknown category", { category: "Travel" }],
  ])("rejects %s", async (_, patch) => {
    await expect(addExpense(accounts, { ...valid, ...patch } as typeof valid)).rejects.toThrow();
    expect(mocks.repo.createExpense).not.toHaveBeenCalled();
  });

  it("blocks staff without the Reports tab or without full billing access", async () => {
    await expect(addExpense(makeUser("FRONT_DESK"), valid)).rejects.toThrow();
    await expect(getBillingReport(makeUser("FRONT_DESK"), {})).rejects.toThrow();
    await expect(addExpense(viewOnly, valid)).rejects.toThrow();
    await expect(deleteExpense(viewOnly, "00000000-0000-4000-8000-e00000000001")).rejects.toThrow();
    expect(mocks.repo.createExpense).not.toHaveBeenCalled();
  });

  it("only deletes an expense of the user's clinic", async () => {
    mocks.repo.findExpense.mockResolvedValue(null);
    await expect(deleteExpense(accounts, "00000000-0000-4000-8000-e00000000001")).rejects.toThrow();
    expect(mocks.repo.findExpense).toHaveBeenCalledWith(CLINIC_A, "00000000-0000-4000-8000-e00000000001", expect.anything());
    expect(mocks.repo.deleteExpense).not.toHaveBeenCalled();
  });
});
