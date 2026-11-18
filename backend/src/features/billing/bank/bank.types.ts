import type { z } from "zod";
import type { PaymentMethod } from "@backend/features/billing/billing.types";
import type { bankAccountInputSchema, depositInputSchema, matchInputSchema } from "./bank.schema";

export type BankAccountInput = z.input<typeof bankAccountInputSchema>;
export type DepositInput = z.input<typeof depositInputSchema>;
export type MatchInput = z.input<typeof matchInputSchema>;

export interface MethodTotal {
  method: PaymentMethod;
  amount: number;
  count: number;
  /** Share of the month's total, 0–100. */
  share: number;
}

export interface BankAccountRow {
  id: string;
  label: string;
  lastFour: string | null;
  deposits: number;
}

/** A posted non-cash payment, as offered for matching or shown on a matched deposit. */
export interface MatchablePayment {
  id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  receivedAt: Date;
  patientName: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
}

export interface DepositRow {
  id: string;
  postedOn: string;
  amount: number;
  reference: string | null;
  description: string | null;
  account: { id: string; label: string; lastFour: string | null };
  matched: MatchablePayment | null;
  /** Unmatched deposits only: payments of the same amount within a week, closest first. */
  suggestions: MatchablePayment[];
}

export interface CollectionsBoard {
  monthStart: string;
  total: number;
  byMethod: MethodTotal[];
  accounts: BankAccountRow[];
  deposits: DepositRow[];
  unmatchedDeposits: { count: number; amount: number };
  /** Non-cash payments not yet seen in the bank, newest first. */
  unseenPayments: MatchablePayment[];
  canEdit: boolean;
}
