import "server-only";
import { addDays, clinicInstant, clinicToday } from "@backend/config/clinic";
import { appointmentIdSchema } from "@backend/features/appointments/appointment.schema";
import { appointmentsRepository } from "@backend/features/appointments/appointments.repository";
import { catalogRepository } from "@backend/features/catalog/catalog.repository";
import { patientIdSchema } from "@backend/features/patients/patient.schema";
import { patientsRepository } from "@backend/features/patients/patients.repository";
import { settingsRepository } from "@backend/features/settings/settings.repository";
import { clinicProfileFrom, type ClinicProfile } from "@backend/features/settings/settings.types";
import { Prisma } from "@backend/generated/prisma/client";
import { assertPermission, can, recordScope, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import { calculateInvoice, round2, type InvoiceTotals } from "./billing.calc";
import { billingRepository, toSummary, type InvoiceDetailRow } from "./billing.repository";
import { checkoutSchema, invoiceIdSchema, listInvoicesQuerySchema, paymentInputSchema, voidDecisionSchema, voidReasonSchema } from "./billing.schema";
import type {
  BillingOverview,
  CheckoutContext,
  CheckoutInput,
  InvoiceDetail,
  InvoiceStatus,
  InvoiceSummary,
  PatientBilling,
  PaymentInput,
  PaymentMethod,
} from "./billing.types";

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

function statusFor(patientDue: number, paid: number): InvoiceStatus {
  if (paid >= patientDue) return "paid";
  return paid > 0 ? "part_paid" : "issued";
}

async function isVatRegistered(clinicId: string, tx: TransactionClient = prisma) {
  const clinic = await settingsRepository.findClinicSettings(clinicId, tx);
  if (!clinic) throw Errors.notFound("clinic");
  return clinicProfileFrom(clinic.name, clinic.settings).vatRegistered;
}

function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const today = clinicToday();
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** A completed visit in the user's scope that hasn't been invoiced yet. */
async function invoiceableVisit(user: AuthUser, appointmentId: string, tx: TransactionClient = prisma) {
  const visit = await appointmentsRepository.findById(recordScope(user), appointmentId, tx);
  if (!visit) throw Errors.notFound("appointment");
  if (visit.status !== "completed") throw Errors.conflict("Finish the visit in the calendar before invoicing it.");
  const existing = await billingRepository.activeForAppointment(appointmentId, tx);
  if (existing) throw Errors.conflict(`This visit is already on invoice ${existing.number}.`);
  return visit;
}

export async function getCheckoutContext(user: AuthUser, query: { patientId?: string; appointmentId?: string }): Promise<CheckoutContext> {
  assertPermission(user, "billing.create");
  const visit = query.appointmentId ? await invoiceableVisit(user, appointmentIdSchema.parse(query.appointmentId)) : null;
  const patientId = visit?.patientId ?? patientIdSchema.parse(query.patientId);
  const [patient, services, vatRegistered] = await Promise.all([
    patientsRepository.findFile(recordScope(user), patientId, false, new Date()),
    catalogRepository.listActive(user.clinicId),
    isVatRegistered(user.clinicId),
  ]);
  if (!patient) throw Errors.notFound("patient");
  const dob = patient.dob ? patient.dob.toISOString().slice(0, 10) : null;
  return {
    patient: { id: patient.id, name: patient.contact.fullName, patientNo: patient.patientNo, payer: patient.payer, scPwdId: patient.scPwdId, age: ageFrom(dob) },
    appointment: visit && { id: visit.id, startsAt: visit.startsAt, dentistName: visit.dentist?.fullName ?? null, serviceId: visit.service?.id ?? null },
    services: services.map((s) => ({ id: s.id, name: s.name, price: s.price.toNumber(), kind: s.kind === "product" ? "product" : "service", hmoCoverable: s.hmoCoverable })),
    vatRegistered,
  };
}

const lineTaxType = (totals: InvoiceTotals) => (totals.vat > 0 ? "vat" : totals.vatExemptSales > 0 ? "exempt" : "non_vat");

export async function checkout(user: AuthUser, input: CheckoutInput): Promise<{ id: string; number: string }> {
  assertPermission(user, "billing.create");
  const data = checkoutSchema.parse(input);

  const attempt = () =>
    prisma.$transaction(async (tx) => {
      const patient = await patientsRepository.exists(recordScope(user), data.patientId, tx);
      if (!patient) throw Errors.validation({ patientId: ["Choose a patient from the list"] });
      if (data.hmo && !patient.payerId) throw Errors.validation({ hmo: ["Add the patient's HMO in their profile first."] }, "Add the patient's HMO in their profile first.");

      const visit = data.appointmentId ? await lockVisit(user, data.appointmentId, tx) : null;
      if (visit && visit.patientId !== data.patientId) throw Errors.validation({ appointmentId: ["This visit belongs to another patient."] });

      const ids = [...new Set(data.lines.map((l) => l.serviceId))];
      const services = new Map((await catalogRepository.findActiveByIds(user.clinicId, ids, tx)).map((s) => [s.id, s]));
      if (services.size !== ids.length) throw Errors.validation({ lines: ["A service is no longer on the price list. Remove it and add it again."] });

      const priced = data.lines.flatMap((l) => {
        const service = services.get(l.serviceId);
        return service ? [{ ...l, service, unitPrice: service.price.toNumber() }] : [];
      });
      const totals = calculateInvoice({
        lines: priced.map((l) => ({ unitPrice: l.unitPrice, qty: l.qty, hmoCoverable: l.service.hmoCoverable })),
        discountType: data.discountType,
        hmo: data.hmo,
        vatRegistered: await isVatRegistered(user.clinicId, tx),
      });
      const paid = data.payment?.amount ?? 0;
      if (paid > totals.patientDue) throw Errors.validation({ payment: [`The patient owes ${totals.patientDue.toFixed(2)}; take that amount or less.`] }, "The payment is more than the patient owes.");

      const number = `SI-${String((await billingRepository.maxInvoiceNumber(user.clinicId, tx)) + 1).padStart(7, "0")}`;
      const taxType = lineTaxType(totals);
      const invoice = await billingRepository.createInvoice(
        user.clinicId,
        {
          patientId: data.patientId,
          payerId: data.hmo ? patient.payerId : null,
          appointmentId: visit?.id ?? null,
          number,
          status: statusFor(totals.patientDue, paid),
          discountType: data.discountType,
          discountIdNo: data.discountType === "none" ? null : data.discountIdNo,
          totals,
          createdById: user.id,
          items: priced.map((l, i) => ({
            serviceId: l.serviceId,
            description: l.toothCode ? `${l.service.name}, tooth ${l.toothCode}` : l.service.name,
            qty: l.qty,
            unitPrice: l.unitPrice,
            taxType,
            amount: totals.lines[i].amount,
            discount: totals.lines[i].discount,
          })),
        },
        tx,
      );
      if (totals.hmoDue > 0 && patient.payerId && data.loaNo) {
        await billingRepository.createClaim({ clinicId: user.clinicId, invoiceId: invoice.id, payerId: patient.payerId, loaNo: data.loaNo, amount: totals.hmoDue }, tx);
      }
      if (data.payment) {
        await billingRepository.createPayment(
          { clinicId: user.clinicId, patientId: data.patientId, invoiceId: invoice.id, amount: data.payment.amount, method: data.payment.method, reference: data.payment.reference, recordedById: user.id },
          tx,
        );
      }
      if (visit) {
        const encounter = await billingRepository.findEncounter(visit.id, tx);
        const treatments = priced.filter((l) => l.service.kind === "service");
        if (encounter && treatments.length) {
          await billingRepository.recordTreatments(
            { clinicId: user.clinicId, patientId: data.patientId, dentistId: visit.dentistId, encounterId: encounter.id, items: treatments.map((l) => ({ serviceId: l.serviceId, toothCode: l.toothCode, qty: l.qty, unitPrice: l.unitPrice })) },
            tx,
          );
        }
      }
      await audit(
        { action: AUDIT_ACTIONS.INVOICE_ISSUED, resourceType: "invoice", resourceId: invoice.id, actorId: user.id, clinicId: user.clinicId, metadata: { number, total: totals.total, hmoDue: totals.hmoDue, paid } },
        tx,
      );
      return { id: invoice.id, number };
    });

  // Two invoices issued at the same moment can pick the same number; the unique index catches it.
  try {
    return await attempt();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return attempt();
  }
}

/** Locks the visit's row while it is invoiced, so it can't be invoiced twice. */
async function lockVisit(user: AuthUser, appointmentId: string, tx: TransactionClient) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM appointments WHERE id = ${appointmentId} FOR UPDATE`);
  return invoiceableVisit(user, appointmentId, tx);
}

function toDetail(row: InvoiceDetailRow): InvoiceDetail {
  const pending = row.invoiceVoidRequests[0];
  return {
    ...toSummary(row),
    lines: row.invoiceItems.map((i) => ({ description: i.description, qty: i.qty.toNumber(), unitPrice: i.unitPrice.toNumber(), amount: i.lineTotal.toNumber(), discount: i.discount.toNumber() })),
    payments: row.paymentAllocations.map(({ payment: p }) => ({
      id: p.id,
      amount: p.amount.toNumber(),
      method: p.method,
      reference: p.reference,
      receivedAt: p.receivedAt,
      status: p.status,
      recordedBy: p.recordedBy?.fullName ?? null,
    })),
    subtotal: row.subtotal.toNumber(),
    discountTotal: row.discountTotal.toNumber(),
    discountIdNo: row.discountIdNo,
    vatableSales: row.vatableSales.toNumber(),
    vatExemptSales: row.vatExemptSales.toNumber(),
    vat: row.taxTotal.toNumber(),
    loaNo: row.claims[0]?.loaNo ?? null,
    dentistName: row.appointment?.dentist?.fullName ?? null,
    appointmentId: row.appointmentId,
    createdBy: row.createdBy?.fullName ?? null,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt,
    pendingVoid: pending ? { id: pending.id, reason: pending.reason, requestedBy: pending.requestedBy.fullName, createdAt: pending.createdAt } : null,
  };
}

/** The clinic details printed on invoices, for anyone who can see billing. */
export async function getInvoiceClinic(user: AuthUser): Promise<ClinicProfile> {
  assertPermission(user, "billing.read");
  const clinic = await settingsRepository.findClinicSettings(user.clinicId);
  if (!clinic) throw Errors.notFound("clinic");
  return clinicProfileFrom(clinic.name, clinic.settings);
}

export async function getInvoice(user: AuthUser, rawId: unknown): Promise<InvoiceDetail> {
  assertPermission(user, "billing.read");
  const row = await billingRepository.findDetail(user.clinicId, invoiceIdSchema.parse(rawId));
  if (!row) throw Errors.notFound("invoice");
  return toDetail(row);
}

export async function listInvoices(user: AuthUser, rawQuery: unknown) {
  assertPermission(user, "billing.read");
  return billingRepository.list(user.clinicId, listInvoicesQuerySchema.parse(rawQuery));
}

export async function recordPayment(user: AuthUser, rawId: unknown, input: PaymentInput): Promise<InvoiceSummary> {
  assertPermission(user, "billing.update");
  const id = invoiceIdSchema.parse(rawId);
  const payment = paymentInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await billingRepository.lock(id, tx);
    const row = await billingRepository.findSummary(user.clinicId, id, tx);
    if (!row) throw Errors.notFound("invoice");
    const invoice = toSummary(row);
    if (invoice.status === "void") throw Errors.conflict("This invoice is cancelled.");
    if (payment.amount > invoice.balance) throw Errors.validation({ amount: [`The balance is ${invoice.balance.toFixed(2)}; take that amount or less.`] });
    await billingRepository.createPayment(
      { clinicId: user.clinicId, patientId: invoice.patient.id, invoiceId: id, amount: payment.amount, method: payment.method as PaymentMethod, reference: payment.reference, recordedById: user.id },
      tx,
    );
    const paid = round2(invoice.paid + payment.amount);
    const status = statusFor(invoice.patientDue, paid);
    await billingRepository.setStatus(id, status, tx);
    await audit(
      { action: AUDIT_ACTIONS.PAYMENT_RECORDED, resourceType: "invoice", resourceId: id, actorId: user.id, clinicId: user.clinicId, metadata: { amount: payment.amount, method: payment.method } },
      tx,
    );
    return { ...invoice, paid, balance: round2(invoice.patientDue - paid), status };
  });
}

/** Approvers cancel straight away; everyone else with billing access sends a request. */
export async function cancelInvoice(user: AuthUser, rawId: unknown, input: unknown): Promise<{ voided: boolean }> {
  assertPermission(user, "billing.update");
  const id = invoiceIdSchema.parse(rawId);
  const { reason } = voidReasonSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await billingRepository.lock(id, tx);
    const row = await billingRepository.findSummary(user.clinicId, id, tx);
    if (!row) throw Errors.notFound("invoice");
    if (row.status === "void") throw Errors.conflict("This invoice is already cancelled.");
    const entry = { resourceType: "invoice", resourceId: id, actorId: user.id, clinicId: user.clinicId, metadata: { number: row.number, reason } };

    if (can(user, "billing.approve")) {
      await billingRepository.voidInvoice(id, reason, tx);
      await billingRepository.decideVoidRequests(id, "approved", user.id, tx);
      await audit({ ...entry, action: AUDIT_ACTIONS.INVOICE_VOIDED }, tx);
      return { voided: true };
    }
    if (await billingRepository.pendingVoidRequest(id, tx)) throw Errors.conflict("A cancellation request for this invoice is already waiting.");
    await billingRepository.createVoidRequest({ clinicId: user.clinicId, invoiceId: id, requestedById: user.id, reason }, tx);
    await audit({ ...entry, action: AUDIT_ACTIONS.INVOICE_VOID_REQUESTED }, tx);
    return { voided: false };
  });
}

export async function decideVoidRequest(user: AuthUser, rawId: unknown, input: unknown): Promise<void> {
  assertPermission(user, "billing.approve");
  const id = invoiceIdSchema.parse(rawId);
  const { approve } = voidDecisionSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    await billingRepository.lock(id, tx);
    const pending = await billingRepository.pendingVoidRequest(id, tx);
    const row = await billingRepository.findSummary(user.clinicId, id, tx);
    if (!row || !pending) throw Errors.notFound("cancellation request");
    const entry = { resourceType: "invoice", resourceId: id, actorId: user.id, clinicId: user.clinicId, metadata: { number: row.number, reason: pending.reason } };
    if (approve) {
      await billingRepository.voidInvoice(id, pending.reason, tx);
      await billingRepository.decideVoidRequests(id, "approved", user.id, tx);
      await audit({ ...entry, action: AUDIT_ACTIONS.INVOICE_VOIDED }, tx);
      return;
    }
    await billingRepository.decideVoidRequests(id, "declined", user.id, tx);
    await audit({ ...entry, action: AUDIT_ACTIONS.INVOICE_VOID_DECLINED }, tx);
  });
}

export async function getBillingOverview(user: AuthUser): Promise<BillingOverview> {
  assertPermission(user, "billing.read");
  const today = clinicToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [collectedToday, collectedThisMonth, unpaid, hmoPending, payments, voids] = await Promise.all([
    billingRepository.collected(user.clinicId, clinicInstant(today), clinicInstant(addDays(today, 1))),
    billingRepository.collected(user.clinicId, clinicInstant(monthStart), clinicInstant(addDays(today, 1))),
    billingRepository.unpaid(user.clinicId),
    billingRepository.hmoPending(user.clinicId),
    billingRepository.latestPayments(user.clinicId),
    can(user, "billing.approve") ? billingRepository.pendingVoids(user.clinicId) : Promise.resolve([]),
  ]);
  return {
    collectedToday,
    collectedThisMonth,
    unpaidBalance: round2(unpaid.reduce((s, i) => s + i.balance, 0)),
    hmoPending,
    unpaid,
    latestPayments: payments.map((p) => ({
      id: p.id,
      amount: p.amount.toNumber(),
      method: p.method,
      reference: p.reference,
      receivedAt: p.receivedAt,
      status: p.status,
      recordedBy: p.recordedBy?.fullName ?? null,
      patientName: p.patient?.contact.fullName ?? null,
      invoiceId: p.paymentAllocations[0]?.invoice.id ?? null,
      invoiceNumber: p.paymentAllocations[0]?.invoice.number ?? null,
    })),
    pendingVoids: voids.map((v) => ({ id: v.id, reason: v.reason, createdAt: v.createdAt, requestedBy: v.requestedBy.fullName, invoice: toSummary(v.invoice) })),
  };
}

/** Totals for the patient file; null when the user can't see billing. */
export async function getPatientBilling(user: AuthUser, patientId: string): Promise<PatientBilling | null> {
  if (!can(user, "billing.read")) return null;
  return billingRepository.patientTotals(user.clinicId, patientId);
}

/** Active invoice per appointment id, for the calendar; empty when the user can't see billing. */
export async function getInvoicesForAppointments(user: AuthUser, appointmentIds: string[]): Promise<Record<string, InvoiceSummary>> {
  if (!can(user, "billing.read")) return {};
  const rows = await billingRepository.forAppointments(user.clinicId, appointmentIds);
  return Object.fromEntries(rows.flatMap((r) => (r.appointmentId ? [[r.appointmentId, toSummary(r)]] : [])));
}
