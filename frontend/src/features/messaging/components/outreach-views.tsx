"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/styles";
import { formatLeadDay, formatLeadTime } from "@/features/leads/format";
import { CHANNEL_LABELS, formatDate, labelOf } from "@/features/patients/format";
import { saveGreetingAction, saveSavedRepliesAction, sendBroadcastAction, sendGreetingAction } from "@backend/features/messaging/messaging.controller";
import { TEMPLATE_TOKENS } from "@backend/features/messaging/messaging.templates";
import type { AudiencePreview, BroadcastAudience, BroadcastSummary, Celebrant, GreetingSent, SavedReply } from "@backend/features/messaging/messaging.types";
import { DELIVERY_LABELS } from "../messaging-state";

const card = "glass-card flex min-w-0 flex-col gap-3 rounded-[24px] p-5";
const primary = "fill-orange h-11 self-start rounded-full px-5 text-sm font-medium text-[#0E2A47] disabled:opacity-50";
const textarea = "rounded-2xl border border-[#D5DCE5] bg-white px-4 py-3 text-[15px] outline-none focus-visible:border-[#1D5296] focus-visible:ring-3 focus-visible:ring-[#1D5296]/15";
const tokens = TEMPLATE_TOKENS.map((t) => `{${t}}`).join(", ");

type ActionLike = { success: boolean; message?: string; error?: { message: string; fields?: Record<string, string[]> } };

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionLike>, done?: (r: ActionLike) => string | undefined) =>
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(Object.values(result.error?.fields ?? {})[0]?.[0] ?? result.error?.message ?? "Something went wrong.");
        return;
      }
      const text = done?.(result) ?? result.message;
      if (text) toast.success(text);
      router.refresh();
    });
  return { pending, run };
}

const whenLabel = (daysAway: number) => (daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `In ${daysAway} days`);

export function BirthdaysView({ celebrants, sent, greeting, canSend }: { celebrants: Celebrant[]; sent: GreetingSent[]; greeting: string; canSend: boolean }) {
  const { pending, run } = useAction();
  const [text, setText] = useState(greeting);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
      <section aria-label="Birthday celebrants" className={card}>
        <h2 className="text-lg">Birthdays this week</h2>
        <ul className="flex flex-col divide-y divide-[#EDF0F4]">
          {celebrants.map((c) => (
            <li key={c.patientId} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <Link href={`/patients/${c.patientId}`} className="truncate text-[15px] hover:underline">
                  {c.name}
                </Link>
                <span className="text-xs text-[#5E6B7E]">
                  {whenLabel(c.daysAway)} · turns {c.turning} · {formatDate(c.dob)} · {c.channel ? labelOf(CHANNEL_LABELS, c.channel) : "no preferred app"}
                </span>
              </span>
              {c.greeted ? (
                <span className="rounded-full bg-[#E3F4EA] px-2.5 py-0.5 text-xs text-[#1F7A4D]">Greeted</span>
              ) : canSend ? (
                <button
                  type="button"
                  disabled={pending || !c.channel}
                  title={c.channel ? undefined : "Set their preferred app in the patient file first"}
                  onClick={() => run(() => sendGreetingAction(c.patientId))}
                  className="h-9 rounded-full border border-[#D5DCE5] bg-white px-3 text-sm disabled:opacity-50"
                >
                  Send greeting
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {celebrants.length === 0 ? <p className="text-sm text-[#5E6B7E]">No patient birthdays in the next 7 days.</p> : null}
      </section>
      <div className="flex flex-col gap-4">
        <section aria-label="Greeting message" className={card}>
          <h2 className="text-lg">Greeting message</h2>
          <label htmlFor="greeting-body" className="sr-only">
            Greeting message
          </label>
          <textarea id="greeting-body" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} disabled={!canSend} className={textarea} />
          <p className="text-xs text-[#5E6B7E]">Fill-ins: {tokens}</p>
          {canSend ? (
            <button type="button" disabled={pending || text === greeting} onClick={() => run(() => saveGreetingAction(text))} className={primary}>
              Save greeting
            </button>
          ) : null}
        </section>
        <section aria-label="Greetings sent" className={card}>
          <h2 className="text-lg">Greetings sent this year · {sent.length}</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {sent.map((g) => (
              <li key={g.messageId} className="flex justify-between gap-2">
                <span className="truncate">{g.name}</span>
                <span className="shrink-0 text-xs text-[#5E6B7E]">
                  {formatLeadDay(g.sentAt)} · {labelOf(CHANNEL_LABELS, g.channel)} · {DELIVERY_LABELS[g.deliveryStatus ?? ""] ?? g.deliveryStatus}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  all: "All patients",
  kids: "Kids (12 and under)",
  seniors: "Seniors and PWD",
  birthdays_month: "Birthdays this month",
  recall: "No visit in 6+ months (recall)",
};

export function BroadcastsView({ audiences, broadcasts, canSend }: { audiences: AudiencePreview[]; broadcasts: BroadcastSummary[]; canSend: boolean }) {
  const { pending, run } = useAction();
  const [form, setForm] = useState({ title: "", body: "", audience: "all" as BroadcastAudience });
  const [confirming, setConfirming] = useState(false);
  const preview = audiences.find((a) => a.audience === form.audience);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
      {canSend ? (
        <section aria-label="New broadcast" className={card}>
          <h2 className="text-lg">New broadcast</h2>
          <p className="text-xs text-[#5E6B7E]">
            Goes only to patients who agreed to receive clinic news and have a preferred app. Each person gets it in their own conversation.
          </p>
          <label className="flex flex-col gap-1.5 text-sm text-[#46566B]">
            Title (for the team)
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. December cleaning promo" className={selectClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[#46566B]">
            Who gets it
            <select value={form.audience} onChange={(e) => (setForm({ ...form, audience: e.target.value as BroadcastAudience }), setConfirming(false))} className={selectClass}>
              {audiences.map((a) => (
                <option key={a.audience} value={a.audience}>
                  {AUDIENCE_LABELS[a.audience]} · {a.reachable} of {a.patients} can receive it
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[#46566B]">
            Message
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} maxLength={2000} className={textarea} />
            <span className="text-xs text-[#5E6B7E]">Fill-ins: {tokens}</span>
          </label>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#FDE3BD] p-3 text-sm text-[#5A3500]">
              <span className="flex-1">Send to {preview?.reachable ?? 0} patients now? This can&apos;t be undone.</span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => sendBroadcastAction(form),
                    (r) => `Broadcast sent to ${(r as ActionLike & { data?: { recipients: number } }).data?.recipients ?? 0} patients.`,
                  )
                }
                className="h-9 rounded-full bg-[#0E2A47] px-4 text-white disabled:opacity-50"
              >
                Send now
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="h-9 rounded-full border border-[#D5DCE5] bg-white px-4">
                Not yet
              </button>
            </div>
          ) : (
            <button type="button" disabled={!form.title.trim() || !form.body.trim() || !preview?.reachable} onClick={() => setConfirming(true)} className={primary}>
              Review and send
            </button>
          )}
        </section>
      ) : null}
      <section aria-label="Past broadcasts" className={card}>
        <h2 className="text-lg">Past broadcasts</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {broadcasts.map((b) => (
            <li key={b.id} className="flex flex-col">
              <span>{b.title}</span>
              <span className="text-xs text-[#5E6B7E]">
                {formatLeadTime(b.createdAt)} · {AUDIENCE_LABELS[b.audience]} · {b.recipientCount} sent{b.createdBy ? ` · ${b.createdBy}` : ""}
              </span>
            </li>
          ))}
        </ul>
        {broadcasts.length === 0 ? <p className="text-sm text-[#5E6B7E]">No broadcasts yet.</p> : null}
      </section>
    </div>
  );
}

export function SavedRepliesEditor({ replies, canEdit }: { replies: SavedReply[]; canEdit: boolean }) {
  const { pending, run } = useAction();
  const [list, setList] = useState(replies);
  const update = (i: number, patch: Partial<SavedReply>) => setList((l) => l.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <section aria-label="Saved replies" className={card}>
      <h2 className="text-lg">Saved replies</h2>
      <p className="text-xs text-[#5E6B7E]">Quick answers for the reply box. Fill-ins: {tokens}</p>
      <fieldset disabled={!canEdit || pending} className="flex flex-col gap-3">
        {list.map((r, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-2xl bg-[#F4F6F9]/80 p-3">
            <div className="flex items-center gap-2">
              <input aria-label={`Title of reply ${i + 1}`} value={r.title} onChange={(e) => update(i, { title: e.target.value })} className={`${selectClass} h-10 flex-1`} />
              {canEdit ? (
                <button type="button" aria-label={`Remove ${r.title || "reply"}`} onClick={() => setList((l) => l.filter((_, k) => k !== i))} className="grid size-9 place-items-center rounded-full hover:bg-white">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <textarea aria-label={`Text of reply ${i + 1}`} value={r.body} onChange={(e) => update(i, { body: e.target.value })} rows={2} maxLength={2000} className={textarea} />
          </div>
        ))}
      </fieldset>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setList((l) => [...l, { title: "", body: "" }])} className="inline-flex h-11 items-center gap-2 rounded-full border border-[#D5DCE5] bg-white px-4 text-sm">
            <Plus className="size-4" aria-hidden />
            Add a reply
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => saveSavedRepliesAction(list))} className={primary}>
            Save replies
          </button>
        </div>
      ) : null}
    </section>
  );
}
