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
        "relative isolate flex min-h-dvh flex-1 flex-col overflow-x-hidden bg-[#cbeffa] text-[#0f2a4a]",
      )}
    >
      <AuthBackground />
      <div className="flex w-full flex-1 flex-col px-4 py-5 sm:px-8 sm:py-6 lg:px-16 xl:px-24">
        <header className="flex justify-center pt-4 lg:justify-start">
          <ClinicLogo />
        </header>

        <div className="grid flex-1 items-center gap-6 py-5 sm:gap-8 sm:py-6 lg:grid-cols-[minmax(0,600px)_400px] lg:justify-between lg:gap-16 xl:grid-cols-[minmax(0,640px)_420px] xl:gap-24">
          <section className="order-2 text-center lg:order-1 lg:pb-20 lg:text-left">
            <p className="text-[1.75rem] leading-[1.08] font-semibold tracking-tight sm:text-4xl lg:text-[clamp(2.4rem,3.9vw,3.6rem)]">
              Every patient answered.
              <br />
              Every chair filled.
            </p>
            <p className="mx-auto mt-4 max-w-xl text-base text-[#2a4263] sm:mt-5 sm:text-lg lg:mx-0">
              A simpler way to manage your clinic, team, and patient relationships.
            </p>
          </section>

          <div className="order-1 mx-auto w-full max-w-[420px] lg:order-2 lg:mx-0">
            <div className="rounded-3xl bg-white/75 p-6 shadow-[0_30px_70px_-25px_rgba(15,42,74,0.35)] ring-1 ring-white/80 backdrop-blur-xl sm:p-8">
              {children}
            </div>
            <p className="mt-4 text-center text-sm text-[#2a4263]">Need help? Contact your clinic administrator.</p>
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
      <div className="absolute inset-0 bg-gradient-to-b from-[#c6edfa] via-[#cbeffa] to-[#eefafd]" />
      <div className="absolute -top-40 -left-40 size-[32rem] rounded-full bg-[#a6e2f5]/60 blur-3xl" />
      <div className="absolute -bottom-48 left-1/3 size-[38rem] rounded-full bg-[#b7d2ff]/55 blur-3xl" />
      <div className="absolute top-1/4 -right-40 size-[26rem] rounded-full bg-[#cde9e2]/80 blur-3xl" />
      <svg className="absolute inset-0 size-full" viewBox="0 0 1440 900" preserveAspectRatio="none" fill="none">
        <path d="M0 250C260 190 440 320 740 290S1200 170 1440 220V0H0Z" className="fill-white/15" />
        <path d="M760 0C930 70 1130 100 1440 70V0Z" className="fill-white/35" />
        <path d="M0 600C280 520 540 680 820 640S1250 540 1440 590V900H0Z" className="fill-white/40" />
        <path d="M0 730C310 680 580 790 880 760S1270 690 1440 720V900H0Z" className="fill-white/40" />
      </svg>
    </div>
  );
}
