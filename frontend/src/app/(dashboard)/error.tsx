"use client";

import { RouteError } from "@/components/shared/route-error";

/** Errors inside a dashboard page keep the sidebar/layout visible. */
export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError error={error} retry={retry} />;
}
