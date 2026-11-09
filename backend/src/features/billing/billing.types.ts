import type { z } from "zod";
import type { ServiceKind } from "@backend/features/catalog/catalog.types";
import type { NamedRef } from "@backend/features/patients/patients.types";
import type { DiscountType, InvoiceTotals } from "./billing.calc";
import type { INVOICE_FILTERS, PAYMENT_METHODS, checkoutSchema, paymentInputSchema } from "./billing.schema";

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];
export type InvoiceStatus = "issued" | "part_paid" | "paid" | "void";
export type CheckoutInput = z.input<typeof checkoutSchema>;
export type PaymentInput = z.input<typeof paymentInputSchema>;

export interface PatientRef {
  id: string;
  name: string;
  patientNo: string;
}

export interface InvoiceSummary {
  id: string;
  number: string;
  issuedAt: Date;
  status: InvoiceStatus;
  patient: PatientRef;
  payerName: string | null;
  discountType: DiscountType;
  total: number;
  hmoDue: number;
  patientDue: number;
  paid: number;
  /** What the patient still owes. */
  balance: number;
}

export interface InvoiceLine {
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
  discount: number;
}

export interface InvoicePayment {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  receivedAt: Date;
  status: string;
  recordedBy: string | null;
}

export interface VoidRequest {
  id: string;
  reason: string;
  requestedBy: string;
  createdAt: Date;
}

export interface InvoiceDetail extends InvoiceSummary {
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  subtotal: number;
  discountTotal: number;
  discountIdNo: string | null;
  vatableSales: number;
  vatExemptSales: number;
  vat: number;
  loaNo: string | null;
  dentistName: string | null;
  appointmentId: string | null;
  createdBy: string | null;
  voidReason: string | null;
  voidedAt: Date | null;
  pendingVoid: VoidRequest | null;
}

export interface CheckoutService extends NamedRef {
  price: number;
  kind: ServiceKind;
  hmoCoverable: boolean;
}

export interface CheckoutContext {
  patient: PatientRef & { payer: NamedRef | null; scPwdId: string | null; age: number | null };
  appointment: { id: string; startsAt: Date; dentistName: string | null; serviceId: string | null } | null;
  services: CheckoutService[];
  vatRegistered: boolean;
}

export interface PaymentRow extends InvoicePayment {
  invoiceId: string | null;
  invoiceNumber: string | null;
  patientName: string | null;
}

export interface PendingVoid extends VoidRequest {
  invoice: InvoiceSummary;
}

export interface BillingOverview {
  collectedToday: number;
  collectedThisMonth: number;
  unpaidBalance: number;
  hmoPending: number;
  unpaid: InvoiceSummary[];
  latestPayments: PaymentRow[];
  pendingVoids: PendingVoid[];
}

export interface PatientBilling {
  totalBilled: number;
  balance: number;
}

export type { InvoiceTotals };
