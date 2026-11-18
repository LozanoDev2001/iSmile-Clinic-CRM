import { describe, expect, it } from "vitest";
import { birDeadlinesBetween, birDeadlinesForYear } from "@backend/features/billing/tax/tax.deadlines";

const find = (year: number, vat: boolean, form: string, period: string) => birDeadlinesForYear(year, vat).find((d) => d.form === form && d.period === period);

describe("BIR deadlines", () => {
  it("files monthly compensation withholding by the 10th, and December's by 15 January", () => {
    expect(find(2026, false, "1601-C", "October 2026")?.due).toBe("2026-11-10");
    expect(find(2026, false, "1601-C", "December 2026")?.due).toBe("2027-01-15");
  });

  it("files 0619-E only for the first two months of each quarter", () => {
    const periods = birDeadlinesForYear(2026, false).filter((d) => d.form === "0619-E").map((d) => d.period);
    expect(periods).toHaveLength(8);
    expect(periods).not.toContain("March 2026");
  });

  it("picks 2550Q for VAT-registered clinics and 2551Q otherwise, due the 25th after the quarter", () => {
    expect(find(2026, true, "2550Q", "Q3 2026")?.due).toBe("2026-10-25");
    expect(find(2026, true, "2551Q", "Q3 2026")).toBeUndefined();
    expect(find(2026, false, "2551Q", "Q3 2026")?.due).toBe("2026-10-25");
  });

  it("dates quarterly income tax and 1601-EQ correctly", () => {
    expect(find(2026, false, "1702Q", "Q1 2026")?.due).toBe("2026-05-30");
    expect(find(2026, false, "1701Q", "Q2 2026")?.due).toBe("2026-08-15");
    expect(find(2026, false, "1601-EQ", "Q3 2026")?.due).toBe("2026-10-31");
    expect(find(2026, false, "1702Q", "Q4 2026")).toBeUndefined();
  });

  it("moves weekend due dates to the next Monday", () => {
    const sat = find(2026, false, "1601-EQ", "Q3 2026");
    expect(sat?.due).toBe("2026-10-31");
    expect(sat?.fileBy).toBe("2026-11-02");
  });

  it("returns deadlines within a range across a year boundary, in filing order", () => {
    const list = birDeadlinesBetween("2026-12-20", "2027-01-31", false);
    expect(list.map((d) => d.form)).toContain("1601-C");
    expect(list.every((d) => d.fileBy >= "2026-12-20" && d.fileBy <= "2027-01-31")).toBe(true);
    expect([...list].sort((a, b) => a.fileBy.localeCompare(b.fileBy)).map((d) => d.fileBy)).toEqual(list.map((d) => d.fileBy));
  });
});
