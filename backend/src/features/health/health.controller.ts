import "server-only";

/** Health controller — GET /api/health for load balancers / uptime checks. */
import { NextResponse } from "next/server";
import { checkDatabase } from "./health.service";

export async function healthHandler() {
  const { database } = await checkDatabase();
  return NextResponse.json(
    { status: database ? "ok" : "unavailable" },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
