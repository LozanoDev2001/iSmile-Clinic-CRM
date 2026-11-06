import Link from "next/link";
import { ShieldX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "./error-state";

/** 403 UI rendered inside the dashboard layout when a permission is missing. */
export function AccessDenied({
  description = "Your role does not include access to this area. If you need it, ask your clinic administrator.",
}: {
  description?: string;
}) {
  return (
    <ErrorState
      icon={ShieldX}
      title="Access denied"
      description={description}
      actions={
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          Back to dashboard
        </Link>
      }
    />
  );
}
