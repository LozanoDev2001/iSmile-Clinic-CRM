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
  PATIENT_CREATED: "patient.created",
  PATIENT_UPDATED: "patient.updated",
  PATIENT_MEDICAL_VIEWED: "patient.medical.viewed",
  PATIENT_MEDICAL_UPDATED: "patient.medical.updated",
  APPOINTMENT_CANCELLED: "appointment.cancelled",
  INVOICE_ADJUSTED: "invoice.adjusted",
  PAYMENT_CORRECTED: "payment.corrected",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEntry {
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  actorId?: string | null;
  clinicId?: string | null;
  /** Small, non-sensitive facts, e.g. `{ changedFields: ["phone"] }`. */
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
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    actorId: entry.actorId ?? null,
    clinicId: entry.clinicId ?? null,
    metadata: entry.metadata ? (redact(entry.metadata) as object) : undefined,
    ipAddress,
    requestId,
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
