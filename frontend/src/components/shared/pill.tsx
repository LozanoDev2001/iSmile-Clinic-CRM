import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const PILL_TONES = {
  green: "bg-[#D7F2E5] text-[#0B3D26]",
  purple: "bg-[#E6E0FA] text-[#3D2A7A]",
  amber: "bg-[#FDE3BD] text-[#7A4300]",
  red: "bg-[#FBD9D4] text-[#8A1E12]",
  muted: "bg-[#EEF1F5] text-[#5E6B7E]",
} as const;

export type PillTone = keyof typeof PILL_TONES;

export function Pill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] whitespace-nowrap", PILL_TONES[tone], className)}>
      {children}
    </span>
  );
}
