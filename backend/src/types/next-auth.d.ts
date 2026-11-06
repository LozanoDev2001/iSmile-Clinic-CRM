import type { DefaultSession } from "next-auth";
import type { Role } from "@backend/generated/prisma/enums";

declare module "next-auth" {
  interface User {
    role?: Role;
    sessionVersion?: number;
    /** "Keep me signed in" was ticked at login. */
    remember?: boolean;
  }

  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
    /** Compared with `users.sessionVersion` on every server request. */
    sessionVersion: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    role?: Role;
    sv?: number;
    /** "Keep me signed in" was ticked at login. */
    rm?: boolean;
    /** Login time (epoch seconds); enforces the absolute session lifetime. */
    lat?: number;
  }
}
