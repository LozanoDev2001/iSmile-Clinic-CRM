import { z } from "zod";

export const patientIdSchema = z.cuid("Invalid patient identifier");

export const listPatientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional().transform((v) => v || undefined),
  branchId: z.cuid().optional(),
});
