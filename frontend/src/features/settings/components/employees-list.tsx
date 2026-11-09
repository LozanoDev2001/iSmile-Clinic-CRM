"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/shared/avatar";
import { Pill, type PillTone } from "@/components/shared/pill";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@backend/config/permissions";
import type { MemberStatus, TeamMember } from "@backend/features/users/users.types";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "INVITED", label: "Invited" },
  { key: "DEACTIVATED", label: "Deactivated" },
] as const;

export const STATUS_PILL: Record<MemberStatus, { tone: PillTone; label: string }> = {
  ACTIVE: { tone: "green", label: "Active" },
  INVITED: { tone: "amber", label: "Invited" },
  DEACTIVATED: { tone: "muted", label: "Deactivated" },
};

export function memberSubtitle(member: Pick<TeamMember, "role" | "jobTitle">) {
  return [ROLE_LABELS[member.role], member.jobTitle].filter(Boolean).join(" · ");
}

export function EmployeesList({ members, activeCount, selectedId }: { members: TeamMember[]; activeCount: number; selectedId?: string }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");
  const shown = filter === "ALL" ? members : members.filter((m) => m.status === filter);

  return (
    <section aria-label="Employees" className="glass-card flex min-w-0 flex-col gap-3 rounded-[24px] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">Employees</h2>
        <span className="text-xs text-[#5E6B7E]">
          {activeCount} active · {members.length} accounts
        </span>
      </div>
      <div role="tablist" aria-label="Filter employees" className="flex gap-1 overflow-x-auto rounded-full bg-[#F4F6F9] p-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn("h-9 shrink-0 rounded-full px-3.5 text-sm", filter === f.key ? "btn-navy text-white" : "text-[#46566B] hover:text-[#0E2A47]")}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-1">
        {shown.map((member) => {
          const selected = member.id === selectedId;
          const status = STATUS_PILL[member.status];
          return (
            <li key={member.id}>
              <Link
                href={`/settings/team?member=${member.id}`}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-[18px] border-[1.5px] px-2.5 py-2.5 transition-colors",
                  selected ? "border-[#1D5296] bg-white/70" : "border-transparent hover:bg-[#F4F6F9]",
                  member.status === "DEACTIVATED" && "opacity-70",
                )}
              >
                <Avatar name={member.name} letters={2} className="size-[42px]" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px]">{member.name}</span>
                  <span className="line-clamp-2 text-[13px] text-[#5E6B7E]">{memberSubtitle(member)}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Pill tone={status.tone}>{status.label}</Pill>
                  {member.locked ? <Pill tone="red">Locked</Pill> : null}
                </span>
              </Link>
            </li>
          );
        })}
        {shown.length === 0 ? <li className="px-2 py-6 text-center text-sm text-[#5E6B7E]">No employees here.</li> : null}
      </ul>
    </section>
  );
}
