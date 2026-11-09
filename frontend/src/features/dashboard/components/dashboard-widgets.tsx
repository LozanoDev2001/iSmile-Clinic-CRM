import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  href: string;
  icon: LucideIcon;
  /** Chip background and icon colour, e.g. "bg-[#DCEAFB] text-[#1D5296]". */
  chipClass: string;
  label: string;
  value: string;
  badge: ReactNode;
}

export function StatCard({ href, icon: Icon, chipClass, label, value, badge }: StatCardProps) {
  return (
    <Link href={href} className="glass-card flex flex-col gap-2.5 rounded-[22px] p-4 transition-transform hover:-translate-y-0.5">
      <span className={cn("grid size-[38px] place-items-center rounded-full", chipClass)}>
        <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
      </span>
      <span className="text-[13px] text-[#46566B]">{label}</span>
      <span className="flex flex-wrap items-baseline gap-2">
        <span className="text-[26px] leading-tight tabular-nums">{value}</span>
        {badge}
      </span>
    </Link>
  );
}

interface PanelProps {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, action, className, children }: PanelProps) {
  return (
    <section aria-label={title} className={cn("glass-card flex min-w-0 flex-col gap-3 rounded-[24px] px-5 py-[18px]", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-xs text-[#1D5296] underline underline-offset-2 hover:text-[#0E2A47]">
      {children}
    </Link>
  );
}

/** Round ↗ button used on the coloured cards. */
export function CornerLink({ href, label, className }: { href: string; label: string; className: string }) {
  return (
    <Link href={href} aria-label={label} className={cn("grid size-[34px] place-items-center rounded-full", className)}>
      <ArrowUpRight className="size-4" aria-hidden />
    </Link>
  );
}
