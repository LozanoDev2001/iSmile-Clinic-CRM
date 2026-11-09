import "server-only";
import { randomUUID } from "node:crypto";
import { assertPermission, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import { serviceIdSchema, serviceInputSchema } from "./catalog.schema";
import { catalogRepository } from "./catalog.repository";
import type { CatalogService, ServiceInput } from "./catalog.types";

type ServiceRow = NonNullable<Awaited<ReturnType<typeof catalogRepository.findActive>>>;

const DUPLICATE_NAME = "A service with this name is already on the list.";

function toCatalogService(row: ServiceRow): CatalogService {
  return { ...row, price: row.price.toNumber(), taxType: row.taxType === "vat" ? "vat" : "exempt" };
}

async function assertNameFree(clinicId: string, name: string, excludeId: string | undefined, tx: TransactionClient) {
  if (await catalogRepository.nameTaken(clinicId, name, excludeId, tx)) throw Errors.conflict(DUPLICATE_NAME, { name: [DUPLICATE_NAME] });
}

export async function listServices(actor: AuthUser): Promise<CatalogService[]> {
  assertPermission(actor, "settings.read");
  const rows = await catalogRepository.listActive(actor.clinicId);
  return rows.map(toCatalogService);
}

export async function createService(actor: AuthUser, input: ServiceInput): Promise<CatalogService> {
  assertPermission(actor, "settings.update");
  const data = serviceInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await assertNameFree(actor.clinicId, data.name, undefined, tx);
    const code = `S-${randomUUID().slice(0, 8).toUpperCase()}`;
    const row = await catalogRepository.create(actor.clinicId, code, data, tx);
    await audit(
      { action: AUDIT_ACTIONS.SERVICE_CREATED, resourceType: "service", resourceId: row.id, actorId: actor.id, clinicId: actor.clinicId, metadata: { name: data.name, price: data.price } },
      tx,
    );
    return toCatalogService(row);
  });
}

export async function updateService(actor: AuthUser, rawId: unknown, input: ServiceInput): Promise<CatalogService> {
  assertPermission(actor, "settings.update");
  const id = serviceIdSchema.parse(rawId);
  const data = serviceInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = await catalogRepository.findActive(actor.clinicId, id, tx);
    if (!existing) throw Errors.notFound("service");
    await assertNameFree(actor.clinicId, data.name, id, tx);
    const row = await catalogRepository.update(id, data, tx);
    await audit(
      {
        action: AUDIT_ACTIONS.SERVICE_UPDATED,
        resourceType: "service",
        resourceId: id,
        actorId: actor.id,
        clinicId: actor.clinicId,
        before: { name: existing.name, price: existing.price.toNumber(), taxType: existing.taxType, hmoCoverable: existing.hmoCoverable },
        metadata: data,
      },
      tx,
    );
    return toCatalogService(row);
  });
}

/** Removes a service from the price list. Archived, not deleted, because past appointments and invoices still reference it. */
export async function archiveService(actor: AuthUser, rawId: unknown): Promise<void> {
  assertPermission(actor, "settings.update");
  const id = serviceIdSchema.parse(rawId);
  await prisma.$transaction(async (tx) => {
    const existing = await catalogRepository.findActive(actor.clinicId, id, tx);
    if (!existing) throw Errors.notFound("service");
    await catalogRepository.archive(id, tx);
    await audit(
      { action: AUDIT_ACTIONS.SERVICE_ARCHIVED, resourceType: "service", resourceId: id, actorId: actor.id, clinicId: actor.clinicId, before: { name: existing.name } },
      tx,
    );
  });
}
