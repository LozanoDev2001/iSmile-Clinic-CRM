import { cn } from "@/lib/utils";
import type { ToothCondition } from "@backend/features/patients/patients.types";

// FDI numbering, drawn from the patient's right to left.
const ADULT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const ADULT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const CHILD_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const CHILD_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

const STYLES: Record<ToothCondition | "healthy", { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "border-[#D5DCE5] bg-white text-[#46566B]" },
  treated: { label: "Treated (filling / root canal)", className: "border-[#2F64A8] bg-[#D9E7F8] text-[#0E2A47]" },
  crown: { label: "Crown", className: "border-[#E08A10] bg-[#FDE3C2] text-[#7A4300]" },
  planned: { label: "Planned", className: "border-[#8E5BD0] bg-[#EFE7FB] text-[#5B3A9A]" },
  extracted: { label: "Extracted", className: "border-dashed border-[#B5BFCC] bg-[#E7EAEF] text-[#9AA6B5]" },
};

function Row({ teeth, chart }: { teeth: number[]; chart: Record<string, ToothCondition> }) {
  return (
    <div className="flex justify-center gap-1">
      {teeth.map((n) => {
        const style = STYLES[chart[String(n)] ?? "healthy"];
        return (
          <span
            key={n}
            role="img"
            aria-label={`Tooth ${n}: ${style.label}`}
            title={`Tooth ${n}: ${style.label}`}
            className={cn("inline-flex h-11 w-8 items-center justify-center rounded-xl border-2 text-[11px] font-medium sm:w-9", style.className)}
          >
            {n}
          </span>
        );
      })}
    </div>
  );
}

export function DentalChart({ chart, child }: { chart: Record<string, ToothCondition>; child: boolean }) {
  const charted = Object.keys(chart).length;
  return (
    <section aria-labelledby="chart-heading" className="glass-card flex min-w-0 flex-col gap-3 rounded-[24px] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="chart-heading" className="text-[15px] font-semibold">
          Dental chart
        </h2>
        <span className="text-xs text-[#5E6B7E]">
          {child ? "Primary teeth" : "Permanent teeth"} · {charted ? `${charted} teeth with recorded work` : "No work recorded yet"}
        </span>
      </div>
      <div className="flex flex-col gap-2 overflow-x-auto py-1">
        <Row teeth={child ? CHILD_UPPER : ADULT_UPPER} chart={chart} />
        <div className="mx-auto h-px w-full max-w-[640px] bg-[#E3E7ED]" />
        <Row teeth={child ? CHILD_LOWER : ADULT_LOWER} chart={chart} />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[#46566B]">
        {Object.values(STYLES).map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={cn("size-3.5 rounded-md border-2", s.className)} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
