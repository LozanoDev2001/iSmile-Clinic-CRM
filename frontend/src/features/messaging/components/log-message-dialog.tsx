"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/styles";
import { CHANNEL_LABELS } from "@/features/patients/format";
import { logIncomingAction, simulateIncomingAction } from "@backend/features/messaging/messaging.controller";
import type { IncomingMessageInput } from "@backend/features/messaging/messaging.types";
import { MESSAGE_CHANNELS } from "@backend/features/patients/patient.schema";
import { messagingHref, type MessagingState } from "../messaging-state";

const label = "flex flex-col gap-1.5 text-sm text-[#46566B]";

/** Records a message that came in on the clinic's phone or apps. In development it can also simulate one. */
export function LogMessageDialog({ state, simulator }: { state: MessagingState; simulator: boolean }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<IncomingMessageInput>({ channel: "viber", name: "", phone: "", email: "", body: "" });
  const [simulate, setSimulate] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<IncomingMessageInput>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const save = () => {
    setError("");
    startTransition(async () => {
      const result = simulate ? await simulateIncomingAction(form) : await logIncomingAction(form);
      if (!result.success) {
        setError(Object.values(result.error.fields ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      toast.success(result.data.newLead ? "Message saved. A new lead was created for them." : (result.message ?? "Message saved."));
      router.push(messagingHref(state, { log: false, c: result.data.conversationId, status: "open" }));
    });
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label="Log a message"
      onClose={() => router.push(messagingHref(state, { log: false }))}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-[28px] bg-[#F7F9FC] p-0 text-[#0E2A47] shadow-2xl backdrop:bg-[#0E2A47]/40"
    >
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl">Log a message</h2>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-white">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <p className="text-xs text-[#5E6B7E]">For messages that came in on the clinic&apos;s phone or apps. Someone new becomes a contact and a lead.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            App
            <select value={form.channel} onChange={(e) => set({ channel: e.target.value as IncomingMessageInput["channel"] })} className={selectClass}>
              {MESSAGE_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Their name
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} className={selectClass} />
          </label>
          <label className={label}>
            Mobile
            <input value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} type="tel" placeholder="+63" className={selectClass} />
          </label>
          <label className={label}>
            Email
            <input value={form.email ?? ""} onChange={(e) => set({ email: e.target.value })} type="email" className={selectClass} />
          </label>
        </div>
        <label className={label}>
          What they wrote
          <textarea value={form.body} onChange={(e) => set({ body: e.target.value })} rows={3} maxLength={2000} className="rounded-2xl border border-[#D5DCE5] bg-white px-4 py-3 text-[15px]" />
        </label>
        {simulator ? (
          <label className="flex items-center gap-2 rounded-xl bg-[#FDE3BD] px-3 py-2 text-sm text-[#7A4300]">
            <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} className="size-4" />
            Development: simulate it arriving from the app
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-xl bg-[#FDECEA] px-3 py-2 text-sm text-[#A1301F]">
            {error}
          </p>
        ) : null}
        <button type="button" disabled={pending} onClick={save} className="fill-orange h-12 rounded-full text-[15px] font-medium text-[#0E2A47] disabled:opacity-60">
          {pending ? "Saving…" : "Save message"}
        </button>
      </div>
    </dialog>
  );
}
