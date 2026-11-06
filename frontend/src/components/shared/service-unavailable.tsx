"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { DatabaseZap, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "./error-state";

/** Shown when the database cannot be reached. No technical details are exposed. */
export function ServiceUnavailable() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <main className="flex flex-1 items-center justify-center">
      <ErrorState
        icon={DatabaseZap}
        title="Service temporarily unavailable"
        description="We can't reach clinic records right now. Your data is safe — please try again in a minute."
        actions={
          <Button disabled={pending} onClick={() => startTransition(() => router.refresh())}>
            <RotateCw data-icon="inline-start" className={pending ? "animate-spin" : undefined} />
            Try again
          </Button>
        }
      />
    </main>
  );
}
