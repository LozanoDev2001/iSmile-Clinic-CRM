import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { InvoicesView, OverviewView } from "@/features/billing/components/billing-views";
import { cn } from "@/lib/utils";
import { listInvoicesQuerySchema } from "@backend/features/billing/billing.schema";
import { getBillingOverview, listInvoices } from "@backend/features/billing/billing.service";
import { can, pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Billing" };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "invoices", label: "Sales invoices" },
] as const;

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ tab?: string; filter?: string; q?: string }> }) {
  const { user, allowed } = await pageCan("billing.read");
  if (!allowed) return <AccessDenied />;
  const params = await searchParams;
  const tab = params.tab === "invoices" ? "invoices" : "overview";
  const query = listInvoicesQuerySchema.parse({ filter: params.filter, search: params.q, page: 1 });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">Billing</h1>
          <p className="text-[13px] text-[#5E6B7E]">Sales invoices, payments and what patients and HMOs still owe</p>
        </div>
        {can(user, "billing.create") ? (
          <Link href="/billing/checkout" className="fill-orange inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-medium text-[#0E2A47] hover:brightness-105">
            <Plus className="size-4" aria-hidden />
            New invoice
          </Link>
        ) : null}
      </div>
      <nav aria-label="Billing sections" className="flex gap-1 border-b border-[#E3E7ED]">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "overview" ? "/billing" : "/billing?tab=invoices"}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn("-mb-px border-b-[3px] px-4 py-3 text-sm font-medium", tab === t.id ? "border-[#F39A1E] text-[#0E2A47]" : "border-transparent text-[#5E6B7E]")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "overview" ? (
        <OverviewView overview={await getBillingOverview(user)} canApprove={can(user, "billing.approve")} />
      ) : (
        <InvoicesView result={await listInvoices(user, query)} filter={query.filter} search={query.search} />
      )}
    </div>
  );
}
