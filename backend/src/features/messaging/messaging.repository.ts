import "server-only";
import { Prisma } from "@backend/generated/prisma/client";
import type { RecordScope } from "@backend/lib/authorization";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import type {
  ConversationStatus,
  ConversationSummary,
} from "./messaging.types";

const INBOX_LIMIT = 100;
const THREAD_LIMIT = 200;

/** Dentists only see conversations with their own patients. */
function scopeWhere(scope: RecordScope): Prisma.ConversationWhereInput {
  return {
    clinicId: scope.clinicId,
    ...(scope.assigneeId
      ? { contact: { patient: { primaryDentistId: scope.assigneeId } } }
      : {}),
  };
}

const summarySelect = {
  id: true,
  channel: true,
  status: true,
  lastMessageAt: true,
  contact: { select: { id: true, fullName: true, contactType: true } },
  assignedTo: { select: { id: true, fullName: true } },
  messages: {
    orderBy: { sentAt: "desc" },
    take: 1,
    select: { body: true, direction: true },
  },
} satisfies Prisma.ConversationSelect;

type SummaryRow = Prisma.ConversationGetPayload<{
  select: typeof summarySelect;
}>;

export function toSummary(row: SummaryRow): ConversationSummary {
  const last = row.messages[0];
  return {
    id: row.id,
    channel: row.channel,
    status: row.status as ConversationStatus,
    contact: {
      id: row.contact.id,
      name: row.contact.fullName,
      contactType: row.contact.contactType,
    },
    assignee: row.assignedTo && {
      id: row.assignedTo.id,
      name: row.assignedTo.fullName,
    },
    lastMessageAt: row.lastMessageAt,
    lastMessage: last
      ? { body: last.body, direction: last.direction === "in" ? "in" : "out" }
      : null,
    needsReply: last?.direction === "in",
  };
}

interface InboxFilter {
  channel: string;
  status: string;
  who: string;
  search?: string;
}

const visitSelect = {
  startsAt: true,
  dentist: { select: { fullName: true } },
  service: { select: { name: true } },
} as const;

export const messagingRepository = {
  async listConversations(
    scope: RecordScope,
    filter: InboxFilter,
    userId: string,
  ) {
    const who: Prisma.ConversationWhereInput =
      filter.who === "all"
        ? {}
        : filter.who === "none"
          ? { assignedToId: null }
          : { assignedToId: filter.who === "me" ? userId : filter.who };
    const rows = await prisma.conversation.findMany({
      where: {
        AND: [
          scopeWhere(scope),
          who,
          filter.channel === "all" ? {} : { channel: filter.channel },
          filter.status === "all" ? {} : { status: filter.status },
          filter.search
            ? {
                OR: [
                  { contact: { fullName: { contains: filter.search } } },
                  { contact: { phone: { contains: filter.search } } },
                ],
              }
            : {},
        ],
      },
      select: summarySelect,
      orderBy: [
        { lastMessageAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: INBOX_LIMIT,
    });
    return rows.map(toSummary);
  },

  findConversation(
    scope: RecordScope,
    id: string,
    tx: TransactionClient = prisma,
  ) {
    return tx.conversation.findFirst({
      where: { AND: [scopeWhere(scope), { id }] },
      select: {
        ...summarySelect,
        contact: {
          select: {
            id: true,
            fullName: true,
            contactType: true,
            phone: true,
            email: true,
            patient: { select: { id: true, patientNo: true } },
            leads: {
              where: { status: "open" },
              take: 1,
              select: {
                id: true,
                stage: true,
                interestedService: { select: { name: true, price: true } },
              },
            },
          },
        },
        messages: {
          orderBy: { sentAt: "desc" },
          take: THREAD_LIMIT,
          select: {
            id: true,
            direction: true,
            body: true,
            sentAt: true,
            kind: true,
            deliveryStatus: true,
            senderUser: { select: { fullName: true } },
          },
        },
      },
    });
  },

  /** The patient's next booked visit, for the {next_appointment} fill-in. */
  nextAppointment(patientId: string, now: Date) {
    return prisma.appointment.findFirst({
      where: {
        patientId,
        startsAt: { gte: now },
        status: { in: ["booked", "confirmed"] },
      },
      orderBy: { startsAt: "asc" },
      select: visitSelect,
    });
  },

  /** The patient's most recent finished visit. */
  lastVisit(patientId: string, now: Date) {
    return prisma.appointment.findFirst({
      where: { patientId, startsAt: { lt: now }, status: "completed" },
      orderBy: { startsAt: "desc" },
      select: visitSelect,
    });
  },

  findByRef(
    clinicId: string,
    channel: string,
    externalRef: string,
    tx: TransactionClient,
  ) {
    return tx.conversation.findFirst({
      where: { clinicId, channel, externalRef },
      select: { id: true, contactId: true },
    });
  },

  createConversation(
    data: {
      clinicId: string;
      contactId: string;
      channel: string;
      externalRef: string | null;
    },
    tx: TransactionClient,
  ) {
    return tx.conversation.create({
      data: { ...data, status: "open" },
      select: { id: true },
    });
  },

  updateConversation(
    id: string,
    data: Prisma.ConversationUncheckedUpdateInput,
    tx: TransactionClient,
  ) {
    return tx.conversation.update({
      where: { id },
      data,
      select: { id: true },
    });
  },

  addMessage(
    data: {
      conversationId: string;
      direction: "in" | "out";
      body: string;
      senderUserId: string | null;
      kind: string;
      deliveryStatus: string | null;
      broadcastId?: string | null;
      sentAt?: Date;
    },
    tx: TransactionClient,
  ) {
    return tx.message.create({ data, select: { id: true, sentAt: true } });
  },

  findOutgoingMessage(scope: RecordScope, id: string, tx: TransactionClient) {
    return tx.message.findFirst({
      where: { id, direction: "out", conversation: scopeWhere(scope) },
      select: { id: true, deliveryStatus: true, conversationId: true },
    });
  },

  setDelivery(id: string, deliveryStatus: string, tx: TransactionClient) {
    return tx.message.update({ where: { id }, data: { deliveryStatus } });
  },

  /** Patients born in the given months, within the user's scope (Prisma has no MONTH() filter). */
  async patientsBornIn(scope: RecordScope, months: number[]) {
    const rows = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM patients WHERE clinic_id = ${scope.clinicId} AND MONTH(dob) IN (${Prisma.join(months)})${
        scope.assigneeId
          ? Prisma.sql` AND primary_dentist_id = ${scope.assigneeId}`
          : Prisma.empty
      }`,
    );
    if (!rows.length) return [];
    return prisma.patient.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: {
        id: true,
        patientNo: true,
        dob: true,
        contact: {
          select: {
            id: true,
            fullName: true,
            preferredChannel: true,
            phone: true,
            email: true,
          },
        },
      },
    });
  },

  /** Birthday greetings sent since `since`, newest first. */
  greetingsSince(clinicId: string, since: Date) {
    return prisma.message.findMany({
      where: {
        kind: "birthday",
        sentAt: { gte: since },
        conversation: { clinicId },
      },
      orderBy: { sentAt: "desc" },
      select: {
        id: true,
        sentAt: true,
        deliveryStatus: true,
        conversation: {
          select: {
            channel: true,
            contactId: true,
            contact: { select: { fullName: true } },
          },
        },
      },
    });
  },

  contactAddress(id: string, tx: TransactionClient) {
    return tx.contact.findUniqueOrThrow({
      where: { id },
      select: { id: true, phone: true, email: true },
    });
  },

  contactByEmail(clinicId: string, email: string, tx: TransactionClient) {
    return tx.contact.findFirst({
      where: { clinicId, email },
      select: {
        id: true,
        patient: { select: { id: true } },
        leads: { where: { status: "open" }, select: { id: true }, take: 1 },
      },
    });
  },

  sourceByName(clinicId: string, name: string, tx: TransactionClient) {
    return tx.leadSource.findFirst({
      where: { clinicId, name },
      select: { id: true },
    });
  },

  broadcasts(clinicId: string) {
    return prisma.broadcast.findMany({
      where: { clinicId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        audience: true,
        recipientCount: true,
        createdAt: true,
        createdBy: { select: { fullName: true } },
      },
    });
  },

  /** Patients with what a broadcast audience needs: age, discount ID, consent, channel and visit history. */
  audienceCandidates(scope: RecordScope) {
    return prisma.patient.findMany({
      where: {
        clinicId: scope.clinicId,
        status: "active",
        ...(scope.assigneeId ? { primaryDentistId: scope.assigneeId } : {}),
      },
      select: {
        id: true,
        dob: true,
        scPwdId: true,
        contact: {
          select: {
            id: true,
            fullName: true,
            marketingOptIn: true,
            preferredChannel: true,
            phone: true,
            email: true,
          },
        },
        encounters: {
          orderBy: { occurredAt: "desc" },
          take: 1,
          select: { occurredAt: true },
        },
      },
    });
  },

  createBroadcast(
    data: {
      clinicId: string;
      title: string;
      body: string;
      audience: string;
      createdById: string;
    },
    tx: TransactionClient,
  ) {
    return tx.broadcast.create({ data, select: { id: true } });
  },

  setBroadcastCount(id: string, recipientCount: number, tx: TransactionClient) {
    return tx.broadcast.update({ where: { id }, data: { recipientCount } });
  },
};

export type ConversationDetailRow = NonNullable<
  Awaited<ReturnType<typeof messagingRepository.findConversation>>
>;
