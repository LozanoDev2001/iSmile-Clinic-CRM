import "server-only";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyCredentials } from "@backend/features/auth/auth.service";
import { authConfig } from "./auth.config";
import { getClientIp } from "./request-context";

/** Surfaces as `?code=rate_limited`; deliberately reveals nothing about the account. */
class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { label: "Keep me signed in", type: "checkbox" },
      },
      async authorize(credentials, request) {
        // Credentials arrive as form strings; `remember` is not part of the login check.
        const { remember, ...login } = credentials;
        const result = await verifyCredentials(login, getClientIp(request));
        if (!result.ok) {
          if (result.reason === "rate_limited") throw new RateLimitedSignin();
          return null; // → generic CredentialsSignin
        }
        return { ...result.user, remember: String(remember) === "true" };
      },
    }),
  ],
});
