import type { PrismaClient } from "@backend/generated/prisma/client";

/** Empties every table (FK-safe order). Only ever run against DATABASE_URL_TEST. */
export async function resetDatabase(prisma: PrismaClient) {
  await prisma.auditLog.deleteMany();
  await prisma.rateLimit.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.userBranch.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.clinic.deleteMany();
}

/**
 * Points the app at the disposable test database. Must run before any
 * module that imports `@/lib/env` is loaded.
 */
export function connectTestDatabase(): boolean {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) return false;
  process.env.DATABASE_URL = url;
  return true;
}
