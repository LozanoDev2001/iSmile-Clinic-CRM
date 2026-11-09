import type { DefaultSession } from "next-auth";
import type { Role } from "@backend/config/permissions";

declare module "next-auth" {
  interface User {
    role?: Role;
    /** `security_sessions.id` created at sign-in. */
    sessionId?: string;
    /** Raw secret whose SHA-256 is `security_sessions.refresh_token_hash`. */
    sessionSecret?: string;
    /** "Keep me signed in" was ticked at login. */
    remember?: boolean;
  }

  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
    /** Checked against `security_sessions` on every server request. */
    sessionId: string;
    sessionSecret: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    role?: Role;
    sid?: string;
    sst?: string;
    /** "Keep me signed in" was ticked at login. */
    rm?: boolean;
    /** Login time (epoch seconds); enforces the absolute session lifetime. */
    lat?: number;
  }
}
