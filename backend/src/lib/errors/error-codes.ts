/**
 * The single source of truth for application error categories, their HTTP
 * status codes and the safe, user-facing default messages.
 * Safe to import from both server and client code.
 */
export const ERROR_CODES = {
  UNAUTHENTICATED: { status: 401, message: "Your session has expired. Please sign in again." },
  FORBIDDEN: { status: 403, message: "You do not have permission to perform this action." },
  NOT_FOUND: { status: 404, message: "The requested record could not be found." },
  VALIDATION_ERROR: { status: 400, message: "Please check the provided information." },
  CONFLICT: { status: 409, message: "This record conflicts with existing data." },
  RATE_LIMITED: { status: 429, message: "Too many attempts. Please wait a moment and try again." },
  DATABASE_ERROR: { status: 503, message: "The service is temporarily unavailable. Please try again shortly." },
  INTERNAL_ERROR: { status: 500, message: "Something went wrong. Please try again." },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Field name → list of messages, shaped for form libraries. */
export type FieldErrors = Record<string, string[]>;

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  fields?: FieldErrors;
  /** Correlation ID so support can find the matching server log entry. */
  requestId?: string;
}
