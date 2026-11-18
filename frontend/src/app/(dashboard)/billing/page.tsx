import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { clinicToday } from "@/config/clinic";
import { formatLongDate } from "@/features/appointments/calendar-state";
import { AuditTab } from "@/features/billing/audit/audit-tab";
import { CollectionsTab } from "@/features/billing/bank/collections-tab";
import { BillingReportsTab } from "@/features/billing/reports/billing-reports-tab";
import { PlansTab } from "@/features/billing/plans/plans-tab";
import { ClaimsTab } from "@/features/billing/claims/claims-tab";
import { BILLING_TABS, billingHref, type BillingSearchParams, type BillingTabProps } from "@/features/billing/billing-tabs";
import { InvoicesView, OverviewView, VoidRequests } from "@/features/billing/components/billing-views";
import { InvoicePanel } from "@/features/billing/components/invoice-panel";
import { TaxTab } from "@/features/billing/tax/tax-tab";
import { cn } from "@/lib/utils";
import { canBillingTab } from "@backend/features/billing/billing.access";
import { invoiceIdSchema, listInvoicesQuerySchema } from "@backend/features/billing/billing.schema";
import { getBillingOverview, getInvoice, listInvoices } from "@backend/features/billing/billing.service";
import { can, pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Billing" };

async function OverviewTab({ user }: BillingTabProps) {
  const overview = await getBillingOverview(user);
  return (
    <>
      {can(user, "billing.approve") ? <VoidRequests overview={overview} /> : null}
      <OverviewView overview={overview} />
    </>
  );
}

async function InvoicesTab({ user, params }: BillingTabProps) {
  const query = listInvoicesQuerySchema.parse({ filter: params.filter, search: params.q, page: 1 });
  const result = await listInvoices(user, query);
  const selectedId = invoiceIdSchema.safeParse(params.inv).success ? params.inv : result.items[0]?.id;
  const selected = selectedId ? await getInvoice(user, selectedId) : null;
  return (
    <InvoicesView
      result={result}
      filter={query.filter}
      search={query.search}
      selectedId={selected?.id}
      aside={selected ? <InvoicePanel invoice={selected} canPay={can(user, "billing.update")} canApprove={can(user, "billing.approve")} /> : null}
    />
  );
}

const TAB_VIEWS: Record<string, (props: BillingTabProps) => Promise<ReactNode>> = {
  overview: OverviewTab,
  invoices: InvoicesTab,
  claims: ClaimsTab,
  plans: PlansTab,
  collections: CollectionsTab,
  tax: TaxTab,
  reports: BillingReportsTab,
  audit: AuditTab,
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, allowed } = await pageCan("billing.read");
  if (!allowed) return <AccessDenied />;
  const raw = await searchParams;
  const params: BillingSearchParams = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const tabs = BILLING_TABS.filter((t) => TAB_VIEWS[t.param] && canBillingTab(user, t.access));
  const tab = tabs.find((t) => t.param === (params.tab ?? "overview")) ?? tabs[0];
  if (!tab) return <AccessDenied />;
  const View = TAB_VIEWS[tab.param];

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-[1_1_420px] flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-light tracking-[-0.01em] sm:text-[34px]">Billing</h1>
          <p className="text-[13px] text-[#5E6B7E]">Invoices, payment plans and collections · as of {formatLongDate(clinicToday())}</p>
        </div>
        {can(user, "billing.create") ? (
          <Link href="/billing/checkout" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#F39A1E] px-5 text-sm font-medium text-[#0E2A47] hover:brightness-105">
            <Plus className="size-4" aria-hidden />
            New sales invoice
          </Link>
        ) : null}
      </div>

      <nav aria-label="Billing sections" className="flex flex-wrap gap-1.5 self-start rounded-[24px] bg-white p-1.5">
        {tabs.map((t) => (
          <Link
            key={t.param}
            href={billingHref(t.param)}
            aria-current={tab.param === t.param ? "page" : undefined}
            className={cn("inline-flex h-10 items-center rounded-full px-4 text-sm", tab.param === t.param ? "bg-[#1D5296] text-white" : "text-[#46566B] hover:bg-[#F4F6F9]")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <View user={user} params={params} />
    </div>
  );
}
