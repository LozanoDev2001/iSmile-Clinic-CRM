import type { z } from "zod";
import type { CONTACT_TYPES, contactInputSchema, newContactSchema } from "./contact.schema";

export type ContactType = (typeof CONTACT_TYPES)[number];
export type ContactInput = z.input<typeof contactInputSchema>;
export type NewContactInput = z.input<typeof newContactSchema>;

export interface ContactSummary {
  id: string;
  fullName: string;
  contactType: ContactType;
  phone: string | null;
  email: string | null;
  preferredChannel: string | null;
  patientNo: string | null;
  updatedAt: Date;
}

export interface ContactDetail extends ContactSummary {
  address: string | null;
  marketingOptIn: boolean;
  patientId: string | null;
  leads: { id: string; status: string; stage: string; createdAt: Date }[];
  guardianOf: { patientId: string; name: string; patientNo: string; relationship: string | null }[];
}

export interface ContactList {
  items: ContactSummary[];
  total: number;
  page: number;
  pageSize: number;
  /** Types this user may see, from their Contacts tabs. */
  types: ContactType[];
}
