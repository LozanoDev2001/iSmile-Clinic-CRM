"use client";

import type { ComponentProps, ReactNode } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface FormTextFieldProps<T extends FieldValues> extends Omit<ComponentProps<typeof Input>, "form" | "name"> {
  form: UseFormReturn<T, unknown, unknown>;
  name: Path<T>;
  label: string;
  description?: ReactNode;
  labelAction?: ReactNode;
  /** Rendered inside the input on the right, e.g. a show-password toggle. */
  endAdornment?: ReactNode;
}

/** Labelled input wired to React Hook Form with accessible error output. */
export function FormTextField<T extends FieldValues>({
  form,
  name,
  label,
  description,
  labelAction,
  endAdornment,
  ...inputProps
}: FormTextFieldProps<T>) {
  const error = form.formState.errors[name];
  const id = `field-${String(name)}`;
  const errorId = `${id}-error`;
  const input = (
    <Input
      id={id}
      aria-invalid={!!error || undefined}
      aria-describedby={error ? errorId : undefined}
      {...inputProps}
      className={endAdornment ? `${inputProps.className ?? ""} pr-12` : inputProps.className}
      {...form.register(name)}
    />
  );
  return (
    <Field data-invalid={!!error || undefined}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {labelAction}
      </div>
      {endAdornment ? (
        <div className="relative">
          {input}
          <div className="absolute inset-y-0 right-1.5 flex items-center">{endAdornment}</div>
        </div>
      ) : (
        input
      )}
      {description && !error ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError id={errorId} errors={error ? [{ message: String(error.message ?? "") }] : undefined} />
    </Field>
  );
}

/** Form-level (non-field) error, e.g. "Invalid email or password". */
export function FormRootError<T extends FieldValues>({ form }: { form: UseFormReturn<T, unknown, unknown> }) {
  const message = form.formState.errors.root?.message;
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}
