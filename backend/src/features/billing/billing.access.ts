import { assertPermission, can, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";

/** Billing tab keys, as granted per employee in Settings › Team & roles. */
export type BillingTab = "overview" | "sales_invoices" | "claims" | "payment_plans" | "collections" | "tax" | "reports" | "audit";

export const canBillingTab = (user: AuthUser, tab: BillingTab) => can(user, "billing.read") && user.access.billing.tabs.includes(tab);

/** Every billing tab service checks this server-side, not just the page. */
export function assertBillingTab(user: AuthUser, tab: BillingTab) {
  assertPermission(user, "billing.read");
  if (!user.access.billing.tabs.includes(tab)) throw Errors.forbidden("You don't have access to this part of Billing.");
}
