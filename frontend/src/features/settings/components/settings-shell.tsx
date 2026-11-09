import type { ReactNode } from "react";
import { SettingsNav } from "./settings-nav";

interface SettingsShellProps {
  actions?: ReactNode;
  children: ReactNode;
}

/** Shared frame for every settings page: title row, section menu and content. */
export function SettingsShell({ actions, children }: SettingsShellProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">Settings</h1>
          <p className="text-[13px] text-[#5E6B7E]">Clinic profile, team access, connected apps and patient notifications</p>
        </div>
        {actions}
      </div>
      <div className="grid gap-4 xl:grid-cols-[272px_minmax(0,1fr)] xl:items-start">
        <SettingsNav />
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}
