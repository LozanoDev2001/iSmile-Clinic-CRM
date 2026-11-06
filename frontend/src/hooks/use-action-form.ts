"use client";

import { useRef, type BaseSyntheticEvent } from "react";
import { unstable_rethrow } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type DefaultValues, type FieldValues, type Path, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import type { ActionResult } from "@backend/lib/api/response";

interface UseActionFormOptions<TSchema extends z.ZodType<FieldValues, FieldValues>, TData> {
  schema: TSchema;
  defaultValues: DefaultValues<z.input<TSchema>>;
  /** A Server Action returning ActionResult. Redirects thrown by it navigate away. */
  action: (values: z.output<TSchema>) => Promise<ActionResult<TData> | undefined | void>;
  onSuccess?: (data: TData) => void;
  /** Toast the server's success message (default true). */
  toastOnSuccess?: boolean;
  resetOnSuccess?: boolean;
}

/**
 * Standard form behaviour for the whole app:
 *  - client-side Zod validation (the server validates again),
 *  - submit disabled while pending + guard against double submission,
 *  - server field errors mapped onto inputs, other errors shown as toasts.
 */
export function useActionForm<TSchema extends z.ZodType<FieldValues, FieldValues>, TData = undefined>({
  schema,
  defaultValues,
  action,
  onSuccess,
  toastOnSuccess = true,
  resetOnSuccess = false,
}: UseActionFormOptions<TSchema, TData>) {
  const form = useForm<z.input<TSchema>, unknown, z.output<TSchema>>({
    // zodResolver cannot infer generic schema types; the cast restores them.
    resolver: zodResolver(schema) as unknown as Resolver<z.input<TSchema>, unknown, z.output<TSchema>>,
    defaultValues,
    mode: "onTouched",
  });
  const inFlight = useRef(false);

  const submitValues = async (values: z.output<TSchema>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await action(values);
      if (!result) return; // redirected

      if (result.success) {
        if (toastOnSuccess && result.message) toast.success(result.message);
        if (resetOnSuccess) form.reset();
        onSuccess?.(result.data);
        return;
      }

      const { fields, message } = result.error;
      let mapped = false;
      for (const [name, messages] of Object.entries(fields ?? {})) {
        if (name in (form.getValues() as object) && messages[0]) {
          form.setError(name as Path<z.input<TSchema>>, { type: "server", message: messages[0] });
          mapped = true;
        }
      }
      if (!mapped) form.setError("root", { type: "server", message });
      toast.error(message);
    } catch (error) {
      // A redirect() thrown by the action (e.g. after sign-in) is navigation, not a failure.
      unstable_rethrow(error);
      // Network failure / server crash before a result was produced.
      const message = "We could not reach the server. Check your connection and try again.";
      form.setError("root", { type: "network", message });
      toast.error(message);
    } finally {
      inFlight.current = false;
    }
  };

  const onSubmit = (event?: BaseSyntheticEvent) => form.handleSubmit(submitValues)(event);

  return { form, onSubmit, isPending: form.formState.isSubmitting };
}
