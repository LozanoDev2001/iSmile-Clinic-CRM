"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { FormRootError, FormTextField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { FieldGroup } from "@/components/ui/field";
import { useActionForm } from "@/hooks/use-action-form";
import { forgotPasswordAction } from "@backend/features/auth/auth.controller";
import { forgotPasswordSchema } from "@backend/features/auth/reset-password.schema";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const { form, onSubmit, isPending } = useActionForm({
    schema: forgotPasswordSchema,
    defaultValues: { email: "" },
    action: forgotPasswordAction,
    toastOnSuccess: false,
    onSuccess: () => setSent(true),
  });

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <MailCheck className="size-10 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          If an account exists for that email, we&apos;ve sent a link to reset your password. It expires in 30
          minutes.
        </p>
        <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormRootError form={form} />
        <FormTextField form={form} name="email" label="Email" type="email" autoComplete="email" autoFocus />
        <SubmitButton pending={isPending} pendingLabel="Sending…" className="w-full" size="lg">
          Send reset link
        </SubmitButton>
        <Link href="/login" className="text-center text-sm text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </FieldGroup>
    </form>
  );
}
