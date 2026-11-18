import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  CircleCheck,
  File,
  FilePlus,
  Filter,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CLINIC_TIME_ZONE } from "@/config/clinic";
import { STAGE_META, formatLeadTime } from "@/features/leads/format";
import { Composer } from "@/features/messaging/components/composer";
import { TakeOverButton } from "@/features/messaging/components/conversation-actions";
import { CHANNEL_LABELS, labelOf } from "@/features/patients/format";
import type { MiaDraft } from "@backend/features/crwdforce/crwdforce.types";
import type { LeadStage } from "@backend/features/leads/leads.types";
import type {
  ConversationDetail,
  SavedReply,
} from "@backend/features/messaging/messaging.types";
import {
  type ConsoleFilter,
  type ConsoleTab,
  INTENT_LABELS,
  NEXT_STEP_LABELS,
  consoleHref,
  initials,
  messagedRecently,
  priorityOf,
} from "../format";
import { MarkDoneButton } from "./mark-done-button";

interface WorkspaceProps {
  conversation: ConversationDetail;
  draft: MiaDraft | null;
  connected: boolean;
  savedReplies: SavedReply[];
  canSend: boolean;
  userId: string;
  filter: ConsoleFilter;
  tab: ConsoleTab;
}

const dayMonth = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
  timeZone: CLINIC_TIME_ZONE,
});
const visitTime = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: CLINIC_TIME_ZONE,
});
const peso = (n: number) =>
  `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
const channelOf = (c: ConversationDetail) =>
  labelOf(CHANNEL_LABELS, c.channel) ?? c.channel;
const TAB_LABELS: Record<ConsoleTab, string> = {
  conversation: "Conversation",
  summary: "Summary",
  details: "Details",
  history: "History",
};
const whiteCard = "flex flex-col gap-3 rounded-[26px] bg-white p-5";

function ActionButton({
  href,
  icon: Icon,
  label,
}: {
  href: string | null;
  icon: typeof Phone;
  label: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "fill-orange grid size-12 place-items-center rounded-full text-[#0E2A47]",
          !href && "opacity-40 shadow-none",
        )}
      >
        <Icon className="size-[19px]" aria-hidden />
      </span>
      <span className="text-xs whitespace-nowrap">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className="flex w-16 flex-col items-center gap-1.5">
      {body}
    </Link>
  ) : (
    <span
      aria-disabled="true"
      className="flex w-16 flex-col items-center gap-1.5 text-[#5E6B7E]"
    >
      {body}
    </span>
  );
}

function Header({ conversation: c, draft, canSend, userId }: WorkspaceProps) {
  const who = c.patient
    ? `Patient · ${c.patient.patientNo}`
    : c.openLead
      ? `Lead · ${STAGE_META[c.openLead.stage as LeadStage]?.label ?? c.openLead.stage}`
      : "New contact";
  const last = c.visits.last
    ? `Last visit ${dayMonth.format(c.visits.last.startsAt)}`
    : c.patient
      ? "No visits yet"
      : "Not a patient yet";
  const priority = priorityOf({ needsReply: c.needsReply, draft });
  const recent = messagedRecently(c.lastMessageAt);
  const handler = c.assignee
    ? {
        initial: initials(c.assignee.name),
        label: "Handled by",
        name: c.assignee.name,
      }
    : draft
      ? { initial: "M", label: "Drafted by", name: "Mia · AI" }
      : null;
  return (
    <section
      aria-label={c.contact.name}
      className="flex flex-wrap items-center gap-6 px-1.5 pt-1"
    >
      <span className="relative grid size-[112px] shrink-0 place-items-center rounded-full border-[5px] border-white bg-[#DCEAFB] text-[38px] font-light sm:size-32 sm:text-[42px]">
        {initials(c.contact.name)}
        {recent ? (
          <span
            title="Messaged in the last hour"
            className="absolute right-2 bottom-2 size-[18px] rounded-full border-[3px] border-white bg-[#2E9E63]"
          />
        ) : null}
      </span>
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3">
        <h2 className="truncate text-[34px] leading-[1.05] font-light tracking-[-0.01em] sm:text-[42px]">
          {c.contact.name}
        </h2>
        <dl className="grid gap-x-6 gap-y-1.5 text-sm text-[#46566B] sm:grid-cols-2">
          <dt className="sr-only">Who</dt>
          <dd>{who}</dd>
          <dt className="sr-only">Mobile</dt>
          <dd className="tabular-nums">
            {c.contactPhone ?? "No mobile on file"}
          </dd>
          <dt className="sr-only">Source</dt>
          <dd>
            Source: {channelOf(c)} · {last}
          </dd>
          <dt className="sr-only">Email</dt>
          <dd className="truncate">{c.contactEmail ?? "No email on file"}</dd>
        </dl>
      </div>
      <div className="ml-auto flex flex-col items-end gap-2.5">
        <span className="flex h-[52px] items-center gap-2.5 rounded-full bg-white pr-3.5 pl-1.5">
          <span
            className={cn(
              "grid size-10 place-items-center rounded-full text-[17px] font-medium",
              handler && c.assignee
                ? "bg-[#DCEAFB] text-[#1D5296]"
                : "fill-orange text-[#0E2A47]",
            )}
          >
            {handler?.initial ?? "M"}
          </span>
          <span className="flex flex-col leading-[1.15]">
            <span className="text-[11px] text-[#5E6B7E]">
              {handler?.label ?? "Handled by"}
            </span>
            <span className="text-[15px] font-medium">
              {handler?.name ?? "No one yet"}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap justify-end gap-1.5">
          <span
            className={cn(
              "inline-flex h-[34px] items-center rounded-full px-[18px] text-sm",
              priority === "High"
                ? "bg-[#F8C9C1] text-[#8A2414]"
                : priority === "Mid"
                  ? "bg-[#A9C8F0]"
                  : "bg-[#CDEBD8] text-[#1E5B33]",
            )}
          >
            {priority}
          </span>
          {draft ? (
            <span className="inline-flex h-[34px] items-center rounded-full bg-[#FDE3BD] px-[18px] text-sm">
              {INTENT_LABELS[draft.intent]}
            </span>
          ) : null}
          {canSend && c.assignee?.id !== userId ? (
            <TakeOverButton conversationId={c.id} userId={userId} />
          ) : null}
        </span>
      </div>
    </section>
  );
}

function Tabs({ conversation: c, filter, tab }: WorkspaceProps) {
  const tabClass = (on: boolean) =>
    cn(
      "inline-flex items-center rounded-t-[24px] px-6 text-[15px] whitespace-nowrap",
      on
        ? "h-16 bg-[#F4F6F9] text-[#0E2A47]"
        : "h-12 text-[#46566B] hover:text-[#0E2A47]",
    );
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-2.5 px-1.5">
      <nav aria-label="Quick actions" className="flex gap-2 pb-2">
        <ActionButton
          href={c.contactPhone ? `tel:${c.contactPhone}` : null}
          icon={Phone}
          label="Call"
        />
        <ActionButton
          href={`/messaging?c=${c.id}`}
          icon={MessageSquare}
          label="Message"
        />
        <ActionButton
          href={c.contactEmail ? `mailto:${c.contactEmail}` : null}
          icon={Mail}
          label="Email"
        />
        <ActionButton
          href={c.patient ? `/calendar?form=new&patient=${c.patient.id}` : null}
          icon={CalendarDays}
          label="Book"
        />
        <ActionButton
          href={c.patient ? `/patients/${c.patient.id}` : null}
          icon={FilePlus}
          label="Patient file"
        />
      </nav>
      <nav
        aria-label="Conversation views"
        className="flex flex-wrap items-end gap-1"
      >
        {(["conversation", "summary", "details"] as const).map((t) => (
          <Link
            key={t}
            href={consoleHref(filter, c.id, t)}
            aria-current={tab === t ? "page" : undefined}
            className={tabClass(tab === t)}
          >
            {t === "conversation"
              ? `Conversation · #${c.id.slice(0, 6).toUpperCase()}`
              : TAB_LABELS[t]}
          </Link>
        ))}
        <span
          aria-disabled="true"
          title="Patient files aren't built yet"
          className={cn(tabClass(false), "cursor-not-allowed opacity-50")}
        >
          Files
        </span>
        <Link
          href={consoleHref(filter, c.id, "history")}
          aria-current={tab === "history" ? "page" : undefined}
          className={tabClass(tab === "history")}
        >
          History
        </Link>
      </nav>
    </div>
  );
}

interface TimelineEntry {
  key: string;
  at: Date;
  icon: typeof Phone;
  dot: string;
  title: string;
  sub: string;
  who: { initial: string; name: string; orange?: boolean } | null;
  stage: { label: string; className: string };
}

function timelineOf(
  c: ConversationDetail,
  draft: MiaDraft | null,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const { last, next } = c.visits;
  if (last) {
    entries.push({
      key: "last",
      at: last.startsAt,
      icon: CalendarDays,
      dot: "bg-[#DCEAFB] text-[#1D5296]",
      title: `Last visit: ${last.service ?? "check-up"}`,
      sub: [last.dentist, c.patient && `Patient ${c.patient.patientNo}`]
        .filter(Boolean)
        .join(" · "),
      who: last.dentist
        ? {
            initial: initials(last.dentist.replace(/^Dr\.?\s*/i, "")),
            name: last.dentist,
          }
        : null,
      stage: { label: "Patient", className: "bg-[#E4EEFB] text-[#1D5296]" },
    });
  }
  if (draft) {
    entries.push({
      key: "draft",
      at: draft.createdAt,
      icon: MessageSquare,
      dot: "bg-[#F7B556] text-[#0E2A47]",
      title: draft.summary,
      sub: `${NEXT_STEP_LABELS[draft.nextStep]}${draft.slotLabel ? ` · ${draft.slotLabel}` : ""}`,
      who: { initial: "M", name: "Mia", orange: true },
      stage: draft.handover
        ? { label: "Needs a person", className: "bg-[#FDECEA] text-[#A1301F]" }
        : { label: "Draft", className: "bg-[#FDE3BD] text-[#7A4300]" },
    });
  }
  if (next) {
    entries.push({
      key: "next",
      at: next.startsAt,
      icon: CalendarDays,
      dot: "bg-[#FDE3BD] text-[#7A4300]",
      title: `Next visit: ${next.service ?? "appointment"}`,
      sub: visitTime.format(next.startsAt),
      who: next.dentist
        ? {
            initial: initials(next.dentist.replace(/^Dr\.?\s*/i, "")),
            name: next.dentist,
          }
        : null,
      stage: { label: "Booked", className: "bg-[#FDE3BD] text-[#7A4300]" },
    });
  }
  return entries;
}

function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol aria-label="Timeline" className="flex flex-col gap-3.5">
      {entries.map((e) => (
        <li key={e.key} className="flex items-stretch gap-3.5">
          <span className="flex w-[58px] shrink-0 flex-col items-center gap-1.5">
            <span
              className={cn(
                "grid size-[46px] place-items-center rounded-full",
                e.dot,
              )}
            >
              <e.icon className="size-[17px]" aria-hidden />
            </span>
            <span className="text-center text-xs text-[#5E6B7E]">
              {dayMonth.format(e.at)}
            </span>
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 rounded-[22px] bg-white px-[18px] py-4">
            <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
              <span className="text-base">{e.title}</span>
              {e.sub ? (
                <span className="text-[13px] text-[#5E6B7E]">{e.sub}</span>
              ) : null}
            </span>
            <span className="ml-auto flex flex-col items-end gap-1.5">
              {e.who ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-[#46566B]">
                  <span
                    className={cn(
                      "grid size-[22px] place-items-center rounded-full text-[10px] font-medium",
                      e.who.orange
                        ? "fill-orange text-[#0E2A47]"
                        : "bg-[#DCEAFB] text-[#0E2A47]",
                    )}
                  >
                    {e.who.initial}
                  </span>
                  {e.who.name}
                </span>
              ) : null}
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs",
                  e.stage.className,
                )}
              >
                {e.stage.label}
              </span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ChatCard({
  conversation: c,
  draft,
  connected,
  savedReplies,
  canSend,
}: WorkspaceProps) {
  const icon =
    "grid size-10 place-items-center rounded-full text-[#46566B] hover:bg-[#F4F6F9]";
  const recent = messagedRecently(c.lastMessageAt);
  return (
    <section
      aria-label={`Chat on ${channelOf(c)}`}
      className="flex flex-col overflow-hidden rounded-[26px] bg-white"
    >
      <div className="flex items-center gap-1 px-3.5 pt-3">
        {c.contactPhone ? (
          <Link
            href={`tel:${c.contactPhone}`}
            aria-label="Call"
            className={icon}
          >
            <Phone className="size-[18px]" aria-hidden />
          </Link>
        ) : null}
        {c.contactEmail ? (
          <Link
            href={`mailto:${c.contactEmail}`}
            aria-label="Email"
            className={icon}
          >
            <Mail className="size-[18px]" aria-hidden />
          </Link>
        ) : null}
        <span
          aria-current="true"
          className="grid h-10 w-[46px] place-items-center rounded-t-2xl bg-[#F4F6F9] text-[#0E2A47]"
        >
          <MessageSquare className="size-[18px]" aria-label="Chat" />
        </span>
        <Link href="#next-step" aria-label="Next step" className={icon}>
          <CircleCheck className="size-[18px]" aria-hidden />
        </Link>
        {c.patient ? (
          <Link
            href={`/calendar?form=new&patient=${c.patient.id}`}
            aria-label="Book"
            className={icon}
          >
            <CalendarDays className="size-[18px]" aria-hidden />
          </Link>
        ) : null}
        <span className="flex-1" />
        <Link
          href={`/messaging?c=${c.id}`}
          aria-label="Open in Messaging"
          className={icon}
        >
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </div>
      <div className="mx-3.5 flex flex-col gap-3 rounded-[0_22px_22px_22px] bg-[#F4F6F9] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-[#DCEAFB] text-[13px] font-medium">
            {initials(c.contact.name)}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-medium">{c.contact.name}</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#46566B]">
              <span
                className={cn(
                  "size-[7px] rounded-full",
                  recent ? "bg-[#2E9E63]" : "bg-[#9AA6B5]",
                )}
              />
              {recent ? "Active recently" : "Away"} · {channelOf(c)}
            </span>
          </span>
        </div>
        <ol
          aria-label="Messages"
          className="flex max-h-[380px] flex-col gap-2.5 overflow-y-auto px-0.5 py-1"
        >
          {c.messages.map((m) =>
            m.direction === "in" ? (
              <li
                key={m.id}
                className="flex max-w-[74%] flex-col gap-1 self-start"
              >
                <span className="rounded-[22px_22px_22px_6px] bg-[#0E2A47] px-[15px] py-[11px] text-sm leading-normal whitespace-pre-line text-white">
                  {m.body}
                </span>
                <span className="text-[11px] text-[#5E6B7E]">
                  {c.contact.name.split(" ")[0]} · {formatLeadTime(m.sentAt)}
                </span>
              </li>
            ) : (
              <li
                key={m.id}
                className="flex max-w-[74%] flex-col items-end gap-1 self-end"
              >
                <span className="rounded-[22px_22px_6px_22px] bg-white px-[15px] py-[11px] text-sm leading-normal whitespace-pre-line">
                  {m.body}
                </span>
                <span className="text-[11px] text-[#5E6B7E]">
                  {m.senderName ?? "Clinic"} · {formatLeadTime(m.sentAt)}
                </span>
              </li>
            ),
          )}
        </ol>
      </div>
      <div className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5">
        <p
          className={cn(
            "flex items-center gap-2 text-xs",
            connected ? "text-[#A55A00]" : "text-[#5E6B7E]",
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              connected ? "bg-[#F39A1E]" : "bg-[#9AA6B5]",
            )}
          />
          {connected
            ? "You're replying for the clinic. Mia drafts suggestions; you send every reply."
            : "Mia isn't connected yet. You're replying yourself."}
        </p>
        {canSend ? (
          <Composer
            conversationId={c.id}
            savedReplies={savedReplies}
            fill={c.fill}
            channelLabel={channelOf(c)}
            mia={{ connected, draft }}
          />
        ) : null}
      </div>
    </section>
  );
}

function SummaryTab({ conversation: c, draft }: WorkspaceProps) {
  const did = draft
    ? [
        `Read the last ${Math.min(c.messages.length, 30)} messages`,
        "Suggested a reply for your team to send",
        ...(draft.slotLabel ? [`Offered ${draft.slotLabel}`] : []),
        ...(draft.handover
          ? [
              `Flagged for a person: ${draft.handoverReason ?? "needs the team"}`,
            ]
          : []),
      ]
    : [];
  return (
    <>
      <section className={whiteCard}>
        <h3 className="text-xl font-normal">Mia&apos;s summary</h3>
        <p className="max-w-[68ch] text-[15px] leading-relaxed text-[#2A3B52]">
          {draft
            ? draft.summary
            : "Mia hasn't read this chat yet. Ask her for a draft in the Conversation tab."}
        </p>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {draft ? (
            <span className="rounded-full bg-[#E4EEFB] px-3 py-1.5">
              {INTENT_LABELS[draft.intent]}
            </span>
          ) : null}
          <span className="rounded-full bg-[#EEF1F5] px-3 py-1.5 text-[#46566B]">
            {channelOf(c)}
          </span>
        </div>
      </section>
      <section className={whiteCard}>
        <h3 className="text-xl font-normal">What Mia did</h3>
        {did.length ? (
          <ul className="flex flex-col gap-2">
            {did.map((a) => (
              <li
                key={a}
                className="flex items-center gap-2.5 rounded-2xl bg-[#F4F6F9] px-3 py-2.5 text-sm"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#DCEAFB]">
                  ✓
                </span>
                {a}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#5E6B7E]">Nothing yet.</p>
        )}
      </section>
    </>
  );
}

function DetailsTab({ conversation: c }: WorkspaceProps) {
  const rows: [string, string][] = [
    ["Name", c.contact.name],
    [
      "Type",
      c.patient
        ? `Patient ${c.patient.patientNo}`
        : c.openLead
          ? "Lead"
          : "Contact",
    ],
    ["Mobile", c.contactPhone ?? "—"],
    ["Email", c.contactEmail ?? "—"],
    ["Messages on", channelOf(c)],
    ["Conversation", c.status === "open" ? "Open" : "Done"],
    ["Handled by", c.assignee?.name ?? "No one yet"],
    ...(c.openLead
      ? ([
          [
            "Lead stage",
            STAGE_META[c.openLead.stage as LeadStage]?.label ??
              c.openLead.stage,
          ],
        ] as [string, string][])
      : []),
    ...(c.openLead?.interest
      ? ([
          [
            "Interested in",
            `${c.openLead.interest.name} · ${peso(c.openLead.interest.price)}`,
          ],
        ] as [string, string][])
      : []),
    ...(c.visits.next
      ? ([["Next visit", visitTime.format(c.visits.next.startsAt)]] as [
          string,
          string,
        ][])
      : []),
  ];
  return (
    <section className={whiteCard}>
      <h3 className="text-xl font-normal">Details</h3>
      <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[#5E6B7E]">{k}</dt>
            <dd className="truncate">{v}</dd>
          </div>
        ))}
      </dl>
      <Link
        href={`/contacts?id=${c.contact.id}`}
        className="text-sm text-[#1D5296] underline"
      >
        Edit contact details
      </Link>
    </section>
  );
}

function HistoryTab({ conversation: c }: WorkspaceProps) {
  return (
    <section className={whiteCard}>
      <h3 className="text-xl font-normal">History</h3>
      <ol className="flex flex-col">
        {[...c.messages].reverse().map((m) => (
          <li
            key={m.id}
            className="flex gap-3.5 border-b border-[#EDF0F4] py-2.5 text-sm last:border-0"
          >
            <span className="w-[110px] shrink-0 text-[#5E6B7E] tabular-nums">
              {formatLeadTime(m.sentAt)}
            </span>
            <span className="w-20 shrink-0 truncate text-[#2F64A8]">
              {m.direction === "in"
                ? c.contact.name.split(" ")[0]
                : (m.senderName ?? "Clinic")}
            </span>
            <span className="min-w-0 flex-1 leading-normal">{m.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function InterestCard({ conversation: c, draft }: WorkspaceProps) {
  const interest = c.openLead?.interest ?? null;
  const stage =
    c.visits.last && !c.visits.next
      ? 2
      : c.visits.next || c.openLead?.stage === "consult_booked"
        ? 1
        : 0;
  const checks: { ok: boolean; text: string }[] = [
    {
      ok: true,
      text: c.patient
        ? `Existing patient ${c.patient.patientNo}`
        : "New enquiry",
    },
    { ok: true, text: `Prefers ${channelOf(c)}` },
    ...(draft?.handover
      ? [{ ok: false, text: draft.handoverReason ?? "Needs a person" }]
      : []),
  ];
  const link = c.patient
    ? `/patients/${c.patient.id}`
    : c.openLead
      ? `/leads?lead=${c.openLead.id}`
      : null;
  return (
    <section
      aria-label="Interested in"
      className="flex flex-col gap-3.5 rounded-[26px] bg-[#A9C8F0] p-[18px]"
    >
      <div className="flex items-start gap-2.5">
        <h3 className="flex-1 text-[22px] leading-[1.2] font-normal">
          {interest
            ? `Interested in ${interest.name.toLowerCase()}`
            : draft
              ? draft.summary
              : "No request yet"}
        </h3>
        {link ? (
          <Link
            href={link}
            aria-label={c.patient ? "Open patient file" : "Open lead"}
            className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/40"
          >
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      <ol
        aria-label="Stage"
        className="flex items-center gap-0.5 rounded-full bg-[#C9DCF6] p-1"
      >
        {["Inquiry", "Booked", "Visit"].map((s, i) => (
          <li
            key={s}
            aria-current={i === stage ? "step" : undefined}
            className={cn(
              "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-sm",
              i === stage && "bg-white",
            )}
          >
            <span
              className={cn(
                "grid size-[18px] place-items-center rounded-full border-[1.5px] text-[10px]",
                i < stage
                  ? "border-[#0E2A47] bg-[#0E2A47] text-white"
                  : "border-[#0E2A47]",
              )}
              aria-hidden
            >
              {i < stage ? "✓" : ""}
            </span>
            {s}
          </li>
        ))}
      </ol>
      {interest ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] text-[#24466B]">Potential value</span>
          <span className="text-[32px] font-light tabular-nums">
            {peso(interest.price)}
          </span>
        </div>
      ) : null}
      <ul className="flex flex-col gap-2">
        {checks.map((k) => (
          <li key={k.text} className="flex items-center gap-2 text-[13px]">
            <span
              className={cn(
                "grid size-[26px] shrink-0 place-items-center rounded-full border text-xs",
                k.ok ? "border-white/70 bg-white/45" : "border-[#0E2A47]/40",
              )}
              aria-hidden
            >
              {k.ok ? "✓" : "×"}
            </span>
            {k.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NextStepCard({ conversation: c, draft, canSend }: WorkspaceProps) {
  const booking =
    !!draft &&
    (draft.nextStep === "book" || draft.nextStep === "reschedule") &&
    !!c.patient;
  const nextText = draft
    ? draft.slotLabel
      ? `Mia offered ${draft.slotLabel}. Book it in the Calendar once they agree.`
      : draft.handover
        ? "A person should reply. Read Mia's note before answering."
        : "Check Mia's draft, edit it if needed, and send it."
    : c.needsReply
      ? "They're waiting for a reply. Ask Mia for a draft or answer yourself."
      : "Nothing is waiting on the clinic.";
  return (
    <section
      id="next-step"
      aria-label="Next step"
      className="flex flex-col gap-3 rounded-[26px] bg-[#F7B556] p-[18px]"
    >
      <div className="flex flex-col">
        <h3 className="text-[22px] leading-tight font-normal">Next step</h3>
        <span className="text-[13px]">
          {draft
            ? NEXT_STEP_LABELS[draft.nextStep]
            : c.needsReply
              ? "Reply to them"
              : "All caught up"}
        </span>
      </div>
      {draft ? (
        <Link
          href="#mia-draft"
          className="flex h-12 items-center gap-2.5 rounded-full bg-white pr-3 pl-4 text-sm"
        >
          <File className="size-4" aria-hidden />
          <span className="flex-1 truncate">Mia&apos;s draft reply</span>
          <ChevronDown className="size-4" aria-hidden />
        </Link>
      ) : null}
      <p className="text-[13px] leading-normal">{nextText}</p>
      <span className="text-[13px]">Reach them on</span>
      <div className="grid grid-cols-2 gap-1.5">
        <span className="inline-flex h-9 items-center justify-center rounded-full bg-[#FBD49B] px-2 text-center text-[13px]">
          {channelOf(c)}
        </span>
        <span className="inline-flex h-9 items-center justify-center rounded-full bg-[#FBD49B] px-2 text-center text-[13px]">
          {c.contactPhone ? "Mobile" : c.contactEmail ? "Email" : "Chat only"}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Link
          href={
            booking && c.patient
              ? `/calendar?form=new&patient=${c.patient.id}`
              : "#reply-body"
          }
          aria-label={booking ? "Book in the Calendar" : "Write the reply"}
          className="grid h-[52px] place-items-center rounded-full bg-[#0E2A47] text-white"
        >
          {booking ? (
            <CalendarPlus className="size-5" aria-hidden />
          ) : (
            <Send className="size-5" aria-hidden />
          )}
        </Link>
        {canSend && c.status === "open" ? (
          <MarkDoneButton conversationId={c.id} />
        ) : (
          <span
            className="grid h-[52px] place-items-center rounded-full bg-white/50 opacity-60"
            aria-label={c.status === "open" ? "Mark as done" : "Already done"}
            aria-disabled="true"
          >
            <CircleCheck className="size-5" aria-hidden />
          </span>
        )}
      </div>
    </section>
  );
}

/** Everything right of the side panel for the selected conversation, laid out like the design. */
export function ConversationWorkspace(props: WorkspaceProps) {
  const { conversation: c, filter, tab } = props;
  const iconButton =
    "grid size-9 place-items-center rounded-full bg-white text-[#46566B] hover:text-[#0E2A47]";
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Header {...props} />
      <Tabs {...props} />
      <div className="-mt-4 flex flex-wrap items-start gap-4 rounded-[30px] bg-[#F4F6F9] p-[18px]">
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-3.5">
          {tab === "conversation" ? (
            <>
              <div className="flex justify-center gap-1.5">
                <Link
                  href={consoleHref(filter, c.id, "history")}
                  aria-label="Full history"
                  className={iconButton}
                >
                  <Filter className="size-4" aria-hidden />
                </Link>
                <Link
                  href={
                    c.patient
                      ? `/calendar?form=new&patient=${c.patient.id}`
                      : "/calendar"
                  }
                  aria-label="Calendar"
                  className={iconButton}
                >
                  <CalendarDays className="size-4" aria-hidden />
                </Link>
                <Link
                  href={`/messaging?q=${encodeURIComponent(c.contact.name)}`}
                  aria-label="Search messages"
                  className={iconButton}
                >
                  <Search className="size-4" aria-hidden />
                </Link>
              </div>
              <Timeline entries={timelineOf(c, props.draft)} />
              <ChatCard {...props} />
            </>
          ) : tab === "summary" ? (
            <SummaryTab {...props} />
          ) : tab === "details" ? (
            <DetailsTab {...props} />
          ) : (
            <HistoryTab {...props} />
          )}
        </div>
        <div className="flex max-w-full min-w-0 flex-[1_1_260px] flex-col gap-3.5">
          <InterestCard {...props} />
          <NextStepCard {...props} />
        </div>
      </div>
    </div>
  );
}
