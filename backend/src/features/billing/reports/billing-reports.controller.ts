"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { addExpense, deleteExpense } from "./billing-reports.service";
import type { ExpenseInput } from "./billing-reports.types";

export async function addExpenseAction(input: ExpenseInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const created = await addExpense(await requireAuth(), input);
    revalidatePath("/billing");
    return created;
  }, "Expense recorded.");
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await deleteExpense(await requireAuth(), id);
    revalidatePath("/billing");
    return undefined;
  }, "Expense removed.");
}
