"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Dates are handled as UTC midnight so the grid never shifts with the viewer's time zone. */
function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}

interface MiniCalendarProps {
  /** Clinic-local today as YYYY-MM-DD. */
  today: string;
}

export function MiniCalendar({ today }: MiniCalendarProps) {
  const [ty, tm, td] = today.split("-").map(Number);
  const todayDate = utcDate(ty, tm - 1, td);
  const [view, setView] = useState(() => utcDate(ty, tm - 1, 1));
  const [selected, setSelected] = useState(todayDate);

  const year = view.getUTCFullYear();
  const month = view.getUTCMonth();
  const leadingBlanks = view.getUTCDay();
  const daysInMonth = utcDate(year, month + 1, 0).getUTCDate();
  const shiftMonth = (delta: number) => setView(utcDate(year, month + delta, 1));

  return (
    <>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="grid size-8 place-items-center rounded-full bg-[#F4F6F9] hover:bg-[#E9EDF3]">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="text-sm" aria-live="polite">
          {monthLabel.format(view)}
        </span>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="grid size-8 place-items-center rounded-full bg-[#F4F6F9] hover:bg-[#E9EDF3]">
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-[#5E6B7E]" aria-hidden>
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = utcDate(year, month, i + 1);
          const isToday = date.getTime() === todayDate.getTime();
          const isSelected = date.getTime() === selected.getTime();
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(date)}
              aria-pressed={isSelected}
              aria-label={dayLabel.format(date)}
              className={cn(
                "h-[38px] rounded-full text-[13px] transition-colors",
                isSelected ? "bg-[#1D5296] text-white" : "hover:bg-[#F4F6F9]",
                isToday && !isSelected && "border-[1.5px] border-[#1D5296]",
                !isSelected && (date.getUTCDay() === 0 ? "text-[#9AA6B6]" : "text-[#0E2A47]"),
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-[#EDF0F4] pt-2.5">
        <span className="text-xs text-[#5E6B7E]">{dayLabel.format(selected)}</span>
        <span className="text-xs text-[#5E6B7E]">Appointments will appear here once the Calendar module is live.</span>
      </div>
    </>
  );
}
