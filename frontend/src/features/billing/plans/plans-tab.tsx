import Link from "next/link";
import { clinicToday } from "@/config/clinic";
import { cn } from "@/lib/utils";
import { PLAN_FILTERS } from "@backend/features/billing/plans/plans.schema";
import { getPlansBoard } from "@backend/features/billing/plans/plans.service";
import type { PlanDetail, PlanFilter, PlanSummary } from "@backend/features/billing/plans/plans.types";
import { can } from "@backend/lib/authorization";
import { billingHref, type BillingTabProps } from "../billing-tabs";
import { peso } from "../format";
import { INSTALLMENT_META, PLAN_STATUS_META, formatDue } from "./format";
import { NewPlanForm } from "./new-plan-form";
import { PlanActions } from "./plan-actions";

const FILTER_LABELS: Record<PlanFilter, string> = { active: "Active", overdue: "Overdue", completed: "Completed", all: "All" };
const th = "border-b border-[#E3E7ED] px-3.5 py-3 text-left text-[11px] font-medium tracking-[0.06em] whitespace-nowrap text-[#5E6B7E] uppercase";
const td = "border-b border-[#EDF0F4] px-3.5 py-[11px] text-[13px] whitespace-nowrap";
const pill = "inline-flex h-[26px] items-center rounded-full px-[11px] text-xs whitespace-nowrap";

function Progress({ paid, of }: { paid: number; of: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block h-2 w-16 rounded-full bg-[#EDF0F4]">
        <span className="block h-2 rounded-full bg-[#1D5296]" style={{ width: `${of ? Math.round((paid / of) * 100) : 0}%` }} />
      </span>
      {paid}/{of}
    </span>
  );
}

function PlanRow({ plan: p, filter, selected }: { plan: PlanSummary; filter: PlanFilter; selected: boolean }) {
  return (
    <tr className={selected ? "bg-[#EEF3FA]" : "hover:bg-[#F7F9FC]"}>
      <td className={td}>
        <Link href={billingHref("plans", { status: filter, plan: p.id })} aria-current={selected ? "true" : undefined} className="text-[#1D5296] underline underline-offset-3">
          {p.patient.name}
        </Link>
      </td>
      <td className={cn(td, "text-[#46566B]")}>
        {p.invoice ? (
          <Link href={`/billing/invoices/${p.invoice.id}`} className="tabular-nums hover:underline">
            {p.invoice.number}
          </Link>
        ) : (
          "—"
        )}
      </td>
      <td className={cn(td, "text-right tabular-nums")}>{peso(p.total)}</td>
      <td className={cn(td, "text-right tabular-nums")}>{peso(p.monthly)}</td>
      <td className={td}>
        <Progress paid={p.installmentsPaid} of={p.installmentsTotal} />
      </td>
      <td className={cn(td, p.status === "overdue" && "text-[#A1301F]")}>{p.nextDue ? formatDue(p.nextDue.dueOn) : "—"}</td>
      <td className={td}>
        <span className={cn(pill, PLAN_STATUS_META[p.status].className)}>{PLAN_STATUS_META[p.status].label}</span>
      </td>
    </tr>
  );
}

function PlanSchedule({ plan: p, canEdit }: { plan: PlanDetail; canEdit: boolean }) {
  const counted = p.installments.filter((i) => i.status !== "cancelled");
  const open = p.status === "active" || p.status === "overdue";
  return (
    <section aria-label="Plan schedule" className="glass-card flex min-w-0 flex-[1_1_320px] flex-col gap-2.5 rounded-[26px] p-5">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-[#5E6B7E]">Plan schedule</span>
        <h2 className="text-xl font-normal">{p.patient.name}</h2>
        <span className="text-[13px] text-[#46566B]">
          {p.invoice?.number ?? "No invoice"} · {counted.length} monthly payments of {peso(p.monthly)}
        </span>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-[#F4F6F9] px-3.5 py-2.5 text-[13px]">
        <span className="text-[#5E6B7E]">Paid so far</span>
        <span className="tabular-nums">
          {peso(p.paidAmount)} of {peso(p.total)}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {p.installments.map((i) => {
          const meta = INSTALLMENT_META[i.overdue ? "overdue" : i.status];
          const index = counted.indexOf(i);
          return (
            <li key={i.id} className={cn("flex items-center gap-2.5 text-[13px]", i.status === "cancelled" && "text-[#8A97A8]")}>
              <span className={cn("size-2.5 shrink-0 rounded-full", meta.dot)} aria-hidden />
              <span className="flex min-w-0 grow flex-col">
                <span>{index >= 0 ? `Payment ${index + 1} of ${counted.length}` : "Cancelled payment"}</span>
                <span className="text-[11px] text-[#5E6B7E]">Due {formatDue(i.dueOn)}</span>
              </span>
              <span className={cn("tabular-nums", i.status === "cancelled" && "line-through")}>{peso(i.amount)}</span>
              <span className={cn("w-16 text-right", i.overdue ? "text-[#A1301F]" : "text-[#5E6B7E]")}>{meta.label}</span>
            </li>
          );
        })}
      </ul>
      {canEdit && open ? <PlanActions key={p.nextDue?.id ?? p.id} planId={p.id} next={p.nextDue} number={p.installmentsPaid + 1} of={p.installmentsTotal} /> : null}
    </section>
  );
}

export async function PlansTab({ user, params }: BillingTabProps) {
  const board = await getPlansBoard(user, params);
  const canEdit = can(user, "billing.update");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Filter payment plans" className="flex flex-wrap gap-2">
          {PLAN_FILTERS.map((f) => (
            <Link
              key={f}
              href={billingHref("plans", { status: f })}
              aria-current={board.filter === f ? "page" : undefined}
              className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px]", board.filter === f ? "border-[#1D5296] bg-[#1D5296] text-white" : "border-[#D5DCE5] bg-white text-[#46566B] hover:bg-[#F4F6F9]")}
            >
              {FILTER_LABELS[f]}
              <span className="opacity-70">{board.counts[f]}</span>
            </Link>
          ))}
        </nav>
      </div>

      {canEdit ? <NewPlanForm invoices={board.eligibleInvoices} today={clinicToday()} /> : null}

      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Payment plans" className="glass-card min-w-0 flex-[999_1_560px] overflow-hidden rounded-[26px]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Patient</th>
                  <th className={th}>Invoice</th>
                  <th className={cn(th, "text-right")}>Total</th>
                  <th className={cn(th, "text-right")}>Monthly</th>
                  <th className={th}>Paid</th>
                  <th className={th}>Next due</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {board.plans.map((p) => (
                  <PlanRow key={p.id} plan={p} filter={board.filter} selected={p.id === board.selected?.id} />
                ))}
              </tbody>
            </table>
          </div>
          {board.plans.length === 0 ? (
            <p className="px-3.5 py-8 text-center text-sm text-[#5E6B7E]">{board.counts.all ? "No plans match this filter." : "No payment plans yet. Split an unpaid invoice into monthly payments with New payment plan."}</p>
          ) : null}
        </section>
        {board.selected ? <PlanSchedule plan={board.selected} canEdit={canEdit} /> : null}
      </div>
    </div>
  );
}
