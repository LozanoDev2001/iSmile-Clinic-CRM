import type { z } from "zod";
import type { TAX_TYPES, serviceInputSchema } from "./catalog.schema";

export type TaxType = (typeof TAX_TYPES)[number];
export type ServiceInput = z.input<typeof serviceInputSchema>;

/** Philippine VAT, added on the invoice to VAT-able items. */
export const VAT_RATE = 0.12;

export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  exempt: "Dental service",
  vat: "Medicine or product",
};

export interface CatalogService {
  id: string;
  code: string;
  name: string;
  /** Before VAT, in pesos. */
  price: number;
  taxType: TaxType;
  hmoCoverable: boolean;
}
