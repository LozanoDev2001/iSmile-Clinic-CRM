"use client";

import { useRouter } from "next/navigation";
import { PatientPicker } from "@/features/patients/components/patient-picker";

/** First step of a checkout that isn't started from a visit: choose who the invoice is for. */
export function CheckoutPatientStep() {
  const router = useRouter();
  return (
    <section aria-label="Choose a patient" className="glass-card flex max-w-xl flex-col gap-3 rounded-[24px] p-5">
      <label htmlFor="checkout-patient" className="text-lg">
        Who is the invoice for?
      </label>
      <PatientPicker inputId="checkout-patient" value={null} onChange={(p) => p && router.push(`/billing/checkout?patient=${p.id}`)} />
      <p className="text-xs text-[#5E6B7E]">To invoice a visit, finish it in the Calendar and choose “Create invoice” there, so the treatments go on the patient&apos;s history.</p>
    </section>
  );
}
