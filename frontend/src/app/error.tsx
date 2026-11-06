"use client";

import { RouteError } from "@/components/shared/route-error";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center">
      <RouteError error={error} retry={retry} />
    </main>
  );
}
