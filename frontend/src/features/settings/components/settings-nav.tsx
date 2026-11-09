"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface Section {
  title: string;
  description: string;
  /** Unbuilt sections have no href and show a "Soon" tag instead of a link. */
  href?: string;
  mia?: boolean;
}

const SECTIONS: Section[] = [
  { title: "Clinic profile", description: "Name, logo, hours, services" },
  { title: "Team & roles", description: "Accounts, windows and tabs", href: "/settings/team" },
  { title: "My profile", description: "Your name, password and devices", href: "/profile" },
  { title: "Services & prices", description: "Price list used on invoices" },
  { title: "Cancellation process", description: "Who can void invoices" },
  { title: "Integrations", description: "Chat apps, phone, payments" },
  { title: "Notifications", description: "Reminders patients receive" },
  { title: "Appearance", description: "Light or dark theme" },
  { title: "crwdForce", description: "Mia’s persona, voice, handover rules", mia: true },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="glass-card flex gap-1 overflow-x-auto rounded-[24px] p-3 [scrollbar-width:none] xl:flex-col">
      {SECTIONS.map((section) => {
        const active = !!section.href && pathname.startsWith(section.href);
        const body = (
          <>
            {section.mia ? (
              <span className="fill-orange grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium text-[#0E2A47]">M</span>
            ) : null}
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 text-[15px] whitespace-nowrap">
                {section.title}
                {section.href ? null : <span className="rounded-full bg-[#EEF1F5] px-1.5 text-[10px] text-[#5E6B7E]">Soon</span>}
              </span>
              <span className="hidden text-xs text-[#5E6B7E] xl:block">{section.description}</span>
            </span>
          </>
        );
        const className = cn(
          "flex shrink-0 items-center gap-2.5 rounded-[18px] px-3.5 py-2.5 xl:py-3",
          active ? "bg-[#DCEAFB]/80" : section.href ? "hover:bg-[#F4F6F9]" : "opacity-60",
        );
        return section.href ? (
          <Link key={section.title} href={section.href} aria-current={active ? "page" : undefined} className={className}>
            {body}
          </Link>
        ) : (
          <div key={section.title} className={className} aria-disabled="true">
            {body}
          </div>
        );
      })}
    </nav>
  );
}
