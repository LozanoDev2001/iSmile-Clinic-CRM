import { CLINIC_TIME_ZONE } from "@/config/clinic";
import { cn } from "@/lib/utils";
import type { AccessLogEntry } from "@backend/features/users/users.types";

const TONE_DOT: Record<AccessLogEntry["tone"], string> = {
  grant: "bg-[#2E9E63]",
  revoke: "bg-[#D9483B]",
  change: "bg-[#F39A1E]",
  neutral: "bg-[#1D5296]",
};

const when = new Intl.DateTimeFormat("en-GB", { timeZone: CLINIC_TIME_ZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export function AccessLogCard({ entries }: { entries: AccessLogEntry[] }) {
  return (
    <section aria-label="Access log" className="glass-card flex min-w-0 flex-col gap-2 rounded-[24px] p-5">
      <h2 className="text-lg font-medium">Access log</h2>
      {entries.length ? (
        <ol className="flex flex-col">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-3 border-b border-[#EDF0F4] py-2.5 last:border-0">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE_DOT[entry.tone])} aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm">{entry.text}</span>
                <time dateTime={entry.at.toISOString()} className="text-xs text-[#5E6B7E]">
                  {when.format(entry.at)}
                </time>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-[#5E6B7E]">No account changes yet. Invites, role and access changes will be listed here.</p>
      )}
    </section>
  );
}
