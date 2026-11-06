import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@backend/generated/prisma/client";
import { env } from "./env";

/**
 * Single Prisma Client per process. In development, Next.js hot reloading
 * re-evaluates modules, so the instance is cached on globalThis to avoid
 * exhausting MySQL connections.
 */
function createPrismaClient() {
  const url = new URL(env.DATABASE_URL);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: env.DB_CONNECTION_LIMIT,
    // Fail fast when the database is unreachable instead of hanging requests.
    connectTimeout: 5_000,
    acquireTimeout: 10_000,
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
