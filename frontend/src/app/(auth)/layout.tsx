import type { ReactNode } from "react";
import { Outfit } from "next/font/google";
import { ClinicLogo, VendorLogo } from "@/components/shared/brand-logos";
import { cn } from "@/lib/utils";

const outfit = Outfit({ subsets: ["latin"], display: "swap" });

/**
 * Split-screen auth shell (login, forgot / reset password).
 * Phones and tablets: logo → card → tagline → footer, centred.
 * Desktop (lg+): tagline on the left, card on the right.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main
      className={cn(
        outfit.className,
        "relative isolate flex min-h-dvh flex-1 flex-col overflow-x-hidden bg-[#e4f5fb] text-[#0f2a4a]",
      )}
    >
      <AuthBackground />
      <div className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col px-4 py-5 sm:px-8 sm:py-8 lg:px-12 xl:px-16">
        <header className="flex justify-center lg:justify-start">
          <ClinicLogo />
        </header>

        <div className="grid flex-1 items-center gap-8 py-6 sm:gap-10 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)] xl:gap-16">
          <section className="order-2 text-center lg:order-1 lg:text-left">
            <p className="text-[1.75rem] leading-[1.08] font-semibold tracking-tight sm:text-4xl lg:text-[clamp(2.4rem,3.9vw,3.6rem)]">
              Every patient answered.
              <br />
              Every chair filled.
            </p>
            <p className="mx-auto mt-4 max-w-xl text-base text-[#2a4263] sm:mt-5 sm:text-lg lg:mx-0">
              A simpler way to manage your clinic, team, and patient relationships.
            </p>
          </section>

          <div className="order-1 mx-auto w-full max-w-[460px] lg:order-2 lg:mx-0">
            <div className="rounded-3xl bg-white/80 p-6 shadow-[0_30px_70px_-25px_rgba(15,42,74,0.35)] ring-1 ring-white/80 backdrop-blur-xl sm:p-10">
              {children}
            </div>
            <p className="mt-5 text-center text-sm text-[#2a4263]">Need help? Contact your clinic administrator.</p>
          </div>
        </div>

        <footer className="flex items-center justify-center gap-3 text-sm text-[#2a4263] lg:justify-start">
          Custom CRM by <VendorLogo />
        </footer>
      </div>
    </main>
  );
}

/** Soft aqua gradient with flowing white waves. Decorative only. */
function AuthBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#bde6f5] via-[#e2f5fb] to-[#eaf8fc]" />
      <div className="absolute -top-40 -left-40 size-[32rem] rounded-full bg-[#9fdcf1]/60 blur-3xl" />
      <div className="absolute -bottom-48 left-1/3 size-[38rem] rounded-full bg-[#b7d2ff]/55 blur-3xl" />
      <div className="absolute top-1/3 -right-40 size-[26rem] rounded-full bg-[#d9f6ef]/70 blur-3xl" />
      <svg className="absolute inset-0 size-full" viewBox="0 0 1440 900" preserveAspectRatio="none" fill="none">
        <path d="M0 250C260 190 440 320 740 290S1200 170 1440 220V0H0Z" className="fill-white/30" />
        <path d="M760 0C930 70 1130 100 1440 70V0Z" className="fill-white/45" />
        <path d="M0 600C280 520 540 680 820 640S1250 540 1440 590V900H0Z" className="fill-white/40" />
        <path d="M0 730C310 680 580 790 880 760S1270 690 1440 720V900H0Z" className="fill-white/40" />
      </svg>
    </div>
  );
}
