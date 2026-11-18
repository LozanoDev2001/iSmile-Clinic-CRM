"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { createLead, updateLead } from "./leads.service";
import type { CreateLeadInput, LeadActionInput, LeadDetail } from "./leads.types";

// Leads feed the calendar and patient list when a consult is booked.
const revalidate = () => revalidatePath("/", "layout");

export async function createLeadAction(input: CreateLeadInput): Promise<ActionResult<{ id: string; existingPatientNo: string | null }>> {
  return runAction(async () => {
    const created = await createLead(await requireAuth(), input);
    revalidate();
    return created;
  }, "Lead added.");
}

export async function updateLeadAction(id: string, input: LeadActionInput): Promise<ActionResult<LeadDetail>> {
  return runAction(async () => {
    const lead = await updateLead(await requireAuth(), id, input);
    revalidate();
    return lead;
  }, "Lead updated.");
}
