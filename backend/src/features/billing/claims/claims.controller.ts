"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { updateClaim } from "./claims.service";
import type { ClaimActionInput, ClaimRow } from "./claims.types";

const SUCCESS: Record<ClaimActionInput["type"], string> = { approve: "Claim approved.", pay: "HMO payment recorded.", deny: "Claim marked as denied." };

export async function updateClaimAction(claimId: string, input: ClaimActionInput): Promise<ActionResult<ClaimRow>> {
  return runAction(async () => {
    const claim = await updateClaim(await requireAuth(), claimId, input);
    revalidatePath("/", "layout");
    return claim;
  }, SUCCESS[input.type]);
}
