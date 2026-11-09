import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { z } from "zod";
import { AccessDenied } from "@/components/shared/access-denied";
import { Avatar } from "@/components/shared/avatar";
import { SearchBox } from "@/components/shared/search-box";
import { ContactForm } from "@/features/contacts/components/contact-form";
import { CHANNEL_LABELS, labelOf } from "@/features/patients/format";
import { STAGE_META } from "@/features/leads/format";
import { cn } from "@/lib/utils";
import { getContact, listContacts } from "@backend/features/contacts/contacts.service";
import type { ContactType } from "@backend/features/contacts/contacts.types";
import type { LeadStage } from "@backend/features/leads/leads.types";
import { can, pageCan } from "@backend/lib/authorization";
import { isAppError } from "@backend/lib/errors/app-error";

export const metadata: Metadata = { title: "Contacts" };

const TYPE_LABELS: Record<ContactType, string> = { patient: "Patient", lead: "Lead", guardian: "Guardian", partner: "Partner", other: "Other" };
const FILTERS: { id: ContactType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "patient", label: "Patients" },
  { id: "lead", label: "Leads" },
  { id: "guardian", label: "Guardians" },
  { id: "partner", label: "Partners" },
];

interface ContactsSearchParams {
  type?: string;
  q?: string;
  id?: string;
  new?: string;
}

export default async function ContactsPage({ searchParams }: { searchParams: Promise<ContactsSearchParams> }) {
  const { user, allowed } = await pageCan("contacts.read");
  if (!allowed) return <AccessDenied />;
  const params = await searchParams;
  const list = await listContacts(user, { type: params.type, search: params.q, page: 1 });
  const creating = params.new === "1" && can(user, "contacts.update") && list.types.includes("partner");
  const selectedId = creating ? undefined : z.uuid().safeParse(params.id).success ? params.id : list.items[0]?.id;
  const contact = selectedId ? await getContact(user, selectedId).catch((e) => (isAppError(e) && e.code === "NOT_FOUND" ? null : Promise.reject(e))) : null;
  const type = FILTERS.some((f) => f.id === params.type) ? params.type : "all";
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { type: type === "all" ? undefined : type, q: params.q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const qs = next.toString();
    return qs ? `/contacts?${qs}` : "/contacts";
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">Contacts</h1>
          <p className="text-[13px] text-[#5E6B7E]">Everyone who has contacted the clinic: patients, leads, guardians and partners</p>
        </div>
        {can(user, "contacts.update") && list.types.includes("partner") ? (
          <Link href={href({ new: "1" })} className="fill-orange inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-medium text-[#0E2A47] hover:brightness-105">
            <Plus className="size-4" aria-hidden />
            New contact
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:items-start">
        <section aria-label="Contact list" className="glass-card flex min-w-0 flex-col gap-3 rounded-[24px] p-4">
          <SearchBox id="contact-search" label="Search contacts" placeholder="Search name, mobile or email" />
          <nav aria-label="Filter contacts" className="flex flex-wrap gap-1.5">
            {FILTERS.filter((f) => f.id === "all" || list.types.includes(f.id)).map((f) => (
              <Link
                key={f.id}
                href={href({ type: f.id === "all" ? undefined : f.id })}
                aria-current={type === f.id ? "page" : undefined}
                className={cn("inline-flex h-[30px] items-center rounded-full border px-[11px] text-xs font-medium", type === f.id ? "border-[#0E2A47] bg-[#0E2A47] text-white" : "border-[#E3E7ED] bg-[#EEF1F5] text-[#46566B]")}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          <ul className="-mx-1 flex max-h-[70vh] flex-col gap-0.5 overflow-y-auto px-1">
            {list.items.map((c) => (
              <li key={c.id}>
                <Link
                  href={href({ id: c.id })}
                  aria-current={c.id === contact?.id ? "page" : undefined}
                  className={cn("flex items-center gap-3 rounded-[18px] border p-2.5", c.id === contact?.id ? "border-[#BCD3F2] bg-[#E4EEFB]" : "border-transparent hover:bg-[#F4F6F9]")}
                >
                  <Avatar name={c.fullName} letters={2} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px]">{c.fullName}</span>
                    <span className="truncate text-xs text-[#5E6B7E]">{[TYPE_LABELS[c.contactType], c.patientNo, c.phone].filter(Boolean).join(" · ")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {list.items.length === 0 ? <p className="py-6 text-center text-sm text-[#5E6B7E]">No contacts match.</p> : null}
          {list.total > list.items.length ? <p className="text-xs text-[#5E6B7E]">Showing {list.items.length} of {list.total}. Search to narrow it down.</p> : null}
        </section>

        {creating ? (
          <section aria-label="New contact" className="glass-card flex flex-col gap-4 rounded-[24px] p-5">
            <h2 className="text-xl">New contact</h2>
            <p className="text-xs text-[#5E6B7E]">For HMO coordinators, labs, suppliers and other partners. Patients are added in Patients, and enquiries in Leads.</p>
            <ContactForm contact={null} canEdit />
          </section>
        ) : contact ? (
          <section aria-label="Contact details" className="glass-card flex flex-col gap-4 rounded-[24px] p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name={contact.fullName} letters={2} className="size-12 text-base" />
              <div className="flex min-w-0 flex-1 flex-col">
                <h2 className="text-xl">{contact.fullName}</h2>
                <span className="text-sm text-[#5E6B7E]">
                  {TYPE_LABELS[contact.contactType]}
                  {contact.preferredChannel ? ` · prefers ${labelOf(CHANNEL_LABELS, contact.preferredChannel)}` : ""}
                </span>
              </div>
              {contact.patientId ? (
                <Link href={`/patients/${contact.patientId}`} className="h-10 rounded-full border border-[#D5DCE5] bg-white px-4 text-sm leading-10">
                  Patient file {contact.patientNo}
                </Link>
              ) : null}
            </div>

            <ContactForm key={contact.id} contact={contact} canEdit={can(user, "contacts.update")} />

            {contact.leads.length ? (
              <section aria-label="Leads" className="flex flex-col gap-1.5">
                <h3 className="text-sm text-[#46566B]">Leads</h3>
                {contact.leads.map((l) => {
                  const status = l.status === "open" ? (STAGE_META[l.stage as LeadStage]?.label ?? l.stage) : l.status === "won" ? "Won" : "Lost";
                  return can(user, "leads.read") ? (
                    <Link key={l.id} href={`/leads?lead=${l.id}`} className="text-sm text-[#1D5296] underline">
                      {status}
                    </Link>
                  ) : (
                    <span key={l.id} className="text-sm">
                      {status}
                    </span>
                  );
                })}
              </section>
            ) : null}
            {contact.guardianOf.length ? (
              <section aria-label="Guardian or emergency contact for" className="flex flex-col gap-1.5">
                <h3 className="text-sm text-[#46566B]">Guardian or emergency contact for</h3>
                {contact.guardianOf.map((g) => (
                  <Link key={g.patientId} href={`/patients/${g.patientId}`} className="text-sm text-[#1D5296] underline">
                    {g.name} · {g.patientNo}
                    {g.relationship ? ` (${g.relationship})` : ""}
                  </Link>
                ))}
              </section>
            ) : null}
          </section>
        ) : (
          <section className="glass-card rounded-[24px] p-10 text-center text-sm text-[#5E6B7E]">Pick a contact from the list.</section>
        )}
      </div>
    </div>
  );
}
