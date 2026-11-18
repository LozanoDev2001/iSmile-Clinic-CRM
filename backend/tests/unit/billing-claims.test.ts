import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@backend/generated/prisma/client";
import { CLINIC_A, makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  claims: { list: vi.fn(), statusCounts: vi.fn(), totals: vi.fn(), findForUpdate: vi.fn(), update: vi.fn() },
  audit: vi.fn(),
}));

vi.mock("@backend/features/billing/claims/claims.repository", () => ({ claimsRepository: mocks.claims }));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));
vi.mock("@backend/lib/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) } }));

const { getClaimsBoard, updateClaim } = await import("@backend/features/billing/claims/claims.service");

const CLAIM_ID = "00000000-0000-4000-8000-c10000000001";
const accounts = makeUser("ACCOUNTS");
const owner = makeUser("OWNER");
const frontDesk = makeUser("FRONT_DESK");

const record = (patch: Record<string, unknown> = {}) => ({
  id: CLAIM_ID,
  status: "submitted",
  loaNo: "LOA-1",
  approvedAmount: new Prisma.Decimal(4000),
  paidAmount: null,
  paidAt: null,
  paymentRef: null,
  deniedReason: null,
  submittedAt: new Date("2026-10-01T02:00:00Z"),
  payer: { name: "Maxicare" },
  invoice: { id: "inv-1", number: "SI-0000001", hmoDue: new Prisma.Decimal(4000), patient: { patientNo: "P-0001", contact: { fullName: "Maria Lopez" } } },
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claims.findForUpdate.mockResolvedValue(record());
  mocks.claims.update.mockImplementation((_id: string, data: Record<string, unknown>) =>
    Promise.resolve(record({ ...data, approvedAmount: new Prisma.Decimal(Number(data.approvedAmount ?? 4000)), paidAmount: data.paidAmount ? new Prisma.Decimal(Number(data.paidAmount)) : null })),
  );
});

describe("getClaimsBoard", () => {
  it("counts claims per status and defaults to submitted", async () => {
    mocks.claims.list.mockResolvedValue({ rows: [record()], truncated: false });
    mocks.claims.statusCounts.mockResolvedValue([
      { status: "submitted", _count: 2 },
      { status: "paid", _count: 3 },
      { status: "cancelled", _count: 1 },
    ]);
    mocks.claims.totals.mockResolvedValue({ awaitingApproval: 8000, approvedUnpaid: 0, paidThisMonth: 1500 });
    const board = await getClaimsBoard(accounts, {});
    expect(mocks.claims.list).toHaveBeenCalledWith(CLINIC_A, "submitted");
    expect(board.counts).toEqual({ submitted: 2, approved: 0, paid: 3, denied: 0, all: 6 });
    expect(board.claims[0]).toMatchObject({ claimed: 4000, approved: 4000, payerName: "Maxicare", patient: { name: "Maria Lopez" } });
    expect(board.claims[0].ageDays).toBeGreaterThan(0);
  });

  it("is closed to staff without the HMO tab", async () => {
    await expect(getClaimsBoard(frontDesk, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("updateClaim", () => {
  it("approves up to the HMO share and audits the change", async () => {
    await updateClaim(accounts, CLAIM_ID, { type: "approve", amount: 3500 });
    expect(mocks.claims.findForUpdate).toHaveBeenCalledWith(CLINIC_A, CLAIM_ID, expect.anything());
    expect(mocks.claims.update).toHaveBeenCalledWith(CLAIM_ID, { status: "approved", approvedAmount: 3500 }, expect.anything());
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "claim.updated", before: { status: "submitted" } }), expect.anything());
  });

  it("rejects approving more than was claimed", async () => {
    await expect(updateClaim(accounts, CLAIM_ID, { type: "approve", amount: 4000.01 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.claims.update).not.toHaveBeenCalled();
  });

  it("records an HMO payment against the approved amount", async () => {
    mocks.claims.findForUpdate.mockResolvedValue(record({ status: "approved", approvedAmount: new Prisma.Decimal(3500) }));
    await updateClaim(owner, CLAIM_ID, { type: "pay", amount: 3325, paidOn: "2026-10-20", reference: "CHK-881" });
    expect(mocks.claims.update).toHaveBeenCalledWith(CLAIM_ID, expect.objectContaining({ status: "paid", paidAmount: 3325, paymentRef: "CHK-881", paidAt: expect.any(Date) }), expect.anything());
  });

  it("rejects payments above the approved amount or dated in the future", async () => {
    mocks.claims.findForUpdate.mockResolvedValue(record({ status: "approved", approvedAmount: new Prisma.Decimal(3500) }));
    await expect(updateClaim(owner, CLAIM_ID, { type: "pay", amount: 3600, paidOn: "2026-10-20", reference: "X" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(updateClaim(owner, CLAIM_ID, { type: "pay", amount: 100, paidOn: "2999-01-01", reference: "X" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(updateClaim(owner, CLAIM_ID, { type: "pay", amount: 100, paidOn: "2026-10-20", reference: " " })).rejects.toThrow();
  });

  it("denies with a reason from the list only", async () => {
    await updateClaim(accounts, CLAIM_ID, { type: "deny", reason: "Benefit limit reached" });
    expect(mocks.claims.update).toHaveBeenCalledWith(CLAIM_ID, { status: "denied", deniedReason: "Benefit limit reached" }, expect.anything());
    await expect(updateClaim(accounts, CLAIM_ID, { type: "deny", reason: "Because" as "Duplicate claim" })).rejects.toThrow();
  });

  it("blocks moves that skip or reverse the pipeline", async () => {
    mocks.claims.findForUpdate.mockResolvedValue(record({ status: "approved" }));
    await expect(updateClaim(accounts, CLAIM_ID, { type: "approve", amount: 100 })).rejects.toMatchObject({ code: "CONFLICT" });
    for (const status of ["paid", "denied", "cancelled"]) {
      mocks.claims.findForUpdate.mockResolvedValue(record({ status }));
      await expect(updateClaim(accounts, CLAIM_ID, { type: "deny", reason: "Duplicate claim" })).rejects.toMatchObject({ code: "CONFLICT" });
    }
    expect(mocks.claims.update).not.toHaveBeenCalled();
  });

  it("treats claims from another clinic as not found", async () => {
    mocks.claims.findForUpdate.mockResolvedValue(null);
    await expect(updateClaim(accounts, CLAIM_ID, { type: "approve", amount: 100 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("needs billing update rights and the HMO tab", async () => {
    await expect(updateClaim(frontDesk, CLAIM_ID, { type: "approve", amount: 100 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const viewer = makeUser("ACCOUNTS", { permissions: ["billing.read"] });
    await expect(updateClaim(viewer, CLAIM_ID, { type: "approve", amount: 100 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.claims.findForUpdate).not.toHaveBeenCalled();
  });
});
