"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormRootError, FormTextField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/hooks/use-action-form";
import { cn } from "@/lib/utils";
import { updateClinicProfileAction } from "@backend/features/settings/settings.controller";
import { clinicProfileSchema } from "@backend/features/settings/settings.schema";
import type { ClinicProfile } from "@backend/features/settings/settings.types";
import { primaryButtonClass, fieldLabelsClass, inputClass } from "@/components/forms/styles";

const DAY_NAMES: Record<ClinicProfile["hours"][number]["day"], string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

const timeClass =
  "h-10 w-[120px] rounded-full border border-[#D5DCE5] bg-white px-3 text-sm outline-none focus-visible:border-[#1D5296] focus-visible:ring-3 focus-visible:ring-[#1D5296]/15 disabled:opacity-40 read-only:opacity-40";

interface ClinicProfileFormProps {
  profile: ClinicProfile;
  servicesOffered: string[];
  canEdit: boolean;
}

export function ClinicProfileForm({ profile, servicesOffered, canEdit }: ClinicProfileFormProps) {
  const router = useRouter();
  const { form, onSubmit, isPending } = useActionForm({
    schema: clinicProfileSchema,
    defaultValues: profile,
    action: updateClinicProfileAction,
    onSuccess: (saved) => {
      form.reset(saved);
      router.refresh();
    },
  });
  const hours = form.watch("hours");
  const hourErrors = form.formState.errors.hours;

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Clinic profile" className="glass-card flex min-w-0 flex-col gap-5 rounded-[24px] p-5 sm:p-6">
      <h2 className="text-xl font-normal">Clinic profile</h2>
      <FormRootError form={form} />

      <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-5">
        <div className={cn("grid gap-4 md:grid-cols-2", fieldLabelsClass)}>
          <FormTextField form={form} name="name" label="Clinic name" autoComplete="organization" className={inputClass} />
          <FormTextField form={form} name="tagline" label="Tagline" placeholder="e.g. Pediatrics · Family · Orthodontics" className={inputClass} />
          <FormTextField form={form} name="phone" label="Clinic phone" type="tel" placeholder="e.g. +63 2 8123 4567" autoComplete="tel" className={inputClass} />
          <FormTextField form={form} name="address" label="Address" placeholder="Street, city" autoComplete="street-address" className={inputClass} />
        </div>

        <section aria-labelledby="hours-heading" className="flex flex-col gap-2">
          <h3 id="hours-heading" className="text-sm text-[#46566B]">
            Clinic hours · Mia uses these to book appointments
          </h3>
          <div className="flex flex-col divide-y divide-[#EDF0F4] rounded-2xl bg-[#F4F6F9]/80 px-4">
            {hours.map((h, i) => {
              const error = hourErrors?.[i]?.close?.message ?? hourErrors?.[i]?.open?.message;
              return (
                <div key={h.day} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                  <span className="w-28 text-[15px]">{DAY_NAMES[h.day]}</span>
                  <label className="flex items-center gap-2 text-sm text-[#46566B]">
                    <input type="checkbox" className="size-4 accent-[#1D5296]" {...form.register(`hours.${i}.closed`)} />
                    Closed
                  </label>
                  <span className="flex items-center gap-2">
                    <input type="time" aria-label={`${DAY_NAMES[h.day]} opening time`} readOnly={h.closed} aria-disabled={h.closed} className={timeClass} {...form.register(`hours.${i}.open`)} />
                    <span className="text-sm text-[#5E6B7E]">to</span>
                    <input type="time" aria-label={`${DAY_NAMES[h.day]} closing time`} readOnly={h.closed} aria-disabled={h.closed} className={timeClass} {...form.register(`hours.${i}.close`)} />
                  </span>
                  {error ? (
                    <span role="alert" className="text-xs text-destructive">
                      {error}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </fieldset>

      <section aria-labelledby="services-heading" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 id="services-heading" className="text-sm text-[#46566B]">
            Services offered
          </h3>
          <Link href="/settings/services" className="text-xs text-[#1D5296] underline">
            Edit price list
          </Link>
        </div>
        {servicesOffered.length ? (
          <ul className="flex flex-wrap gap-2">
            {servicesOffered.map((name) => (
              <li key={name} className="rounded-full bg-[#E4EEFB] px-3 py-1 text-[13px] text-[#10305A]">
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#5E6B7E]">No dental services on the price list yet.</p>
        )}
      </section>

      {canEdit ? (
        <div>
          <SubmitButton pending={isPending} pendingLabel="Saving…" disabled={!form.formState.isDirty} className={primaryButtonClass}>
            Save changes
          </SubmitButton>
        </div>
      ) : (
        <p className="text-xs text-[#5E6B7E]">Only people with full Settings access can change the clinic profile.</p>
      )}
    </form>
  );
}
