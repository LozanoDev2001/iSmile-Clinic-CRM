"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/styles";
import { CHANNEL_LABELS } from "@/features/patients/format";
import { createContactAction, updateContactAction } from "@backend/features/contacts/contacts.controller";
import type { ContactDetail, NewContactInput } from "@backend/features/contacts/contacts.types";
import { MESSAGE_CHANNELS } from "@backend/features/patients/patient.schema";

const label = "flex flex-col gap-1.5 text-sm text-[#46566B]";

type FormValues = Omit<NewContactInput, "contactType"> & { contactType: NewContactInput["contactType"] };

/** Edits a contact's details, or creates a partner / other contact when `contact` is null. */
export function ContactForm({ contact, canEdit }: { contact: ContactDetail | null; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<FormValues>({
    fullName: contact?.fullName ?? "",
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
    preferredChannel: (contact?.preferredChannel ?? "") as FormValues["preferredChannel"],
    address: contact?.address ?? "",
    contactType: "partner",
  });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<FormValues>) => setForm((f) => ({ ...f, ...patch }));

  const save = () => {
    setError("");
    startTransition(async () => {
      const { contactType, ...details } = form;
      const result = contact ? await updateContactAction(contact.id, details) : await createContactAction({ ...details, contactType });
      if (!result.success) {
        setError(Object.values(result.error.fields ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      toast.success(result.message ?? "Saved.");
      router.push(`/contacts?id=${result.data.id}`);
      router.refresh();
    });
  };

  return (
    <fieldset disabled={!canEdit || pending} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Name
          <input value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} className={selectClass} />
        </label>
        {contact ? null : (
          <label className={label}>
            Type
            <select value={form.contactType} onChange={(e) => set({ contactType: e.target.value as FormValues["contactType"] })} className={selectClass}>
              <option value="partner">Partner (HMO, lab, supplier)</option>
              <option value="other">Other</option>
            </select>
          </label>
        )}
        <label className={label}>
          Mobile
          <input value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} type="tel" className={selectClass} />
        </label>
        <label className={label}>
          Email
          <input value={form.email ?? ""} onChange={(e) => set({ email: e.target.value })} type="email" className={selectClass} />
        </label>
        <label className={label}>
          Preferred app
          <select value={form.preferredChannel ?? ""} onChange={(e) => set({ preferredChannel: e.target.value as FormValues["preferredChannel"] })} className={selectClass}>
            <option value="">Not known</option>
            {MESSAGE_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Address
          <input value={form.address ?? ""} onChange={(e) => set({ address: e.target.value })} className={selectClass} />
        </label>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl bg-[#FDECEA] px-3 py-2 text-sm text-[#A1301F]">
          {error}
        </p>
      ) : null}
      {canEdit ? (
        <button type="button" onClick={save} className="fill-orange h-11 self-start rounded-full px-6 text-sm font-medium text-[#0E2A47] disabled:opacity-60">
          {pending ? "Saving…" : contact ? "Save changes" : "Add contact"}
        </button>
      ) : null}
    </fieldset>
  );
}
