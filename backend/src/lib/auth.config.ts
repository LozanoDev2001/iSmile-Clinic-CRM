import type { NextAuthConfig } from "next-auth";
import { SECURITY } from "@backend/config/security";

/**
 * Database-free Auth.js configuration shared by the proxy (src/proxy.ts) and
 * the full server config (src/lib/auth.ts). The proxy only checks that a
 * valid, unexpired session cookie exists; authoritative checks (account
 * active, session not revoked, permissions) happen on the server in
 * src/lib/authorization.ts against the database.
 */
const HOUR = 60 * 60;
/** Absolute session lifetime without / with "Keep me signed in". */
const standardLifetime = Number(process.env.SESSION_MAX_AGE_HOURS ?? 8) * HOUR;
const rememberLifetime = Math.max(Number(process.env.SESSION_REMEMBER_HOURS ?? 72) * HOUR, standardLifetime);

export const authConfig = {
  // Credentials login requires JWT sessions in Auth.js. Revocation is handled
  // with `sessionVersion` (see prisma/schema.prisma).
  session: {
    strategy: "jwt",
    // Cookie lifetime is the longest allowed; the jwt callback enforces the
    // per-login absolute limit, since the cookie itself slides while active.
    maxAge: rememberLifetime,
    updateAge: SECURITY.session.updateAgeSeconds,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  // Host header is trusted because the app is expected to run behind a
  // hosting platform / reverse proxy that sets it. Set AUTH_URL otherwise.
  trustHost: true,
  // Cookies: Auth.js defaults are HttpOnly, SameSite=Lax, and Secure +
  // `__Secure-` prefix whenever the site is served over HTTPS.
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.sv = user.sessionVersion ?? 0;
        token.rm = user.remember ?? false;
        token.lat = Math.floor(Date.now() / 1000);
      }
      const lifetime = token.rm ? rememberLifetime : standardLifetime;
      if (token.lat && Math.floor(Date.now() / 1000) - token.lat > lifetime) {
        return null; // absolute lifetime reached: sign out
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid && token.role) {
        session.user.id = token.uid;
        session.user.role = token.role;
      }
      session.sessionVersion = token.sv ?? 0;
      return session;
    },
  },
} satisfies NextAuthConfig;
