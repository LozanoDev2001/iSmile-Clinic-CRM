import "server-only";
import { logger } from "@backend/lib/logging/logger";
import { prisma } from "@backend/lib/prisma";
import type { HealthStatus } from "./health.types";

/** Liveness + database readiness. Logs details server-side; reveals none. */
export async function checkDatabase(): Promise<HealthStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { database: true };
  } catch (error) {
    logger.error("Health check: database unavailable", { error });
    return { database: false };
  }
}
