import type { ReactNode } from "react";
import { ClinicLogo, VendorLogo } from "@/components/shared/brand-logos";
import { outfit } from "@/lib/fonts";
import { cn } from "@/lib/utils";

/**
 * Split-screen auth shell (login, forgot / reset password).
 * Below lg: logo → card → footer, stacked and centred. lg+: logo, tagline and footer left, card right.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main
      className={cn(
        outfit.className,
        "auth-bg",
        "relative isolate flex min-h-dvh flex-1 flex-col items-center gap-4 overflow-x-hidden px-4 pt-[max(22px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))] text-[#10305A] sm:justify-center sm:gap-6 sm:px-8 sm:py-10",
        "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:items-center lg:gap-12 lg:pt-11 lg:pr-[6vw] lg:pb-10 lg:pl-[4vw]",
      )}
    >
      <AuthBackground />

      <section aria-label="About iSmile CRM" className="contents lg:flex lg:min-w-0 lg:flex-col lg:justify-between lg:gap-8 lg:self-stretch">
        <div className="order-1 lg:order-none lg:self-start">
          <ClinicLogo />
        </div>
        <div className="hidden flex-col gap-[22px] pl-[2vw] lg:flex">
          <h1 className="text-[30px] xl:text-[clamp(40px,3.4vw,64px)] leading-[1.08] font-semibold tracking-[-0.025em]">
            Every patient answered.
            <br />
            Every chair filled.
          </h1>
          <p className="text-[clamp(16px,1.15vw,22px)] leading-[1.45] text-[#24405F]">
            A simpler way to manage your clinic, team, and patient relationships.
          </p>
        </div>
        <div className="order-3 inline-flex items-center gap-2.5 text-[13px] sm:text-sm lg:order-none lg:self-start lg:pl-[1vw] lg:text-base">
          Custom CRM by <VendorLogo />
        </div>
      </section>

      <div className="order-2 flex w-full max-w-[540px] min-w-0 flex-col gap-4 sm:gap-[22px] lg:order-none lg:max-w-none">
        <div className="rounded-[20px] border border-white/90 bg-[linear-gradient(150deg,rgba(255,255,255,.88)_0%,rgba(255,255,255,.72)_100%)] px-5 pt-6 pb-3.5 shadow-[0_30px_70px_rgba(16,48,90,.14),inset_0_1px_0_rgba(255,255,255,.95)] backdrop-blur-[20px] backdrop-saturate-[1.6] max-[359px]:px-4 sm:rounded-3xl sm:px-9 sm:pt-9 sm:pb-5 lg:px-10 lg:pt-[34px] lg:pb-[22px] desk:px-12 desk:pt-11 desk:pb-[26px]">
          {children}
        </div>
        <p className="text-center text-[13px] text-[#24405F] sm:text-sm lg:text-base">Need help? Contact your clinic administrator.</p>
      </div>
    </main>
  );
}

/** Animated aqua blobs and soft white waves. Decorative only. */
function AuthBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="auth-blob auth-b1" />
      <div className="auth-blob auth-b2" />
      <div className="auth-blob auth-b3" />
      <div className="auth-blob auth-b4" />
      <svg className="absolute -inset-x-[8%] -inset-y-[4%] h-[108%] w-[116%]" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
        <path className="auth-wave auth-w1" d="M0 610 C 260 520, 480 700, 760 640 S 1180 470, 1440 560 L 1440 900 L 0 900 Z" fill="#FFFFFF" opacity=".38" />
        <path className="auth-wave auth-w2" d="M0 700 C 300 640, 520 820, 820 760 S 1220 640, 1440 700 L 1440 900 L 0 900 Z" fill="#FFFFFF" opacity=".42" />
        <path className="auth-wave auth-w3" d="M520 0 C 640 120, 820 150, 980 90 S 1240 10, 1440 70 L 1440 0 Z" fill="#FFFFFF" opacity=".45" />
        <path className="auth-wave auth-w4" d="M0 330 C 200 260, 360 380, 560 330 S 900 190, 1100 260" stroke="#FFFFFF" strokeWidth="70" strokeLinecap="round" opacity=".22" />
        <path className="auth-wave auth-w5" d="M760 900 C 900 760, 1100 720, 1440 780" stroke="#FFFFFF" strokeWidth="40" opacity=".35" />
      </svg>
    </div>
  );
}
