import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@backend/generated/prisma/client";
import { CLINIC_A, makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  bank: {
    methodTotals: vi.fn(),
    accounts: vi.fn(),
    createAccount: vi.fn(),
    accountExists: vi.fn(),
    createDeposit: vi.fn(),
    recentDeposits: vi.fn(),
    unmatchedDepositTotals: vi.fn(),
    unseenPayments: vi.fn(),
    lockDeposit: vi.fn(),
    lockMatchablePayment: vi.fn(),
    setMatch: vi.fn(),
  },
  audit: vi.fn(),
}));

vi.mock("@backend/features/billing/bank/bank.repository", () => ({ bankRepository: mocks.bank }));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));
vi.mock("@backend/lib/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) } }));

const { addBankAccount, addDeposit, getCollections, matchDeposit, unmatchDeposit } = await import("@backend/features/billing/bank/bank.service");

const ACCOUNT_ID = "00000000-0000-4000-8000-b00000000001";
const DEPOSIT_ID = "00000000-0000-4000-8000-b00000000002";
const PAYMENT_ID = "00000000-0000-4000-8000-b00000000003";
const dec = (n: number) => new Prisma.Decimal(n);
const accounts = makeUser("ACCOUNTS");
const frontDesk = makeUser("FRONT_DESK");

const paymentRow = (id: string, amount: number, receivedAt: string) => ({
  id,
  amount: dec(amount),
  method: "gcash",
  reference: "REF",
  receivedAt: new Date(receivedAt),
  patient: { contact: { fullName: "Maria Lopez" } },
  paymentAllocations: [{ invoice: { id: "inv-1", number: "SI-0000001" } }],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bank.methodTotals.mockResolvedValue([
    { method: "gcash", _sum: { amount: dec(3000) }, _count: 2 },
    { method: "cash", _sum: { amount: dec(1000) }, _count: 1 },
  ]);
  mocks.bank.accounts.mockResolvedValue([{ id: ACCOUNT_ID, label: "BDO", lastFour: "1234", _count: { bankTransactions: 1 } }]);
  mocks.bank.recentDeposits.mockResolvedValue([
    { id: DEPOSIT_ID, postedOn: new Date("2026-11-10T00:00:00Z"), amount: dec(1500), reference: null, description: null, bankAccount: { id: ACCOUNT_ID, label: "BDO", lastFour: "1234" }, matchedPayment: null },
  ]);
  mocks.bank.unmatchedDepositTotals.mockResolvedValue({ count: 1, amount: 1500 });
  mocks.bank.unseenPayments.mockResolvedValue([paymentRow("near", 1500, "2026-11-09T02:00:00Z"), paymentRow("far", 1500, "2026-10-01T02:00:00Z"), paymentRow("other", 900, "2026-11-10T02:00:00Z")]);
  mocks.bank.createAccount.mockResolvedValue({ id: ACCOUNT_ID });
  mocks.bank.createDeposit.mockResolvedValue({ id: DEPOSIT_ID });
  mocks.bank.accountExists.mockResolvedValue(1);
  mocks.bank.lockDeposit.mockResolvedValue({ id: DEPOSIT_ID, amount: dec(1500), matchedPaymentId: null });
  mocks.bank.lockMatchablePayment.mockResolvedValue({ id: PAYMENT_ID, amount: dec(1500) });
});

describe("getCollections", () => {
  it("totals the month by method and suggests same-amount payments within a week", async () => {
    const board = await getCollections(accounts);
    expect(board.total).toBe(4000);
    expect(board.byMethod).toEqual([
      { method: "gcash", amount: 3000, count: 2, share: 75 },
      { method: "cash", amount: 1000, count: 1, share: 25 },
    ]);
    expect(board.deposits[0].suggestions.map((s) => s.id)).toEqual(["near"]);
    expect(mocks.bank.recentDeposits).toHaveBeenCalledWith(CLINIC_A);
  });

  it("is closed to staff without the Collections tab", async () => {
    await expect(getCollections(frontDesk)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("bank accounts and deposits", () => {
  it("adds an account to the user's clinic", async () => {
    await addBankAccount(accounts, { label: "BDO Savings", lastFour: "1234" });
    expect(mocks.bank.createAccount).toHaveBeenCalledWith({ clinicId: CLINIC_A, label: "BDO Savings", lastFour: "1234" }, expect.anything());
  });

  it("rejects last four digits that aren't 4 digits", async () => {
    await expect(addBankAccount(accounts, { label: "BDO", lastFour: "12a" })).rejects.toThrow();
    expect(mocks.bank.createAccount).not.toHaveBeenCalled();
  });

  it("refuses a deposit into another clinic's account", async () => {
    mocks.bank.accountExists.mockResolvedValue(0);
    await expect(addDeposit(accounts, { bankAccountId: ACCOUNT_ID, postedOn: "2026-11-01", amount: 500 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.bank.accountExists).toHaveBeenCalledWith(CLINIC_A, ACCOUNT_ID, expect.anything());
    expect(mocks.bank.createDeposit).not.toHaveBeenCalled();
  });

  it("rejects a future date and a zero amount", async () => {
    await expect(addDeposit(accounts, { bankAccountId: ACCOUNT_ID, postedOn: "2999-01-01", amount: 500 })).rejects.toThrow();
    await expect(addDeposit(accounts, { bankAccountId: ACCOUNT_ID, postedOn: "2026-11-01", amount: 0 })).rejects.toThrow();
    expect(mocks.bank.createDeposit).not.toHaveBeenCalled();
  });

  it("stores the posted date as a calendar day", async () => {
    await addDeposit(accounts, { bankAccountId: ACCOUNT_ID, postedOn: "2026-11-01", amount: 500, reference: "TRF-1" });
    expect(mocks.bank.createDeposit).toHaveBeenCalledWith(expect.objectContaining({ postedOn: new Date("2026-11-01T00:00:00Z"), amount: 500, reference: "TRF-1" }), expect.anything());
  });
});

describe("matching", () => {
  it("matches a deposit to a payment, both locked within the clinic", async () => {
    await matchDeposit(accounts, { transactionId: DEPOSIT_ID, paymentId: PAYMENT_ID });
    expect(mocks.bank.lockDeposit).toHaveBeenCalledWith(CLINIC_A, DEPOSIT_ID, expect.anything());
    expect(mocks.bank.lockMatchablePayment).toHaveBeenCalledWith(CLINIC_A, PAYMENT_ID, expect.anything());
    expect(mocks.bank.setMatch).toHaveBeenCalledWith(DEPOSIT_ID, PAYMENT_ID, expect.anything());
  });

  it("refuses a deposit that is already matched", async () => {
    mocks.bank.lockDeposit.mockResolvedValue({ id: DEPOSIT_ID, amount: dec(1500), matchedPaymentId: "x" });
    await expect(matchDeposit(accounts, { transactionId: DEPOSIT_ID, paymentId: PAYMENT_ID })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.bank.setMatch).not.toHaveBeenCalled();
  });

  it("refuses a payment that can't be matched", async () => {
    mocks.bank.lockMatchablePayment.mockResolvedValue(null);
    await expect(matchDeposit(accounts, { transactionId: DEPOSIT_ID, paymentId: PAYMENT_ID })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.bank.setMatch).not.toHaveBeenCalled();
  });

  it("treats another clinic's deposit as not found", async () => {
    mocks.bank.lockDeposit.mockResolvedValue(null);
    await expect(unmatchDeposit(accounts, DEPOSIT_ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("unmatches a matched deposit", async () => {
    mocks.bank.lockDeposit.mockResolvedValue({ id: DEPOSIT_ID, amount: dec(1500), matchedPaymentId: PAYMENT_ID });
    await unmatchDeposit(accounts, DEPOSIT_ID);
    expect(mocks.bank.setMatch).toHaveBeenCalledWith(DEPOSIT_ID, null, expect.anything());
  });

  it("needs billing update rights to change anything", async () => {
    const viewer = makeUser("ACCOUNTS", { permissions: ["billing.read"] });
    await expect(matchDeposit(viewer, { transactionId: DEPOSIT_ID, paymentId: PAYMENT_ID })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
