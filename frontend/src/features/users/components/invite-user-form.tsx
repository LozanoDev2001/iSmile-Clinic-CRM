"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { FormRootError, FormTextField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { CLINIC_WIDE_ROLES, ROLE_LABELS } from "@backend/config/permissions";
import type { Role } from "@backend/generated/prisma/enums";
import { useActionForm } from "@/hooks/use-action-form";
import { inviteUserAction } from "@backend/features/users/users.controller";
import type { InviteOptions } from "@backend/features/users/users.types";
import { inviteUserSchema } from "@backend/features/users/user.schema";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

export function InviteUserForm({ options }: { options: InviteOptions }) {
  const [open, setOpen] = useState(false);
  const { form, onSubmit, isPending } = useActionForm({
    schema: inviteUserSchema,
    defaultValues: { name: "", email: "", role: options.roles[0], branchIds: [], clinicId: options.clinics[0]?.id },
    action: inviteUserAction,
    resetOnSuccess: true,
    toastOnSuccess: false,
    onSuccess: (data) => {
      if (data.emailSent) toast.success("Invitation sent.");
      else toast.warning("Account created, but the invitation email could not be sent. Ask the user to use “Forgot password”.");
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <UserPlus data-icon="inline-start" />
        Invite staff member
      </Button>
    );
  }

  const role = form.watch("role") as Role;
  const clinicId = form.watch("clinicId");
  const needsBranches = role !== "SUPER_ADMIN" && !CLINIC_WIDE_ROLES.includes(role);
  const branches = options.chooseClinic ? options.branches.filter((b) => b.clinicId === clinicId) : options.branches;
  const errors = form.formState.errors;

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-lg rounded-xl border p-4">
      <FieldGroup>
        <FormRootError form={form} />
        <FormTextField form={form} name="name" label="Full name" autoComplete="off" />
        <FormTextField form={form} name="email" label="Work email" type="email" autoComplete="off" />

        <Field data-invalid={!!errors.role || undefined}>
          <FieldLabel htmlFor="field-role">Role</FieldLabel>
          <select id="field-role" className={selectClass} {...form.register("role")}>
            {options.roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <FieldError errors={errors.role ? [{ message: errors.role.message }] : undefined} />
        </Field>

        {options.chooseClinic && role !== "SUPER_ADMIN" ? (
          <Field data-invalid={!!errors.clinicId || undefined}>
            <FieldLabel htmlFor="field-clinicId">Clinic</FieldLabel>
            <select id="field-clinicId" className={selectClass} {...form.register("clinicId")}>
              {options.clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError errors={errors.clinicId ? [{ message: errors.clinicId.message }] : undefined} />
          </Field>
        ) : null}

        {needsBranches ? (
          <Field data-invalid={!!errors.branchIds || undefined}>
            <FieldLabel>Branches</FieldLabel>
            {branches.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {branches.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" value={b.id} className="size-4 accent-primary" {...form.register("branchIds")} />
                    {b.name}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active branches available.</p>
            )}
            <FieldError errors={errors.branchIds ? [{ message: errors.branchIds.message }] : undefined} />
          </Field>
        ) : null}

        <div className="flex gap-2">
          <SubmitButton pending={isPending} pendingLabel="Sending invitation…">
            Send invitation
          </SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
