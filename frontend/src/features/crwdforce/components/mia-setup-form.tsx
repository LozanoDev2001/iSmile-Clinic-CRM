"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormRootError, FormTextField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { fieldLabelsClass, inputClass } from "@/components/forms/styles";
import { useActionForm } from "@/hooks/use-action-form";
import { cn } from "@/lib/utils";
import { saveMiaSettingsAction } from "@backend/features/crwdforce/crwdforce.controller";
import {
  MIA_LANGUAGES,
  MIA_TONES,
  miaSettingsSchema,
} from "@backend/features/crwdforce/crwdforce.schema";
import type {
  MiaSetup,
  MiaSource,
} from "@backend/features/crwdforce/crwdforce.types";

const TONE_LABELS: Record<(typeof MIA_TONES)[number], string> = {
  friendly: "Friendly",
  warm: "Warm",
  formal: "Formal",
};
const card = "glass-card flex min-w-0 flex-col gap-4 rounded-[24px] p-5";
const textareaClass =
  "w-full rounded-[20px] border border-[#D5DCE5] bg-white px-4 py-3 text-[15px] outline-none placeholder:text-[#8A97A8] focus-visible:border-[#1D5296] focus-visible:ring-3 focus-visible:ring-[#1D5296]/15";
const soon = (
  <span className="rounded-full bg-[#EEF1F5] px-2 py-0.5 text-[11px] font-normal text-[#5E6B7E]">
    Soon
  </span>
);

const SOURCE_CLASSES: Record<MiaSource["status"], string> = {
  ok: "bg-[#DDF3E4] text-[#1E5B33]",
  live: "bg-[#DCEAFB] text-[#1D5296]",
  needs: "bg-[#FDE3BD] text-[#7A4300]",
  soon: "bg-[#EEF1F5] text-[#5E6B7E]",
};

const CHANNELS = [
  ["Website chat", "Chat bubble on the clinic website"],
  ["Facebook Messenger", "Replies to page messages"],
  ["WhatsApp", "Bookings and reminders"],
  ["Viber", "Chats from the clinic's Viber"],
  ["Phone line", "Answers calls on the clinic number"],
  ["SMS", "Two-way text replies"],
] as const;

const VOICES = [
  ["Warm", "Friendly female voice, Filipino-English accent"],
  ["Bright", "Upbeat, clear neutral English"],
  ["Calm", "Soft and reassuring, great for nervous patients"],
] as const;

const HANDOVER_RULES = [
  {
    level: "Instantly",
    text: "Emergencies: swelling, bleeding that won't stop, trauma, fever with tooth pain",
    tone: "bg-[#FDECEA]",
    tag: "text-[#A1301F]",
  },
  {
    level: "Priority",
    text: "Billing disputes, refunds, HMO approvals, complaints, or a patient asking for a person",
    tone: "bg-[#FFF1DA]",
    tag: "text-[#7A4300]",
  },
  {
    level: "Review",
    text: "Medical history, medicines and treatment advice. Mia never diagnoses.",
    tone: "bg-[#E4EEFB]",
    tag: "text-[#1D5296]",
  },
];

function TextArea({
  id,
  label,
  error,
  ...props
}: React.ComponentProps<"textarea"> & {
  id: string;
  label: string;
  error?: string;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-sm text-[#46566B]">{label}</span>
      <textarea
        id={id}
        aria-invalid={!!error || undefined}
        className={textareaClass}
        {...props}
      />
      {error ? <span className="text-xs text-[#A1301F]">{error}</span> : null}
    </label>
  );
}

function hoursSummary(hours: MiaSetup["hours"]) {
  const open = hours.filter((h) => !h.closed);
  return open.length
    ? open.map((h) => `${h.day} ${h.open}–${h.close}`).join(" · ")
    : "No open days set yet";
}

/** The whole "Mia's setup" page; the header's Save button submits the form. */
export function MiaSetupForm({
  setup,
  canEdit,
}: {
  setup: MiaSetup;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending } = useActionForm({
    schema: miaSettingsSchema,
    defaultValues: setup.settings,
    action: saveMiaSettingsAction,
    onSuccess: (saved) => {
      form.reset(saved);
      router.refresh();
    },
  });
  const { errors } = form.formState;
  const tone = form.watch("tone");
  const toneIndex = Math.max(0, MIA_TONES.indexOf(tone));

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label="Mia's setup"
      className="flex flex-col gap-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            href="/crwdforce"
            className="text-[13px] font-medium text-[#1D5296]"
          >
            ← crwdForce Console
          </Link>
          <h1 className="text-[28px] leading-tight font-light tracking-[-0.01em] sm:text-[34px]">
            {form.watch("name") || "Mia"}&apos;s setup
          </h1>
          <p className="text-[13px] text-[#5E6B7E]">
            How your crwdForce agent sounds, what she knows, and when she hands
            over to your team.
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="h-11 rounded-full border border-[#D5DCE5] bg-white px-4 text-[13px] font-medium opacity-60"
        >
          Test Mia
        </button>
        {canEdit ? (
          <SubmitButton
            pending={isPending}
            className="fill-orange h-11 rounded-full px-5 text-[13px] font-semibold text-[#0E2A47] hover:brightness-105"
          >
            Save changes
          </SubmitButton>
        ) : null}
      </div>
      <FormRootError form={form} />
      {canEdit ? null : (
        <p className="rounded-2xl bg-[#EEF1F5] px-4 py-2.5 text-sm text-[#46566B]">
          You can view Mia&apos;s setup. Ask the owner to change it.
        </p>
      )}

      <fieldset
        disabled={!canEdit}
        className="grid min-w-0 gap-4 xl:grid-cols-2 xl:items-start"
      >
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="persona-heading" className={card}>
            <h2 id="persona-heading" className="text-base font-semibold">
              Persona
            </h2>
            <div className={cn("flex items-end gap-4", fieldLabelsClass)}>
              <span
                className="fill-orange mb-0.5 grid size-16 shrink-0 place-items-center rounded-full text-[28px] text-[#0E2A47]"
                aria-hidden
              >
                {(form.watch("name") || "M")[0]?.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <FormTextField
                  form={form}
                  name="name"
                  label="Name patients see"
                  className={inputClass}
                />
              </div>
            </div>
            <div className={fieldLabelsClass}>
              <FormTextField
                form={form}
                name="role"
                label="Role"
                placeholder="e.g. Virtual front desk"
                className={inputClass}
              />
            </div>
            <TextArea
              id="mia-greeting"
              label="Opening greeting"
              rows={3}
              error={errors.greeting?.message}
              {...form.register("greeting")}
            />
            <div className="flex flex-col gap-2">
              <label htmlFor="mia-tone" className="text-sm text-[#46566B]">
                Tone
              </label>
              <input
                id="mia-tone"
                type="range"
                min={0}
                max={MIA_TONES.length - 1}
                step={1}
                value={toneIndex}
                aria-valuetext={TONE_LABELS[MIA_TONES[toneIndex]]}
                onChange={(e) =>
                  form.setValue("tone", MIA_TONES[Number(e.target.value)], {
                    shouldDirty: true,
                  })
                }
                className="w-full accent-[#0E2A47]"
              />
              <div className="grid grid-cols-3 text-xs text-[#5E6B7E]">
                {MIA_TONES.map((t, i) => (
                  <span
                    key={t}
                    className={cn(
                      i === 1 && "text-center",
                      i === 2 && "text-right",
                      t === tone && "font-medium text-[#0E2A47]",
                    )}
                  >
                    {TONE_LABELS[t]}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section aria-labelledby="voice-heading" className={card}>
            <h2
              id="voice-heading"
              className="flex items-center gap-2 text-base font-semibold"
            >
              Voice for phone calls {soon}
            </h2>
            {VOICES.map(([name, desc], i) => (
              <div
                key={name}
                aria-disabled="true"
                className={cn(
                  "flex items-center gap-3 rounded-[20px] border px-4 py-3 opacity-60",
                  i === 0
                    ? "border-[#0E2A47] bg-[#E4EEFB]"
                    : "border-[#E3E7ED] bg-white",
                )}
              >
                <span
                  className={cn(
                    "size-4 rounded-full border-2",
                    i === 0
                      ? "border-[#0E2A47] bg-[#0E2A47] ring-2 ring-white ring-inset"
                      : "border-[#8A97A8]",
                  )}
                  aria-hidden
                />
                <span className="flex flex-col">
                  <span className="text-[15px]">{name}</span>
                  <span className="text-xs text-[#5E6B7E]">{desc}</span>
                </span>
              </div>
            ))}
            <p className="text-xs text-[#5E6B7E]">
              Mia will answer calls once the clinic phone line is connected.
            </p>
          </section>

          <section aria-labelledby="knows-heading" className={card}>
            <h2 id="knows-heading" className="text-base font-semibold">
              What Mia knows
            </h2>
            <ul className="flex flex-col divide-y divide-[#EDF0F4]">
              {setup.sources.map((s) => (
                <li key={s.title} className="flex items-center gap-3 py-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px]">{s.title}</span>
                    <span className="text-xs text-[#5E6B7E]">{s.detail}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
                      SOURCE_CLASSES[s.status],
                    )}
                  >
                    {s.statusLabel}
                  </span>
                </li>
              ))}
            </ul>
            <TextArea
              id="mia-knowledge"
              label="Clinic notes"
              rows={6}
              placeholder={
                "e.g. Braces consultation is free.\nParking is at the back of the building.\nWe accept Maxicare and Intellicare."
              }
              error={errors.knowledge?.message}
              {...form.register("knowledge")}
            />
            <p className="-mt-2 text-xs text-[#5E6B7E]">
              Mia only says what&apos;s written here or in your settings. Prices
              come from Services &amp; prices.
            </p>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="channels-heading" className={card}>
            <h2
              id="channels-heading"
              className="flex items-center gap-2 text-base font-semibold"
            >
              Channels {soon}
            </h2>
            <ul className="flex flex-col divide-y divide-[#EDF0F4]">
              {CHANNELS.map(([name, desc]) => (
                <li key={name} className="flex items-center gap-3 py-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px]">{name}</span>
                    <span className="text-xs text-[#5E6B7E]">{desc}</span>
                  </span>
                  <span
                    role="switch"
                    aria-checked="false"
                    aria-disabled="true"
                    aria-label={`${name}, not connected yet`}
                    className="flex h-7 w-12 items-center rounded-full bg-[#D5DCE5] p-1 opacity-60"
                  >
                    <span className="size-5 rounded-full bg-white" />
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-[#5E6B7E]">
              No chat apps are connected yet. Until then Mia drafts replies for
              chats logged in Messaging, and your team sends them.
            </p>
          </section>

          <section aria-labelledby="languages-heading" className={card}>
            <h2 id="languages-heading" className="text-base font-semibold">
              Languages
            </h2>
            <div className="flex flex-wrap gap-2">
              {MIA_LANGUAGES.map((l) => (
                <label
                  key={l}
                  className="flex h-11 cursor-pointer items-center rounded-full border border-[#D5DCE5] bg-white px-4 text-sm font-medium focus-within:ring-3 focus-within:ring-[#1D5296]/25 has-checked:border-[#0E2A47] has-checked:bg-[#0E2A47] has-checked:text-white"
                >
                  <input
                    type="checkbox"
                    value={l}
                    className="sr-only"
                    {...form.register("languages")}
                  />
                  {l}
                </label>
              ))}
            </div>
            <p
              className={cn(
                "text-xs",
                errors.languages ? "text-[#A1301F]" : "text-[#5E6B7E]",
              )}
            >
              {errors.languages?.message ??
                "Mia replies in the language the patient uses, when it's one of these."}
            </p>
          </section>

          <section aria-labelledby="handover-heading" className={card}>
            <h2 id="handover-heading" className="text-base font-semibold">
              When Mia hands over to your team
            </h2>
            <ul className="flex flex-col gap-2">
              {HANDOVER_RULES.map((r) => (
                <li
                  key={r.level}
                  className={cn(
                    "flex items-center gap-3 rounded-[18px] px-4 py-3 text-sm",
                    r.tone,
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold",
                      r.tag,
                    )}
                  >
                    {r.level}
                  </span>
                  {r.text}
                </li>
              ))}
            </ul>
            <TextArea
              id="mia-handover"
              label="Also hand over when…"
              rows={2}
              placeholder="e.g. They ask for a specific dentist's personal number"
              error={errors.handoverNotes?.message}
              {...form.register("handoverNotes")}
            />
            <p className="-mt-2 text-xs text-[#5E6B7E]">
              Hand-overs show as &ldquo;Needs a person&rdquo; in the crwdForce
              console.
            </p>
          </section>

          <section
            aria-labelledby="hours-heading"
            className="card-navy flex flex-col gap-2 rounded-[24px] p-5 text-white"
          >
            <h2 id="hours-heading" className="text-base font-semibold">
              Working hours
            </h2>
            <p className="text-sm text-white/85">
              Mia drafts a reply whenever your team asks, day or night. She only
              offers open slots inside clinic hours: {hoursSummary(setup.hours)}
              .
            </p>
            <Link
              href="/settings/clinic"
              className="text-sm text-[#F9BC5E] underline"
            >
              Change clinic hours
            </Link>
          </section>
        </div>
      </fieldset>
    </form>
  );
}
