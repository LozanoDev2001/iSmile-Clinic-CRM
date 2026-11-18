import type { Metadata } from "next";
import { z } from "zod";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { CheckoutForm } from "@/features/billing/components/checkout-form";
import { CheckoutPatientStep } from "@/features/billing/components/checkout-patient-step";
import { getCheckoutContext } from "@backend/features/billing/billing.service";
import type { CheckoutContext } from "@backend/features/billing/billing.types";
import { pageCan } from "@backend/lib/authorization";
import { isAppError } from "@backend/lib/errors/app-error";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ appointment?: string; patient?: string }> }) {
  const { user, allowed } = await pageCan("billing.create");
  if (!allowed) return <AccessDenied />;
  const { appointment, patient } = await searchParams;

  const validId = (id: string | undefined) => id === undefined || z.uuid().safeParse(id).success;
  const started = Boolean(appointment || patient);
  let context: CheckoutContext | null = null;
  let problem = started && (!validId(appointment) || !validId(patient)) ? "That link isn't valid." : "";
  if (started && !problem) {
    try {
      context = await getCheckoutContext(user, { appointmentId: appointment, patientId: patient });
    } catch (error) {
      // A visit that is already invoiced or not finished is a normal situation, not a crash.
      if (!isAppError(error) || error.code === "UNAUTHENTICATED" || error.code === "FORBIDDEN") throw error;
      problem = error.message;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/billing" className="inline-flex items-center gap-1.5 self-start text-sm text-[#1D5296]">
        <ArrowLeft className="size-4" aria-hidden />
        Billing
      </Link>
      <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">Checkout</h1>
      {!started ? <CheckoutPatientStep /> : null}
      {context ? <CheckoutForm context={context} /> : null}
      {problem ? <p className="glass-card rounded-[24px] p-6 text-sm">{problem}</p> : null}
    </div>
  );
}
