import "server-only";
import {
  CLINIC_TIME_ZONE,
  ageFrom,
  clinicInstant,
  clinicToday,
  daysToBirthday,
} from "@backend/config/clinic";
import { leadsRepository } from "@backend/features/leads/leads.repository";
import { patientIdSchema } from "@backend/features/patients/patient.schema";
import { settingsRepository } from "@backend/features/settings/settings.repository";
import { clinicProfileFrom } from "@backend/features/settings/settings.types";
import { staffWithPermission } from "@backend/features/users/staff.service";
import {
  assertPermission,
  recordScope,
  type AuthUser,
} from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import { deliver } from "./messaging.delivery";
import {
  messagingRepository,
  toSummary,
  type ConversationDetailRow,
} from "./messaging.repository";
import {
  BROADCAST_AUDIENCES,
  assignSchema,
  broadcastSchema,
  conversationIdSchema,
  greetingSchema,
  inboxQuerySchema,
  incomingMessageSchema,
  messageIdSchema,
  replySchema,
  savedRepliesSchema,
  statusSchema,
} from "./messaging.schema";
import {
  DEFAULT_GREETING,
  DEFAULT_SAVED_REPLIES,
  fillTemplate,
  type TemplateValues,
} from "./messaging.templates";
import type {
  AudiencePreview,
  BroadcastAudience,
  BroadcastInput,
  BroadcastSummary,
  Celebrant,
  ConversationDetail,
  ConversationStatus,
  ConversationSummary,
  GreetingSent,
  IncomingMessageInput,
  SavedReply,
  VisitRef,
} from "./messaging.types";

const KID_MAX_AGE = 12;
const SENIOR_AGE = 60;
const RECALL_MONTHS = 6;
const GREETING_WINDOW_DAYS = 7;
/** Lead platforms named after the chat apps a new conversation arrives on. */
const CHANNEL_SOURCE: Record<string, string> = {
  messenger: "Messenger",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  viber: "Viber",
};

const dateTime = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: CLINIC_TIME_ZONE,
});

/** How a conversation is addressed on its platform: the email for email, otherwise the phone digits. */
export function externalRefFor(
  channel: string,
  phone: string | null,
  email: string | null,
): string | null {
  if (channel === "email") return email?.toLowerCase() ?? null;
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits.length >= 7 ? digits : null;
}

interface MessagingSettings {
  savedReplies?: SavedReply[];
  birthdayGreeting?: string;
}

async function clinicSettings(
  clinicId: string,
  tx: TransactionClient = prisma,
) {
  const clinic = await settingsRepository.findClinicSettings(clinicId, tx);
  if (!clinic) throw Errors.notFound("clinic");
  const settings = (clinic.settings ?? {}) as Record<string, unknown>;
  return {
    clinic,
    settings,
    messaging: (settings.messaging ?? {}) as MessagingSettings,
    profile: clinicProfileFrom(clinic.name, clinic.settings),
  };
}

async function saveMessagingSettings(
  clinicId: string,
  patch: MessagingSettings,
  tx: TransactionClient,
) {
  const { settings, messaging } = await clinicSettings(clinicId, tx);
  await settingsRepository.updateClinicSettings(
    clinicId,
    { ...settings, messaging: { ...messaging, ...patch } } as object,
    tx,
  );
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Finds the contact's conversation on a platform, or starts one. */
async function conversationFor(
  clinicId: string,
  contact: { id: string; phone: string | null; email: string | null },
  channel: string,
  tx: TransactionClient,
) {
  const ref = externalRefFor(channel, contact.phone, contact.email);
  const existing = ref
    ? await messagingRepository.findByRef(clinicId, channel, ref, tx)
    : null;
  return (
    existing ??
    (await messagingRepository.createConversation(
      { clinicId, contactId: contact.id, channel, externalRef: ref },
      tx,
    ))
  );
}

/** Saves an outgoing message and "sends" it; without a connector it stays not sent for staff to send by hand. */
async function sendOut(
  conversationId: string,
  body: string,
  senderUserId: string,
  kind: string,
  tx: TransactionClient,
  broadcastId: string | null = null,
) {
  const delivery = await deliver();
  const message = await messagingRepository.addMessage(
    {
      conversationId,
      direction: "out",
      body,
      senderUserId,
      kind,
      deliveryStatus: delivery.status,
      broadcastId,
    },
    tx,
  );
  await messagingRepository.updateConversation(
    conversationId,
    { lastMessageAt: message.sentAt },
    tx,
  );
  return message;
}

export async function listConversations(
  user: AuthUser,
  rawQuery: unknown,
): Promise<ConversationSummary[]> {
  assertPermission(user, "messaging.read");
  return messagingRepository.listConversations(
    recordScope(user),
    inboxQuerySchema.parse(rawQuery),
    user.id,
  );
}

type VisitRow = Awaited<ReturnType<typeof messagingRepository.nextAppointment>>;
const toVisit = (v: VisitRow): VisitRef | null =>
  v
    ? {
        startsAt: v.startsAt,
        dentist: v.dentist?.fullName ?? null,
        service: v.service?.name ?? null,
      }
    : null;

async function fillValues(
  clinicId: string,
  row: ConversationDetailRow,
  next: VisitRow,
): Promise<TemplateValues> {
  const { profile } = await clinicSettings(clinicId);
  return {
    first_name: firstName(row.contact.fullName),
    clinic_name: profile.name,
    clinic_phone: profile.phone || null,
    clinic_address: profile.address || null,
    next_appointment: next
      ? `${dateTime.format(next.startsAt)}${next.dentist ? ` with ${next.dentist.fullName}` : ""}`
      : null,
  };
}

export async function getConversation(
  user: AuthUser,
  rawId: unknown,
): Promise<ConversationDetail> {
  assertPermission(user, "messaging.read");
  const row = await messagingRepository.findConversation(
    recordScope(user),
    conversationIdSchema.parse(rawId),
  );
  if (!row) throw Errors.notFound("conversation");
  const patientId = row.contact.patient?.id;
  const now = new Date();
  const [next, last] = patientId
    ? await Promise.all([
        messagingRepository.nextAppointment(patientId, now),
        messagingRepository.lastVisit(patientId, now),
      ])
    : [null, null];
  const lead = row.contact.leads[0];
  return {
    ...toSummary(row),
    messages: row.messages
      .map((m) => ({
        id: m.id,
        direction: m.direction === "in" ? ("in" as const) : ("out" as const),
        body: m.body,
        sentAt: m.sentAt,
        kind: m.kind,
        deliveryStatus: m.deliveryStatus,
        senderName: m.senderUser?.fullName ?? null,
      }))
      .reverse(),
    contactPhone: row.contact.phone,
    contactEmail: row.contact.email,
    patient: row.contact.patient,
    openLead: lead
      ? {
          id: lead.id,
          stage: lead.stage,
          interest: lead.interestedService
            ? {
                name: lead.interestedService.name,
                price: lead.interestedService.price.toNumber(),
              }
            : null,
        }
      : null,
    visits: { last: toVisit(last), next: toVisit(next) },
    fill: await fillValues(user.clinicId, row, next),
  };
}

export async function getMessagingStaff(user: AuthUser) {
  assertPermission(user, "messaging.read");
  return staffWithPermission(user.clinicId, "messaging.send");
}

/** Records a message that arrived from someone; a new person becomes a contact and a lead. Shared by "Log a message", the simulator and (later) platform webhooks. */
export async function receiveMessage(
  user: AuthUser,
  input: IncomingMessageInput,
  actor: "staff" | "simulator" = "staff",
): Promise<{ conversationId: string; newLead: boolean }> {
  assertPermission(user, "messaging.send");
  const data = incomingMessageSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const digits = data.phone?.replace(/\D/g, "") ?? "";
    const known =
      digits.length >= 7
        ? await leadsRepository.contactByPhone(user.clinicId, digits, tx)
        : data.email
          ? await messagingRepository.contactByEmail(
              user.clinicId,
              data.email,
              tx,
            )
          : null;
    let contactId = known?.id;
    let newLead = false;
    if (!contactId) {
      contactId = (
        await leadsRepository.createContact(
          user.clinicId,
          {
            fullName: data.name,
            phone: data.phone,
            email: data.email,
            preferredChannel: data.channel,
          },
          tx,
        )
      ).id;
      const source = CHANNEL_SOURCE[data.channel]
        ? await messagingRepository.sourceByName(
            user.clinicId,
            CHANNEL_SOURCE[data.channel],
            tx,
          )
        : null;
      const lead = await leadsRepository.create(
        {
          clinicId: user.clinicId,
          contactId,
          sourceId: source?.id ?? null,
          interestedServiceId: null,
          message: data.body,
          hot: false,
          assignedToId: null,
          stage: "new",
          nextActionAt: null,
        },
        tx,
      );
      await leadsRepository.addActivity(
        {
          leadId: lead.id,
          actorId: user.id,
          activityType: "created",
          content: `New conversation on ${CHANNEL_SOURCE[data.channel] ?? data.channel}`,
        },
        tx,
      );
      newLead = true;
    }
    const conversation = await conversationFor(
      user.clinicId,
      { id: contactId, phone: data.phone, email: data.email },
      data.channel,
      tx,
    );
    const message = await messagingRepository.addMessage(
      {
        conversationId: conversation.id,
        direction: "in",
        body: data.body,
        senderUserId: null,
        kind: "chat",
        deliveryStatus: null,
      },
      tx,
    );
    await messagingRepository.updateConversation(
      conversation.id,
      { lastMessageAt: message.sentAt, status: "open" },
      tx,
    );
    await audit(
      {
        action: AUDIT_ACTIONS.MESSAGE_RECEIVED,
        resourceType: "conversation",
        resourceId: conversation.id,
        actorId: user.id,
        clinicId: user.clinicId,
        metadata: { channel: data.channel, via: actor, newLead },
      },
      tx,
    );
    return { conversationId: conversation.id, newLead };
  });
}

async function conversationInScope(
  user: AuthUser,
  rawId: unknown,
  tx: TransactionClient,
) {
  const row = await messagingRepository.findConversation(
    recordScope(user),
    conversationIdSchema.parse(rawId),
    tx,
  );
  if (!row) throw Errors.notFound("conversation");
  return row;
}

export async function reply(
  user: AuthUser,
  rawId: unknown,
  input: unknown,
): Promise<void> {
  assertPermission(user, "messaging.send");
  const { body } = replySchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const conversation = await conversationInScope(user, rawId, tx);
    await sendOut(conversation.id, body, user.id, "chat", tx);
    // Whoever answers an unassigned chat takes it.
    if (!conversation.assignedTo)
      await messagingRepository.updateConversation(
        conversation.id,
        { assignedToId: user.id },
        tx,
      );
  });
}

export async function markMessageSent(
  user: AuthUser,
  rawId: unknown,
): Promise<void> {
  assertPermission(user, "messaging.send");
  await prisma.$transaction(async (tx) => {
    const message = await messagingRepository.findOutgoingMessage(
      recordScope(user),
      messageIdSchema.parse(rawId),
      tx,
    );
    if (!message) throw Errors.notFound("message");
    if (message.deliveryStatus !== "not_sent")
      throw Errors.conflict("This message is already marked as sent.");
    await messagingRepository.setDelivery(message.id, "sent_manually", tx);
  });
}

export async function assignConversation(
  user: AuthUser,
  rawId: unknown,
  input: unknown,
): Promise<void> {
  assertPermission(user, "messaging.send");
  const { assigneeId } = assignSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const conversation = await conversationInScope(user, rawId, tx);
    if (
      assigneeId &&
      !(await staffWithPermission(user.clinicId, "messaging.send", tx)).some(
        (s) => s.id === assigneeId,
      )
    ) {
      throw Errors.validation({
        assigneeId: ["Choose someone from the team list"],
      });
    }
    await messagingRepository.updateConversation(
      conversation.id,
      { assignedToId: assigneeId },
      tx,
    );
  });
}

export async function setConversationStatus(
  user: AuthUser,
  rawId: unknown,
  input: unknown,
): Promise<ConversationStatus> {
  assertPermission(user, "messaging.send");
  const { status } = statusSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const conversation = await conversationInScope(user, rawId, tx);
    await messagingRepository.updateConversation(
      conversation.id,
      { status },
      tx,
    );
  });
  return status;
}

export async function getSavedReplies(user: AuthUser): Promise<SavedReply[]> {
  assertPermission(user, "messaging.read");
  return (
    (await clinicSettings(user.clinicId)).messaging.savedReplies ??
    DEFAULT_SAVED_REPLIES
  );
}

export async function saveSavedReplies(
  user: AuthUser,
  input: unknown,
): Promise<SavedReply[]> {
  assertPermission(user, "messaging.send");
  const savedReplies = savedRepliesSchema.parse(input);
  await prisma.$transaction((tx) =>
    saveMessagingSettings(user.clinicId, { savedReplies }, tx),
  );
  return savedReplies;
}

export async function getGreeting(user: AuthUser): Promise<string> {
  assertPermission(user, "messaging.read");
  return (
    (await clinicSettings(user.clinicId)).messaging.birthdayGreeting ??
    DEFAULT_GREETING
  );
}

export async function saveGreeting(
  user: AuthUser,
  input: unknown,
): Promise<string> {
  assertPermission(user, "messaging.send");
  const { body } = greetingSchema.parse(input);
  await prisma.$transaction((tx) =>
    saveMessagingSettings(user.clinicId, { birthdayGreeting: body }, tx),
  );
  return body;
}

const startOfYear = () => clinicInstant(`${clinicToday().slice(0, 4)}-01-01`);
const dobString = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Patients with a birthday from today through the next week, and whether they were greeted this year. */
export async function getCelebrants(user: AuthUser): Promise<Celebrant[]> {
  assertPermission(user, "messaging.read");
  const today = clinicToday();
  const month = Number(today.slice(5, 7));
  const [patients, greetings] = await Promise.all([
    messagingRepository.patientsBornIn(recordScope(user), [
      month,
      (month % 12) + 1,
    ]),
    messagingRepository.greetingsSince(user.clinicId, startOfYear()),
  ]);
  const greeted = new Set(greetings.map((g) => g.conversation.contactId));
  return patients
    .flatMap((p) => {
      const dob = dobString(p.dob);
      const daysAway = daysToBirthday(dob, today);
      if (!dob || daysAway === null || daysAway >= GREETING_WINDOW_DAYS)
        return [];
      return [
        {
          patientId: p.id,
          contactId: p.contact.id,
          name: p.contact.fullName,
          patientNo: p.patientNo,
          dob,
          turning: (ageFrom(dob, today) ?? 0) + (daysAway === 0 ? 0 : 1),
          daysAway,
          channel: p.contact.preferredChannel,
          greeted: greeted.has(p.contact.id),
        },
      ];
    })
    .sort((a, b) => a.daysAway - b.daysAway);
}

export async function getGreetingsSent(
  user: AuthUser,
): Promise<GreetingSent[]> {
  assertPermission(user, "messaging.read");
  const rows = await messagingRepository.greetingsSince(
    user.clinicId,
    startOfYear(),
  );
  return rows.map((r) => ({
    messageId: r.id,
    name: r.conversation.contact.fullName,
    channel: r.conversation.channel,
    sentAt: r.sentAt,
    deliveryStatus: r.deliveryStatus,
  }));
}

export async function sendGreeting(
  user: AuthUser,
  rawPatientId: unknown,
): Promise<{ conversationId: string }> {
  assertPermission(user, "messaging.send");
  const patientId = patientIdSchema.parse(rawPatientId);
  const celebrant = (await getCelebrants(user)).find(
    (c) => c.patientId === patientId,
  );
  if (!celebrant) throw Errors.notFound("birthday");
  if (celebrant.greeted)
    throw Errors.conflict(`${celebrant.name} was already greeted this year.`);
  if (!celebrant.channel)
    throw Errors.validation(
      { channel: ["Set the patient's preferred app first."] },
      "Set the patient's preferred app first.",
    );
  const channel = celebrant.channel;
  return prisma.$transaction(async (tx) => {
    const { messaging, profile } = await clinicSettings(user.clinicId, tx);
    const contact = await messagingRepository.contactAddress(
      celebrant.contactId,
      tx,
    );
    const conversation = await conversationFor(
      user.clinicId,
      contact,
      channel,
      tx,
    );
    const body = fillTemplate(messaging.birthdayGreeting ?? DEFAULT_GREETING, {
      first_name: firstName(celebrant.name),
      clinic_name: profile.name,
      clinic_phone: profile.phone,
      clinic_address: profile.address,
    });
    await sendOut(conversation.id, body, user.id, "birthday", tx);
    return { conversationId: conversation.id };
  });
}

type Candidate = Awaited<
  ReturnType<typeof messagingRepository.audienceCandidates>
>[number];

function inAudience(
  audience: BroadcastAudience,
  p: Candidate,
  today: string,
): boolean {
  const dob = dobString(p.dob);
  const age = ageFrom(dob, today);
  switch (audience) {
    case "kids":
      return age !== null && age <= KID_MAX_AGE;
    case "seniors":
      return !!p.scPwdId || (age !== null && age >= SENIOR_AGE);
    case "birthdays_month":
      return !!dob && dob.slice(5, 7) === today.slice(5, 7);
    case "recall": {
      const last = p.encounters[0]?.occurredAt;
      const cutoff = new Date(`${today}T00:00:00Z`);
      cutoff.setUTCMonth(cutoff.getUTCMonth() - RECALL_MONTHS);
      return !!last && last < cutoff;
    }
    default:
      return true;
  }
}

/** The app to reach a patient on for broadcasts: only those who agreed to clinic news and can be reached there. */
function broadcastChannel(p: Candidate): string | null {
  const channel = p.contact.preferredChannel;
  return p.contact.marketingOptIn &&
    channel &&
    externalRefFor(channel, p.contact.phone, p.contact.email)
    ? channel
    : null;
}

export async function previewAudiences(
  user: AuthUser,
): Promise<AudiencePreview[]> {
  assertPermission(user, "messaging.read");
  const today = clinicToday();
  const candidates = await messagingRepository.audienceCandidates(
    recordScope(user),
  );
  return BROADCAST_AUDIENCES.map((audience) => {
    const members = candidates.filter((p) => inAudience(audience, p, today));
    return {
      audience,
      patients: members.length,
      reachable: members.filter((p) => broadcastChannel(p) !== null).length,
    };
  });
}

export async function listBroadcasts(
  user: AuthUser,
): Promise<BroadcastSummary[]> {
  assertPermission(user, "messaging.read");
  const rows = await messagingRepository.broadcasts(user.clinicId);
  return rows.map((b) => ({
    id: b.id,
    title: b.title,
    audience: b.audience as BroadcastAudience,
    recipientCount: b.recipientCount,
    createdAt: b.createdAt,
    createdBy: b.createdBy?.fullName ?? null,
  }));
}

export async function sendBroadcast(
  user: AuthUser,
  input: BroadcastInput,
): Promise<{ id: string; recipients: number }> {
  assertPermission(user, "messaging.send");
  const data = broadcastSchema.parse(input);
  const today = clinicToday();
  const recipients = (
    await messagingRepository.audienceCandidates(recordScope(user))
  ).flatMap((p) => {
    const channel = inAudience(data.audience, p, today)
      ? broadcastChannel(p)
      : null;
    return channel ? [{ contact: p.contact, channel }] : [];
  });
  if (!recipients.length)
    throw Errors.conflict(
      "No one in this group has agreed to receive clinic news on an app yet.",
    );
  return prisma.$transaction(
    async (tx) => {
      const { profile } = await clinicSettings(user.clinicId, tx);
      const broadcast = await messagingRepository.createBroadcast(
        {
          clinicId: user.clinicId,
          title: data.title,
          body: data.body,
          audience: data.audience,
          createdById: user.id,
        },
        tx,
      );
      for (const { contact, channel } of recipients) {
        const conversation = await conversationFor(
          user.clinicId,
          contact,
          channel,
          tx,
        );
        const body = fillTemplate(data.body, {
          first_name: firstName(contact.fullName),
          clinic_name: profile.name,
          clinic_phone: profile.phone,
          clinic_address: profile.address,
        });
        await sendOut(
          conversation.id,
          body,
          user.id,
          "broadcast",
          tx,
          broadcast.id,
        );
      }
      await messagingRepository.setBroadcastCount(
        broadcast.id,
        recipients.length,
        tx,
      );
      await audit(
        {
          action: AUDIT_ACTIONS.BROADCAST_SENT,
          resourceType: "broadcast",
          resourceId: broadcast.id,
          actorId: user.id,
          clinicId: user.clinicId,
          metadata: { audience: data.audience, recipients: recipients.length },
        },
        tx,
      );
      return { id: broadcast.id, recipients: recipients.length };
    },
    { timeout: 60_000 },
  );
}
