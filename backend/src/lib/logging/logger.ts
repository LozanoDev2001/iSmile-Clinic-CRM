/**
 * Structured server-side logger: one JSON object per line on stdout/stderr,
 * which every log collector (Vercel, Docker, CloudWatch, Datadog…) ingests.
 *
 * Never log passwords, tokens, cookies, medical notes or whole patient
 * records. Keys matching SENSITIVE_KEY are redacted automatically as a
 * safety net, but do not rely on it — log identifiers, not data.
 */

type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|session|hash|medical|allerg|diagnos|notes|dateOfBirth|dob|ssn|card/i;
const MAX_DEPTH = 4;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[Truncated]";
  if (value instanceof Error) return serializeError(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1),
    ]),
  );
}

function serializeError(error: Error): Record<string, unknown> {
  const e = error as Error & { code?: unknown };
  return {
    name: e.name,
    message: e.message,
    code: e.code,
    // Stack traces stay in server logs only; they are never sent to clients.
    stack: e.stack?.split("\n").slice(0, 8).join("\n"),
    cause: e.cause instanceof Error ? serializeError(e.cause) : undefined,
  };
}

function minLevel(): number {
  const configured = (process.env.LOG_LEVEL as Level | undefined) ?? "info";
  return LEVELS[configured] ?? LEVELS.info;
}

function write(level: Level, message: string, context?: Record<string, unknown>) {
  if (LEVELS[level] < minLevel() || process.env.LOG_SILENT === "true") return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};

/** Authentication / authorization security events, tagged for alerting. */
export function logSecurityEvent(event: string, context: Record<string, unknown> = {}) {
  write("warn", `security.${event}`, { category: "security", ...context });
}
