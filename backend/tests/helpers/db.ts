import type { PrismaClient } from "@backend/generated/prisma/client";
import { seedAccessModel } from "../../prisma/seed-access";

/**
 * Empties the tables tests write to (FK-safe order) and re-seeds the system
 * roles and permissions. Only ever run against DATABASE_URL_TEST.
 */
export async function resetDatabase(prisma: PrismaClient) {
  await prisma.auditLog.deleteMany();
  await prisma.rateLimit.deleteMany();
  await prisma.passwordToken.deleteMany();
  await prisma.securitySession.deleteMany();
  await prisma.userPermissionOverride.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.user.deleteMany();
  await prisma.clinic.deleteMany();
  return seedAccessModel(prisma);
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
