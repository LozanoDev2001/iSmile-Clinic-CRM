"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { createPatient, updatePatient } from "./patients.service";
import type { PatientClinicalInput, PatientInput } from "./patients.types";

/** One flat form: patient fields plus, when `withClinical`, the clinical fields (each schema keeps only its own keys). */
type PatientFormValues = PatientInput & Partial<PatientClinicalInput>;

export async function createPatientAction(values: PatientFormValues, withClinical: boolean): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const created = await createPatient(await requireAuth(), values, withClinical ? values : undefined);
    revalidatePath("/patients", "layout");
    return created;
  }, "Patient added.");
}

export async function updatePatientAction(id: string, values: PatientFormValues, withClinical: boolean): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await updatePatient(await requireAuth(), id, values, withClinical ? values : undefined);
    revalidatePath("/patients", "layout");
    return { id };
  }, "Patient details saved.");
}
