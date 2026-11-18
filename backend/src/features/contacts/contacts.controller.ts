"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { createContact, updateContact } from "./contacts.service";
import type { ContactInput, NewContactInput } from "./contacts.types";

// Contact names and numbers also show on patient files, leads and the calendar.
const revalidate = () => revalidatePath("/", "layout");

export async function updateContactAction(id: string, input: ContactInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await updateContact(await requireAuth(), id, input);
    revalidate();
    return { id };
  }, "Contact saved.");
}

export async function createContactAction(input: NewContactInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const created = await createContact(await requireAuth(), input);
    revalidate();
    return created;
  }, "Contact added.");
}
