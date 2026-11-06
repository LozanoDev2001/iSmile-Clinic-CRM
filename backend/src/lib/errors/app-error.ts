import { ERROR_CODES, type ErrorCode, type FieldErrors } from "./error-codes";

/**
 * Expected, typed application failure. `message` is shown to users, so it
 * must never contain SQL, stack traces, secrets or patient information.
 * Put diagnostic detail in `cause` — it is logged server-side only.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly fields?: FieldErrors;

  constructor(
    code: ErrorCode,
    message: string = ERROR_CODES[code].message,
    options: { fields?: FieldErrors; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.statusCode = ERROR_CODES[code].status;
    this.fields = options.fields;
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

/** Short-hands so call sites read naturally: `throw Errors.notFound("Patient")`. */
export const Errors = {
  unauthenticated: () => new AppError("UNAUTHENTICATED"),
  forbidden: (message?: string) => new AppError("FORBIDDEN", message),
  notFound: (resource = "record") =>
    new AppError("NOT_FOUND", `The requested ${resource} could not be found.`),
  validation: (fields?: FieldErrors, message?: string) =>
    new AppError("VALIDATION_ERROR", message, { fields }),
  conflict: (message?: string, fields?: FieldErrors) => new AppError("CONFLICT", message, { fields }),
  rateLimited: (message?: string) => new AppError("RATE_LIMITED", message),
};
