import type { z } from "zod";
import type { SERVICE_KINDS, serviceInputSchema } from "./catalog.schema";

export type ServiceKind = (typeof SERVICE_KINDS)[number];
export type ServiceInput = z.input<typeof serviceInputSchema>;

export const SERVICE_KIND_LABELS: Record<ServiceKind, string> = {
  service: "Dental service",
  product: "Medicine or product",
};

export interface CatalogService {
  id: string;
  code: string;
  name: string;
  /** Before VAT, in pesos. */
  price: number;
  kind: ServiceKind;
  hmoCoverable: boolean;
}
