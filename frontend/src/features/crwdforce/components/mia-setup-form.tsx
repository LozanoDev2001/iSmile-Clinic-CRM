"use client";

import { useRouter } from "next/navigation";
import { FormRootError, FormTextField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { fieldLabelsClass, inputClass, primaryButtonClass } from "@/components/forms/styles";
import { useActionForm } from "@/hooks/use-action-form";
import { cn } from "@/lib/utils";
import { saveMiaSettingsAction } from "@backend/features/crwdforce/crwdforce.controller";
import { MIA_LANGUAGES, MIA_TONES, miaSettingsSchema } from "@backend/features/crwdforce/crwdforce.schema";
import type { MiaSettings } from "@backend/features/crwdforce/crwdforce.types";

const TONE_LABELS: Record<(typeof MIA_TONES)[number], string> = { warm: "Warm and friendly", formal: "Polite and formal" };
const textareaClass =
  "w-full rounded-2xl border border-[#D5DCE5] bg-white px-4 py-3 text-[15px] outline-none placeholder:text-[#8A97A8] focus-visible:border-[#1D5296] focus-visible:ring-3 focus-visible:ring-[#1D5296]/15";

function TextArea({ id, label, hint, error, rows, ...props }: React.ComponentProps<"textarea"> & { id: string; label: string; hint: string; error?: string }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-sm text-[#46566B]">{label}</span>
      <textarea id={id} rows={rows} aria-invalid={!!error || undefined} aria-describedby={`${id}-hint`} className={textareaClass} {...props} />
      <span id={`${id}-hint`} className={cn("text-xs", error ? "text-[#A1301F]" : "text-[#5E6B7E]")}>
        {error ?? hint}
      </span>
    </label>
  );
}

export function MiaSetupForm({ settings, canEdit }: { settings: MiaSettings; canEdit: boolean }) {
  const router = useRouter();
  const { form, onSubmit, isPending } = useActionForm({
    schema: miaSettingsSchema,
    defaultValues: settings,
    action: saveMiaSettingsAction,
    onSuccess: (saved) => {
      form.reset(saved);
      router.refresh();
    },
  });
  const { errors } = form.formState;

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Mia's setup" className="glass-card flex min-w-0 flex-col gap-5 rounded-[24px] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="fill-orange grid size-10 place-items-center rounded-full font-medium text-[#0E2A47]" aria-hidden>
          M
        </span>
        <div className="flex flex-col">
          <h2 className="text-xl font-normal">crwdForce · Mia&apos;s setup</h2>
          <p className="text-xs text-[#5E6B7E]">How Mia talks to patients. She uses your clinic profile, hours and price list as facts.</p>
        </div>
      </div>
      <FormRootError form={form} />

      <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-5">
        <div className={cn("grid gap-4 md:grid-cols-2", fieldLabelsClass)}>
          <FormTextField form={form} name="name" label="Her name" className={inputClass} />
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm text-[#46566B]">Tone</legend>
            <div className="flex flex-wrap gap-2">
              {MIA_TONES.map((t) => (
                <label key={t} className="flex h-12 items-center gap-2 rounded-full border border-[#D5DCE5] bg-white px-4 text-[15px] has-checked:border-[#1D5296] has-checked:bg-[#E4EEFB]">
                  <input type="radio" value={t} className="size-4 accent-[#1D5296]" {...form.register("tone")} />
                  {TONE_LABELS[t]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm text-[#46566B]">Languages she replies in</legend>
          <div className="flex flex-wrap gap-2">
            {MIA_LANGUAGES.map((l) => (
              <label key={l} className="flex h-10 items-center gap-2 rounded-full border border-[#D5DCE5] bg-white px-4 text-sm has-checked:border-[#1D5296] has-checked:bg-[#E4EEFB]">
                <input type="checkbox" value={l} className="size-4 accent-[#1D5296]" {...form.register("languages")} />
                {l}
              </label>
            ))}
          </div>
          <span className={cn("text-xs", errors.languages ? "text-[#A1301F]" : "text-[#5E6B7E]")}>{errors.languages?.message ?? "She answers in the patient's language when it's one of these."}</span>
        </fieldset>

        <TextArea id="mia-greeting" label="Opening greeting" rows={3} hint="Used when someone messages the clinic for the first time." error={errors.greeting?.message} {...form.register("greeting")} />
        <TextArea
          id="mia-knowledge"
          label="What Mia should know"
          rows={8}
          placeholder={"e.g. Braces consultation is free.\nParking is at the back of the building.\nWe accept Maxicare and Intellicare."}
          hint="Extra facts beyond the clinic profile and price list. Mia only says what's written here or in your settings."
          error={errors.knowledge?.message}
          {...form.register("knowledge")}
        />
        <TextArea
          id="mia-handover"
          label="Also hand over to the team when…"
          rows={3}
          placeholder="e.g. They ask for a specific dentist's personal number"
          hint="Mia always hands over emergencies, complaints, billing and HMO questions, and medical history."
          error={errors.handoverNotes?.message}
          {...form.register("handoverNotes")}
        />
      </fieldset>

      {canEdit ? (
        <div className="flex justify-end">
          <SubmitButton pending={isPending} className={primaryButtonClass}>
            Save Mia&apos;s setup
          </SubmitButton>
        </div>
      ) : (
        <p className="text-sm text-[#5E6B7E]">You can view Mia&apos;s setup. Ask the owner to change it.</p>
      )}
    </form>
  );
}
