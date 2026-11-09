import "server-only";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import { logger, redact } from "./logger";
import { getRequestContext } from "@backend/lib/request-context";

/**
 * Audit trail for sensitive actions (who did what to which record, when).
 * Separate from application logs: stored in the append-only `audit_logs`
 * table. Record identifiers and non-sensitive facts only — never patient
 * data, medical notes, passwords or tokens.
 */

export const AUDIT_ACTIONS = {
  LOGIN_SUCCEEDED: "auth.login.succeeded",
  LOGIN_FAILED: "auth.login.failed",
  LOGOUT: "auth.logout",
  PASSWORD_CHANGED: "auth.password.changed",
  PASSWORD_RESET_REQUESTED: "auth.password_reset.requested",
  PASSWORD_RESET_COMPLETED: "auth.password_reset.completed",
  SESSIONS_REVOKED: "auth.sessions.revoked",
  PROFILE_UPDATED: "user.profile.updated",
  USER_INVITED: "user.invited",
  USER_ACTIVATED: "user.activated",
  USER_DEACTIVATED: "user.deactivated",
  USER_ROLE_CHANGED: "user.role.changed",
  USER_ACCESS_CHANGED: "user.access.changed",
  USER_TITLE_CHANGED: "user.title.changed",
  USER_LOCKED: "user.locked",
  USER_UNLOCKED: "user.unlocked",
  SIGN_IN_RULES_UPDATED: "clinic.sign_in_rules.updated",
  CLINIC_PROFILE_UPDATED: "clinic.profile.updated",
  SERVICE_CREATED: "service.created",
  SERVICE_UPDATED: "service.updated",
  SERVICE_ARCHIVED: "service.archived",
  PATIENT_CREATED: "patient.created",
  LEAD_CREATED: "lead.created",
  CONTACT_CREATED: "contact.created",
  CONTACT_UPDATED: "contact.updated",
  MESSAGE_RECEIVED: "message.received",
  BROADCAST_SENT: "broadcast.sent",
  LEAD_UPDATED: "lead.updated",
  PATIENT_UPDATED: "patient.updated",
  PATIENT_MEDICAL_VIEWED: "patient.medical.viewed",
  PATIENT_MEDICAL_UPDATED: "patient.medical.updated",
  APPOINTMENT_BOOKED: "appointment.booked",
  APPOINTMENT_RESCHEDULED: "appointment.rescheduled",
  APPOINTMENT_STATUS_CHANGED: "appointment.status_changed",
  APPOINTMENT_CANCELLED: "appointment.cancelled",
  INVOICE_ISSUED: "invoice.issued",
  INVOICE_ADJUSTED: "invoice.adjusted",
  INVOICE_VOID_REQUESTED: "invoice.void_requested",
  INVOICE_VOID_DECLINED: "invoice.void_declined",
  INVOICE_VOIDED: "invoice.voided",
  PAYMENT_RECORDED: "payment.recorded",
  PAYMENT_CORRECTED: "payment.corrected",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEntry {
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  actorId?: string | null;
  /** Every entry belongs to a clinic (`audit_logs.clinic_id` is required). */
  clinicId: string;
  /** Small, non-sensitive facts about the old state, e.g. `{ role: "DENTIST" }`. */
  before?: Record<string, unknown>;
  /** Small, non-sensitive facts, e.g. `{ changedFields: ["phone"] }`. Stored as `after_data`. */
  metadata?: Record<string, unknown>;
}

/**
 * Writes an audit entry. Pass `tx` to make the entry part of the same
 * transaction as the change it records (recommended for critical changes —
 * if the audit write fails, the change is rolled back).
 * Without `tx`, a failed audit write is logged but does not fail the request.
 */
export async function audit(entry: AuditEntry, tx?: TransactionClient): Promise<void> {
  const { requestId, ipAddress } = await getRequestContext();
  const data = {
    action: entry.action,
    entityType: entry.resourceType,
    entityId: entry.resourceId ?? null,
    actorId: entry.actorId ?? null,
    clinicId: entry.clinicId,
    beforeData: entry.before ? (redact(entry.before) as object) : undefined,
    afterData: entry.metadata ? (redact(entry.metadata) as object) : undefined,
    ip: ipAddress,
  };

  if (tx) {
    await tx.auditLog.create({ data });
    return;
  }
  try {
    await prisma.auditLog.create({ data });
  } catch (error) {
    logger.error("Failed to write audit log", { requestId, action: entry.action, error });
  }
}
