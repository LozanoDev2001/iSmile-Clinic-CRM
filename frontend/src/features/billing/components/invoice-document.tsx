import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { VAT_RATE } from "@backend/features/billing/billing.calc";
import type { InvoiceDetail } from "@backend/features/billing/billing.types";
import type { ClinicProfile } from "@backend/features/settings/settings.types";
import { DISCOUNT_LABELS, STATUS_META, formatWhen, methodLabel, peso, statusLabel } from "../format";

function Row({ label, value, strong }: { label: ReactNode; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4 py-0.5", strong && "font-semibold")}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** The sales invoice as printed. Kept plain (black on white) so it prints cleanly. */
export function InvoiceDocument({ invoice: i, clinic }: { invoice: InvoiceDetail; clinic: ClinicProfile }) {
  const scPwd = i.discountType !== "none";
  return (
    <article aria-label={`Sales invoice ${i.number}`} className="invoice-document print-area flex flex-col gap-5 rounded-[24px] bg-white p-6 text-[#0E2A47] shadow-sm print:rounded-none print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E3E7ED] pb-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-lg font-semibold">{clinic.name}</span>
          {clinic.tagline ? <span className="text-xs text-[#5E6B7E]">{clinic.tagline}</span> : null}
          {clinic.address ? <span className="text-xs text-[#5E6B7E]">{clinic.address}</span> : null}
          {clinic.phone ? <span className="text-xs text-[#5E6B7E]">{clinic.phone}</span> : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs tracking-[0.08em] text-[#5E6B7E] uppercase">Sales invoice</span>
          <span className="text-xl font-semibold">{i.number}</span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs", STATUS_META[i.status].className)}>{statusLabel(i)}</span>
        </div>
      </header>

      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        <Row label="Date" value={formatWhen(i.issuedAt)} />
        <Row label="Patient" value={`${i.patient.name} · ${i.patient.patientNo}`} />
        {i.dentistName ? <Row label="Attending dentist" value={i.dentistName} /> : null}
        <Row label="Payer" value={scPwd ? `${DISCOUNT_LABELS[i.discountType]} · ID ${i.discountIdNo ?? "—"}` : i.payerName ? `${i.payerName}${i.loaNo ? ` · LOA ${i.loaNo}` : ""}` : "Self-pay"} />
        {i.createdBy ? <Row label="Issued by" value={i.createdBy} /> : null}
      </dl>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#E3E7ED] text-left text-xs text-[#5E6B7E]">
            <th className="py-1.5 pr-2 font-normal">Description</th>
            <th className="py-1.5 pr-2 text-right font-normal">Qty</th>
            <th className="py-1.5 pr-2 text-right font-normal">Unit price</th>
            <th className="py-1.5 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {i.lines.map((l, k) => (
            <tr key={k} className="border-b border-[#EDF0F4]">
              <td className="py-1.5 pr-2">{l.description}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{l.qty}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{peso(l.unitPrice)}</td>
              <td className="py-1.5 text-right tabular-nums">{peso(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto flex w-full max-w-sm flex-col text-sm">
        <Row label="Subtotal" value={peso(i.subtotal)} />
        {i.discountTotal ? <Row label={`Less: ${DISCOUNT_LABELS[i.discountType].toLowerCase()} discount`} value={`−${peso(i.discountTotal)}`} /> : null}
        {i.vatableSales ? <Row label="VATable sales" value={peso(i.vatableSales)} /> : null}
        {i.vatExemptSales ? <Row label="VAT-exempt sales" value={peso(i.vatExemptSales)} /> : null}
        {i.vat ? <Row label={`VAT (${VAT_RATE * 100}%)`} value={peso(i.vat)} /> : null}
        <Row label="Total amount due" value={peso(i.total)} strong />
        {i.hmoDue ? <Row label={`Less: charged to ${i.payerName ?? "HMO"}`} value={`−${peso(i.hmoDue)}`} /> : null}
        {i.hmoDue ? <Row label="Patient's share" value={peso(i.patientDue)} strong /> : null}
        <Row label="Paid" value={peso(i.paid)} />
        <Row label="Balance" value={peso(i.balance)} strong />
      </dl>

      {i.payments.length ? (
        <section aria-label="Payments" className="flex flex-col gap-1 text-sm">
          <h2 className="text-xs tracking-[0.08em] text-[#5E6B7E] uppercase">Payments</h2>
          {i.payments.map((p) => (
            <div key={p.id} className="flex flex-wrap justify-between gap-2">
              <span>
                {formatWhen(p.receivedAt)} · {methodLabel(p.method)}
                {p.reference ? ` · ref ${p.reference}` : ""}
                {p.status === "refund_due" ? " · to refund" : ""}
              </span>
              <span className="tabular-nums">{peso(p.amount)}</span>
            </div>
          ))}
        </section>
      ) : null}

      {i.status === "void" ? (
        <p className="rounded-xl bg-[#EEF1F5] px-3 py-2 text-sm">
          Cancelled {i.voidedAt ? formatWhen(i.voidedAt) : ""} · {i.voidReason}
        </p>
      ) : null}
    </article>
  );
}
