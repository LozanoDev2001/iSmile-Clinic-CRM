import type { Bar } from "@backend/features/reports/reports.types";

/** The clinic blue, checked for contrast on the light surface; every chart here has a single series. */
const BAR = "bg-[#1D5296]";
const PLOT_HEIGHT = 180;
const TOOLTIP_HEIGHT = 26;

const tooltip =
  "pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-[#0E2A47] px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100";

function DataTable({ caption, rows, format }: { caption: string; rows: Bar[]; format: (n: number) => string }) {
  return (
    <details className="text-xs text-[#5E6B7E]">
      <summary className="cursor-pointer">Show as a table</summary>
      <table className="mt-2 w-full text-sm text-[#0E2A47]">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-[#EDF0F4]">
              <th scope="row" className="py-1 text-left font-normal">
                {r.label}
              </th>
              <td className="py-1 text-right tabular-nums">{format(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Vertical bars over time, value on each cap, hover or focus for the exact figure. */
export function ColumnChart({ title, bars, format, compact }: { title: string; bars: Bar[]; format: (n: number) => string; compact: (n: number) => string }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative flex items-end gap-2 border-b border-[#D5DCE5]" style={{ height: PLOT_HEIGHT }} role="list" aria-label={title}>
        {[0.5, 1].map((f) => (
          <span key={f} aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#EDF0F4]" style={{ bottom: PLOT_HEIGHT * f - 1 }} />
        ))}
        {bars.map((b) => {
          const h = b.value ? Math.max(4, (b.value / max) * (PLOT_HEIGHT - 24)) : 0;
          return (
            <div key={b.label} role="listitem" tabIndex={0} aria-label={`${b.label}: ${format(b.value)}`} className="group relative flex h-full flex-1 flex-col items-center justify-end outline-none">
              <span className="mb-1 text-[11px] text-[#46566B] tabular-nums">{b.value ? compact(b.value) : ""}</span>
              <span className={`w-full max-w-6 rounded-t-[4px] ${BAR}`} style={{ height: h }} />
              <span className={tooltip} style={{ bottom: Math.min(h + 22, PLOT_HEIGHT - TOOLTIP_HEIGHT) }}>
                {b.label}: {format(b.value)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 text-[11px] text-[#5E6B7E]">
        {bars.map((b) => (
          <span key={b.label} className="flex-1 truncate text-center">
            {b.label}
          </span>
        ))}
      </div>
      <DataTable caption={title} rows={bars} format={format} />
    </figure>
  );
}

/** Ranked horizontal bars for parts of a whole (sources, dentists), value at each bar's tip. */
export function BarList({ title, bars, format, label = (s) => s }: { title: string; bars: Bar[]; format: (n: number) => string; label?: (raw: string) => string }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  const total = bars.reduce((s, b) => s + b.value, 0);
  if (!bars.length) return <p className="text-sm text-[#5E6B7E]">Nothing in this period yet.</p>;
  return (
    <figure className="flex flex-col gap-2.5">
      <ul aria-label={title} className="flex flex-col gap-2.5">
        {bars.map((b) => {
          const share = total ? Math.round((b.value / total) * 100) : 0;
          return (
            <li key={b.label} tabIndex={0} aria-label={`${label(b.label)}: ${format(b.value)}, ${share}%`} className="group relative flex flex-col gap-1 outline-none">
              <span className="flex justify-between gap-2 text-sm">
                <span className="truncate">{label(b.label)}</span>
                <span className="shrink-0 text-[#46566B] tabular-nums">
                  {format(b.value)} · {share}%
                </span>
              </span>
              <span className="h-2.5 w-full rounded-[4px] bg-[#EEF1F5]" aria-hidden>
                <span className={`block h-full rounded-[4px] ${BAR}`} style={{ width: `${(b.value / max) * 100}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
      <DataTable caption={title} rows={bars.map((b) => ({ ...b, label: label(b.label) }))} format={format} />
    </figure>
  );
}
