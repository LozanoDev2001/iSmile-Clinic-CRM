import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import type { LeadCard, LeadStage, LeadStatus } from "./leads.types";

const ACTIVITY_LIMIT = 50;
const CLOSED_LIMIT = 200;

const cardSelect = {
  id: true,
  stage: true,
  status: true,
  hot: true,
  nextActionAt: true,
  attempts: true,
  createdAt: true,
  closedAt: true,
  closedReason: true,
  wonValue: true,
  contact: { select: { fullName: true, phone: true } },
  source: { select: { id: true, name: true } },
  interestedService: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, fullName: true } },
} satisfies Prisma.LeadSelect;

type CardRow = Prisma.LeadGetPayload<{ select: typeof cardSelect }>;

export function toCard(row: CardRow): LeadCard {
  return {
    id: row.id,
    name: row.contact.fullName,
    phone: row.contact.phone,
    stage: row.stage as LeadStage,
    status: row.status as LeadStatus,
    hot: row.hot,
    source: row.source,
    interest: row.interestedService,
    assignee: row.assignedTo && { id: row.assignedTo.id, name: row.assignedTo.fullName },
    nextActionAt: row.nextActionAt,
    attempts: row.attempts,
    createdAt: row.createdAt,
    closedAt: row.closedAt,
    closedReason: row.closedReason,
    wonValue: row.wonValue?.toNumber() ?? null,
  };
}

const detailSelect = {
  ...cardSelect,
  contactId: true,
  message: true,
  contact: { select: { fullName: true, phone: true, email: true, preferredChannel: true } },
  convertedPatient: { select: { id: true, patientNo: true } },
  appointment: { select: { id: true, startsAt: true, status: true } },
  leadActivities: {
    orderBy: { occurredAt: "desc" },
    take: ACTIVITY_LIMIT,
    select: { id: true, activityType: true, content: true, occurredAt: true, actor: { select: { fullName: true } } },
  },
} satisfies Prisma.LeadSelect;

export type LeadDetailRow = NonNullable<Awaited<ReturnType<typeof leadsRepository.findDetail>>>;

function searchWhere(search: string | undefined): Prisma.LeadWhereInput {
  if (!search) return {};
  return { OR: [{ contact: { fullName: { contains: search } } }, { contact: { phone: { contains: search } } }, { interestedService: { name: { contains: search } } }] };
}

export const leadsRepository = {
  async openLeads(clinicId: string, search?: string) {
    const rows = await prisma.lead.findMany({
      where: { clinicId, status: "open", ...searchWhere(search) },
      select: cardSelect,
      orderBy: [{ hot: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(toCard);
  },

  async closedLeads(clinicId: string, status: Exclude<LeadStatus, "open">, from: Date, to: Date) {
    const rows = await prisma.lead.findMany({
      where: { clinicId, status, closedAt: { gte: from, lt: to } },
      select: cardSelect,
      orderBy: { closedAt: "desc" },
      take: CLOSED_LIMIT,
    });
    return rows.map(toCard);
  },

  wonSince(clinicId: string, from: Date) {
    return prisma.lead.aggregate({ where: { clinicId, status: "won", closedAt: { gte: from } }, _count: true, _sum: { wonValue: true } });
  },

  findDetail(clinicId: string, id: string, tx: TransactionClient = prisma) {
    return tx.lead.findFirst({ where: { id, clinicId }, select: detailSelect });
  },

  sources(clinicId: string) {
    return prisma.leadSource.findMany({ where: { clinicId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  },

  sourceExists(clinicId: string, id: string, tx: TransactionClient) {
    return tx.leadSource.count({ where: { id, clinicId } });
  },

  /** A contact in the clinic with this phone number (digits compared), for duplicate detection. */
  async contactByPhone(clinicId: string, digits: string, tx: TransactionClient) {
    const candidates = await tx.contact.findMany({
      where: { clinicId, phone: { contains: digits.slice(-7) } },
      select: { id: true, phone: true, patient: { select: { id: true, patientNo: true } }, leads: { where: { status: "open" }, select: { id: true }, take: 1 } },
    });
    return candidates.find((c) => (c.phone ?? "").replace(/\D/g, "").endsWith(digits.slice(-10))) ?? null;
  },

  createContact(clinicId: string, data: { fullName: string; phone: string | null; email: string | null; preferredChannel: string | null }, tx: TransactionClient) {
    return tx.contact.create({ data: { clinicId, contactType: "lead", ...data }, select: { id: true } });
  },

  create(
    data: { clinicId: string; contactId: string; sourceId: string | null; interestedServiceId: string | null; message: string | null; hot: boolean; assignedToId: string | null; stage: LeadStage; nextActionAt: Date | null },
    tx: TransactionClient,
  ) {
    return tx.lead.create({ data, select: { id: true } });
  },

  update(id: string, data: Prisma.LeadUncheckedUpdateInput, tx: TransactionClient) {
    return tx.lead.update({ where: { id }, data, select: { id: true } });
  },

  addActivity(data: { leadId: string; actorId: string; activityType: string; content: string | null }, tx: TransactionClient) {
    return tx.leadActivity.create({ data });
  },

  /** Turns the lead's contact into a patient (keeping the same contact), numbered like other patients. */
  createPatientFromContact(data: { clinicId: string; contactId: string; patientNo: string; primaryDentistId: string | null }, tx: TransactionClient) {
    return tx.patient.create({ data, select: { id: true } });
  },

  markContactAsPatient(contactId: string, tx: TransactionClient) {
    return tx.contact.update({ where: { id: contactId }, data: { contactType: "patient" } });
  },
};
