"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { archiveService, createService, updateService } from "./catalog.service";
import type { CatalogService, ServiceInput } from "./catalog.types";

// The price list also feeds the "Services offered" list on the clinic profile.
const revalidateSettings = () => revalidatePath("/settings", "layout");

export async function createServiceAction(input: ServiceInput): Promise<ActionResult<CatalogService>> {
  return runAction(async () => {
    const service = await createService(await requireAuth(), input);
    revalidateSettings();
    return service;
  }, "Added to the price list. New invoices use it now.");
}

export async function updateServiceAction(id: string, input: ServiceInput): Promise<ActionResult<CatalogService>> {
  return runAction(async () => {
    const service = await updateService(await requireAuth(), id, input);
    revalidateSettings();
    return service;
  }, "Service updated. New invoices use the new price.");
}

export async function archiveServiceAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await archiveService(await requireAuth(), id);
    revalidateSettings();
    return undefined;
  }, "Removed from the price list. Past invoices keep it.");
}
