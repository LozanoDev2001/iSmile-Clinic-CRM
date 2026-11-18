"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { addBankAccount, addDeposit, matchDeposit, unmatchDeposit } from "./bank.service";
import type { BankAccountInput, DepositInput, MatchInput } from "./bank.types";

const revalidate = () => revalidatePath("/billing");

export async function addBankAccountAction(input: BankAccountInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const created = await addBankAccount(await requireAuth(), input);
    revalidate();
    return created;
  }, "Account added.");
}

export async function addDepositAction(input: DepositInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const created = await addDeposit(await requireAuth(), input);
    revalidate();
    return created;
  }, "Deposit added.");
}

export async function matchDepositAction(input: MatchInput): Promise<ActionResult> {
  return runAction(async () => {
    await matchDeposit(await requireAuth(), input);
    revalidate();
    return undefined;
  }, "Deposit matched.");
}

export async function unmatchDepositAction(transactionId: string): Promise<ActionResult> {
  return runAction(async () => {
    await unmatchDeposit(await requireAuth(), transactionId);
    revalidate();
    return undefined;
  }, "Match removed.");
}
