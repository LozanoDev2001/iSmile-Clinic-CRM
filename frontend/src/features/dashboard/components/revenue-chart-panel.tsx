import Link from "next/link";
import { ChartLine } from "lucide-react";
import { Panel, TextLink } from "@/features/dashboard/components/dashboard-widgets";
import { cn } from "@/lib/utils";

const CHART_MONTHS = 5;
const GRID_LINES = 5;
// Plot insets match the design: 48px y-axis gutter, 14px right, 22px x-axis.
const PLOT_LEFT = 48;
const PLOT_RIGHT = 14;

const LEGEND = [
  { label: "Net revenue", swatch: "border-t-[3px] border-[#1D5296]" },
  { label: "Expenses", swatch: "border-t-[2.5px] border-[#F58C80]" },
  { label: "Net income", swatch: "border-t-[2.5px] border-dashed border-[#2E9E63]" },
];

const SUMMARY_TILES = [
  { href: "/reports", value: "— %", caption: "net margin this month · open monthly summary" },
  { href: "/billing", value: "₱ —", caption: "collected this month · open Collections & bank" },
];

const TABS = ["Profit", "Cash"];

// Last `count` months ending with the current one, oldest first.
function recentMonths(isoDate: string, count: number) {
  const [y, m] = isoDate.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - count + i, 1)));
}

const monthFormat = (month: "short" | "long") =>
  new Intl.DateTimeFormat("en-GB", { month, timeZone: "UTC" });

export function RevenueChartPanel({ isoDate }: { isoDate: string }) {
  const months = recentMonths(isoDate, CHART_MONTHS);
  const longName = monthFormat("long");
  const shortName = monthFormat("short");
  const range = `${longName.format(months[0])} to ${longName.format(months[months.length - 1])}`;

  return (
    <Panel
      title={`Revenue, expenses and profit · ${range}`}
      className="gap-3.5"
      action={
        <div role="group" aria-label="Chart" className="flex gap-1 rounded-full bg-[#F4F6F9] p-1">
          {TABS.map((tab, i) => (
            <span
              key={tab}
              className={cn(
                "inline-flex h-[30px] items-center rounded-full px-3.5 text-xs",
                i === 0 ? "bg-[#0E2A47] text-white" : "text-[#46566B]",
              )}
            >
              {tab}
            </span>
          ))}
        </div>
      }
    >
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex flex-[0_1_170px] flex-col gap-2.5 max-[720px]:flex-[1_1_100%] max-[720px]:flex-row">
          {SUMMARY_TILES.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="flex flex-col gap-1 rounded-2xl bg-[#F4F6F9] p-3.5 transition-colors hover:bg-[#EDF0F4] max-[720px]:min-w-0 max-[720px]:flex-1"
            >
              <span className="text-[26px] whitespace-nowrap max-[720px]:text-[19px]">{tile.value}</span>
              <span className="text-xs text-[#5E6B7E]">{tile.caption}</span>
            </Link>
          ))}
        </div>

        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1.5">
          <ul className="flex flex-wrap gap-3.5 text-xs text-[#46566B]">
            {LEGEND.map((item) => (
              <li key={item.label} className="inline-flex items-center gap-1.5">
                <span className={cn("w-4", item.swatch)} aria-hidden />
                {item.label}
              </li>
            ))}
          </ul>
          <div className="relative h-[220px]">
            <div
              className="absolute top-0 bottom-[22px] flex flex-col justify-between"
              style={{ left: PLOT_LEFT, right: PLOT_RIGHT }}
              aria-hidden
            >
              {Array.from({ length: GRID_LINES }, (_, i) => (
                <span key={i} className="relative border-t border-[#EDF0F4]">
                  {i === GRID_LINES - 1 ? (
                    <span
                      className="absolute top-0 -translate-y-1/2 text-[11px] text-[#5E6B7E]"
                      style={{ left: -PLOT_LEFT }}
                    >
                      0
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
            <div
              className="absolute top-0 bottom-[22px] grid place-items-center px-4"
              style={{ left: PLOT_LEFT, right: PLOT_RIGHT }}
            >
              <div className="flex max-w-sm flex-col items-center gap-2 rounded-2xl bg-white/80 px-5 py-4 text-center backdrop-blur-sm">
                <ChartLine className="size-6 text-[#1D5296]" strokeWidth={1.8} aria-hidden />
                <p className="text-[13px] text-[#46566B]">
                  Monthly revenue, expenses and profit will chart here once invoices and expenses are
                  recorded in Billing.
                </p>
                <TextLink href="/billing">Open Billing</TextLink>
              </div>
            </div>
            {months.map((month, i) => (
              <span
                key={month.toISOString()}
                className="absolute bottom-0 -translate-x-1/2 text-[11px] text-[#5E6B7E]"
                style={{
                  left: `calc(${PLOT_LEFT}px + (100% - ${PLOT_LEFT + PLOT_RIGHT}px) * ${i / (CHART_MONTHS - 1)})`,
                }}
                aria-hidden
              >
                {shortName.format(month)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
