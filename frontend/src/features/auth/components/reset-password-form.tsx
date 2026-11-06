"use client";

import { useRouter } from "next/navigation";
import { FormRootError, FormTextField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { FieldGroup } from "@/components/ui/field";
import { SECURITY } from "@backend/config/security";
import { useActionForm } from "@/hooks/use-action-form";
import { resetPasswordAction } from "@backend/features/auth/auth.controller";
import { resetPasswordSchema } from "@backend/features/auth/reset-password.schema";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const { form, onSubmit, isPending } = useActionForm({
    schema: resetPasswordSchema,
    defaultValues: { token, password: "", confirmPassword: "" },
    action: resetPasswordAction,
    onSuccess: () => router.replace("/login?reason=password-reset"),
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormRootError form={form} />
        <FormTextField
          form={form}
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          description={`At least ${SECURITY.password.minLength} characters. A short phrase is easy to remember.`}
          autoFocus
        />
        <FormTextField form={form} name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" />
        <SubmitButton pending={isPending} pendingLabel="Saving…" className="w-full" size="lg">
          Set new password
        </SubmitButton>
      </FieldGroup>
    </form>
  );
}
