import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@backend/lib/errors/app-error";
import type { ErrorPayload } from "@backend/lib/errors/error-codes";
import {
  handleApiError,
  logAppError,
  normalizeError,
  toErrorPayload,
} from "@backend/lib/errors/api-error-handler";
import { REQUEST_ID_HEADER, getRequestContext } from "@backend/lib/request-context";

// ─── Shapes shared by Route Handlers and Server Actions ──────────────────────

export type ApiSuccess<T> = { success: true; data: T; message?: string };
export type ApiFailure = { success: false; error: ErrorPayload };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Return type of every Server Action. Import with `import type` in client code. */
export type ActionResult<T = undefined> = ApiResponse<T>;

// ─── Route Handlers ──────────────────────────────────────────────────────────

export function ok<T>(data: T, init: { message?: string; status?: number; requestId?: string } = {}) {
  return NextResponse.json<ApiSuccess<T>>(
    { success: true, data, ...(init.message ? { message: init.message } : {}) },
    {
      status: init.status ?? 200,
      headers: {
        "Cache-Control": "no-store",
        ...(init.requestId ? { [REQUEST_ID_HEADER]: init.requestId } : {}),
      },
    },
  );
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defence for cookie-authenticated Route Handlers: browsers always send
 * `Origin` on cross-site mutating requests, so reject any mismatch.
 * (Server Actions get the same check from Next.js automatically.)
 */
function assertSameOrigin(request: NextRequest) {
  if (!MUTATING_METHODS.has(request.method)) return;
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    throw new AppError("FORBIDDEN", "Cross-site request blocked.");
  }
}

type RouteContext<P> = { params: Promise<P> };

/**
 * Wraps a Route Handler with request IDs, CSRF origin checks and centralized
 * error handling. Handlers just return data or throw AppErrors.
 *
 * export const GET = withApiHandler(async (req) => ok(await listPatients(...)));
 */
export function withApiHandler<P = Record<string, string>>(
  handler: (request: NextRequest, context: RouteContext<P> & { requestId: string }) => Promise<Response>,
) {
  return async (request: NextRequest, context: RouteContext<P>) => {
    const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
    try {
      assertSameOrigin(request);
      const response = await handler(request, { ...context, requestId });
      response.headers.set(REQUEST_ID_HEADER, requestId);
      return response;
    } catch (error) {
      return handleApiError(error, requestId);
    }
  };
}

// ─── Server Actions ──────────────────────────────────────────────────────────

/**
 * Error boundary for Server Actions. Returns a serialisable ActionResult
 * instead of throwing, so forms can show field errors and toasts. Redirects
 * and other Next.js control-flow errors pass through.
 */
export async function runAction<T>(
  operation: () => Promise<T>,
  successMessage?: string,
): Promise<ActionResult<T>> {
  try {
    const data = await operation();
    return { success: true, data, ...(successMessage ? { message: successMessage } : {}) };
  } catch (error) {
    unstable_rethrow(error);
    const appError = normalizeError(error);
    const { requestId } = await getRequestContext();
    logAppError(appError, { requestId, boundary: "server-action" });
    return { success: false, error: toErrorPayload(appError, requestId) };
  }
}
