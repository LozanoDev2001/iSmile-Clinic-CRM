/** When marketing consent was given: set on opting in, kept while it stays on, cleared on opting out. */
export function consentTimestamp(previous: boolean, next: boolean, now = new Date()): Date | null | undefined {
  if (!next) return null;
  return previous ? undefined : now;
}
