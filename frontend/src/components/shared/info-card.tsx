import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function InfoCard({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-label={title} className="glass-card flex min-w-0 flex-col gap-3 rounded-[24px] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function StatTile({ label, value, note, highlight }: { label: string; value: string; note: string; highlight?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-[22px] px-4 py-3.5", highlight ? "bg-[#1D5296] text-white" : "glass-card text-[#0E2A47]")}>
      <span className={cn("text-xs", highlight ? "text-[#CFE0F5]" : "text-[#5E6B7E]")}>{label}</span>
      <span className="text-xl">{value}</span>
      <span className={cn("truncate text-xs", highlight ? "text-[#CFE0F5]" : "text-[#5E6B7E]")}>{note}</span>
    </div>
  );
}
