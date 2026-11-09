import Link from "next/link";
import { Avatar } from "@/components/shared/avatar";
import { SearchBox } from "@/components/shared/search-box";
import { cn } from "@/lib/utils";
import { formatLeadTime } from "@/features/leads/format";
import { CHANNEL_LABELS, labelOf } from "@/features/patients/format";
import type { ConversationDetail, ConversationSummary, SavedReply } from "@backend/features/messaging/messaging.types";
import { MESSAGE_CHANNELS } from "@backend/features/patients/patient.schema";
import type { NamedRef } from "@backend/features/patients/patients.types";
import { DELIVERY_LABELS, messagingHref, type MessagingState } from "../messaging-state";
import { Composer, type MiaAssist } from "./composer";
import { AssignSelect, MarkSentButton, StatusButton } from "./conversation-actions";

const KIND_LABELS: Record<string, string> = { birthday: "Birthday greeting", broadcast: "Broadcast" };
const chip = (on: boolean) => cn("inline-flex h-[30px] items-center rounded-full border px-[11px] text-xs font-medium", on ? "border-[#0E2A47] bg-[#0E2A47] text-white" : "border-[#E3E7ED] bg-[#EEF1F5] text-[#46566B]");
const channelLabel = (c: string) => labelOf(CHANNEL_LABELS, c) ?? c;

function ConversationList({ state, conversations }: { state: MessagingState; conversations: ConversationSummary[] }) {
  return (
    <section aria-label="Conversations" className="glass-card flex min-w-0 flex-col gap-3 rounded-[24px] p-4">
      <SearchBox id="conversation-search" label="Search conversations" placeholder="Search name or mobile" />
      <nav aria-label="Platforms" className="flex flex-wrap gap-1.5">
        {["all", ...MESSAGE_CHANNELS].map((c) => (
          <Link key={c} href={messagingHref(state, { channel: c, c: undefined })} aria-current={state.channel === c ? "page" : undefined} className={chip(state.channel === c)}>
            {c === "all" ? "All apps" : channelLabel(c)}
          </Link>
        ))}
      </nav>
      <nav aria-label="Conversation status" className="flex flex-wrap gap-1.5">
        {(
          [
            ["open", "Open"],
            ["done", "Done"],
            ["all", "All"],
          ] as const
        ).map(([s, l]) => (
          <Link key={s} href={messagingHref(state, { status: s, c: undefined })} aria-current={state.status === s ? "page" : undefined} className={chip(state.status === s)}>
            {l}
          </Link>
        ))}
        <Link href={messagingHref(state, { who: state.who === "me" ? "all" : "me", c: undefined })} aria-current={state.who === "me" ? "page" : undefined} className={chip(state.who === "me")}>
          Mine
        </Link>
      </nav>
      <ul className="-mx-1 flex max-h-[65vh] flex-col gap-0.5 overflow-y-auto px-1">
        {conversations.map((c) => (
          <li key={c.id}>
            <Link
              href={messagingHref(state, { c: c.id })}
              aria-current={c.id === state.c ? "page" : undefined}
              className={cn("flex items-start gap-3 rounded-[18px] border p-2.5", c.id === state.c ? "border-[#BCD3F2] bg-[#E4EEFB]" : "border-transparent hover:bg-[#F4F6F9]")}
            >
              <Avatar name={c.contact.name} letters={2} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className={cn("truncate text-[15px]", c.needsReply && "font-semibold")}>{c.contact.name}</span>
                  {c.needsReply ? <span className="size-2 shrink-0 rounded-full bg-[#F39A1E]" aria-label="Waiting for a reply" /> : null}
                </span>
                <span className="truncate text-xs text-[#5E6B7E]">
                  {channelLabel(c.channel)} · {c.lastMessage ? `${c.lastMessage.direction === "out" ? "You: " : ""}${c.lastMessage.body ?? ""}` : "No messages"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {conversations.length === 0 ? <p className="py-6 text-center text-sm text-[#5E6B7E]">No conversations here.</p> : null}
    </section>
  );
}

function Thread({ conversation: c, savedReplies, canSend, mia }: { conversation: ConversationDetail; savedReplies: SavedReply[]; canSend: boolean; mia: MiaAssist | null }) {
  return (
    <section aria-label={`Conversation with ${c.contact.name}`} className="glass-card flex min-w-0 flex-col gap-3 rounded-[24px] p-4">
      <div className="flex items-center gap-3 border-b border-[#E3E7ED] pb-3">
        <Avatar name={c.contact.name} letters={2} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lg">{c.contact.name}</span>
          <span className="text-xs text-[#5E6B7E]">
            {channelLabel(c.channel)} · {c.status === "open" ? "Open" : "Done"}
          </span>
        </span>
        {canSend ? <StatusButton conversationId={c.id} status={c.status} /> : null}
      </div>
      <ol className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto pr-1">
        {c.messages.map((m) => (
          <li key={m.id} className={cn("flex max-w-[80%] flex-col gap-0.5", m.direction === "out" ? "self-end items-end" : "self-start")}>
            {KIND_LABELS[m.kind] ? <span className="text-[11px] text-[#5E6B7E]">{KIND_LABELS[m.kind]}</span> : null}
            <span className={cn("rounded-2xl px-3.5 py-2 text-sm whitespace-pre-line", m.direction === "out" ? "bg-[#1D5296] text-white" : "bg-white text-[#0E2A47] shadow-sm")}>{m.body}</span>
            <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-[#5E6B7E]">
              {formatLeadTime(m.sentAt)}
              {m.direction === "out" && m.senderName ? ` · ${m.senderName}` : ""}
              {m.direction === "out" && m.deliveryStatus ? (
                <span className={m.deliveryStatus === "not_sent" ? "font-medium text-[#A55A00]" : undefined}>· {DELIVERY_LABELS[m.deliveryStatus] ?? m.deliveryStatus}</span>
              ) : null}
              {m.direction === "out" && m.deliveryStatus === "not_sent" && canSend ? <MarkSentButton messageId={m.id} /> : null}
            </span>
          </li>
        ))}
      </ol>
      {canSend ? <Composer conversationId={c.id} savedReplies={savedReplies} fill={c.fill} channelLabel={channelLabel(c.channel)} mia={mia} /> : null}
    </section>
  );
}

function ContextPanel({ conversation: c, staff, canSend }: { conversation: ConversationDetail; staff: NamedRef[]; canSend: boolean }) {
  return (
    <aside aria-label="About this person" className="glass-card flex min-w-0 flex-col gap-3 rounded-[24px] p-4 text-sm">
      <h2 className="text-base font-medium">About {c.contact.name.split(" ")[0]}</h2>
      <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-2 gap-y-1.5">
        <dt className="text-[#5E6B7E]">Type</dt>
        <dd className="capitalize">{c.contact.contactType}</dd>
        <dt className="text-[#5E6B7E]">Mobile</dt>
        <dd>{c.contactPhone ?? "—"}</dd>
        <dt className="text-[#5E6B7E]">Email</dt>
        <dd className="truncate">{c.contactEmail ?? "—"}</dd>
        {c.fill.next_appointment ? (
          <>
            <dt className="text-[#5E6B7E]">Next visit</dt>
            <dd>{c.fill.next_appointment}</dd>
          </>
        ) : null}
      </dl>
      <div className="flex flex-col gap-1.5">
        {c.patient ? (
          <Link href={`/patients/${c.patient.id}`} className="text-[#1D5296] underline">
            Patient file {c.patient.patientNo}
          </Link>
        ) : null}
        {c.openLead ? (
          <Link href={`/leads?lead=${c.openLead.id}`} className="text-[#1D5296] underline">
            Open lead
          </Link>
        ) : null}
        {c.patient ? (
          <Link href={`/calendar?form=new&patient=${c.patient.id}`} className="text-[#1D5296] underline">
            Book a visit
          </Link>
        ) : null}
        <Link href={`/contacts?id=${c.contact.id}`} className="text-[#1D5296] underline">
          Contact details
        </Link>
      </div>
      {canSend ? <AssignSelect conversationId={c.id} assigneeId={c.assignee?.id ?? null} staff={staff} /> : <p>Handled by {c.assignee?.name ?? "no one yet"}</p>}
    </aside>
  );
}

interface InboxViewProps {
  state: MessagingState;
  conversations: ConversationSummary[];
  conversation: ConversationDetail | null;
  savedReplies: SavedReply[];
  staff: NamedRef[];
  canSend: boolean;
  mia: MiaAssist | null;
}

export function InboxView({ state, conversations, conversation, savedReplies, staff, canSend, mia }: InboxViewProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_260px] xl:items-start">
      <ConversationList state={state} conversations={conversations} />
      {conversation ? (
        <>
          <Thread conversation={conversation} savedReplies={savedReplies} canSend={canSend} mia={mia} />
          <ContextPanel conversation={conversation} staff={staff} canSend={canSend} />
        </>
      ) : (
        <section className="glass-card rounded-[24px] p-10 text-center text-sm text-[#5E6B7E] xl:col-span-2">Pick a conversation to read it and reply.</section>
      )}
    </div>
  );
}
