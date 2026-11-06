import "server-only";
import { headers } from "next/headers";

export const REQUEST_ID_HEADER = "x-request-id";

export interface RequestContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Correlation ID + client info for the current request. The request ID is
 * assigned by src/proxy.ts. Safe to call outside a request (tests, scripts):
 * it then returns a fresh ID and no client info.
 */
export async function getRequestContext(): Promise<RequestContext> {
  try {
    const h = await headers();
    return {
      requestId: h.get(REQUEST_ID_HEADER) ?? crypto.randomUUID(),
      // First hop of X-Forwarded-For is set by the trusted reverse proxy /
      // hosting platform. Do not trust it if the app is exposed directly.
      ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
      userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
    };
  } catch {
    return { requestId: crypto.randomUUID(), ipAddress: null, userAgent: null };
  }
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
