import { z } from "zod";

export const REPORT_PERIODS = ["month", "quarter", "year"] as const;

export const overviewQuerySchema = z.object({ period: z.enum(REPORT_PERIODS).catch("month") });
export const monthQuerySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().catch(undefined) });
