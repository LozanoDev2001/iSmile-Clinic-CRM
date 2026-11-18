import { cn } from "@/lib/utils";
import { formatLongDate, formatMonth, formatShortDate } from "@/features/appointments/calendar-state";
import type { TaxKind } from "@backend/features/billing/tax/tax.deadlines";
import { getTaxCalendar } from "@backend/features/billing/tax/tax.service";
import type { BillingTabProps } from "../billing-tabs";

const MS_PER_DAY = 86_400_000;
const SOON_DAYS = 7;

const KIND_META: Record<TaxKind, { label: string; color: string }> = {
  withholding: { label: "Withholding", color: "#D9483B" },
  business: { label: "VAT or percentage tax", color: "#F39A1E" },
  income: { label: "Income tax", color: "#1D5296" },
  annual: { label: "Annual returns", color: "#2E9E63" },
};

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);

function dueNote(days: number) {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return "Due today";
  return `In ${days} day${days === 1 ? "" : "s"}`;
}

export async function TaxTab({ user }: BillingTabProps) {
  const { today, vatRegistered, deadlines } = await getTaxCalendar(user);
  const upcoming = deadlines.filter((d) => d.fileBy >= today);
  const next = upcoming[0];
  const nextSameDay = next ? upcoming.filter((d) => d.fileBy === next.fileBy) : [];
  const months = [...new Set(deadlines.map((d) => d.fileBy.slice(0, 7)))];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Next deadline" className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 rounded-[26px] bg-[#1D5296] p-[22px] text-white">
          <span className="text-sm text-[#D3E2F5]">Next BIR deadline</span>
          {next ? (
            <>
              <span className="text-[30px] leading-tight font-light">{formatLongDate(next.fileBy)}</span>
              <span className="text-sm text-[#D3E2F5]">{dueNote(daysBetween(today, next.fileBy))}</span>
              <ul className="flex flex-col gap-2 border-t border-[#3A74B6] pt-3">
                {nextSameDay.map((d) => (
                  <li key={`${d.form}-${d.period}`} className="flex flex-col">
                    <span className="text-[15px]">
                      {d.form} · {d.title}
                    </span>
                    <span className="text-xs text-[#D3E2F5]">{d.period}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <span className="text-sm">No deadlines in the next four months.</span>
          )}
        </section>

        <section aria-label="About these dates" className="glass-card flex min-w-0 flex-[2_1_420px] flex-col gap-2.5 rounded-[26px] px-[22px] py-5 text-[13px] leading-relaxed text-[#46566B]">
          <h2 className="text-xl font-normal text-[#0E2A47]">How these dates work</h2>
          <p>
            Standard BIR deadlines for manual and eBIRForms filers on a calendar year. The clinic is set as{" "}
            <strong className="font-medium text-[#0E2A47]">{vatRegistered ? "VAT-registered (2550Q)" : "non-VAT (2551Q percentage tax)"}</strong>; change this in Settings › Clinic profile.
          </p>
          <p>Due dates on a weekend move to the next Monday. Public holidays and eFPS group deadlines are not applied, so confirm the final date and the amounts with your accountant.</p>
          <p>Both corporate (1702) and sole-proprietor (1701) income tax returns are listed. Only the one matching how the clinic is registered applies.</p>
          <div className="flex flex-wrap gap-3 pt-1 text-xs text-[#5E6B7E]">
            {Object.values(KIND_META).map((k) => (
              <span key={k.label} className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full" style={{ background: k.color }} aria-hidden />
                {k.label}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section aria-label="Filing calendar" className="glass-card flex min-w-0 flex-col gap-1 rounded-[26px] px-[22px] py-5">
        <h2 className="pb-1 text-xl font-normal">Filing calendar</h2>
        {months.map((m) => (
          <div key={m} className="flex flex-col">
            <h3 className="border-b border-[#E3E7ED] pt-3 pb-1.5 text-[11px] font-medium tracking-[0.06em] text-[#5E6B7E] uppercase">{formatMonth(`${m}-01`)}</h3>
            <ul className="flex flex-col">
              {deadlines
                .filter((d) => d.fileBy.startsWith(m))
                .map((d) => {
                  const days = daysBetween(today, d.fileBy);
                  return (
                    <li key={`${d.form}-${d.period}`} className={cn("grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#EDF0F4] py-2.5", days < 0 && "opacity-55")}>
                      <span className="text-[13px] tabular-nums">{formatShortDate(d.fileBy)}</span>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: KIND_META[d.kind].color }} aria-hidden />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm">
                            {d.form} · {d.title}
                          </span>
                          <span className="text-xs text-[#5E6B7E]">
                            {d.period}
                            {d.fileBy !== d.due ? ` · due ${formatShortDate(d.due)}, a weekend` : ""}
                          </span>
                        </span>
                      </span>
                      <span className={cn("text-xs whitespace-nowrap", days >= 0 && days <= SOON_DAYS ? "font-medium text-[#A1301F]" : "text-[#5E6B7E]")}>{days < 0 ? "Passed" : dueNote(days)}</span>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
