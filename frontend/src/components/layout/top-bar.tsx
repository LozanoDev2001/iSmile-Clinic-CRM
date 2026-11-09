import Link from "next/link";
import { Search } from "lucide-react";
import { ClinicLogo } from "@/components/shared/brand-logos";
import { LogoutIconButton } from "@/features/auth/components/session-buttons";
import { NotificationsButton } from "./notifications-button";

interface TopBarProps {
  userName: string;
  roleLabel: string;
  /** Whether Mia (crwdForce) can draft replies; null hides the pill for people without crwdForce. */
  miaConnected: boolean | null;
}

export function TopBar({ userName, roleLabel, miaConnected }: TopBarProps) {
  const initial = userName.replace(/^Dr\.?\s*/i, "").charAt(0).toUpperCase();
  return (
    <header className="flex items-center gap-2 text-[#0E2A47] sm:gap-3">
      <Link
        href="/dashboard"
        aria-label="iSmile Dental Home dashboard"
        className="glass-pill inline-flex h-11 shrink-0 items-center rounded-full px-3.5 sm:h-[52px] sm:px-[18px]"
      >
        <ClinicLogo className="h-8 w-auto min-[360px]:w-auto sm:h-10 sm:w-auto desk:w-auto" />
      </Link>

      {/* Global search needs the Patients, Leads and Billing modules; disabled until they exist. */}
      <div className="glass-pill relative hidden h-[52px] max-w-[460px] min-w-0 flex-1 items-center rounded-full lg:flex">
        <Search className="pointer-events-none absolute left-[18px] size-[18px] text-[#5E6B7E]" strokeWidth={2} aria-hidden />
        <label htmlFor="topsearch" className="sr-only">
          Search the CRM
        </label>
        <input
          id="topsearch"
          disabled
          title="Search arrives with the Patients, Leads and Billing modules"
          placeholder="Search patients, leads, invoices"
          className="size-full rounded-full bg-transparent pr-5 pl-12 text-[15px] placeholder:text-[#5E6B7E] focus:outline-none disabled:cursor-not-allowed"
        />
      </div>

      <div className="flex-1" />

      <NotificationsButton />

      {miaConnected === null ? null : (
        <Link href="/crwdforce" className="glass-pill hidden h-[52px] items-center gap-2 rounded-full px-[18px] text-sm text-[#46566B] hover:brightness-[0.98] xl:inline-flex">
          <span className={miaConnected ? "size-2 rounded-full bg-[#2E9E63]" : "size-2 rounded-full bg-[#9AA6B6]"} aria-hidden />
          {miaConnected ? "Mia is drafting replies" : "Mia not connected"}
        </Link>
      )}

      <div className="glass-pill inline-flex h-11 shrink-0 items-center gap-2.5 rounded-full pr-1.5 pl-1 sm:h-[52px] sm:pr-2 sm:pl-1.5">
        <span className="grid size-9 place-items-center rounded-full bg-[#DCEAFB] text-base font-medium sm:size-10">{initial}</span>
        <span className="hidden flex-col leading-[1.15] sm:flex">
          <span className="text-[11px] text-[#5E6B7E]">{roleLabel}</span>
          <span className="max-w-[160px] truncate text-[15px] font-medium">{userName}</span>
        </span>
        <LogoutIconButton />
      </div>
    </header>
  );
}
