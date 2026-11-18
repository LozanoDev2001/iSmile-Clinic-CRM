"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { FormRootError, FormTextField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/hooks/use-action-form";
import { SECURITY } from "@backend/config/security";
import { inviteUserAction } from "@backend/features/users/users.controller";
import { inviteUserSchema } from "@backend/features/users/user.schema";
import type { InviteOptions } from "@backend/features/users/users.types";
import type { Role } from "@backend/config/permissions";
import { RolePicker } from "./role-picker";
import { inputClass } from "@/components/forms/styles";

interface TeamInvitePanelProps {
  editorName: string;
  editorRole: string;
  /** Null when the viewer cannot invite. */
  options: InviteOptions | null;
}

export function TeamInvitePanel({ editorName, editorRole, options }: TeamInvitePanelProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <section className="glass-card flex flex-wrap items-center justify-between gap-4 rounded-[24px] px-6 py-5">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-1.5">
          <h2 className="text-[22px] font-normal">Team and roles</h2>
          <p className="text-sm text-[#46566B]">
            Each employee signs in with their own account. Choose their role, then pick exactly which windows and tabs they can open · editing as{" "}
            {editorName}, {editorRole}
          </p>
        </div>
        {options ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="btn-navy inline-flex h-12 shrink-0 items-center gap-1.5 rounded-full px-5 text-[15px] font-medium text-white"
          >
            {open ? "Close invite" : (
              <>
                <Plus className="size-4" aria-hidden />
                Invite employee
              </>
            )}
          </button>
        ) : null}
      </section>
      {open && options ? <InviteEmployeeForm options={options} onDone={() => setOpen(false)} /> : null}
    </>
  );
}

function InviteEmployeeForm({ options, onDone }: { options: InviteOptions; onDone: () => void }) {
  const router = useRouter();
  const { form, onSubmit, isPending } = useActionForm({
    schema: inviteUserSchema,
    defaultValues: {
      name: "",
      email: "",
      role: options.roles.includes("DENTIST") ? "DENTIST" : options.roles[0],
    },
    action: inviteUserAction,
    toastOnSuccess: false,
    onSuccess: (data) => {
      if (data.emailSent) toast.success("Invitation sent.");
      else toast.warning("Account created, but the invitation email could not be sent. Use “Reset password” to send a new link.");
      onDone();
      router.push(`/settings/team?member=${data.userId}`, { scroll: false });
    },
  });

  const role = form.watch("role") as Role;
  return (
    <form onSubmit={onSubmit} noValidate className="glass-card flex flex-col gap-4 rounded-[24px] px-6 py-5">
      <h2 className="text-xl font-normal">Invite an employee</h2>
      <FormRootError form={form} />
      <div className="grid gap-4 md:grid-cols-2 [&_[data-slot=field-label]]:text-sm [&_[data-slot=field-label]]:font-normal [&_[data-slot=field-label]]:text-[#46566B]">
        <FormTextField form={form} name="name" label="Full name" placeholder="e.g. Paula Mendoza" autoComplete="off" className={inputClass} />
        <FormTextField form={form} name="email" label="Work email" type="email" placeholder="name@clinic.com" autoComplete="off" className={inputClass} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-[#46566B]">Role · sets their starting windows and tabs, which you can fine-tune after</span>
        <RolePicker roles={options.roles} value={role} onChange={(r) => form.setValue("role", r, { shouldValidate: true })} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          pending={isPending}
          pendingLabel="Sending…"
          className="fill-orange h-12 rounded-full px-6 text-[15px] font-medium text-[#0E2A47] hover:brightness-105"
        >
          Send invite
        </SubmitButton>
        <span className="text-[13px] text-[#46566B]">
          They get a link to set their own password. The link expires in {SECURITY.invite.tokenTtlHours} hours.
        </span>
      </div>
    </form>
  );
}
