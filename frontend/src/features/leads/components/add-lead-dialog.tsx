"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/styles";
import { CHANNEL_LABELS } from "@/features/patients/format";
import { createLeadAction } from "@backend/features/leads/leads.controller";
import type { CreateLeadInput, LeadOptions } from "@backend/features/leads/leads.types";
import { MESSAGE_CHANNELS } from "@backend/features/patients/patient.schema";
import { leadsHref, type LeadsState } from "../leads-state";

const label = "flex flex-col gap-1.5 text-sm text-[#46566B]";

/** For walk-ins, calls and messages that came in outside a connected channel. */
export function AddLeadDialog({ options, state }: { options: LeadOptions; state: LeadsState }) {
  const closeHref = leadsHref(state, { add: false });
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<CreateLeadInput>({ fullName: "", phone: "", email: "", preferredChannel: "", sourceId: "", interestedServiceId: "", message: "", hot: false, assigneeId: "" });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const save = () => {
    setError("");
    startTransition(async () => {
      const result = await createLeadAction(form);
      if (!result.success) {
        setError(Object.values(result.error.fields ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      toast.success(result.data.existingPatientNo ? `Lead added. They're already patient ${result.data.existingPatientNo}.` : "Lead added.");
      router.push(leadsHref(state, { add: false, lead: result.data.id }), { scroll: false });
    });
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label="Add a lead"
      onClose={() => router.push(closeHref, { scroll: false })}
      className="m-auto w-[min(600px,calc(100vw-32px))] rounded-[28px] bg-[#F7F9FC] p-0 text-[#0E2A47] shadow-2xl backdrop:bg-[#0E2A47]/40"
    >
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl">Add a lead</h2>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-white">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <p className="text-xs text-[#5E6B7E]">For walk-ins, phone calls and messages that didn&apos;t come in through a connected app.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Full name
            <input value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} placeholder="e.g. Andrea Santos" className={selectClass} />
          </label>
          <label className={label}>
            Mobile
            <input value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} type="tel" placeholder="+63" className={selectClass} />
          </label>
          <label className={label}>
            Email
            <input value={form.email ?? ""} onChange={(e) => set({ email: e.target.value })} type="email" placeholder="name@email.com" className={selectClass} />
          </label>
          <label className={label}>
            Preferred app
            <select value={form.preferredChannel ?? ""} onChange={(e) => set({ preferredChannel: e.target.value as CreateLeadInput["preferredChannel"] })} className={selectClass}>
              <option value="">Not known</option>
              {MESSAGE_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Came in from
            <select value={form.sourceId ?? ""} onChange={(e) => set({ sourceId: e.target.value })} className={selectClass}>
              <option value="">Not known</option>
              {options.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Interested in
            <select value={form.interestedServiceId ?? ""} onChange={(e) => set({ interestedServiceId: e.target.value })} className={selectClass}>
              <option value="">Not sure yet</option>
              {options.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Assign to
            <select value={form.assigneeId ?? ""} onChange={(e) => set({ assigneeId: e.target.value })} className={selectClass}>
              <option value="">Leave unassigned</option>
              {options.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-3 text-sm">
            <input type="checkbox" checked={form.hot} onChange={(e) => set({ hot: e.target.checked })} className="size-4 accent-[#B42318]" />
            Hot lead · call within the hour
          </label>
        </div>
        <label className={label}>
          What they said
          <textarea value={form.message ?? ""} onChange={(e) => set({ message: e.target.value })} rows={3} maxLength={2000} className="rounded-2xl border border-[#D5DCE5] bg-white px-4 py-3 text-[15px]" />
        </label>
        {error ? (
          <p role="alert" className="rounded-xl bg-[#FDECEA] px-3 py-2 text-sm text-[#A1301F]">
            {error}
          </p>
        ) : null}
        <button type="button" disabled={pending} onClick={save} className="fill-orange h-12 rounded-full text-[15px] font-medium text-[#0E2A47] disabled:opacity-60">
          {pending ? "Saving…" : "Add lead"}
        </button>
      </div>
    </dialog>
  );
}
