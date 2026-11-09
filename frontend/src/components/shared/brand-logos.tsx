import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo files live in frontend/public/brand/. Until they are added, styled-text
 * placeholders are shown. Server-only (reads the file system).
 */
function findBrandAsset(name: string): string | null {
  for (const ext of ["svg", "png", "webp"]) {
    const file = `${name}.${ext}`;
    if (existsSync(path.join(process.cwd(), "public", "brand", file))) return `/brand/${file}`;
  }
  return null;
}

/** iSmile Dental Home logo — expects public/brand/ismile-logo.(svg|png|webp). */
export function ClinicLogo({ className }: { className?: string }) {
  const src = findBrandAsset("ismile-logo");
  if (src) {
    return (
      <Image
        src={src}
        alt="iSmile Dental Home — Pediatrics, Family, Orthodontics"
        width={300}
        height={110}
        priority
        unoptimized
        className={cn("h-auto w-[170px] min-[360px]:w-[190px] sm:w-[220px] desk:w-[270px]", className)}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label="iSmile Dental Home — Pediatrics, Family, Orthodontics"
      className={cn("inline-flex flex-col items-center leading-none text-[#2b6cae]", className)}
    >
      <span className="font-serif text-4xl tracking-tight sm:text-5xl">
        iSmil
        <span className="relative">
          e
          <span className="absolute inset-x-0 -bottom-0.5 h-2 rounded-b-full border-b-[3px] border-[#f39a1e]" />
        </span>
      </span>
      <span className="mt-1.5 w-full border-t border-[#2b6cae]/50 pt-1 text-center text-[10px] tracking-[0.4em] sm:text-xs">
        DENTAL HOME
      </span>
      <span className="mt-1 text-[9px] font-medium tracking-[0.12em] whitespace-nowrap sm:text-[11px]">
        PEDIATRICS <span className="text-[#f39a1e]">•</span> FAMILY <span className="text-[#f39a1e]">•</span>{" "}
        ORTHODONTICS
      </span>
    </div>
  );
}

/** Vendor logo — expects public/brand/crwd-logo.(svg|png|webp). */
export function VendorLogo({ className }: { className?: string }) {
  const src = findBrandAsset("crwd-logo");
  if (src) {
    // Source file is yellow; the filter recolours it to brand blue.
    return (
      <Image
        src={src}
        alt="crwd."
        width={97}
        height={30}
        unoptimized
        className={cn(
          "h-6 w-auto lg:h-[30px] [filter:brightness(0)_saturate(100%)_invert(26%)_sepia(94%)_saturate(2600%)_hue-rotate(207deg)_brightness(93%)_contrast(101%)]",
          className,
        )}
      />
    );
  }
  return <span className={cn("text-xl font-extrabold tracking-tight text-[#1652f0]", className)}>crwd.</span>;
}
