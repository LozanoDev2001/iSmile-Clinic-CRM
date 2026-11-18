import "server-only";
import { clinicDateOf, clinicInstant, clinicToday } from "@backend/config/clinic";
import type { Prisma } from "@backend/generated/prisma/client";
import { assertPermission, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma } from "@backend/lib/prisma";
import { assertBillingTab } from "../billing.access";
import { round2 } from "../billing.calc";
import { claimsRepository, type ClaimRecord } from "./claims.repository";
import { CLAIM_FILTERS, claimActionSchema, claimIdSchema, claimsQuerySchema } from "./claims.schema";
import type { ClaimActionInput, ClaimFilter, ClaimRow, ClaimStatus, ClaimsBoard } from "./claims.types";

const MS_PER_DAY = 86_400_000;
const OPEN: ClaimStatus[] = ["submitted", "approved"];
type ClaimAction = ClaimActionInput["type"];

/** Which actions each status allows, and where they lead. */
const TRANSITIONS: Partial<Record<ClaimStatus, Partial<Record<ClaimAction, ClaimStatus>>>> = {
  submitted: { approve: "approved", pay: "paid", deny: "denied" },
  approved: { pay: "paid", deny: "denied" },
};

const daysSince = (date: Date) => Math.round((Date.parse(clinicToday()) - Date.parse(clinicDateOf(date))) / MS_PER_DAY);

function toRow(c: ClaimRecord): ClaimRow {
  const status = c.status as ClaimStatus;
  const claimed = c.invoice.hmoDue.toNumber();
  return {
    id: c.id,
    status,
    invoice: { id: c.invoice.id, number: c.invoice.number },
    patient: { name: c.invoice.patient.contact.fullName, patientNo: c.invoice.patient.patientNo },
    payerName: c.payer.name,
    loaNo: c.loaNo,
    claimed,
    approved: c.approvedAmount?.toNumber() ?? claimed,
    paidAmount: c.paidAmount?.toNumber() ?? null,
    paidAt: c.paidAt,
    paymentRef: c.paymentRef,
    deniedReason: c.deniedReason,
    submittedAt: c.submittedAt,
    ageDays: OPEN.includes(status) && c.submittedAt ? daysSince(c.submittedAt) : null,
  };
}

export async function getClaimsBoard(user: AuthUser, rawQuery: unknown): Promise<ClaimsBoard> {
  assertBillingTab(user, "claims");
  const { status } = claimsQuerySchema.parse(rawQuery);
  const monthStart = clinicInstant(`${clinicToday().slice(0, 7)}-01`);
  const [list, grouped, totals] = await Promise.all([claimsRepository.list(user.clinicId, status), claimsRepository.statusCounts(user.clinicId), claimsRepository.totals(user.clinicId, monthStart)]);

  const counts = Object.fromEntries(CLAIM_FILTERS.map((f) => [f, 0])) as Record<ClaimFilter, number>;
  for (const g of grouped) {
    counts.all += g._count;
    if (g.status in counts) counts[g.status as ClaimFilter] = g._count;
  }
  return { status, counts, ...totals, claims: list.rows.map(toRow), truncated: list.truncated };
}

export async function updateClaim(user: AuthUser, rawId: unknown, input: ClaimActionInput): Promise<ClaimRow> {
  assertBillingTab(user, "claims");
  assertPermission(user, "billing.update");
  const id = claimIdSchema.parse(rawId);
  const action = claimActionSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const claim = await claimsRepository.findForUpdate(user.clinicId, id, tx);
    if (!claim) throw Errors.notFound("claim");
    const current = toRow(claim);
    const next = TRANSITIONS[current.status]?.[action.type];
    if (!next) throw Errors.conflict(`This claim is ${current.status} and can't be changed that way.`);

    let data: Prisma.ClaimUncheckedUpdateInput;
    switch (action.type) {
      case "approve":
        if (action.amount > current.claimed) throw Errors.validation({ amount: [`The HMO share billed is ₱${current.claimed.toFixed(2)}; approve that amount or less.`] });
        data = { status: next, approvedAmount: round2(action.amount) };
        break;
      case "pay":
        if (action.amount > current.approved) throw Errors.validation({ amount: [`The approved amount is ₱${current.approved.toFixed(2)}; enter that amount or less.`] });
        if (action.paidOn > clinicToday()) throw Errors.validation({ paidOn: ["The payment date can't be in the future."] });
        data = { status: next, paidAmount: round2(action.amount), paidAt: clinicInstant(action.paidOn), paymentRef: action.reference };
        break;
      case "deny":
        data = { status: next, deniedReason: action.reason };
        break;
    }

    const updated = await claimsRepository.update(id, data, tx);
    await audit(
      {
        action: AUDIT_ACTIONS.CLAIM_UPDATED,
        resourceType: "claim",
        resourceId: id,
        actorId: user.id,
        clinicId: user.clinicId,
        before: { status: current.status },
        metadata: { status: next, invoiceId: current.invoice.id, ...("amount" in action ? { amount: action.amount } : {}) },
      },
      tx,
    );
    return toRow(updated);
  });
}
