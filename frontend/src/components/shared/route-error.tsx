"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState } from "./error-state";

/**
 * Body of every error.tsx boundary. In production Next.js replaces server
 * error messages with a generic one plus a `digest`; we never render the
 * message, only the digest as a support reference.
 */
export function RouteError({ error, retry, homeHref = "/dashboard" }: { error: unknown; retry: () => void; homeHref?: string }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;

  useEffect(() => {
    // Browser console only; full details are in the server log under the same digest.
    console.error("Route error", digest ?? error);
  }, [error, digest]);

  return (
    <ErrorState
      title="We couldn't load this page"
      description="This is usually temporary — for example a brief connection problem. Please try again. If it keeps happening, contact support with the reference below."
      reference={digest}
      actions={
        <>
          <Button onClick={() => retry()}>
            <RotateCw data-icon="inline-start" />
            Try again
          </Button>
          <Link href={homeHref} className={buttonVariants({ variant: "outline" })}>
            Go to dashboard
          </Link>
        </>
      }
    />
  );
}
