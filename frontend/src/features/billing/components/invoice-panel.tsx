import Link from "next/link";
import { FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InvoiceDetail } from "@backend/features/billing/billing.types";
import { STATUS_META, formatOn, peso, statusLabel } from "../format";
import { InvoiceActions } from "./invoice-actions";

interface InvoicePanelProps {
  invoice: InvoiceDetail;
  canPay: boolean;
  canApprove: boolean;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-[#5E6B7E]">{label}</span>
      <span className="truncate text-sm">{value}</span>
    </span>
  );
}

/** The selected sales invoice beside the invoice table, as in the demo. */
export function InvoicePanel({ invoice: i, canPay, canApprove }: InvoicePanelProps) {
  const account = [
    { label: "Subtotal", value: i.subtotal },
    ...(i.discountTotal ? [{ label: "Discount", value: -i.discountTotal }] : []),
    ...(i.vat ? [{ label: "VAT", value: i.vat }] : []),
    ...(i.hmoDue ? [{ label: "HMO share", value: -i.hmoDue }] : []),
    ...(i.paid ? [{ label: "Paid by patient", value: -i.paid }] : []),
  ];
  return (
    <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
      <section aria-label="Selected invoice" className="glass-card flex flex-col gap-3.5 rounded-[26px] p-[22px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs tracking-[0.08em] text-[#46566B] uppercase">Sales invoice</span>
            <span className="text-[22px] tabular-nums">{i.number}</span>
            <span className="text-[13px] text-[#5E6B7E]">{formatOn(i.issuedAt)}</span>
          </div>
          <span className={cn("inline-flex h-[26px] items-center rounded-full px-[11px] text-xs whitespace-nowrap", STATUS_META[i.status].className)}>{statusLabel(i)}</span>
        </div>

        <div className="grid grid-cols-2 gap-x-3.5 gap-y-2 rounded-2xl bg-[#F4F6F9] px-3.5 py-3 text-xs">
          <Info label="Sold to" value={i.patient.name} />
          <Info label="Payer" value={i.payerName ? `${i.payerName}${i.loaNo ? ` · LOA ${i.loaNo}` : ""}` : "Self-pay"} />
          <Info label="Dentist" value={i.dentistName ?? "—"} />
          <Info label="Patient no." value={i.patient.patientNo} />
        </div>

        <ul className="flex flex-col">
          {i.lines.map((l, k) => (
            <li key={k} className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 border-b border-[#EDF0F4] py-2 text-[13px]">
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{l.description}</span>
                <span className="text-[11px] text-[#5E6B7E]">
                  {l.qty} × {peso(l.unitPrice)}
                  {l.discount ? ` · less ${peso(l.discount)}` : ""}
                </span>
              </span>
              <span className="text-right tabular-nums">{peso(l.amount)}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1.5 text-[13px]">
          {account.map((a) => (
            <div key={a.label} className="flex justify-between gap-2.5 text-[#46566B]">
              <span>{a.label}</span>
              <span className="tabular-nums">{a.value < 0 ? `− ${peso(-a.value)}` : peso(a.value)}</span>
            </div>
          ))}
          <div className="flex justify-between gap-2.5 border-t border-[#E3E7ED] pt-2 text-[15px]">
            <span>{i.status === "void" ? "Cancelled" : "Patient balance"}</span>
            <span className={cn("tabular-nums", i.balance > 0 && "text-[#A1301F]")}>{peso(i.balance)}</span>
          </div>
        </div>

        <Link href={`/billing/invoices/${i.id}`} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#F39A1E] text-sm font-medium text-[#0E2A47] hover:brightness-105">
          <FileDown className="size-[18px]" aria-hidden />
          Preview, print or download PDF
        </Link>
      </section>
      <InvoiceActions invoice={i} canPay={canPay} canCancel={canPay} canApprove={canApprove} showPrint={false} />
    </div>
  );
}
