import "server-only";
import { clinicToday } from "@backend/config/clinic";
import { assertPermission, can, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma } from "@backend/lib/prisma";
import { assertBillingTab } from "../billing.access";
import { round2 } from "../billing.calc";
import { billingRepository, toSummary } from "../billing.repository";
import { paymentInputSchema } from "../billing.schema";
import { recordPaymentInTransaction } from "../billing.service";
import { addMonths, splitInstallments } from "./plans.calc";
import { PLAN_FILTERS, createPlanSchema, payInstallmentSchema, planIdSchema, plansQuerySchema } from "./plans.schema";
import { plansRepository, type PlanRow } from "./plans.repository";
import type { CreatePlanInput, Installment, InstallmentStatus, PayInstallmentInput, PlanDetail, PlanFilter, PlanStatus, PlansBoard } from "./plans.types";

const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

function toDetail(row: PlanRow, today: string): PlanDetail {
  const installments: Installment[] = row.paymentInstallments.map((i) => {
    const dueOn = i.dueOn.toISOString().slice(0, 10);
    const status = i.status as InstallmentStatus;
    return { id: i.id, dueOn, amount: i.amount.toNumber(), status, overdue: status === "due" && dueOn < today, paidAt: i.paidAt };
  });
  const counted = installments.filter((i) => i.status !== "cancelled");
  const paid = counted.filter((i) => i.status === "paid");
  const nextDue = counted.find((i) => i.status === "due") ?? null;
  const stored = row.status as "active" | "completed" | "cancelled";
  const status: PlanStatus = stored === "active" && installments.some((i) => i.overdue) ? "overdue" : stored;
  return {
    id: row.id,
    patient: { id: row.patient.id, name: row.patient.contact.fullName, patientNo: row.patient.patientNo },
    invoice: row.invoice,
    status,
    total: round2(counted.reduce((s, i) => s + i.amount, 0)),
    paidAmount: round2(paid.reduce((s, i) => s + i.amount, 0)),
    monthly: counted[0]?.amount ?? 0,
    installmentsPaid: paid.length,
    installmentsTotal: counted.length,
    nextDue,
    createdAt: row.createdAt,
    installments,
  };
}

const matches = (filter: PlanFilter, status: PlanStatus) => filter === "all" || (filter === "active" ? status === "active" || status === "overdue" : status === filter);

export async function getPlansBoard(user: AuthUser, rawQuery: unknown): Promise<PlansBoard> {
  assertBillingTab(user, "payment_plans");
  const { status: filter, plan } = plansQuerySchema.parse(rawQuery);
  const today = clinicToday();
  const canEdit = can(user, "billing.update");
  const [rows, unpaid, planned] = await Promise.all([
    plansRepository.list(user.clinicId),
    canEdit ? billingRepository.unpaid(user.clinicId) : Promise.resolve([]),
    canEdit ? plansRepository.activeInvoiceIds(user.clinicId) : Promise.resolve(new Set<string | null>()),
  ]);
  const details = rows.map((r) => toDetail(r, today));
  const counts = Object.fromEntries(PLAN_FILTERS.map((f) => [f, details.filter((d) => matches(f, d.status)).length])) as Record<PlanFilter, number>;
  const visible = details.filter((d) => matches(filter, d.status));
  return {
    filter,
    plans: visible,
    counts,
    selected: details.find((d) => d.id === plan) ?? visible[0] ?? null,
    eligibleInvoices: unpaid.filter((i) => !planned.has(i.id)),
  };
}

export async function createPlan(user: AuthUser, input: CreatePlanInput): Promise<{ id: string }> {
  assertBillingTab(user, "payment_plans");
  assertPermission(user, "billing.update");
  const { invoiceId, installments, firstDueOn } = createPlanSchema.parse(input);
  if (firstDueOn < clinicToday()) throw Errors.validation({ firstDueOn: ["The first payment can't be due in the past."] });

  return prisma.$transaction(async (tx) => {
    await billingRepository.lock(invoiceId, tx);
    const row = await billingRepository.findSummary(user.clinicId, invoiceId, tx);
    if (!row) throw Errors.notFound("invoice");
    const invoice = toSummary(row);
    if (invoice.status === "void") throw Errors.conflict("This invoice is cancelled.");
    if (invoice.balance <= 0) throw Errors.conflict("This invoice has nothing left to pay.");
    if (await plansRepository.activeForInvoice(invoiceId, tx)) throw Errors.conflict("This invoice already has an active payment plan.");

    const amounts = splitInstallments(invoice.balance, installments);
    if (!amounts) throw Errors.validation({ installments: ["The balance is too small to split into that many payments."] });
    const created = await plansRepository.create(
      { clinicId: user.clinicId, patientId: invoice.patient.id, invoiceId, installments: amounts.map((amount, i) => ({ dueOn: asDate(addMonths(firstDueOn, i)), amount })) },
      tx,
    );
    await audit(
      { action: AUDIT_ACTIONS.PAYMENT_PLAN_CREATED, resourceType: "payment_plan", resourceId: created.id, actorId: user.id, clinicId: user.clinicId, metadata: { invoiceId, installments, total: invoice.balance } },
      tx,
    );
    return created;
  });
}

/** Pays the plan's next due installment through a normal invoice payment, all in one transaction. */
export async function payInstallment(user: AuthUser, input: PayInstallmentInput): Promise<void> {
  assertBillingTab(user, "payment_plans");
  assertPermission(user, "billing.update");
  const { installmentId, method, reference } = payInstallmentSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const found = await plansRepository.findInstallment(user.clinicId, installmentId, tx);
    if (!found?.plan.invoiceId) throw Errors.notFound("installment");
    const invoiceId = found.plan.invoiceId;
    await billingRepository.lock(invoiceId, tx);

    const plan = await plansRepository.find(user.clinicId, found.planId, tx);
    if (!plan || plan.status !== "active") throw Errors.conflict("This payment plan is no longer active.");
    const next = plan.paymentInstallments.find((i) => i.status === "due");
    if (next?.id !== installmentId) throw Errors.conflict("Record the earliest unpaid installment first.");

    const payment = paymentInputSchema.parse({ amount: next.amount.toNumber(), method, reference });
    const { invoice, paymentId } = await recordPaymentInTransaction(user, invoiceId, payment, tx);
    await plansRepository.markPaid(installmentId, paymentId, tx);

    const remaining = plan.paymentInstallments.filter((i) => i.status === "due" && i.id !== installmentId).length;
    if (remaining === 0 || invoice.balance <= 0) {
      // A balance paid off outside the plan leaves nothing for the remaining installments.
      await plansRepository.cancelRemaining(plan.id, tx);
      await plansRepository.setStatus(plan.id, "completed", tx);
    }
    await audit(
      { action: AUDIT_ACTIONS.INSTALLMENT_PAID, resourceType: "payment_plan", resourceId: plan.id, actorId: user.id, clinicId: user.clinicId, metadata: { installmentId, amount: payment.amount, method } },
      tx,
    );
  });
}

/** Stops a plan; paid installments stay, unpaid ones are cancelled. The invoice balance is unchanged. */
export async function cancelPlan(user: AuthUser, rawId: unknown): Promise<void> {
  assertBillingTab(user, "payment_plans");
  assertPermission(user, "billing.update");
  const id = planIdSchema.parse(rawId);
  await prisma.$transaction(async (tx) => {
    const plan = await plansRepository.find(user.clinicId, id, tx);
    if (!plan) throw Errors.notFound("payment plan");
    if (plan.status !== "active") throw Errors.conflict("Only active plans can be cancelled.");
    await plansRepository.cancelRemaining(id, tx);
    await plansRepository.setStatus(id, "cancelled", tx);
    await audit({ action: AUDIT_ACTIONS.PAYMENT_PLAN_CANCELLED, resourceType: "payment_plan", resourceId: id, actorId: user.id, clinicId: user.clinicId }, tx);
  });
}
