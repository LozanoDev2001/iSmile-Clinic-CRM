"use client";

import { FormRootError, FormTextField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { FieldGroup } from "@/components/ui/field";
import { SECURITY } from "@backend/config/security";
import { useActionForm } from "@/hooks/use-action-form";
import { changePasswordAction } from "@backend/features/auth/auth.controller";
import { changePasswordSchema } from "@backend/features/auth/password.schema";

/** On success the server signs the user out of every session and redirects to /login. */
export function ChangePasswordForm() {
  const { form, onSubmit, isPending } = useActionForm({
    schema: changePasswordSchema,
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    action: changePasswordAction,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-md">
      <FieldGroup>
        <FormRootError form={form} />
        <FormTextField form={form} name="currentPassword" label="Current password" type="password" autoComplete="current-password" />
        <FormTextField
          form={form}
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          description={`At least ${SECURITY.password.minLength} characters. You will be signed out on all devices.`}
        />
        <FormTextField form={form} name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" />
        <div>
          <SubmitButton pending={isPending} pendingLabel="Updating…">
            Change password
          </SubmitButton>
        </div>
      </FieldGroup>
    </form>
  );
}
