import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import type { RecordScope } from "@backend/lib/authorization";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import type { ContactSummary, ContactType } from "./contacts.types";

export const CONTACTS_PAGE_SIZE = 50;

/** Dentists only see the contacts of their own patients (the patients and their guardians). */
function scopeWhere(scope: RecordScope): Prisma.ContactWhereInput {
  if (!scope.assigneeId) return { clinicId: scope.clinicId };
  const mine = { primaryDentistId: scope.assigneeId };
  return { clinicId: scope.clinicId, OR: [{ patient: mine }, { patientGuardians: { some: { patient: mine } } }] };
}

const summarySelect = {
  id: true,
  fullName: true,
  contactType: true,
  phone: true,
  email: true,
  preferredChannel: true,
  updatedAt: true,
  patient: { select: { id: true, patientNo: true } },
} satisfies Prisma.ContactSelect;

type SummaryRow = Prisma.ContactGetPayload<{ select: typeof summarySelect }>;

const toSummary = ({ patient, contactType, ...row }: SummaryRow): ContactSummary => ({ ...row, contactType: contactType as ContactType, patientNo: patient?.patientNo ?? null });

export const contactsRepository = {
  async list(scope: RecordScope, types: ContactType[], query: { search?: string; page: number }) {
    const where: Prisma.ContactWhereInput = {
      AND: [
        scopeWhere(scope),
        { contactType: { in: types } },
        query.search ? { OR: [{ fullName: { contains: query.search } }, { phone: { contains: query.search } }, { email: { contains: query.search } }] } : {},
      ],
    };
    const [rows, total] = await prisma.$transaction([
      prisma.contact.findMany({ where, select: summarySelect, orderBy: { fullName: "asc" }, skip: (query.page - 1) * CONTACTS_PAGE_SIZE, take: CONTACTS_PAGE_SIZE }),
      prisma.contact.count({ where }),
    ]);
    return { items: rows.map(toSummary), total };
  },

  async findDetail(scope: RecordScope, id: string, tx: TransactionClient = prisma) {
    const row = await tx.contact.findFirst({
      where: { AND: [scopeWhere(scope), { id }] },
      select: {
        ...summarySelect,
        address: true,
        marketingOptIn: true,
        leads: { select: { id: true, status: true, stage: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        patientGuardians: { select: { relationship: true, patient: { select: { id: true, patientNo: true, contact: { select: { fullName: true } } } } } },
      },
    });
    if (!row) return null;
    const { address, marketingOptIn, leads, patientGuardians, ...summary } = row;
    return {
      ...toSummary(summary),
      address,
      marketingOptIn,
      patientId: summary.patient?.id ?? null,
      leads,
      guardianOf: patientGuardians.map((g) => ({ patientId: g.patient.id, name: g.patient.contact.fullName, patientNo: g.patient.patientNo, relationship: g.relationship })),
    };
  },

  update(id: string, data: Prisma.ContactUpdateInput, tx: TransactionClient) {
    return tx.contact.update({ where: { id }, data, select: { id: true } });
  },

  create(clinicId: string, data: Omit<Prisma.ContactUncheckedCreateInput, "clinicId">, tx: TransactionClient) {
    return tx.contact.create({ data: { ...data, clinicId }, select: { id: true } });
  },
};
