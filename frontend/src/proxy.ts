import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { DEFAULT_LOGIN_REDIRECT, LOGIN_PATH, PUBLIC_API_PREFIXES, PUBLIC_PATHS } from "@backend/config/security";
import { authConfig } from "@backend/lib/auth.config";

/**
 * Runs before every page/API request:
 *  1. Assigns a request ID (correlates logs, audit entries and error pages).
 *  2. Optimistic auth redirects based on the session cookie (no DB access).
 *     Real authorization still happens on the server for every request.
 *  3. Sets a per-request nonce-based Content-Security-Policy.
 */
const { auth } = NextAuth(authConfig);

const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token/;

function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by UI components; scripts remain nonce-locked.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.APP_URL?.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isLoggedIn = !!req.auth?.user?.id;
  const isApi = pathname.startsWith("/api/");
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isLoggedIn && pathname === LOGIN_PATH) {
    return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, req.nextUrl));
  }

  if (!isLoggedIn && !isPublic) {
    if (isApi) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Authentication required." } },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const loginUrl = new URL(LOGIN_PATH, req.nextUrl);
    if (pathname !== "/") loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    const hadSession = req.cookies.getAll().some((c) => SESSION_COOKIE.test(c.name));
    if (hadSession) loginUrl.searchParams.set("reason", "expired");
    return NextResponse.redirect(loginUrl);
  }

  const requestId = crypto.randomUUID();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  if (!isApi) response.headers.set("Content-Security-Policy", csp);
  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)"],
};
