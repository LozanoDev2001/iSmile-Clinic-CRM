import "server-only";
import { CLINIC_TIME_ZONE, addDays, clinicInstant, clinicToday } from "@backend/config/clinic";
import { effectiveAccess, grantKey, permissionsFor } from "@backend/config/access";
import { isRole } from "@backend/config/permissions";
import { bookInTransaction } from "@backend/features/appointments/appointments.service";
import { catalogRepository } from "@backend/features/catalog/catalog.repository";
import { patientsRepository } from "@backend/features/patients/patients.repository";
import { assertPermission, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import { LEAD_STAGES, boardQuerySchema, closedQuerySchema, createLeadSchema, leadActionSchema, leadIdSchema } from "./lead.schema";
import { leadsRepository, toCard, type LeadDetailRow } from "./leads.repository";
import type { ClosedLeads, CreateLeadInput, LeadActionInput, LeadBoard, LeadCard, LeadDetail, LeadOptions, LeadStage } from "./leads.types";

const HOUR_MS = 3_600_000;
/** How soon a new lead should be called once someone is assigned. */
const FIRST_CALL_HOURS = { hot: 1, normal: 4 };
/** Follow-up times may be a little in the past (staff logging a call just made), but not hours ago. */
const PAST_GRACE_MS = HOUR_MS;

const CALL_RESULT_TEXT = { no_answer: "no answer", busy: "line busy", switched_off: "phone switched off" } as const;

/** Staff whose access lets them work leads (the people a lead can be assigned to). */
async function leadStaff(clinicId: string, tx: TransactionClient = prisma) {
  const rows = await leadsRepository.staffWithAccess(clinicId, tx);
  return rows.flatMap((u) => {
    const code = u.userRoles[0]?.role.code;
    if (!code || !isRole(code)) return [];
    const grants = u.userRoles[0].role.rolePermissions.map((rp) => grantKey(rp.permission.resource, rp.permission.action));
    const overrides = u.userPermissionOverrides.map((o) => ({ grant: grantKey(o.permission.resource, o.permission.action), decision: o.decision === "deny" ? ("deny" as const) : ("allow" as const) }));
    return permissionsFor(effectiveAccess(code, grants, overrides)).includes("leads.update") ? [{ id: u.id, name: u.fullName }] : [];
  });
}

async function assertAssignable(clinicId: string, assigneeId: string, tx: TransactionClient) {
  if (!(await leadStaff(clinicId, tx)).some((s) => s.id === assigneeId)) throw Errors.validation({ assigneeId: ["Choose someone from the team list"] });
}

function assertNotLongPast(at: Date) {
  if (at.getTime() < Date.now() - PAST_GRACE_MS) throw Errors.validation({ nextAt: ["Pick a time from now on"] });
}

const isDue = (lead: LeadCard, endOfToday: Date) => lead.status === "open" && lead.stage !== "consult_booked" && !!lead.nextActionAt && lead.nextActionAt < endOfToday;

export async function getLeadOptions(user: AuthUser): Promise<LeadOptions> {
  assertPermission(user, "leads.read");
  const [staff, sources, services, [dentists]] = await Promise.all([
    leadStaff(user.clinicId),
    leadsRepository.sources(user.clinicId),
    catalogRepository.listActive(user.clinicId),
    patientsRepository.formOptions(user.clinicId),
  ]);
  const durations = new Map((await catalogRepository.listBookable(user.clinicId)).map((s) => [s.id, s.durationMinutes]));
  return {
    staff,
    sources,
    services: services.filter((s) => s.kind === "service").map((s) => ({ id: s.id, name: s.name, price: s.price.toNumber(), durationMinutes: durations.get(s.id) ?? null })),
    dentists: dentists.map((d) => ({ id: d.id, name: d.fullName })),
  };
}

export async function getLeadBoard(user: AuthUser, rawQuery: unknown): Promise<LeadBoard> {
  assertPermission(user, "leads.read");
  const query = boardQuerySchema.parse(rawQuery);
  const today = clinicToday();
  const endOfToday = clinicInstant(addDays(today, 1));
  const [open, sources, won] = await Promise.all([
    leadsRepository.openLeads(user.clinicId, query.search),
    leadsRepository.sources(user.clinicId),
    leadsRepository.wonSince(user.clinicId, clinicInstant(`${today.slice(0, 7)}-01`)),
  ]);
  const whoMatches = (l: LeadCard) => {
    if (query.who === "all") return true;
    if (query.who === "none") return !l.assignee;
    if (query.who === "due") return isDue(l, endOfToday);
    if (query.who === "me") return l.assignee?.id === user.id;
    return l.assignee?.id === query.who;
  };
  const shown = open.filter((l) => (query.source === "all" || l.source?.id === query.source) && whoMatches(l));
  return {
    columns: Object.fromEntries(LEAD_STAGES.map((s) => [s, shown.filter((l) => l.stage === s)])) as Record<LeadStage, LeadCard[]>,
    openCount: open.length,
    hotCount: open.filter((l) => l.hot).length,
    unassignedCount: open.filter((l) => !l.assignee).length,
    dueCount: open.filter((l) => isDue(l, endOfToday)).length,
    wonThisMonth: won._count,
    wonValueThisMonth: won._sum.wonValue?.toNumber() ?? 0,
    sources: sources.map((s) => ({ ...s, open: open.filter((l) => l.source?.id === s.id).length })),
  };
}

export async function getClosedLeads(user: AuthUser, rawQuery: unknown): Promise<ClosedLeads> {
  assertPermission(user, "leads.read");
  const { status, month = clinicToday().slice(0, 7) } = closedQuerySchema.parse(rawQuery);
  const start = `${month}-01`;
  const next = `${addDays(start, 31).slice(0, 7)}-01`;
  const leads = await leadsRepository.closedLeads(user.clinicId, status, clinicInstant(start), clinicInstant(next));
  const counts = new Map<string, number>();
  for (const l of leads) if (l.closedReason) counts.set(l.closedReason, (counts.get(l.closedReason) ?? 0) + 1);
  return {
    leads,
    total: leads.length,
    value: leads.reduce((sum, l) => sum + (l.wonValue ?? 0), 0),
    reasons: [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

function toDetail(row: LeadDetailRow): LeadDetail {
  return {
    ...toCard(row),
    contactId: row.contactId,
    email: row.contact.email,
    preferredChannel: row.contact.preferredChannel,
    message: row.message,
    patient: row.convertedPatient,
    appointment: row.appointment,
    activities: row.leadActivities.map((a) => ({ id: a.id, type: a.activityType, content: a.content, actorName: a.actor?.fullName ?? null, occurredAt: a.occurredAt })),
  };
}

export async function getLead(user: AuthUser, rawId: unknown): Promise<LeadDetail> {
  assertPermission(user, "leads.read");
  const row = await leadsRepository.findDetail(user.clinicId, leadIdSchema.parse(rawId));
  if (!row) throw Errors.notFound("lead");
  return toDetail(row);
}

export async function createLead(user: AuthUser, input: CreateLeadInput): Promise<{ id: string; existingPatientNo: string | null }> {
  assertPermission(user, "leads.create");
  const data = createLeadSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    if (data.sourceId && !(await leadsRepository.sourceExists(user.clinicId, data.sourceId, tx))) throw Errors.validation({ sourceId: ["Choose a platform from the list"] });
    if (data.interestedServiceId && !(await catalogRepository.findActive(user.clinicId, data.interestedServiceId, tx))) throw Errors.validation({ interestedServiceId: ["Choose a treatment from the list"] });
    if (data.assigneeId) await assertAssignable(user.clinicId, data.assigneeId, tx);

    const digits = data.phone?.replace(/\D/g, "") ?? "";
    const existing = digits.length >= 7 ? await leadsRepository.contactByPhone(user.clinicId, digits, tx) : null;
    if (existing?.leads.length) throw Errors.conflict("This number already has an open lead. Open that one instead.", { phone: ["Already an open lead"] });
    const contactId = existing?.id ?? (await leadsRepository.createContact(user.clinicId, { fullName: data.fullName, phone: data.phone, email: data.email, preferredChannel: data.preferredChannel }, tx)).id;

    const hours = data.hot ? FIRST_CALL_HOURS.hot : FIRST_CALL_HOURS.normal;
    const lead = await leadsRepository.create(
      {
        clinicId: user.clinicId,
        contactId,
        sourceId: data.sourceId,
        interestedServiceId: data.interestedServiceId,
        message: data.message,
        hot: data.hot,
        assignedToId: data.assigneeId,
        stage: data.assigneeId ? "assigned" : "new",
        nextActionAt: data.assigneeId ? new Date(Date.now() + hours * HOUR_MS) : null,
      },
      tx,
    );
    const patientNote = existing?.patient ? ` · already patient ${existing.patient.patientNo}` : "";
    await leadsRepository.addActivity({ leadId: lead.id, actorId: user.id, activityType: "created", content: `Lead added${patientNote}` }, tx);
    await audit({ action: AUDIT_ACTIONS.LEAD_CREATED, resourceType: "lead", resourceId: lead.id, actorId: user.id, clinicId: user.clinicId }, tx);
    return { id: lead.id, existingPatientNo: existing?.patient?.patientNo ?? null };
  });
}

/** The patient behind a lead: the contact's existing patient record, or a new one numbered like any other. */
async function patientForLead(user: AuthUser, lead: LeadDetailRow, dentistId: string, tx: TransactionClient): Promise<string> {
  if (lead.convertedPatient) return lead.convertedPatient.id;
  const existing = await tx.patient.findUnique({ where: { contactId: lead.contactId }, select: { id: true } });
  if (existing) return existing.id;
  assertPermission(user, "patients.create");
  const patientNo = `P-${String((await patientsRepository.maxPatientNumber(user.clinicId, tx)) + 1).padStart(4, "0")}`;
  const created = await leadsRepository.createPatientFromContact({ clinicId: user.clinicId, contactId: lead.contactId, patientNo, primaryDentistId: dentistId }, tx);
  await leadsRepository.markContactAsPatient(lead.contactId, tx);
  await audit({ action: AUDIT_ACTIONS.PATIENT_CREATED, resourceType: "patient", resourceId: created.id, actorId: user.id, clinicId: user.clinicId, metadata: { patientNo, fromLead: lead.id } }, tx);
  return created.id;
}

async function servicePrice(clinicId: string, serviceId: string, tx: TransactionClient) {
  const service = await catalogRepository.findActive(clinicId, serviceId, tx);
  if (!service) throw Errors.validation({ serviceId: ["Choose a treatment from the list"] });
  return { name: service.name, price: service.price.toNumber() };
}

const activityTime = new Intl.DateTimeFormat("en-PH", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: CLINIC_TIME_ZONE });
const when = (d: Date) => activityTime.format(d);

export async function updateLead(user: AuthUser, rawId: unknown, input: LeadActionInput): Promise<LeadDetail> {
  assertPermission(user, "leads.update");
  const id = leadIdSchema.parse(rawId);
  const action = leadActionSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const lead = await leadsRepository.findDetail(user.clinicId, id, tx);
    if (!lead) throw Errors.notFound("lead");
    if (action.type === "reopen" ? lead.status !== "lost" : action.type !== "note" && lead.status !== "open") {
      throw Errors.conflict(action.type === "reopen" ? "Only lost leads can be reopened." : "This lead is closed. Reopen it first.");
    }
    if (action.type !== "note") await assertAssignable(user.clinicId, action.assigneeId, tx);
    if ("nextAt" in action) assertNotLongPast(action.nextAt);

    const base = action.type === "note" ? {} : { assignedToId: action.assigneeId };
    let data: Parameters<typeof leadsRepository.update>[1] = base;
    let text: string;
    switch (action.type) {
      case "assign":
        data = { ...base, stage: "assigned", nextActionAt: action.nextAt };
        text = `Assigned · first call by ${when(action.nextAt)}`;
        break;
      case "retry":
        data = { ...base, stage: "assigned", attempts: lead.attempts + 1, nextActionAt: action.nextAt };
        text = `Call attempt ${lead.attempts + 1} · ${CALL_RESULT_TEXT[action.result]} · try again ${when(action.nextAt)}`;
        break;
      case "follow_up":
        data = { ...base, stage: "follow_up", nextActionAt: action.nextAt };
        text = `Spoke to them · ${action.reason.toLowerCase()} · call back ${when(action.nextAt)}`;
        break;
      case "book_consult": {
        const patientId = await patientForLead(user, lead, action.dentistId, tx);
        const booked = await bookInTransaction(
          user,
          { dentistId: action.dentistId, date: action.date, startMinutes: action.startMinutes, durationMinutes: action.durationMinutes, patientId, serviceId: action.serviceId, bookingSource: "lead", notes: action.note },
          tx,
        );
        data = { ...base, stage: "consult_booked", nextActionAt: null, appointmentId: booked.id, convertedPatientId: patientId, convertedAt: lead.convertedPatient ? undefined : new Date(), ...(action.serviceId ? { interestedServiceId: action.serviceId } : {}) };
        text = `Consult booked for ${when(clinicInstant(action.date, action.startMinutes))}`;
        break;
      }
      case "plan_sent": {
        const service = await servicePrice(user.clinicId, action.serviceId, tx);
        data = { ...base, stage: "plan_sent", interestedServiceId: action.serviceId, nextActionAt: action.nextAt };
        text = `Plan sent · ${service.name} · decision follow-up ${when(action.nextAt)}`;
        break;
      }
      case "won": {
        const service = await servicePrice(user.clinicId, action.serviceId, tx);
        data = { ...base, status: "won", interestedServiceId: action.serviceId, wonValue: service.price, closedAt: new Date(), closedReason: null, nextActionAt: null };
        text = `Won · ${service.name}`;
        break;
      }
      case "lost":
        data = { ...base, status: "lost", closedAt: new Date(), closedReason: action.reason, nextActionAt: null };
        text = `Lost · ${action.reason}`;
        break;
      case "reopen":
        data = { ...base, status: "open", stage: "assigned", closedAt: null, closedReason: null, wonValue: null, nextActionAt: action.nextAt };
        text = `Reopened · call ${when(action.nextAt)}`;
        break;
      case "note":
        text = action.note;
        break;
    }
    if (action.type !== "note") await leadsRepository.update(id, data, tx);
    const note = action.type !== "note" && action.note ? ` · Note: ${action.note}` : "";
    await leadsRepository.addActivity({ leadId: id, actorId: user.id, activityType: action.type, content: `${text}${note}` }, tx);
    await audit({ action: AUDIT_ACTIONS.LEAD_UPDATED, resourceType: "lead", resourceId: id, actorId: user.id, clinicId: user.clinicId, metadata: { type: action.type } }, tx);

    const updated = await leadsRepository.findDetail(user.clinicId, id, tx);
    if (!updated) throw Errors.notFound("lead");
    return toDetail(updated);
  });
}
