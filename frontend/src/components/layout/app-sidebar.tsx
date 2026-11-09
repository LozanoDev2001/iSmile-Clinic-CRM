"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NAV_MODULES, type NavModule } from "@/config/navigation";
import { LogoutButton } from "@/features/auth/components/session-buttons";
import { cn } from "@/lib/utils";
import { NotificationsButton } from "./notifications-button";

const PHONE_PRIMARY = ["dashboard", "patients", "calendar", "messaging"];
const PHONE_SLOTS = 4;

interface AppSidebarProps {
  allowedKeys: string[];
  userName: string;
  roleLabel: string;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({
  allowedKeys,
  userName,
  roleLabel,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const modules = NAV_MODULES.filter((m) => allowedKeys.includes(m.key));
  const primary = [
    ...modules.filter((m) => PHONE_PRIMARY.includes(m.key)),
    ...modules.filter((m) => !PHONE_PRIMARY.includes(m.key)),
  ].slice(0, PHONE_SLOTS);
  const moreActive = !primary.some((m) => isActive(pathname, m.href));
  const initial = userName
    .replace(/^Dr\.?\s*/i, "")
    .charAt(0)
    .toUpperCase();

  return (
    <>
      <aside className="rail-bg sticky top-3.5 hidden h-[calc(100dvh-28px)] min-h-[560px] w-[88px] shrink-0 flex-col items-center gap-3.5 overflow-y-auto rounded-[30px] pt-[18px] pb-4 text-white [scrollbar-width:none] md:flex">
        <Link
          href="/dashboard"
          aria-label="iSmile Dental Home"
          className="fill-orange grid size-12 shrink-0 place-items-center rounded-full"
        >
          <SmileMark />
        </Link>
        <div className="h-px w-10 shrink-0 bg-[#3A74B6]" />
        <nav aria-label="Main" className="flex flex-col items-center gap-1.5">
          {modules.map((m) => (
            <RailLink
              key={m.key}
              module={m}
              active={isActive(pathname, m.href)}
            />
          ))}
        </nav>
        {/* Bottom group sits at the end of the rail; on short screens the rail scrolls, as in the design. */}
        <div className="mt-auto flex shrink-0 flex-col items-center gap-2.5 pt-1.5">
          <NotificationsButton variant="rail" />
          <div
            title={`${userName} · ${roleLabel}`}
            className="flex flex-col items-center gap-[3px]"
          >
            <span className="flex size-[46px] rounded-full border-2 border-[#F39A1E] p-[3px]">
              <span className="grid flex-1 place-items-center rounded-full bg-[#DCEAFB] text-base font-medium text-[#0E2A47]">
                {initial}
              </span>
            </span>
            <span className="max-w-[80px] truncate text-[11px] text-[#EAF1FA]">
              {userName.split(" ").at(-1)}
            </span>
          </div>
        </div>
      </aside>

      <nav
        aria-label="Main menu"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around gap-0.5 bg-[linear-gradient(180deg,#2766B8_0%,#1A4A88_100%)] px-1.5 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] md:hidden"
      >
        {primary.map((m) => (
          <PhoneLink
            key={m.key}
            module={m}
            active={isActive(pathname, m.href)}
          />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-controls="phone-menu"
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center gap-[3px] py-1 text-[11px]",
            moreActive ? "font-semibold text-white" : "text-[#D3E2F5]",
          )}
        >
          <span
            className={cn(
              "grid h-8 w-11 place-items-center rounded-full",
              moreActive ? "fill-orange text-[#0E2A47]" : "text-[#EAF1FA]",
            )}
          >
            <Menu className="size-5" aria-hidden />
          </span>
          More
        </button>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-[#0E2A47]/45"
            onClick={() => setMoreOpen(false)}
          />
          <div
            id="phone-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="relative flex max-h-[80dvh] flex-col gap-3.5 overflow-y-auto rounded-t-[26px] bg-white px-4 pt-[18px] pb-[calc(18px+env(safe-area-inset-bottom))] text-[#0E2A47]"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-[#DCEAFB] text-[17px] font-medium">
                {initial}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-base font-medium">
                  {userName}
                </span>
                <span className="text-xs text-[#5E6B7E]">{roleLabel}</span>
              </span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="grid size-10 place-items-center rounded-full bg-[#EEF1F5]"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {modules.map((m) => {
                const active = isActive(pathname, m.href);
                return (
                  <Link
                    key={m.key}
                    href={m.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-[18px] px-1 py-3",
                      active ? "bg-[#FDE3BD]" : "bg-[#F4F6F9]",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-10 place-items-center rounded-full",
                        active ? "fill-orange" : "bg-white",
                      )}
                    >
                      <m.icon className="size-5" aria-hidden />
                    </span>
                    <span className="text-center text-xs">{m.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="rounded-full border border-[#D5DCE5] text-[#A1301F] [&_button]:h-[46px] [&_button]:justify-center [&_button]:text-[#A1301F]">
              <LogoutButton />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function RailLink({
  module: m,
  active,
}: {
  module: NavModule;
  active: boolean;
}) {
  return (
    <Link
      href={m.href}
      aria-current={active ? "page" : undefined}
      className="group flex w-20 flex-col items-center gap-[3px] rounded-2xl py-0.5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
    >
      <span
        className={cn(
          "grid size-[42px] place-items-center rounded-full border transition-colors",
          active
            ? "fill-orange border-[#F39A1E] text-[#0E2A47]"
            : "border-[#3A74B6] text-[#EAF1FA] group-hover:bg-white/10",
        )}
      >
        <m.icon className="size-[19px]" strokeWidth={1.8} aria-hidden />
      </span>
      <span
        className={cn(
          "text-[11px] leading-[1.15] whitespace-nowrap",
          active ? "font-semibold text-white" : "text-[#D3E2F5]",
        )}
      >
        {m.label}
      </span>
    </Link>
  );
}

function PhoneLink({
  module: m,
  active,
}: {
  module: NavModule;
  active: boolean;
}) {
  return (
    <Link
      href={m.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-[3px] py-1 text-[11px]",
        active ? "font-semibold text-white" : "text-[#D3E2F5]",
      )}
    >
      <span
        className={cn(
          "grid h-8 w-11 place-items-center rounded-full",
          active ? "fill-orange text-[#0E2A47]" : "text-[#EAF1FA]",
        )}
      >
        <m.icon className="size-5" strokeWidth={1.8} aria-hidden />
      </span>
      {m.shortLabel ?? m.label}
    </Link>
  );
}

function SmileMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="11" cy="12" r="2.4" fill="#0E2A47" />
      <circle cx="21" cy="12" r="2.4" fill="#0E2A47" />
      <path
        d="M8 18.5c2 3.6 4.8 5.4 8 5.4s6-1.8 8-5.4"
        stroke="#0E2A47"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
