import "server-only";
import { assertPermission, recordScope, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma } from "@backend/lib/prisma";
import { contactIdSchema, contactInputSchema, listContactsQuerySchema, newContactSchema } from "./contact.schema";
import { CONTACTS_PAGE_SIZE, contactsRepository } from "./contacts.repository";
import type { ContactDetail, ContactInput, ContactList, ContactType, NewContactInput } from "./contacts.types";

/** Contacts tabs (Team & roles) decide which kinds of contact a user sees. */
const TAB_TYPES: Record<string, ContactType[]> = { patients: ["patient"], leads: ["lead"], guardians: ["guardian"], partners: ["partner", "other"] };

export function visibleContactTypes(user: AuthUser): ContactType[] {
  return user.access.contacts.tabs.flatMap((tab) => TAB_TYPES[tab] ?? []);
}

export async function listContacts(user: AuthUser, rawQuery: unknown): Promise<ContactList> {
  assertPermission(user, "contacts.read");
  const query = listContactsQuerySchema.parse(rawQuery);
  const types = visibleContactTypes(user);
  const wanted = query.type === "all" ? types : types.filter((t) => t === query.type);
  const { items, total } = await contactsRepository.list(recordScope(user), wanted, query);
  return { items, total, page: query.page, pageSize: CONTACTS_PAGE_SIZE, types };
}

export async function getContact(user: AuthUser, rawId: unknown): Promise<ContactDetail> {
  assertPermission(user, "contacts.read");
  const contact = await contactsRepository.findDetail(recordScope(user), contactIdSchema.parse(rawId));
  if (!contact || !visibleContactTypes(user).includes(contact.contactType)) throw Errors.notFound("contact");
  return contact;
}

export async function updateContact(user: AuthUser, rawId: unknown, input: ContactInput): Promise<void> {
  assertPermission(user, "contacts.update");
  const id = contactIdSchema.parse(rawId);
  const data = contactInputSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const contact = await contactsRepository.findDetail(recordScope(user), id, tx);
    if (!contact || !visibleContactTypes(user).includes(contact.contactType)) throw Errors.notFound("contact");
    await contactsRepository.update(id, data, tx);
    await audit({ action: AUDIT_ACTIONS.CONTACT_UPDATED, resourceType: "contact", resourceId: id, actorId: user.id, clinicId: user.clinicId }, tx);
  });
}

export async function createContact(user: AuthUser, input: NewContactInput): Promise<{ id: string }> {
  assertPermission(user, "contacts.update");
  const data = newContactSchema.parse(input);
  if (!visibleContactTypes(user).includes(data.contactType)) throw Errors.forbidden();
  return prisma.$transaction(async (tx) => {
    const created = await contactsRepository.create(user.clinicId, data, tx);
    await audit({ action: AUDIT_ACTIONS.CONTACT_CREATED, resourceType: "contact", resourceId: created.id, actorId: user.id, clinicId: user.clinicId }, tx);
    return created;
  });
}
