import path from "node:path";
import { loadEnvConfig, updateInitialEnv } from "@next/env";
import type { NextConfig } from "next";

/** Repository root (iSmile-CRM/): holds backend/, frontend/ and the single .env. */
const repoRoot = path.join(__dirname, "..");

// Load iSmile-CRM/.env (shared with the backend's Prisma CLI) — Next.js on its
// own only reads .env files inside frontend/. forceReload bypasses Next's
// cached (frontend-only) result; updateInitialEnv keeps these values when Next
// reloads env later (dev server, build workers). Real environment variables
// set by the host always win over the file.
const { parsedEnv } = loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", undefined, true);
if (parsedEnv) updateInitialEnv(parsedEnv);

/**
 * Static security headers for every response. The Content-Security-Policy is
 * per-request (nonce-based) and is set in src/proxy.ts.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // Cache Components is intentionally off: almost every page is per-user,
  // clinic-scoped and may show medical data, which must not be cached across
  // users. Pages render dynamically; use explicit request-scoped caching only.
  poweredByHeader: false,
  devIndicators: false,
  // Native / Node-only packages: load at runtime instead of bundling.
  serverExternalPackages: ["@node-rs/argon2", "mariadb"],
  // backend/ lives beside frontend/; both must be inside the build root.
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
