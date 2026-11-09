import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { InboxView } from "@/features/messaging/components/inbox-view";
import { LogMessageDialog } from "@/features/messaging/components/log-message-dialog";
import { BirthdaysView, BroadcastsView, SavedRepliesEditor } from "@/features/messaging/components/outreach-views";
import { SECTIONS, SECTION_LABELS, messagingHref, parseMessagingState, type MessagingSearchParams } from "@/features/messaging/messaging-state";
import { cn } from "@/lib/utils";
import { isSimulatorOn } from "@backend/features/messaging/messaging.delivery";
import {
  getCelebrants,
  getConversation,
  getGreeting,
  getGreetingsSent,
  getMessagingStaff,
  getSavedReplies,
  listBroadcasts,
  listConversations,
  previewAudiences,
} from "@backend/features/messaging/messaging.service";
import { can, pageCan } from "@backend/lib/authorization";
import { isAppError } from "@backend/lib/errors/app-error";

export const metadata: Metadata = { title: "Messaging" };

export default async function MessagingPage({ searchParams }: { searchParams: Promise<MessagingSearchParams> }) {
  const { user, allowed } = await pageCan("messaging.read");
  if (!allowed) return <AccessDenied />;
  const state = parseMessagingState(await searchParams);
  const canSend = can(user, "messaging.send");

  let body: React.ReactNode = null;
  if (state.section === "inbox") {
    const [conversations, savedReplies, staff, conversation] = await Promise.all([
      listConversations(user, { channel: state.channel, status: state.status, who: state.who, search: state.q }),
      getSavedReplies(user),
      getMessagingStaff(user),
      state.c ? getConversation(user, state.c).catch((e) => (isAppError(e) && e.code === "NOT_FOUND" ? null : Promise.reject(e))) : null,
    ]);
    body = <InboxView state={state} conversations={conversations} conversation={conversation} savedReplies={savedReplies} staff={staff} canSend={canSend} />;
  } else if (state.section === "birthdays") {
    const [celebrants, sent, greeting] = await Promise.all([getCelebrants(user), getGreetingsSent(user), getGreeting(user)]);
    body = <BirthdaysView celebrants={celebrants} sent={sent} greeting={greeting} canSend={canSend} />;
  } else if (state.section === "broadcasts") {
    const [audiences, broadcasts] = await Promise.all([previewAudiences(user), listBroadcasts(user)]);
    body = <BroadcastsView audiences={audiences} broadcasts={broadcasts} canSend={canSend} />;
  } else {
    body = <SavedRepliesEditor replies={await getSavedReplies(user)} canEdit={canSend} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">Messaging</h1>
          <p className="text-[13px] text-[#5E6B7E]">One inbox for Messenger, Instagram, WhatsApp, Viber, SMS and email, plus birthday greetings and broadcasts</p>
        </div>
        {canSend ? (
          <Link href={messagingHref(state, { section: "inbox", log: true })} className="fill-orange inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-medium text-[#0E2A47] hover:brightness-105">
            <MessageSquarePlus className="size-4" aria-hidden />
            Log a message
          </Link>
        ) : null}
      </div>
      <p className="rounded-2xl bg-[#FDE3BD] px-4 py-2.5 text-sm text-[#5A3500]">
        No chat apps are connected yet. Replies are saved here as &ldquo;not sent yet&rdquo;; send them from the clinic&apos;s app, then mark them as sent.
        {isSimulatorOn() ? " Development: replies are marked as simulated deliveries instead." : ""}
      </p>
      <nav aria-label="Messaging sections" className="flex gap-1 overflow-x-auto border-b border-[#E3E7ED]">
        {SECTIONS.map((s) => (
          <Link
            key={s}
            href={messagingHref({ ...state, c: undefined }, { section: s })}
            aria-current={state.section === s ? "page" : undefined}
            className={cn("-mb-px border-b-[3px] px-4 py-3 text-sm font-medium whitespace-nowrap", state.section === s ? "border-[#F39A1E] text-[#0E2A47]" : "border-transparent text-[#5E6B7E]")}
          >
            {SECTION_LABELS[s]}
          </Link>
        ))}
      </nav>
      {body}
      {state.log && canSend ? <LogMessageDialog state={state} simulator={isSimulatorOn()} /> : null}
    </div>
  );
}
