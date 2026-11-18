/** Splits a balance into equal centavo amounts with the remainder on the last; null when it's too small to split. */
export function splitInstallments(balance: number, count: number): number[] | null {
  const cents = Math.round(balance * 100);
  const base = Math.floor(cents / count);
  if (base < 1) return null;
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? cents - base * (count - 1) : base) / 100);
}

/** The same day `months` later, clamped to the month's last day (Jan 31 → Feb 28). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, lastDay));
  return first.toISOString().slice(0, 10);
}
