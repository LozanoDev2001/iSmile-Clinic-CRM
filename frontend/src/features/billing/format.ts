import { CLINIC_TIME_ZONE } from "@/config/clinic";
import type { DiscountType } from "@backend/features/billing/billing.calc";
import type { InvoiceStatus, InvoiceSummary, PaymentMethod } from "@backend/features/billing/billing.types";

const pesoFormat = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export const peso = (n: number) => pesoFormat.format(n);

const dateTimeFormat = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: CLINIC_TIME_ZONE });
const dateFormat = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: CLINIC_TIME_ZONE });
export const formatWhen = (d: Date) => dateTimeFormat.format(d);
export const formatOn = (d: Date) => dateFormat.format(d);

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  gcash: "GCash",
  maya: "Maya",
  bank_transfer: "Bank transfer",
};

export const DISCOUNT_LABELS: Record<DiscountType, string> = {
  none: "No discount",
  sc: "Senior citizen",
  pwd: "PWD",
};

export const STATUS_META: Record<InvoiceStatus, { label: string; className: string }> = {
  issued: { label: "Unpaid", className: "bg-[#FDECEA] text-[#B42318]" },
  part_paid: { label: "Partially paid", className: "bg-[#FEF1DF] text-[#A55A00]" },
  paid: { label: "Paid", className: "bg-[#E3F4EA] text-[#1F7A4D]" },
  void: { label: "Cancelled", className: "bg-[#EEF1F5] text-[#5E6B7E] line-through" },
};

/** "Paid · HMO share pending" style label: the patient's side first, then the HMO's. */
export function statusLabel(i: Pick<InvoiceSummary, "status" | "hmoDue">) {
  const base = STATUS_META[i.status].label;
  return i.status === "paid" && i.hmoDue > 0 ? `${base} · HMO share billed` : base;
}

export const methodLabel = (method: string) => METHOD_LABELS[method as PaymentMethod] ?? method;
