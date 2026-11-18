import type { z } from "zod";
import type { CLAIM_FILTERS, claimActionSchema } from "./claims.schema";

export type ClaimStatus = "submitted" | "approved" | "paid" | "denied" | "cancelled" | "draft";
export type ClaimFilter = (typeof CLAIM_FILTERS)[number];
export type ClaimActionInput = z.input<typeof claimActionSchema>;

export interface ClaimRow {
  id: string;
  status: ClaimStatus;
  invoice: { id: string; number: string };
  patient: { name: string; patientNo: string };
  payerName: string;
  loaNo: string | null;
  /** The HMO share billed on the invoice. */
  claimed: number;
  /** What the HMO approved; equals the claimed amount until it is approved. */
  approved: number;
  paidAmount: number | null;
  paidAt: Date | null;
  paymentRef: string | null;
  deniedReason: string | null;
  submittedAt: Date | null;
  /** Days since submission while the claim is still open; null once paid, denied or cancelled. */
  ageDays: number | null;
}

export interface ClaimsBoard {
  status: ClaimFilter;
  counts: Record<ClaimFilter, number>;
  awaitingApproval: number;
  approvedUnpaid: number;
  paidThisMonth: number;
  claims: ClaimRow[];
  /** True when the list was cut at the display limit. */
  truncated: boolean;
}
