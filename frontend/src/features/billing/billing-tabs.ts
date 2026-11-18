import type { BillingTab } from "@backend/features/billing/billing.access";
import type { AuthUser } from "@backend/lib/authorization";

/** Query params every billing tab receives; arrays from the URL are reduced to their first value by the page. */
export type BillingSearchParams = Record<string, string | undefined>;

export interface BillingTabProps {
  user: AuthUser;
  params: BillingSearchParams;
}

/** URL `?tab=` value, the access tab it needs, and its label, in display order. */
export const BILLING_TABS: { param: string; access: BillingTab; label: string }[] = [
  { param: "overview", access: "overview", label: "Overview" },
  { param: "invoices", access: "sales_invoices", label: "Sales invoices" },
  { param: "claims", access: "claims", label: "HMO & PhilHealth" },
  { param: "plans", access: "payment_plans", label: "Payment plans" },
  { param: "collections", access: "collections", label: "Collections & bank" },
  { param: "tax", access: "tax", label: "BIR & tax" },
  { param: "reports", access: "reports", label: "Reports" },
  { param: "audit", access: "audit", label: "Audit trail" },
];

/** A billing URL for a tab with extra query params; empty values are dropped. */
export function billingHref(tab: string, params: Record<string, string | undefined> = {}) {
  const search = new URLSearchParams(tab === "overview" ? {} : { tab });
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const qs = search.toString();
  return qs ? `/billing?${qs}` : "/billing";
}
