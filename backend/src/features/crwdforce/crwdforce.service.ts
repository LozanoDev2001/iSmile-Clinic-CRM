import "server-only";
import {
  CLINIC_TIME_ZONE,
  clinicInstant,
  clinicToday,
  formatMinutes,
} from "@backend/config/clinic";
import { upcomingOpenSlots } from "@backend/features/appointments/appointments.service";
import { catalogRepository } from "@backend/features/catalog/catalog.repository";
import {
  getConversation,
  listConversations,
} from "@backend/features/messaging/messaging.service";
import { settingsRepository } from "@backend/features/settings/settings.repository";
import { clinicProfileFrom } from "@backend/features/settings/settings.types";
import { assertPermission, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma } from "@backend/lib/prisma";
import { MIA_MODEL, isMiaConnected, requestDraft } from "./crwdforce.claude";
import {
  buildSystemPrompt,
  buildUserContent,
  type ClinicFacts,
  type ConversationContext,
} from "./crwdforce.prompt";
import { crwdforceRepository, toDraft } from "./crwdforce.repository";
import {
  draftDecisionSchema,
  draftIdSchema,
  miaSettingsSchema,
} from "./crwdforce.schema";
import {
  DEFAULT_MIA_SETTINGS,
  type CrwdforceConsole,
  type MiaDraft,
  type MiaSettings,
  type MiaSettingsInput,
  type MiaSetup,
  type MiaSource,
  type MiaStatus,
  type SlotOption,
} from "./crwdforce.types";

/** How much of the schedule and the chat Mia sees per draft: enough to offer times and follow the thread, small enough to stay cheap. */
const SLOT_DAYS = 3;
const SLOT_MINUTES = 30;
const SLOTS_PER_DENTIST_PER_DAY = 4;
const TRANSCRIPT_MESSAGES = 30;

const dayLabel = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const stamp = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: CLINIC_TIME_ZONE,
});
const nowLabel = new Intl.DateTimeFormat("en-PH", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: CLINIC_TIME_ZONE,
});

async function loadSettings(clinicId: string) {
  const clinic = await settingsRepository.findClinicSettings(clinicId);
  if (!clinic) throw Errors.notFound("clinic");
  const settings = (clinic.settings ?? {}) as Record<string, unknown>;
  const stored = miaSettingsSchema.safeParse(settings.mia);
  return {
    clinic,
    settings,
    mia: stored.success ? stored.data : DEFAULT_MIA_SETTINGS,
  };
}

export function miaStatus(): MiaStatus {
  return { connected: isMiaConnected(), model: MIA_MODEL };
}

export async function saveMiaSettings(
  user: AuthUser,
  input: MiaSettingsInput,
): Promise<MiaSettings> {
  assertPermission(user, "crwdforce.update");
  const mia = miaSettingsSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const clinic = await settingsRepository.findClinicSettings(
      user.clinicId,
      tx,
    );
    if (!clinic) throw Errors.notFound("clinic");
    await settingsRepository.updateClinicSettings(
      user.clinicId,
      { ...((clinic.settings ?? {}) as object), mia },
      tx,
    );
    await audit(
      {
        action: AUDIT_ACTIONS.MIA_SETTINGS_UPDATED,
        resourceType: "clinic",
        resourceId: user.clinicId,
        actorId: user.id,
        clinicId: user.clinicId,
      },
      tx,
    );
  });
  return mia;
}

async function clinicFacts(
  clinicId: string,
  name: string,
  settings: unknown,
): Promise<ClinicFacts> {
  const services = await catalogRepository.listActive(clinicId);
  const item = (s: (typeof services)[number]) => ({
    name: s.name,
    price: s.price.toNumber(),
  });
  return {
    profile: clinicProfileFrom(name, settings),
    services: services.filter((s) => s.kind === "service").map(item),
    products: services.filter((s) => s.kind === "product").map(item),
  };
}

async function slotOptions(clinicId: string): Promise<SlotOption[]> {
  const slots = await upcomingOpenSlots(
    clinicId,
    SLOT_DAYS,
    SLOT_MINUTES,
    SLOTS_PER_DENTIST_PER_DAY,
  );
  return slots.map((s, i) => ({
    id: `S${i + 1}`,
    label: `${dayLabel.format(new Date(`${s.date}T00:00:00Z`))}, ${formatMinutes(s.startMinutes)} with ${s.dentist.name}`,
  }));
}

/** Asks Mia for a suggested reply to a conversation. Nothing is sent: staff use or dismiss the draft. */
export async function draftReply(
  user: AuthUser,
  conversationId: string,
): Promise<MiaDraft> {
  assertPermission(user, "crwdforce.read");
  assertPermission(user, "messaging.send");
  const conversation = await getConversation(user, conversationId);
  if (!conversation.messages.some((m) => m.direction === "in"))
    throw Errors.conflict(
      "There's no message from them yet for Mia to answer.",
    );
  const [{ clinic, settings, mia }, slots] = await Promise.all([
    loadSettings(user.clinicId),
    slotOptions(user.clinicId),
  ]);
  const facts = await clinicFacts(user.clinicId, clinic.name, settings);

  const context: ConversationContext = {
    now: nowLabel.format(new Date()),
    channel: conversation.channel,
    firstName: conversation.fill.first_name ?? conversation.contact.name,
    relationship: conversation.patient
      ? "patient"
      : conversation.openLead || conversation.contact.contactType === "lead"
        ? "lead"
        : "new",
    nextAppointment: conversation.fill.next_appointment ?? null,
    slots,
    // Only the words exchanged; Mia never sees clinical notes or billing.
    transcript: conversation.messages
      .slice(-TRANSCRIPT_MESSAGES)
      .map((m) => ({
        from: m.direction === "in" ? "patient" : "clinic",
        text: m.body ?? "",
        at: stamp.format(m.sentAt),
      })),
  };
  const result = await requestDraft(
    buildSystemPrompt(mia, facts),
    buildUserContent(context),
  );
  const { output } = result;
  const draft = await crwdforceRepository.create({
    clinicId: user.clinicId,
    conversationId: conversation.id,
    reply: output.reply,
    summary: output.summary,
    intent: output.intent,
    nextStep: output.next_step,
    slotLabel: slots.find((s) => s.id === output.slot_id)?.label ?? null,
    handover: output.handover,
    handoverReason: output.handover_reason || null,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    createdById: user.id,
  });
  await audit({
    action: AUDIT_ACTIONS.MIA_DRAFTED,
    resourceType: "conversation",
    resourceId: conversation.id,
    actorId: user.id,
    clinicId: user.clinicId,
    metadata: {
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      handover: output.handover,
    },
  });
  return toDraft(draft);
}

export async function decideDraft(
  user: AuthUser,
  rawId: unknown,
  input: unknown,
): Promise<void> {
  assertPermission(user, "messaging.send");
  const id = draftIdSchema.parse(rawId);
  const { decision } = draftDecisionSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const draft = await crwdforceRepository.findPending(user.clinicId, id, tx);
    if (!draft) throw Errors.notFound("draft");
    await crwdforceRepository.decide(id, decision, tx);
  });
}

export async function pendingDrafts(
  user: AuthUser,
  conversationIds: string[],
): Promise<Record<string, MiaDraft>> {
  assertPermission(user, "crwdforce.read");
  const drafts = await crwdforceRepository.pendingFor(
    user.clinicId,
    conversationIds,
  );
  return Object.fromEntries(drafts.map((d) => [d.conversationId, d]));
}

export async function getCrwdforceConsole(
  user: AuthUser,
): Promise<CrwdforceConsole> {
  assertPermission(user, "crwdforce.read");
  const open = await listConversations(user, { status: "open" });
  const since = clinicInstant(clinicToday());
  const [drafts, today] = await Promise.all([
    pendingDrafts(
      user,
      open.map((c) => c.id),
    ),
    crwdforceRepository.draftsSince(user.clinicId, since),
  ]);
  return {
    status: miaStatus(),
    conversations: open.map((c) => ({
      conversationId: c.id,
      name: c.contact.name,
      channel: c.channel,
      lastMessage: c.lastMessage?.body ?? null,
      lastMessageAt: c.lastMessageAt,
      needsReply: c.needsReply,
      assignee: c.assignee?.name ?? null,
      draft: drafts[c.id] ?? null,
    })),
    today: {
      chats: open.filter((c) => c.lastMessageAt && c.lastMessageAt >= since)
        .length,
      waiting: open.filter((c) => c.needsReply).length,
      used: today.filter((d) => d.status === "used").length,
      handovers: today.filter((d) => d.handover).length,
    },
  };
}

/** Mia's settings plus what she draws on and whether it's ready, for the setup page. */
export async function getMiaSetup(user: AuthUser): Promise<MiaSetup> {
  assertPermission(user, "crwdforce.read");
  const { clinic, settings, mia } = await loadSettings(user.clinicId);
  const facts = await clinicFacts(user.clinicId, clinic.name, settings);
  const items = [...facts.services, ...facts.products];
  const unpriced = items.filter((i) => i.price <= 0).length;
  const { profile } = facts;
  const profileReady =
    !!profile.phone &&
    !!profile.address &&
    profile.hours.some((h) => !h.closed);
  const sources: MiaSource[] = [
    {
      title: "Services & price guide",
      detail: `${items.length} active items Mia can quote, from Services & prices`,
      ...(items.length === 0 || unpriced > 0
        ? { status: "needs", statusLabel: "Needs prices" }
        : { status: "ok", statusLabel: "Up to date" }),
    },
    {
      title: "Dentists' schedules",
      detail: "Open times from the Calendar, next 3 clinic days",
      status: "live",
      statusLabel: "Live sync",
    },
    {
      title: "Clinic profile & hours",
      detail: "Address, phone and opening hours",
      ...(profileReady
        ? { status: "ok", statusLabel: "Up to date" }
        : { status: "needs", statusLabel: "Needs details" }),
    },
    {
      title: "Clinic notes",
      detail: "Parking, payments, promos and anything else below",
      ...(mia.knowledge
        ? { status: "ok", statusLabel: "Up to date" }
        : { status: "needs", statusLabel: "Empty" }),
    },
    {
      title: "Patient records",
      detail: "First name and next visit only, never clinical notes",
      status: "live",
      statusLabel: "Live sync",
    },
    {
      title: "HMO & insurance partners",
      detail: "Accepted cards and coverage rules",
      status: "soon",
      statusLabel: "Soon",
    },
  ];
  return { settings: mia, sources, hours: profile.hours };
}
