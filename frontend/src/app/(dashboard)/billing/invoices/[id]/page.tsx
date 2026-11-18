import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { InvoiceActions } from "@/features/billing/components/invoice-actions";
import { InvoiceDocument } from "@/features/billing/components/invoice-document";
import { invoiceIdSchema } from "@backend/features/billing/billing.schema";
import { getInvoice, getInvoiceClinic } from "@backend/features/billing/billing.service";
import { can, pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Sales invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, allowed } = await pageCan("billing.read");
  if (!allowed) return <AccessDenied />;
  const { id } = await params;
  if (!invoiceIdSchema.safeParse(id).success) notFound();
  const [invoice, clinic] = await Promise.all([getInvoice(user, id), getInvoiceClinic(user)]);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/billing?tab=invoices" className="inline-flex items-center gap-1.5 self-start text-sm text-[#1D5296] print:hidden">
        <ArrowLeft className="size-4" aria-hidden />
        Sales invoices
      </Link>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,820px)_340px] xl:items-start">
        <InvoiceDocument invoice={invoice} clinic={clinic} />
        <InvoiceActions invoice={invoice} canPay={can(user, "billing.update")} canCancel={can(user, "billing.update")} canApprove={can(user, "billing.approve")} />
      </div>
    </div>
  );
}
