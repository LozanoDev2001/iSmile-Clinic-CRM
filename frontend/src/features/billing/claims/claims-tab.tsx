import Link from "next/link";
import { cn } from "@/lib/utils";
import { CLAIM_FILTERS } from "@backend/features/billing/claims/claims.schema";
import { getClaimsBoard } from "@backend/features/billing/claims/claims.service";
import type { ClaimFilter, ClaimRow, ClaimStatus } from "@backend/features/billing/claims/claims.types";
import { can } from "@backend/lib/authorization";
import { billingHref, type BillingTabProps } from "../billing-tabs";
import { formatOn, peso } from "../format";
import { ClaimActions } from "./claim-actions";

const OVERDUE_DAYS = 45;
const FILTER_LABELS: Record<ClaimFilter, string> = { submitted: "Submitted", approved: "Approved", paid: "Paid", denied: "Denied", all: "All" };

const STATUS_PILL: Record<ClaimStatus, { label: string; className: string }> = {
  submitted: { label: "Awaiting approval", className: "bg-[#FDE3BD] text-[#5A3500]" },
  approved: { label: "Approved", className: "bg-[#C9DCF6] text-[#0E2A47]" },
  paid: { label: "Paid", className: "bg-[#9EDBC0] text-[#0B3D26]" },
  denied: { label: "Denied", className: "bg-[#F9B4AA] text-[#5A1308]" },
  cancelled: { label: "Cancelled", className: "bg-[#EEF1F5] text-[#46566B] line-through" },
  draft: { label: "Draft", className: "bg-[#EEF1F5] text-[#46566B]" },
};

const th = "border-b border-[#E3E7ED] px-3.5 py-3 text-left text-[11px] font-medium tracking-[0.06em] whitespace-nowrap text-[#5E6B7E] uppercase";
const td = "border-b border-[#EDF0F4] px-3.5 py-[11px] text-[13px] whitespace-nowrap";
const pillClass = "inline-flex h-[26px] items-center rounded-full px-[11px] text-xs whitespace-nowrap";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function StageCard({ href, label, value, note, tone }: { href: string; label: string; value: string; note: string; tone: string }) {
  return (
    <Link href={href} className="flex min-w-0 flex-col gap-0.5 rounded-[22px] p-3.5 text-[#0E2A47] hover:brightness-[1.03]" style={{ background: tone }}>
      <span className="text-[13px]">{label}</span>
      <span className="text-[26px] leading-tight font-light tabular-nums">{value}</span>
      <span className="truncate text-xs opacity-80">{note}</span>
    </Link>
  );
}

function statusNote(c: ClaimRow) {
  if (c.status === "paid") return `${peso(c.paidAmount ?? 0)} on ${c.paidAt ? formatOn(c.paidAt) : "—"} · ${c.paymentRef ?? ""}`;
  if (c.status === "denied") return c.deniedReason;
  if (c.status === "approved" && c.approved !== c.claimed) return `${peso(c.approved)} approved`;
  return null;
}

export async function ClaimsTab({ user, params }: BillingTabProps) {
  const board = await getClaimsBoard(user, { status: params.status });
  const canUpdate = can(user, "billing.update");
  const href = (status: ClaimFilter) => billingHref("claims", { status: status === "submitted" ? undefined : status });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StageCard href={href("submitted")} label="Awaiting approval" value={peso(board.awaitingApproval)} note={`${plural(board.counts.submitted, "claim")} sent to HMOs`} tone="#FDE3BD" />
        <StageCard href={href("approved")} label="Approved, not yet paid" value={peso(board.approvedUnpaid)} note={`${plural(board.counts.approved, "claim")} awaiting payment`} tone="#C9DCF6" />
        <StageCard href={href("paid")} label="Paid this month" value={peso(board.paidThisMonth)} note="Received from HMOs" tone="#9EDBC0" />
        <StageCard href={href("denied")} label="Denied" value={String(board.counts.denied)} note="Bill the patient instead" tone="#F9B4AA" />
      </div>

      <nav aria-label="Filter claims" className="flex flex-wrap gap-2">
        {CLAIM_FILTERS.map((f) => (
          <Link
            key={f}
            href={href(f)}
            aria-current={board.status === f ? "page" : undefined}
            className={cn("inline-flex h-9 items-center gap-1 rounded-full border px-3.5 text-[13px]", board.status === f ? "border-[#1D5296] bg-[#1D5296] text-white" : "border-[#D5DCE5] bg-white text-[#46566B] hover:bg-[#F4F6F9]")}
          >
            {FILTER_LABELS[f]} <span className="opacity-70">{board.counts[f]}</span>
          </Link>
        ))}
      </nav>

      <section aria-label="HMO claims" className="glass-card min-w-0 overflow-hidden rounded-[26px]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Invoice no.</th>
                <th className={th}>Patient</th>
                <th className={th}>Payer</th>
                <th className={th}>LOA no.</th>
                <th className={cn(th, "text-right")}>Amount</th>
                <th className={th}>Submitted</th>
                <th className={cn(th, "text-right")}>Age</th>
                <th className={th}>Status</th>
                {canUpdate ? <th className={th}>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {board.claims.map((c) => {
                const note = statusNote(c);
                return (
                  <tr key={c.id} className="hover:bg-[#F7F9FC]">
                    <td className={td}>
                      <Link href={`/billing/invoices/${c.invoice.id}`} className="text-[#1D5296] tabular-nums underline underline-offset-3">
                        {c.invoice.number}
                      </Link>
                    </td>
                    <td className={td}>
                      {c.patient.name} <span className="text-xs text-[#5E6B7E]">{c.patient.patientNo}</span>
                    </td>
                    <td className={cn(td, "text-[#46566B]")}>{c.payerName}</td>
                    <td className={cn(td, "text-[#46566B]")}>{c.loaNo ?? "—"}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{peso(c.claimed)}</td>
                    <td className={cn(td, "text-[#5E6B7E]")}>{c.submittedAt ? formatOn(c.submittedAt) : "—"}</td>
                    <td className={cn(td, "text-right tabular-nums", c.ageDays !== null && c.ageDays > OVERDUE_DAYS ? "text-[#A1301F]" : "text-[#46566B]")}>{c.ageDays !== null ? `${c.ageDays} d` : "—"}</td>
                    <td className={td}>
                      <span className="flex flex-col items-start gap-0.5">
                        <span className={cn(pillClass, STATUS_PILL[c.status].className)}>{STATUS_PILL[c.status].label}</span>
                        {note ? <span className="max-w-56 truncate text-xs text-[#5E6B7E]">{note}</span> : null}
                      </span>
                    </td>
                    {canUpdate ? (
                      <td className={td}>
                        <ClaimActions claimId={c.id} status={c.status} invoiceNumber={c.invoice.number} patientName={c.patient.name} claimed={c.claimed} approved={c.approved} />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {board.claims.length === 0 ? (
          <p className="px-3.5 py-8 text-center text-sm text-[#5E6B7E]">No {board.status === "all" ? "" : `${FILTER_LABELS[board.status].toLowerCase()} `}claims. Claims are created when an invoice is billed to an HMO at checkout.</p>
        ) : null}
        <p className="px-3.5 py-3 text-xs text-[#5E6B7E]">
          {board.truncated ? `Showing the newest ${board.claims.length}.` : plural(board.claims.length, "claim")} · open claims over {OVERDUE_DAYS} days are shown in red
        </p>
      </section>
    </div>
  );
}
