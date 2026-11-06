import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { AppError, isAppError } from "./app-error";
import type { ErrorPayload, FieldErrors } from "./error-codes";
import { mapPrismaError } from "./prisma-error-handler";
import { logger } from "@backend/lib/logging/logger";

/** Converts a ZodError into `{ field: [messages] }` for forms and API clients. */
export function zodFieldErrors(error: ZodError): FieldErrors {
  const { fieldErrors, formErrors } = z.flattenError(error);
  const fields: FieldErrors = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (Array.isArray(messages) && messages.length) fields[key] = messages as string[];
  }
  if (formErrors.length) fields._form = formErrors;
  return fields;
}

/**
 * Turns any thrown value into a safe AppError. Unknown errors become a
 * generic INTERNAL_ERROR; the original is preserved as `cause` for logging.
 */
export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof ZodError) {
    return new AppError("VALIDATION_ERROR", undefined, { fields: zodFieldErrors(error), cause: error });
  }
  const dbError = mapPrismaError(error);
  if (dbError) return dbError;
  return new AppError("INTERNAL_ERROR", undefined, { cause: error });
}

/** Logs at the right severity: 5xx are bugs/outages, 4xx are expected. */
export function logAppError(error: AppError, context: Record<string, unknown> = {}) {
  if (error.statusCode >= 500) {
    logger.error(`Unhandled ${error.code}`, { ...context, code: error.code, error: error.cause ?? error });
  } else if (error.code === "FORBIDDEN" || error.code === "RATE_LIMITED") {
    logger.warn(`Request rejected: ${error.code}`, { ...context, code: error.code });
  } else {
    logger.debug(`Request rejected: ${error.code}`, { ...context, code: error.code });
  }
}

/** Client-safe error body. Never includes stack, SQL, or `cause`. */
export function toErrorPayload(error: AppError, requestId?: string): ErrorPayload {
  return {
    code: error.code,
    message: error.message,
    ...(error.fields ? { fields: error.fields } : {}),
    ...(requestId && error.statusCode >= 500 ? { requestId } : {}),
  };
}

/**
 * Central error boundary for Route Handlers. Framework control-flow errors
 * (redirect, notFound…) are re-thrown untouched.
 */
export function handleApiError(error: unknown, requestId?: string): NextResponse {
  unstable_rethrow(error);
  const appError = normalizeError(error);
  logAppError(appError, { requestId });
  return NextResponse.json(
    { success: false, error: toErrorPayload(appError, requestId) },
    {
      status: appError.statusCode,
      headers: {
        "Cache-Control": "no-store",
        ...(requestId ? { "x-request-id": requestId } : {}),
        ...(appError.code === "RATE_LIMITED" ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
