"use client";

import type { ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Disabled + spinner while pending, so a form cannot be submitted twice. */
export function SubmitButton({
  pending,
  pendingLabel,
  children,
  ...props
}: ComponentProps<typeof Button> & { pending: boolean; pendingLabel?: string }) {
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
