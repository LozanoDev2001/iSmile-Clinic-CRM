"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { FormRootError, FormTextField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/hooks/use-action-form";
import { cn } from "@/lib/utils";
import { primaryButtonClass, fieldLabelsClass, inputClass, selectClass } from "@/components/forms/styles";
import { createPatientAction, updatePatientAction } from "@backend/features/patients/patients.controller";
import { CIVIL_STATUSES, MESSAGE_CHANNELS, SEXES, patientClinicalSchema, patientInputSchema } from "@backend/features/patients/patient.schema";
import type { PatientFile, PatientFormOptions } from "@backend/features/patients/patients.types";
import { CHANNEL_LABELS, CIVIL_STATUS_LABELS, SEX_LABELS } from "../format";

const formSchema = z.intersection(patientInputSchema, patientClinicalSchema.partial());
type FormValues = z.input<typeof formSchema>;

const textareaClass =
  "min-h-20 rounded-2xl border border-[#D5DCE5] bg-white px-4 py-3 text-[15px] outline-none placeholder:text-[#8A97A8] focus-visible:border-[#1D5296] focus-visible:ring-3 focus-visible:ring-[#1D5296]/15";

function valuesFrom(patient: PatientFile | null): FormValues {
  const v = (x: string | null | undefined) => x ?? "";
  return {
    fullName: v(patient?.fullName),
    dob: v(patient?.dob),
    sex: (patient?.sex ?? "") as FormValues["sex"],
    civilStatus: (patient?.civilStatus ?? "") as FormValues["civilStatus"],
    occupation: v(patient?.occupation),
    phone: v(patient?.phone),
    email: v(patient?.email),
    address: v(patient?.address),
    preferredChannel: (patient?.preferredChannel ?? "") as FormValues["preferredChannel"],
    primaryDentistId: v(patient?.primaryDentistId),
    payerId: v(patient?.payer?.id),
    hmoMemberNo: v(patient?.hmoMemberNo),
    scPwdId: v(patient?.scPwdId),
    emergencyName: v(patient?.emergencyContact?.name),
    emergencyRelationship: v(patient?.emergencyContact?.relationship),
    emergencyPhone: v(patient?.emergencyContact?.phone),
    allergies: v(patient?.clinical?.allergies),
    medicalConditions: v(patient?.clinical?.medicalConditions),
    medications: v(patient?.clinical?.medications),
  };
}

function SelectField<T extends FieldValues>({ form, name, label, children }: { form: UseFormReturn<T, unknown, unknown>; name: Path<T>; label: string; children: ReactNode }) {
  const error = form.formState.errors[name]?.message;
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm text-[#46566B]">
        {label}
      </label>
      <select id={id} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : undefined} className={selectClass} {...form.register(name)}>
        {children}
      </select>
      {error ? (
        <span id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {String(error)}
        </span>
      ) : null}
    </div>
  );
}

function TextAreaField<T extends FieldValues>({ form, name, label, placeholder }: { form: UseFormReturn<T, unknown, unknown>; name: Path<T>; label: string; placeholder?: string }) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-2 md:col-span-2">
      <label htmlFor={id} className="text-sm text-[#46566B]">
        {label}
      </label>
      <textarea id={id} rows={2} placeholder={placeholder} className={textareaClass} {...form.register(name)} />
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-3 flex flex-col gap-0.5">
        <span className="text-lg">{title}</span>
        {description ? <span className="text-xs text-[#5E6B7E]">{description}</span> : null}
      </legend>
      <div className={cn("grid gap-4 md:grid-cols-2", fieldLabelsClass)}>{children}</div>
    </fieldset>
  );
}

interface PatientFormProps {
  patient: PatientFile | null;
  options: PatientFormOptions;
  /** Scoped dentists always file patients under themselves. */
  lockDentist: boolean;
  canEditClinical: boolean;
}

export function PatientForm({ patient, options, lockDentist, canEditClinical }: PatientFormProps) {
  const router = useRouter();
  const { form, onSubmit, isPending } = useActionForm({
    schema: formSchema,
    defaultValues: valuesFrom(patient),
    action: (values) => (patient ? updatePatientAction(patient.id, values, canEditClinical) : createPatientAction(values, canEditClinical)),
    onSuccess: (data) => router.push(`/patients/${data.id}`),
  });
  const cancelHref = patient ? `/patients/${patient.id}` : "/patients";

  return (
    <form onSubmit={onSubmit} noValidate aria-label={patient ? `Edit ${patient.fullName}` : "New patient"} className="glass-card flex flex-col gap-8 rounded-[24px] p-5 sm:p-6">
      <FormRootError form={form} />

      <Section title="Basic information">
        <FormTextField form={form} name="fullName" label="Full name" placeholder="First, middle and last name" autoComplete="off" className={inputClass} />
        <FormTextField form={form} name="dob" label="Date of birth" type="date" className={inputClass} />
        <SelectField form={form} name="sex" label="Sex">
          <option value="">Not recorded</option>
          {SEXES.map((s) => (
            <option key={s} value={s}>
              {SEX_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <SelectField form={form} name="civilStatus" label="Civil status">
          <option value="">Not recorded</option>
          {CIVIL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CIVIL_STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <FormTextField form={form} name="occupation" label="Occupation or school" autoComplete="off" className={inputClass} />
        {lockDentist ? null : (
          <SelectField form={form} name="primaryDentistId" label="Attending dentist">
            <option value="">Not assigned</option>
            {options.dentists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
        )}
      </Section>

      <Section title="Contact details">
        <FormTextField form={form} name="phone" label="Mobile" type="tel" placeholder="+63" autoComplete="off" className={inputClass} />
        <FormTextField form={form} name="email" label="Email" type="email" placeholder="name@email.com" autoComplete="off" className={inputClass} />
        <SelectField form={form} name="preferredChannel" label="Preferred app for messages">
          <option value="">Not recorded</option>
          {MESSAGE_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </SelectField>
        <FormTextField form={form} name="address" label="Home address" placeholder="Street, barangay, city" autoComplete="off" className={inputClass} />
      </Section>

      <Section title="Coverage and emergency contact" description="For kids, add the parent or guardian as the emergency contact.">
        <SelectField form={form} name="payerId" label="Coverage">
          <option value="">Self-pay</option>
          {options.hmos.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </SelectField>
        <FormTextField form={form} name="hmoMemberNo" label="HMO member no." autoComplete="off" className={inputClass} />
        <FormTextField form={form} name="scPwdId" label="Senior citizen / PWD ID" autoComplete="off" className={inputClass} />
        <span className="hidden md:block" />
        <FormTextField form={form} name="emergencyName" label="Emergency contact or guardian" autoComplete="off" className={inputClass} />
        <FormTextField form={form} name="emergencyRelationship" label="Relationship" placeholder="e.g. Mother" autoComplete="off" className={inputClass} />
        <FormTextField form={form} name="emergencyPhone" label="Their mobile" type="tel" placeholder="+63" autoComplete="off" className={inputClass} />
      </Section>

      {canEditClinical ? (
        <Section title="Clinical" description="Only staff with access to medical records can see these.">
          <TextAreaField form={form} name="allergies" label="Allergies" placeholder="e.g. Penicillin, latex" />
          <TextAreaField form={form} name="medicalConditions" label="Medical conditions" placeholder="e.g. Hypertension, diabetes" />
          <TextAreaField form={form} name="medications" label="Maintenance medicines" />
        </Section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={isPending} pendingLabel="Saving…" className={primaryButtonClass}>
          {patient ? "Save changes" : "Add patient"}
        </SubmitButton>
        <Link href={cancelHref} className="inline-flex h-12 items-center rounded-full border border-[#D5DCE5] bg-white px-6 text-[15px]">
          Cancel
        </Link>
      </div>
    </form>
  );
}
