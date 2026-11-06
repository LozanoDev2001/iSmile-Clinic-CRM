import "server-only";

/**
 * Auth HTTP controller — Route Handlers for the auth feature (the Server
 * Action controller is auth.controller.ts; a "use server" file may only
 * export actions, hence two files). Mounted by thin files in
 * frontend/src/app/api.
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOGIN_REDIRECT, LOGIN_PATH } from "@backend/config/security";
import { handlers } from "@backend/lib/auth";
import { getCurrentUser } from "@backend/lib/authorization";

/** Auth.js endpoints: /api/auth/* (sign-in callback, CSRF token, session, sign-out). */
export const { GET: authGetHandler, POST: authPostHandler } = handlers;

/**
 * GET /api/session/expired — pages redirect here when a session cookie exists
 * but is no longer valid (revoked, deactivated, password changed). Server
 * Components cannot modify cookies, so this clears the stale cookie and sends
 * the user to sign in. It only clears cookies when the session really is
 * invalid, so a cross-site link cannot log someone out.
 */
export async function sessionExpiredHandler(request: NextRequest) {
  if (await getCurrentUser()) {
    return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, request.nextUrl));
  }

  const jar = await cookies();
  for (const cookie of jar.getAll()) {
    if (/^(__Secure-|__Host-)?authjs\.(session-token|callback-url)/.test(cookie.name)) {
      jar.delete(cookie.name);
    }
  }

  const loginUrl = new URL(LOGIN_PATH, request.nextUrl);
  loginUrl.searchParams.set("reason", "expired");
  return NextResponse.redirect(loginUrl);
}
