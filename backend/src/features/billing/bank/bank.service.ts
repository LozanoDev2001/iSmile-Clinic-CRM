import "server-only";
import { addDays, clinicDateOf, clinicInstant, clinicToday } from "@backend/config/clinic";
import { assertBillingTab } from "@backend/features/billing/billing.access";
import { round2 } from "@backend/features/billing/billing.calc";
import type { PaymentMethod } from "@backend/features/billing/billing.types";
import { assertPermission, can, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma } from "@backend/lib/prisma";
import { bankRepository, type MatchablePaymentRow } from "./bank.repository";
import { bankAccountInputSchema, depositInputSchema, matchInputSchema, transactionIdSchema } from "./bank.schema";
import type { BankAccountInput, CollectionsBoard, DepositInput, MatchablePayment, MatchInput } from "./bank.types";

const MS_PER_DAY = 86_400_000;
const SUGGEST_WITHIN_DAYS = 7;
const MAX_SUGGESTIONS = 5;

/** A @db.Date column holds the calendar day at UTC midnight. */
const toDateColumn = (date: string) => new Date(`${date}T00:00:00Z`);
const fromDateColumn = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / MS_PER_DAY;

function toMatchable(p: MatchablePaymentRow): MatchablePayment {
  const invoice = p.paymentAllocations[0]?.invoice;
  return {
    id: p.id,
    amount: p.amount.toNumber(),
    method: p.method as PaymentMethod,
    reference: p.reference,
    receivedAt: p.receivedAt,
    patientName: p.patient?.contact.fullName ?? null,
    invoiceId: invoice?.id ?? null,
    invoiceNumber: invoice?.number ?? null,
  };
}

/** Unmatched payments of the same amount received within a week of the deposit, closest first. */
function suggestionsFor(postedOn: string, amount: number, unseen: MatchablePayment[]) {
  return unseen
    .map((p) => ({ p, days: daysBetween(clinicDateOf(p.receivedAt), postedOn) }))
    .filter(({ p, days }) => p.amount === amount && days <= SUGGEST_WITHIN_DAYS)
    .sort((a, b) => a.days - b.days)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ p }) => p);
}

export async function getCollections(user: AuthUser): Promise<CollectionsBoard> {
  assertBillingTab(user, "collections");
  const today = clinicToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [totals, accounts, deposits, unmatchedDeposits, unseenRows] = await Promise.all([
    bankRepository.methodTotals(user.clinicId, clinicInstant(monthStart), clinicInstant(addDays(today, 1))),
    bankRepository.accounts(user.clinicId),
    bankRepository.recentDeposits(user.clinicId),
    bankRepository.unmatchedDepositTotals(user.clinicId),
    bankRepository.unseenPayments(user.clinicId),
  ]);

  const total = round2(totals.reduce((s, t) => s + (t._sum.amount?.toNumber() ?? 0), 0));
  const unseenPayments = unseenRows.map(toMatchable);
  return {
    monthStart,
    total,
    byMethod: totals
      .map((t) => {
        const amount = t._sum.amount?.toNumber() ?? 0;
        return { method: t.method as PaymentMethod, amount, count: t._count, share: total ? Math.round((amount / total) * 100) : 0 };
      })
      .sort((a, b) => b.amount - a.amount),
    accounts: accounts.map((a) => ({ id: a.id, label: a.label, lastFour: a.lastFour, deposits: a._count.bankTransactions })),
    deposits: deposits.map((d) => {
      const postedOn = fromDateColumn(d.postedOn);
      const amount = d.amount.toNumber();
      return {
        id: d.id,
        postedOn,
        amount,
        reference: d.reference,
        description: d.description,
        account: d.bankAccount,
        matched: d.matchedPayment ? toMatchable(d.matchedPayment) : null,
        suggestions: d.matchedPayment ? [] : suggestionsFor(postedOn, amount, unseenPayments),
      };
    }),
    unmatchedDeposits,
    unseenPayments,
    canEdit: can(user, "billing.update"),
  };
}

export async function addBankAccount(user: AuthUser, input: BankAccountInput): Promise<{ id: string }> {
  assertBillingTab(user, "collections");
  assertPermission(user, "billing.update");
  const data = bankAccountInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const created = await bankRepository.createAccount({ clinicId: user.clinicId, ...data }, tx);
    await audit({ action: AUDIT_ACTIONS.BANK_ACCOUNT_ADDED, resourceType: "bank_account", resourceId: created.id, actorId: user.id, clinicId: user.clinicId, metadata: { label: data.label } }, tx);
    return created;
  });
}

export async function addDeposit(user: AuthUser, input: DepositInput): Promise<{ id: string }> {
  assertBillingTab(user, "collections");
  assertPermission(user, "billing.update");
  const data = depositInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    if (!(await bankRepository.accountExists(user.clinicId, data.bankAccountId, tx))) throw Errors.validation({ bankAccountId: ["Choose an account from the list"] });
    const created = await bankRepository.createDeposit({ ...data, postedOn: toDateColumn(data.postedOn) }, tx);
    await audit(
      { action: AUDIT_ACTIONS.BANK_TRANSACTION_ADDED, resourceType: "bank_transaction", resourceId: created.id, actorId: user.id, clinicId: user.clinicId, metadata: { amount: data.amount, postedOn: data.postedOn } },
      tx,
    );
    return created;
  });
}

export async function matchDeposit(user: AuthUser, input: MatchInput): Promise<void> {
  assertBillingTab(user, "collections");
  assertPermission(user, "billing.update");
  const { transactionId, paymentId } = matchInputSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const deposit = await bankRepository.lockDeposit(user.clinicId, transactionId, tx);
    if (!deposit) throw Errors.notFound("deposit");
    if (deposit.matchedPaymentId) throw Errors.conflict("This deposit is already matched. Unmatch it first.");
    const payment = await bankRepository.lockMatchablePayment(user.clinicId, paymentId, tx);
    if (!payment) throw Errors.conflict("That payment can't be matched. It may be cash, cancelled, or already matched to another deposit.");
    await bankRepository.setMatch(transactionId, paymentId, tx);
    await audit(
      { action: AUDIT_ACTIONS.BANK_TRANSACTION_MATCHED, resourceType: "bank_transaction", resourceId: transactionId, actorId: user.id, clinicId: user.clinicId, metadata: { paymentId, deposit: deposit.amount.toNumber(), payment: payment.amount.toNumber() } },
      tx,
    );
  });
}

export async function unmatchDeposit(user: AuthUser, rawId: unknown): Promise<void> {
  assertBillingTab(user, "collections");
  assertPermission(user, "billing.update");
  const id = transactionIdSchema.parse(rawId);
  await prisma.$transaction(async (tx) => {
    const deposit = await bankRepository.lockDeposit(user.clinicId, id, tx);
    if (!deposit) throw Errors.notFound("deposit");
    if (!deposit.matchedPaymentId) throw Errors.conflict("This deposit isn't matched.");
    await bankRepository.setMatch(id, null, tx);
    await audit(
      { action: AUDIT_ACTIONS.BANK_TRANSACTION_UNMATCHED, resourceType: "bank_transaction", resourceId: id, actorId: user.id, clinicId: user.clinicId, before: { paymentId: deposit.matchedPaymentId } },
      tx,
    );
  });
}
