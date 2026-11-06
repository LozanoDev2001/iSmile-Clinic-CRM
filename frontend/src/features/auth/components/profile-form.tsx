"use client";

import { useRouter } from "next/navigation";
import { FormRootError, FormTextField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { FieldGroup } from "@/components/ui/field";
import { useActionForm } from "@/hooks/use-action-form";
import { updateProfileAction } from "@backend/features/auth/auth.controller";
import { updateProfileSchema } from "@backend/features/auth/password.schema";

export function ProfileForm({ name }: { name: string }) {
  const router = useRouter();
  const { form, onSubmit, isPending } = useActionForm({
    schema: updateProfileSchema,
    defaultValues: { name },
    action: updateProfileAction,
    onSuccess: () => router.refresh(),
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-md">
      <FieldGroup>
        <FormRootError form={form} />
        <FormTextField form={form} name="name" label="Full name" autoComplete="name" />
        <div>
          <SubmitButton pending={isPending} pendingLabel="Saving…" disabled={!form.formState.isDirty}>
            Save profile
          </SubmitButton>
        </div>
      </FieldGroup>
    </form>
  );
}
