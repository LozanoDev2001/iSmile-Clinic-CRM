import Link from "next/link";
import {
  CircleCheck,
  Clock3,
  Headset,
  MessageSquare,
  Send,
  Settings2,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CHANNEL_LABELS, labelOf } from "@/features/patients/format";
import type {
  ConsoleConversation,
  CrwdforceConsole,
} from "@backend/features/crwdforce/crwdforce.types";
import {
  type ConsoleFilter,
  consoleHref,
  INTENT_LABELS,
  PRIORITY_CLASSES,
  filterConversations,
  initials,
  priorityOf,
  statusOf,
} from "../format";

function Tile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-white/15 bg-white/8 p-3.5">
      <span className="flex items-center gap-1.5 text-[13px] text-white/85">
        <Icon className="size-4 text-[#F9BC5E]" aria-hidden />
        {label}
      </span>
      <span className="self-end text-[32px] leading-none font-light">
        {value}
      </span>
    </div>
  );
}

function ConversationCard({
  c,
  selected,
  filter,
}: {
  c: ConsoleConversation;
  selected: boolean;
  filter: ConsoleFilter;
}) {
  const priority = priorityOf(c);
  const channel = labelOf(CHANNEL_LABELS, c.channel) ?? c.channel;
  const topic = c.draft ? INTENT_LABELS[c.draft.intent] : c.lastMessage;
  return (
    <li>
      <Link
        href={consoleHref(filter, c.conversationId)}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex flex-col gap-3 rounded-[22px] p-3.5",
          selected
            ? "fill-orange text-[#0E2A47]"
            : "border border-white/15 bg-white/8 text-white hover:bg-white/14",
        )}
      >
        <span className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-full text-sm font-medium",
              selected
                ? "bg-white text-[#0E2A47]"
                : "bg-white/90 text-[#0E2A47]",
            )}
          >
            {initials(c.name)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px]">{c.name}</span>
            <span
              className={cn(
                "truncate text-xs",
                selected ? "text-[#0E2A47]/75" : "text-white/70",
              )}
            >
              {channel}
              {topic ? ` · ${topic}` : ""}
            </span>
          </span>
        </span>
        <span
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]",
            selected ? "border-[#0E2A47]/25" : "border-white/20",
          )}
        >
          {c.draft?.handover ? (
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
          ) : (
            <MessageSquare className="size-4 shrink-0" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate">{statusOf(c)}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              PRIORITY_CLASSES[priority],
            )}
          >
            {priority}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Console column joined to the side menu: today's numbers and the open conversations. The caller supplies the blue background. */
export function ConsolePanel({
  data,
  filter,
  selectedId,
}: {
  data: CrwdforceConsole;
  filter: ConsoleFilter;
  selectedId: string | null;
}) {
  const list = filterConversations(data.conversations, filter);
  const chip = (on: boolean) =>
    cn(
      "inline-flex h-9 items-center rounded-full px-3.5 text-[13px]",
      on
        ? "bg-white text-[#0E2A47]"
        : "border border-white/25 text-white hover:bg-white/10",
    );
  return (
    <section
      aria-label="Conversations"
      className="flex h-full min-w-0 flex-col gap-4 px-4 pt-5 pb-4 text-white"
    >
      <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="Today">
        <Tile icon={Clock3} label="Chats today" value={data.today.chats} />
        <Tile icon={MessageSquare} label="Waiting" value={data.today.waiting} />
        <Tile icon={Send} label="Mia's drafts sent" value={data.today.used} />
        <Tile icon={Headset} label="Handed over" value={data.today.handovers} />
      </div>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-normal">
          <CircleCheck className="size-4" aria-hidden />
          Conversations
        </h2>
        <span className="text-xs text-white/70">Open</span>
      </div>
      <nav aria-label="Filter conversations" className="flex flex-wrap gap-1.5">
        <Link
          href={consoleHref("all")}
          aria-current={filter === "all" ? "page" : undefined}
          className={chip(filter === "all")}
        >
          All
        </Link>
        <span
          aria-disabled="true"
          title="Phone calls aren't connected yet"
          className={cn(chip(false), "cursor-not-allowed opacity-50")}
        >
          Calls
        </span>
        <Link
          href={consoleHref("staff")}
          aria-current={filter === "staff" ? "page" : undefined}
          className={chip(filter === "staff")}
        >
          Needs staff
        </Link>
      </nav>
      <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-2.5 scrollbar-dark overflow-y-auto px-1">
        {list.map((c) => (
          <ConversationCard
            key={c.conversationId}
            c={c}
            filter={filter}
            selected={c.conversationId === selectedId}
          />
        ))}
      </ul>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/75">
          {filter === "staff"
            ? "Nothing needs the team right now."
            : "No open conversations."}
        </p>
      ) : null}
      <Link
        href="/crwdforce/setup"
        className="mt-auto inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/8 text-sm hover:bg-white/14"
      >
        <Settings2 className="size-4" aria-hidden />
        Mia&apos;s setup
      </Link>
    </section>
  );
}
