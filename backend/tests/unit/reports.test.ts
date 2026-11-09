import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@backend/generated/prisma/client";
import { makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  repo: { invoices: vi.fn(), payments: vi.fn(), newPatients: vi.fn(), appointments: vi.fn(), leadsCreated: vi.fn(), leadsClosed: vi.fn() },
}));
vi.mock("@backend/features/reports/reports.repository", () => ({ reportsRepository: mocks.repo }));

const { addMonths, getLeadsReport, getOverview, getSalesReport, periodMonths } = await import("@backend/features/reports/reports.service");

const owner = makeUser("OWNER");
const frontDesk = makeUser("FRONT_DESK");
const d = (n: number) => new Prisma.Decimal(n);

const invoice = (patch: Record<string, unknown> = {}) => ({
  id: "i1",
  number: "SI-0000001",
  issuedAt: new Date(),
  status: "paid",
  subtotal: d(2000),
  discountTotal: d(0),
  taxTotal: d(240),
  grandTotal: d(2240),
  hmoDue: d(0),
  discountType: "none",
  payer: null,
  patient: { patientNo: "P-0001", contact: { fullName: "Maria Lopez" } },
  appointment: { dentist: { id: "dr", fullName: "Dr. Ana Reyes" } },
  invoiceItems: [{ description: "Oral prophylaxis (cleaning)" }],
  paymentAllocations: [{ amount: d(2240), payment: { status: "posted" } }],
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.invoices.mockResolvedValue([]);
  mocks.repo.payments.mockResolvedValue([]);
  mocks.repo.newPatients.mockResolvedValue([]);
  mocks.repo.appointments.mockResolvedValue([]);
  mocks.repo.leadsCreated.mockResolvedValue([]);
  mocks.repo.leadsClosed.mockResolvedValue([]);
});

describe("periods", () => {
  it("shifts months across years", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", 3)).toBe("2027-02");
  });

  it("covers this month, the last 3 months or the calendar year", () => {
    expect(periodMonths("month", "2026-11-09")).toEqual({ first: "2026-11", last: "2026-11" });
    expect(periodMonths("quarter", "2026-02-15")).toEqual({ first: "2025-12", last: "2026-02" });
    expect(periodMonths("year", "2026-11-09")).toEqual({ first: "2026-01", last: "2026-12" });
  });
});

describe("getOverview", () => {
  it("counts revenue after discounts and before VAT, leaving out cancelled invoices", async () => {
    mocks.repo.invoices.mockResolvedValue([invoice(), invoice({ id: "i2", subtotal: d(1300), discountTotal: d(260) }), invoice({ id: "i3", status: "void", subtotal: d(9999) })]);
    mocks.repo.appointments.mockResolvedValue([{ status: "completed", bookingSource: "front_desk" }, { status: "completed", bookingSource: "lead" }, { status: "no_show", bookingSource: "phone" }, { status: "cancelled", bookingSource: "phone" }]);
    mocks.repo.newPatients.mockResolvedValue([{ id: "p1", leads: [{ source: { name: "Facebook" } }] }, { id: "p2", leads: [] }]);
    const o = await getOverview(owner, { period: "month" });
    expect(o.kpis.find((k) => k.label === "Revenue")?.value).toBe(3040);
    expect(o.kpis.find((k) => k.label === "No-show rate")?.value).toBe(33.33);
    expect(o.newPatientsBySource).toEqual([
      { label: "Facebook", value: 1 },
      { label: "Direct (walk-in, call, referral)", value: 1 },
    ]);
    expect(o.bookingsBySource.map((b) => b.label)).not.toContain(undefined);
    expect(o.bookingsBySource.reduce((s, b) => s + b.value, 0)).toBe(3);
    expect(o.revenueByDentist).toEqual([{ label: "Dr. Ana Reyes", value: 3040 }]);
  });

  it("is only for people with Reports access", async () => {
    await expect(getOverview(frontDesk, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("getSalesReport", () => {
  it("totals the month and splits it by payer, dentist and payment method", async () => {
    mocks.repo.invoices.mockResolvedValue([
      invoice(),
      invoice({ id: "i2", discountType: "sc", subtotal: d(1300), discountTotal: d(260), taxTotal: d(0), grandTotal: d(1040), paymentAllocations: [] }),
      invoice({ id: "i3", payer: { name: "Maxicare" }, grandTotal: d(2240), hmoDue: d(560), paymentAllocations: [{ amount: d(1000), payment: { status: "posted" } }] }),
      invoice({ id: "i4", status: "void" }),
    ]);
    mocks.repo.payments.mockResolvedValue([{ amount: d(2240), method: "cash" }, { amount: d(1000), method: "gcash" }]);
    const r = await getSalesReport(owner, { month: "2026-11" });
    expect(r).toMatchObject({ invoiceCount: 3, gross: 5300, discounts: 260, vat: 480, total: 5520, collected: 3240, unpaid: 1720 });
    expect(r.byPayer.map((p) => p.label)).toEqual(["Self-pay", "Maxicare", "Senior citizen"]);
    expect(r.byMethod).toEqual([
      { label: "cash", value: 2240 },
      { label: "gcash", value: 1000 },
    ]);
    expect(r.invoices).toHaveLength(4);
    expect(r.invoices.find((i) => i.id === "i4")?.balance).toBe(0);
  });
});

describe("getLeadsReport", () => {
  it("works out the win rate and value by platform", async () => {
    mocks.repo.leadsCreated.mockResolvedValue([{ source: { name: "Facebook" } }, { source: { name: "Facebook" } }, { source: null }]);
    mocks.repo.leadsClosed.mockResolvedValue([
      { status: "won", wonValue: d(15000), closedReason: null, source: { name: "Facebook" }, assignedTo: { fullName: "Joy Ramirez" } },
      { status: "lost", wonValue: null, closedReason: "Price or budget", source: { name: "Facebook" }, assignedTo: { fullName: "Joy Ramirez" } },
      { status: "lost", wonValue: null, closedReason: "Price or budget", source: null, assignedTo: null },
    ]);
    const r = await getLeadsReport(owner, { month: "2026-11" });
    expect(r).toMatchObject({ received: 3, won: 1, lost: 2, winRate: 33.33, wonValue: 15000 });
    expect(r.bySource.find((s) => s.source === "Facebook")).toEqual({ source: "Facebook", received: 2, won: 1, lost: 1, value: 15000 });
    expect(r.byStaff).toContainEqual({ name: "Unassigned", won: 0, lost: 1 });
    expect(r.lostReasons).toEqual([{ label: "Price or budget", value: 2 }]);
  });

  it("has no win rate when nothing closed", async () => {
    expect((await getLeadsReport(owner, {})).winRate).toBeNull();
  });
});
