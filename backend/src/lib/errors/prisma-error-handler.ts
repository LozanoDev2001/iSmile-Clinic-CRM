import { AppError } from "./app-error";

/**
 * Maps Prisma / MySQL driver failures to safe AppErrors. Detection is by
 * error name, Prisma code and the driver adapter's structured `kind`
 * (duck typing), so it works without importing the generated client.
 * The original error is kept as `cause` for server-side logging only.
 *
 * With Prisma 7 driver adapters, most database failures arrive as
 * PrismaClientKnownRequestError (P2010 / P2039 …) carrying
 * `meta.driverAdapterError.cause = { kind, code?, ... }`.
 */

/** Adapter error kinds meaning "the database cannot be used right now". */
const UNAVAILABLE_KINDS = new Set([
  "DatabaseNotReachable",
  "DatabaseDoesNotExist",
  "DatabaseAccessDenied",
  "AuthenticationFailed",
  "ConnectionClosed",
  "TlsConnectionError",
  "TooManyConnections",
  "SocketTimeout",
]);
/** MySQL server / client error numbers for connection-level failures. */
const UNAVAILABLE_MYSQL_CODES = new Set([1040, 1044, 1045, 1049, 1053, 2002, 2003, 2006, 2013]);
/** MariaDB connector errors (450xx) for connection / pool failures. */
const UNAVAILABLE_CONNECTOR_CODES = new Set([45001, 45008, 45009, 45010, 45011, 45026, 45028, 45029]);

const UNAVAILABLE_PRISMA_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);
const UNAVAILABLE_NODE_CODES =
  /^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|EPIPE|PROTOCOL_CONNECTION_LOST|ER_GET_CONNECTION_TIMEOUT|ER_CON_COUNT_ERROR|ER_CONNECTION_TIMEOUT|ER_SOCKET_UNEXPECTED_CLOSE)$/;

interface ErrorLike {
  name?: string;
  code?: unknown;
  meta?: Record<string, unknown>;
  cause?: unknown;
}

interface AdapterCause {
  kind?: string;
  code?: number | string;
  constraint?: { fields?: string[]; index?: string };
}

function asErrorLike(error: unknown): ErrorLike | null {
  return typeof error === "object" && error !== null ? (error as ErrorLike) : null;
}

function prismaCode(error: ErrorLike): string | undefined {
  return typeof error.code === "string" ? error.code : undefined;
}

/** The structured driver adapter error, wherever Prisma put it. */
function adapterCause(error: ErrorLike): AdapterCause | undefined {
  const fromMeta = (error.meta?.driverAdapterError as { cause?: AdapterCause } | undefined)?.cause;
  if (fromMeta) return fromMeta;
  if (error.name === "DriverAdapterError") return asErrorLike(error.cause) as AdapterCause | undefined;
  return undefined;
}

export function isPrismaError(error: unknown): boolean {
  const name = asErrorLike(error)?.name ?? "";
  return name.startsWith("PrismaClient") || name === "DriverAdapterError";
}

export function isConnectionError(error: unknown, depth = 0): boolean {
  const e = asErrorLike(error);
  if (!e || depth > 4) return false;
  if (e.name === "PrismaClientInitializationError") return true;

  const code = prismaCode(e);
  if (code && (UNAVAILABLE_PRISMA_CODES.has(code) || UNAVAILABLE_NODE_CODES.test(code))) return true;

  const cause = adapterCause(e);
  if (cause?.kind && UNAVAILABLE_KINDS.has(cause.kind)) return true;
  if (cause?.kind === "mysql") {
    const n = Number(cause.code);
    if (UNAVAILABLE_MYSQL_CODES.has(n) || UNAVAILABLE_CONNECTOR_CODES.has(n)) return true;
  }
  return e.cause !== undefined && e.cause !== error ? isConnectionError(e.cause, depth + 1) : false;
}

function isWriteConflict(error: ErrorLike): boolean {
  const cause = adapterCause(error);
  return (
    prismaCode(error) === "P2034" ||
    cause?.kind === "TransactionWriteConflict" ||
    (cause?.kind === "mysql" && Number(cause.code) === 1205) // lock wait timeout
  );
}

/** Transient failures that are safe to retry for idempotent operations only. */
export function isTransientDbError(error: unknown): boolean {
  const e = asErrorLike(error);
  return !!e && (isConnectionError(error) || isWriteConflict(e));
}

/** Unique-constraint field names, when reported (classic meta.target or adapter constraint). */
function uniqueFields(error: ErrorLike): string[] {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string") return [target];
  return adapterCause(error)?.constraint?.fields ?? [];
}

/** Returns an AppError for known database failures, or null if not a DB error. */
export function mapPrismaError(error: unknown): AppError | null {
  const e = asErrorLike(error);
  if (!e) return null;

  if (isConnectionError(error)) return new AppError("DATABASE_ERROR", undefined, { cause: error });
  if (!isPrismaError(error)) return null;
  if (isWriteConflict(e)) {
    return new AppError("CONFLICT", "The record was changed by another request. Please try again.", { cause: error });
  }

  const kind = adapterCause(e)?.kind;
  const code = prismaCode(e);

  if (code === "P2002" || kind === "UniqueConstraintViolation") {
    const fields = Object.fromEntries(
      uniqueFields(e)
        .filter((f) => !f.endsWith("_key") && f !== "PRIMARY")
        .map((f) => [f, ["This value is already in use."]]),
    );
    return new AppError("CONFLICT", "A record with these details already exists.", {
      fields: Object.keys(fields).length ? fields : undefined,
      cause: error,
    });
  }
  if (code === "P2025" || code === "P2001") return new AppError("NOT_FOUND", undefined, { cause: error });
  if (code === "P2003" || kind === "ForeignKeyConstraintViolation") {
    return new AppError("VALIDATION_ERROR", "A related record does not exist.", { cause: error });
  }
  // Validation errors, panics and unknown codes are programming errors.
  return new AppError("INTERNAL_ERROR", undefined, { cause: error });
}

/**
 * Bounded retry for transient database failures. Use ONLY for idempotent
 * operations (reads, upserts keyed on a natural key). Never wrap payment or
 * other non-idempotent writes in this.
 */
export async function retryTransient<T>(
  operation: () => Promise<T>,
  { retries = 2, baseDelayMs = 100 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retries || !isTransientDbError(error)) throw error;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
}
