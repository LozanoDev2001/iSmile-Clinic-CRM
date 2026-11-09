import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once at startup. Import `env` instead of
 * reading `process.env` directly so misconfiguration fails fast and loudly.
 */
const isProduction = process.env.NODE_ENV === "production";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required")
      .refine((v) => v.startsWith("mysql://") || v.startsWith("mariadb://"), {
        message: "DATABASE_URL must be a mysql:// connection string",
      }),
    DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),

    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    APP_URL: z.url().default("http://localhost:3000"),
    SESSION_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(72).default(8),
    SESSION_REMEMBER_HOURS: z.coerce.number().int().min(1).max(720).default(72),

    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default(isProduction ? "info" : "debug"),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    EMAIL_FROM: z.string().default("iSmile CRM <no-reply@ismile.local>"),
    // Mia (crwdForce) drafts replies with Claude; without a key she shows as not connected.
    ANTHROPIC_API_KEY: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    // Password reset and invitations depend on email in production. Checked
    // when the server runs, not during `next build` (which also uses NODE_ENV=production).
    const isBuild = process.env.NEXT_PHASE === "phase-production-build";
    if (value.NODE_ENV === "production" && !isBuild && !value.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "SMTP_HOST is required in production (password reset emails)",
      });
    }
  });

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Never print the values themselves — only which keys are wrong.
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
