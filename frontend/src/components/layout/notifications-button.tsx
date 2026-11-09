"use client";

import { useId, useState } from "react";
import { Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";

const TRIGGER = {
  topbar: "glass-pill size-11 text-[#0E2A47] sm:size-[52px]",
  rail: "size-[42px] border border-[#3A74B6] text-[#EAF1FA] hover:bg-white/10",
};
const PANEL = {
  topbar: "top-[72px] right-3 sm:top-[82px] sm:right-4",
  rail: "bottom-4 left-[112px]",
};

// Notifications are not built yet; the panel says so instead of showing fake items.
export function NotificationsButton({
  variant = "topbar",
}: {
  variant?: keyof typeof TRIGGER;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "grid shrink-0 place-items-center rounded-full",
          TRIGGER[variant],
        )}
      >
        <Bell
          className={variant === "rail" ? "size-[19px]" : "size-5"}
          strokeWidth={1.8}
          aria-hidden
        />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-[69] cursor-default"
            onClick={() => setOpen(false)}
          />
          <section
            id={panelId}
            aria-label="Notifications"
            className={cn(
              "fixed z-[70] flex w-[400px] max-w-[calc(100vw-24px)] flex-col gap-2.5 rounded-[20px] bg-white p-4 text-[#0E2A47] shadow-[0_18px_50px_rgba(14,42,71,.25)]",
              PANEL[variant],
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold">Notifications</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-[34px] place-items-center rounded-full bg-[#EEF1F5]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <p className="text-[13px] text-[#5E6B7E]">
              You&apos;re all caught up. Requests and alerts will show up here.
            </p>
          </section>
        </>
      ) : null}
    </>
  );
}
