"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/styles";
import { cn } from "@/lib/utils";
import { SC_PWD_DISCOUNT_RATE, VAT_RATE, calculateInvoice, type DiscountType } from "@backend/features/billing/billing.calc";
import { checkoutAction } from "@backend/features/billing/billing.controller";
import type { CheckoutContext, CheckoutInput } from "@backend/features/billing/billing.types";
import { SERVICE_KIND_LABELS } from "@backend/features/catalog/catalog.types";
import { formatWhen, peso } from "../format";
import { PaymentFields, emptyPayment, type PaymentDraft } from "./payment-fields";

const SENIOR_AGE = 60;
const MAX_QTY = 99;

type Payer = "self" | "hmo" | DiscountType;

interface Line {
  key: number;
  serviceId: string;
  qty: number;
  toothCode: string;
}

const chip = (on: boolean) => cn("h-10 rounded-full border px-4 text-sm disabled:opacity-40", on ? "border-[#0E2A47] bg-[#0E2A47] text-white" : "border-[#D5DCE5] bg-white");

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "red" | "blue" }) {
  return (
    <div className={cn("flex justify-between gap-3 text-sm", strong && "text-base font-semibold", tone === "red" && "text-[#B42318]", tone === "blue" && "text-[#1D5296]")}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

export function CheckoutForm({ context }: { context: CheckoutContext }) {
  const router = useRouter();
  const { patient, appointment, services, vatRegistered } = context;
  const byId = new Map(services.map((s) => [s.id, s]));

  const [lines, setLines] = useState<Line[]>(() => (appointment?.serviceId && byId.has(appointment.serviceId) ? [{ key: 1, serviceId: appointment.serviceId, qty: 1, toothCode: "" }] : []));
  const [nextKey, setNextKey] = useState(2);
  const [payer, setPayer] = useState<Payer>(() => (patient.scPwdId ? ((patient.age ?? 0) >= SENIOR_AGE ? "sc" : "pwd") : "self"));
  const [discountIdNo, setDiscountIdNo] = useState(patient.scPwdId ?? "");
  const [loaNo, setLoaNo] = useState("");
  const [takePayment, setTakePayment] = useState(true);
  const [payment, setPayment] = useState<PaymentDraft | null>(null);
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();

  const discountType: DiscountType = payer === "sc" || payer === "pwd" ? payer : "none";
  const totals = calculateInvoice({
    lines: lines.map((l) => ({ unitPrice: byId.get(l.serviceId)?.price ?? 0, qty: l.qty, hmoCoverable: byId.get(l.serviceId)?.hmoCoverable ?? false })),
    discountType,
    hmo: payer === "hmo",
    vatRegistered,
  });
  // The amount follows what the patient owes until staff type their own.
  const draft = payment ?? emptyPayment(totals.patientDue);

  const updateLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = (serviceId: string) => {
    if (!serviceId) return;
    setLines((ls) => [...ls, { key: nextKey, serviceId, qty: 1, toothCode: "" }]);
    setNextKey((k) => k + 1);
  };

  const issue = () => {
    setError("");
    const input: CheckoutInput = {
      patientId: patient.id,
      appointmentId: appointment?.id ?? null,
      lines: lines.map((l) => ({ serviceId: l.serviceId, qty: l.qty, toothCode: l.toothCode.trim() || null })),
      discountType,
      discountIdNo: discountType === "none" ? null : discountIdNo,
      hmo: payer === "hmo",
      loaNo: payer === "hmo" ? loaNo : null,
      payment: takePayment && totals.patientDue > 0 ? { method: draft.method, amount: draft.amount, reference: draft.reference || null } : null,
    };
    startSaving(async () => {
      const result = await checkoutAction(input);
      if (!result.success) {
        const fieldMessage = Object.values(result.error.fields ?? {})[0]?.[0];
        setError(fieldMessage ?? result.error.message);
        return;
      }
      toast.success(`Invoice ${result.data.number} issued.`);
      router.push(`/billing/invoices/${result.data.id}`);
    });
  };

  const payers: { id: Payer; label: string; disabled?: boolean }[] = [
    { id: "self", label: "Self-pay" },
    { id: "hmo", label: patient.payer ? patient.payer.name : "HMO (none on file)", disabled: !patient.payer },
    { id: "sc", label: "Senior citizen" },
    { id: "pwd", label: "PWD" },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <section aria-label="Patient and visit" className="glass-card flex flex-wrap items-baseline justify-between gap-2 rounded-[24px] p-5">
          <span className="text-xl">
            {patient.name} <span className="text-sm text-[#5E6B7E]">{patient.patientNo}</span>
          </span>
          <span className="text-sm text-[#5E6B7E]">{appointment ? `Visit ${formatWhen(appointment.startsAt)}${appointment.dentistName ? ` · ${appointment.dentistName}` : ""}` : "Not linked to a visit"}</span>
        </section>

        <section aria-label="Services and items" className="glass-card flex flex-col gap-3 rounded-[24px] p-5">
          <h2 className="text-lg">Services and items</h2>
          {lines.length === 0 ? <p className="text-sm text-[#5E6B7E]">No services yet. Pick one from the list below.</p> : null}
          <ul className="flex flex-col divide-y divide-[#EDF0F4]">
            {lines.map((l, i) => {
              const s = byId.get(l.serviceId);
              if (!s) return null;
              return (
                <li key={l.key} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px]">{s.name}</span>
                    <span className="text-xs text-[#5E6B7E]">
                      {peso(s.price)} each{s.hmoCoverable ? " · HMO can cover" : ""}
                    </span>
                  </span>
                  {s.kind === "service" ? (
                    <label className="flex items-center gap-1.5 text-xs text-[#46566B]">
                      Tooth
                      <input
                        value={l.toothCode}
                        onChange={(e) => updateLine(l.key, { toothCode: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                        inputMode="numeric"
                        placeholder="—"
                        aria-label={`Tooth number for ${s.name}`}
                        className="h-9 w-14 rounded-full border border-[#D5DCE5] bg-white text-center text-sm"
                      />
                    </label>
                  ) : null}
                  <span className="flex items-center gap-1">
                    <button type="button" aria-label="Fewer" disabled={l.qty <= 1} onClick={() => updateLine(l.key, { qty: l.qty - 1 })} className="grid size-8 place-items-center rounded-full border border-[#D5DCE5] bg-white disabled:opacity-40">
                      <Minus className="size-3.5" aria-hidden />
                    </button>
                    <span className="w-6 text-center text-sm tabular-nums" aria-label="Quantity">
                      {l.qty}
                    </span>
                    <button type="button" aria-label="More" disabled={l.qty >= MAX_QTY} onClick={() => updateLine(l.key, { qty: l.qty + 1 })} className="grid size-8 place-items-center rounded-full border border-[#D5DCE5] bg-white disabled:opacity-40">
                      <Plus className="size-3.5" aria-hidden />
                    </button>
                  </span>
                  <span className="w-24 text-right text-sm tabular-nums">{peso(totals.lines[i]?.amount ?? 0)}</span>
                  <button type="button" aria-label={`Remove ${s.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="grid size-8 place-items-center rounded-full hover:bg-[#F4F6F9]">
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          <select aria-label="Add a service or item" value="" onChange={(e) => addLine(e.target.value)} className={selectClass}>
            <option value="">+ Add a service or item…</option>
            {(["service", "product"] as const).map((kind) => (
              <optgroup key={kind} label={SERVICE_KIND_LABELS[kind]}>
                {services
                  .filter((s) => s.kind === kind)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {peso(s.price)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </section>

        <section aria-label="Who pays" className="glass-card flex flex-col gap-3 rounded-[24px] p-5">
          <h2 className="text-lg">Who pays</h2>
          <div role="group" aria-label="Payer" className="flex flex-wrap gap-2">
            {payers.map((p) => (
              <button key={p.id} type="button" aria-pressed={payer === p.id} disabled={p.disabled} onClick={() => setPayer(p.id)} className={chip(payer === p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          {discountType !== "none" ? (
            <label className="flex flex-col gap-2 text-sm text-[#46566B]">
              {payer === "sc" ? "Senior citizen" : "PWD"} ID no.
              <input value={discountIdNo} onChange={(e) => setDiscountIdNo(e.target.value)} className={selectClass} />
              <span className="text-xs text-[#5E6B7E]">
                {SC_PWD_DISCOUNT_RATE * 100}% off{vatRegistered ? " and VAT-exempt" : ""}. Keep a copy of the ID with the invoice.
              </span>
            </label>
          ) : null}
          {payer === "hmo" ? (
            <label className="flex flex-col gap-2 text-sm text-[#46566B]">
              Letter of authorization (LOA) no.
              <input value={loaNo} onChange={(e) => setLoaNo(e.target.value)} className={selectClass} />
              <span className="text-xs text-[#5E6B7E]">{patient.payer?.name} pays for the items marked “HMO can cover”; the patient pays the rest.</span>
            </label>
          ) : null}
        </section>

        {totals.patientDue > 0 ? (
          <section aria-label="Payment" className="glass-card flex flex-col gap-3 rounded-[24px] p-5">
            <label className="flex items-center gap-2 text-lg">
              <input type="checkbox" checked={takePayment} onChange={(e) => setTakePayment(e.target.checked)} className="size-4 accent-[#1D5296]" />
              Take payment now
            </label>
            {takePayment ? <PaymentFields value={draft} onChange={setPayment} idPrefix="checkout" /> : <p className="text-sm text-[#5E6B7E]">The full amount stays as a balance to collect.</p>}
          </section>
        ) : null}
      </div>

      <aside aria-label="Invoice summary" className="glass-card flex flex-col gap-3 rounded-[24px] p-5 xl:sticky xl:top-4">
        <h2 className="text-lg">Invoice summary</h2>
        <dl className="flex flex-col gap-1.5">
          <Row label={vatRegistered ? "Subtotal (before VAT)" : "Subtotal"} value={peso(totals.subtotal)} />
          {totals.discountTotal ? <Row label={`Less: ${payer === "sc" ? "senior citizen" : "PWD"} discount`} value={`−${peso(totals.discountTotal)}`} tone="red" /> : null}
          {vatRegistered ? (
            <>
              <Row label="VATable sales" value={peso(totals.vatableSales)} />
              <Row label="VAT-exempt sales" value={peso(totals.vatExemptSales)} />
              <Row label={`VAT (${VAT_RATE * 100}%)`} value={peso(totals.vat)} />
            </>
          ) : null}
          <div className="my-1 border-t border-[#E3E7ED]" />
          <Row label="Total amount due" value={peso(totals.total)} strong />
          {totals.hmoDue ? <Row label={`${patient.payer?.name ?? "HMO"} pays`} value={peso(totals.hmoDue)} tone="blue" /> : null}
          <Row label="Patient pays" value={peso(totals.patientDue)} strong />
        </dl>
        {error ? (
          <p role="alert" className="rounded-xl bg-[#FDECEA] px-3 py-2 text-sm text-[#A1301F]">
            {error}
          </p>
        ) : null}
        <button type="button" disabled={saving || lines.length === 0} onClick={issue} className="fill-orange h-12 rounded-full text-[15px] font-medium text-[#0E2A47] hover:brightness-105 disabled:opacity-50">
          {saving ? "Issuing…" : "Issue invoice"}
        </button>
        <p className="text-xs text-[#5E6B7E]">Issued invoices can&apos;t be edited. To fix a mistake, cancel it and issue a new one.</p>
      </aside>
    </div>
  );
}
