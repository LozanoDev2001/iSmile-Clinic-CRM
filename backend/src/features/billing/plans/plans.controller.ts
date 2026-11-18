"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { cancelPlan, createPlan, payInstallment } from "./plans.service";
import type { CreatePlanInput, PayInstallmentInput } from "./plans.types";

// Plan payments change invoice balances shown across Billing, patient files and dashboards.
const revalidate = () => revalidatePath("/", "layout");

export async function createPlanAction(input: CreatePlanInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const created = await createPlan(await requireAuth(), input);
    revalidate();
    return created;
  }, "Payment plan created.");
}

export async function payInstallmentAction(input: PayInstallmentInput): Promise<ActionResult> {
  return runAction(async () => {
    await payInstallment(await requireAuth(), input);
    revalidate();
    return undefined;
  }, "Installment payment recorded.");
}

export async function cancelPlanAction(planId: string): Promise<ActionResult> {
  return runAction(async () => {
    await cancelPlan(await requireAuth(), planId);
    revalidate();
    return undefined;
  }, "Payment plan cancelled.");
}
