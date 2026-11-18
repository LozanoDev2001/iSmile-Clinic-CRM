import { addDays, weekdayOf } from "@backend/config/clinic";

export type TaxKind = "withholding" | "business" | "income" | "annual";

export interface TaxDeadline {
  form: string;
  title: string;
  period: string;
  kind: TaxKind;
  /** Statutory due date (YYYY-MM-DD). */
  due: string;
  /** Due date moved off a weekend to the next Monday; public holidays are not applied. */
  fileBy: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SATURDAY = 6;
const SUNDAY = 0;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const nextMonth = (year: number, month: number) => (month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 });

function nextWorkingDay(date: string) {
  const day = weekdayOf(date);
  if (day === SATURDAY) return addDays(date, 2);
  if (day === SUNDAY) return addDays(date, 1);
  return date;
}

/** Standard BIR filing deadlines for a calendar-year clinic, for every period of the given year. */
export function birDeadlinesForYear(year: number, vatRegistered: boolean): TaxDeadline[] {
  const items: Omit<TaxDeadline, "fileBy">[] = [];

  for (let month = 1; month <= 12; month++) {
    const after = nextMonth(year, month);
    const period = `${MONTHS[month - 1]} ${year}`;
    items.push({ form: "1601-C", title: "Tax withheld on compensation", period, kind: "withholding", due: ymd(after.year, after.month, month === 12 ? 15 : 10) });
    if (month % 3 !== 0) items.push({ form: "0619-E", title: "Expanded withholding tax (monthly)", period, kind: "withholding", due: ymd(after.year, after.month, 10) });
  }

  for (let quarter = 1; quarter <= 4; quarter++) {
    const endMonth = quarter * 3;
    const after = nextMonth(year, endMonth);
    const period = `Q${quarter} ${year}`;
    items.push({ form: "1601-EQ", title: "Expanded withholding tax (quarterly) with QAP", period, kind: "withholding", due: ymd(after.year, after.month, lastDay(after.year, after.month)) });
    items.push(
      vatRegistered
        ? { form: "2550Q", title: "Quarterly VAT return", period, kind: "business", due: ymd(after.year, after.month, 25) }
        : { form: "2551Q", title: "Quarterly percentage tax", period, kind: "business", due: ymd(after.year, after.month, 25) },
    );
    if (quarter === 4) continue;
    items.push({ form: "1702Q", title: "Quarterly income tax (corporation)", period, kind: "income", due: addDays(ymd(year, endMonth, lastDay(year, endMonth)), 60) });
    items.push({ form: "1701Q", title: "Quarterly income tax (sole proprietor)", period, kind: "income", due: ymd(year, endMonth + 2, 15) });
  }

  const following = year + 1;
  const annual = `Year ${year}`;
  items.push(
    { form: "1604-C", title: "Annual information return, compensation withheld", period: annual, kind: "annual", due: ymd(following, 1, 31) },
    { form: "2316", title: "Give employees their certificate of tax withheld", period: annual, kind: "annual", due: ymd(following, 1, 31) },
    { form: "1604-E", title: "Annual information return, expanded withholding", period: annual, kind: "annual", due: ymd(following, 3, 1) },
    { form: "1702-RT", title: "Annual income tax (corporation)", period: annual, kind: "annual", due: ymd(following, 4, 15) },
    { form: "1701", title: "Annual income tax (sole proprietor)", period: annual, kind: "annual", due: ymd(following, 4, 15) },
  );

  return items.map((d) => ({ ...d, fileBy: nextWorkingDay(d.due) })).sort((a, b) => a.fileBy.localeCompare(b.fileBy) || a.form.localeCompare(b.form));
}

/** Deadlines whose filing date falls in [from, to], drawn from the periods that can land there. */
export function birDeadlinesBetween(from: string, to: string, vatRegistered: boolean): TaxDeadline[] {
  const firstYear = Number(from.slice(0, 4)) - 1;
  const lastYear = Number(to.slice(0, 4));
  const all: TaxDeadline[] = [];
  for (let y = firstYear; y <= lastYear; y++) all.push(...birDeadlinesForYear(y, vatRegistered));
  return all.filter((d) => d.fileBy >= from && d.fileBy <= to).sort((a, b) => a.fileBy.localeCompare(b.fileBy) || a.form.localeCompare(b.form));
}
