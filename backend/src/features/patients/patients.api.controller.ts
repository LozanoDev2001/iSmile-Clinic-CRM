import "server-only";

/**
 * Patients controller — HTTP entry layer, mounted by the thin route files in
 * src/app/api/patients. Authenticates, extracts request input, delegates to
 * the service (validation, permissions, scoping) and shapes the JSON
 * response. Errors are converted centrally by withApiHandler.
 */
import { ok, withApiHandler } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { getPatient, listPatients } from "./patients.service";

/** GET /api/patients?page=1&pageSize=25&search=smi — scoped to the caller's clinic/branches. */
export const listPatientsHandler = withApiHandler(async (request, { requestId }) => {
  const user = await requireAuth();
  const result = await listPatients(user, Object.fromEntries(request.nextUrl.searchParams));
  return ok(result, { requestId });
});

/** GET /api/patients/:id — medical fields included only with `patients.medical.read`. */
export const getPatientHandler = withApiHandler<{ id: string }>(async (_request, { params, requestId }) => {
  const user = await requireAuth();
  const { id } = await params;
  return ok(await getPatient(user, id), { requestId });
});
