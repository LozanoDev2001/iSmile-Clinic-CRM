import Link from "next/link";
import { cn } from "@/lib/utils";
import { AUDIT_GROUPS, getBillingAudit, type AuditGroup, type BillingAuditEntry } from "@backend/features/billing/audit/billing-audit.service";
import { billingHref, type BillingTabProps } from "../billing-tabs";
import { formatWhen, methodLabel, peso } from "../format";

const th = "border-b border-[#E3E7ED] px-3.5 py-3 text-left text-[11px] font-medium tracking-[0.06em] whitespace-nowrap text-[#5E6B7E] uppercase";
const td = "border-b border-[#EDF0F4] px-3.5 py-[11px] align-top text-[13px]";
const MAX_DETAILS = 4;

const DETAIL_LABELS: Record<string, string> = { amount: "Amount", method: "Method", reason: "Reason", number: "Invoice", status: "Status", total: "Total", installments: "Installments" };

function detailValue(key: string, value: unknown) {
  if (typeof value === "number" && /amount|total|paid/i.test(key)) return peso(value);
  if (key === "method" && typeof value === "string") return methodLabel(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function Details({ entry }: { entry: BillingAuditEntry }) {
  const pairs = Object.entries(entry.details ?? {})
    .map(([k, v]) => [DETAIL_LABELS[k] ?? k, detailValue(k, v)] as const)
    .filter((p): p is readonly [string, string] => p[1] !== null)
    .slice(0, MAX_DETAILS);
  if (!pairs.length) return <span className="text-[#9AA6B6]">—</span>;
  return <span className="text-[#46566B]">{pairs.map(([k, v]) => `${k}: ${v}`).join(" · ")}</span>;
}

function RecordLink({ entry }: { entry: BillingAuditEntry }) {
  const label = entry.entityType.replace(/_/g, " ");
  if (entry.entityType === "invoice" && entry.entityId) {
    return (
      <Link href={`/billing/invoices/${entry.entityId}`} className="text-[#1D5296] underline underline-offset-3">
        Open invoice
      </Link>
    );
  }
  return <span className="text-[#5E6B7E] capitalize">{label}</span>;
}

export async function AuditTab({ user, params }: BillingTabProps) {
  const page = await getBillingAudit(user, { group: params.group, before: params.before });
  const pill = (on: boolean) => cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[13px]", on ? "border-[#1D5296] bg-[#1D5296] text-white" : "border-[#D5DCE5] bg-white text-[#46566B] hover:bg-[#F4F6F9]");

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Filter the audit trail" className="flex flex-wrap gap-2">
        <Link href={billingHref("audit")} aria-current={page.group === null ? "page" : undefined} className={pill(page.group === null)}>
          All changes
        </Link>
        {(Object.keys(AUDIT_GROUPS) as AuditGroup[]).map((g) => (
          <Link key={g} href={billingHref("audit", { group: g })} aria-current={page.group === g ? "page" : undefined} className={pill(page.group === g)}>
            {AUDIT_GROUPS[g].label}
          </Link>
        ))}
      </nav>

      <section aria-label="Audit trail" className="glass-card min-w-0 overflow-hidden rounded-[26px]">
        <div className="px-5 pt-[18px] pb-1.5">
          <h2 className="text-xl font-normal">Audit trail</h2>
          <span className="text-xs text-[#5E6B7E]">Every billing change, who made it and when. Entries can&apos;t be edited from the app.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>When</th>
                <th className={th}>Who</th>
                <th className={th}>What</th>
                <th className={th}>Details</th>
                <th className={th}>Record</th>
              </tr>
            </thead>
            <tbody>
              {page.entries.map((e) => (
                <tr key={e.id}>
                  <td className={cn(td, "whitespace-nowrap text-[#5E6B7E]")}>{formatWhen(e.occurredAt)}</td>
                  <td className={cn(td, "whitespace-nowrap")}>{e.actor ?? "System"}</td>
                  <td className={td}>{e.label}</td>
                  <td className={td}>
                    <Details entry={e} />
                  </td>
                  <td className={cn(td, "whitespace-nowrap")}>
                    <RecordLink entry={e} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {page.entries.length === 0 ? <p className="px-5 py-8 text-center text-sm text-[#5E6B7E]">No billing changes recorded yet.</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-3">
          <span className="text-xs text-[#5E6B7E]">Newest first</span>
          <span className="flex gap-1.5">
            {params.before ? (
              <Link href={billingHref("audit", { group: page.group ?? undefined })} className="inline-flex h-[34px] items-center rounded-full border border-[#D5DCE5] bg-white px-3.5 text-[13px]">
                Newest
              </Link>
            ) : null}
            {page.olderThan ? (
              <Link href={billingHref("audit", { group: page.group ?? undefined, before: page.olderThan })} className="inline-flex h-[34px] items-center rounded-full border border-[#D5DCE5] bg-white px-3.5 text-[13px]">
                Older
              </Link>
            ) : null}
          </span>
        </div>
      </section>
    </div>
  );
}
