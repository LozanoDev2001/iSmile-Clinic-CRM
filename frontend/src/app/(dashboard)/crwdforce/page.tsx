import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { ConsolePanel } from "@/features/crwdforce/components/console-panel";
import { ConversationWorkspace } from "@/features/crwdforce/components/conversation-workspace";
import {
  CONSOLE_TABS,
  type ConsoleFilter,
  type ConsoleTab,
  selectedConversationId,
} from "@/features/crwdforce/format";
import { getCrwdforceConsole } from "@backend/features/crwdforce/crwdforce.service";
import {
  getConversation,
  getSavedReplies,
} from "@backend/features/messaging/messaging.service";
import { can, pageCan } from "@backend/lib/authorization";
import { isAppError } from "@backend/lib/errors/app-error";

export const metadata: Metadata = { title: "crwdForce" };

export default async function CrwdforcePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; filter?: string; tab?: string }>;
}) {
  const { user, allowed } = await pageCan("crwdforce.read");
  if (!allowed) return <AccessDenied />;
  const params = await searchParams;
  const filter: ConsoleFilter = params.filter === "staff" ? "staff" : "all";
  const tab: ConsoleTab =
    CONSOLE_TABS.find((t) => t === params.tab) ?? "conversation";
  const data = await getCrwdforceConsole(user);
  const selectedId = selectedConversationId(
    data.conversations,
    filter,
    params.c,
  );
  const canRead = can(user, "messaging.read");
  const [conversation, savedReplies] = await Promise.all([
    selectedId && canRead
      ? getConversation(user, selectedId).catch((e) =>
          isAppError(e) && e.code === "NOT_FOUND" ? null : Promise.reject(e),
        )
      : null,
    canRead ? getSavedReplies(user) : [],
  ]);
  const draft = conversation
    ? (data.conversations.find((c) => c.conversationId === conversation.id)
        ?.draft ?? null)
    : null;

  return (
    <div className="flex flex-col gap-4">
      {data.status.connected ? null : (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#FDE3BD] px-4 py-3 text-sm text-[#5A3500]"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            Mia isn&apos;t connected yet. Add the clinic&apos;s Anthropic API
            key as{" "}
            <code className="rounded bg-white/60 px-1">ANTHROPIC_API_KEY</code>{" "}
            in the server&apos;s{" "}
            <code className="rounded bg-white/60 px-1">.env</code> file, then
            restart the app. You can still set her up and reply yourself.
          </p>
        </div>
      )}
      {/* On wider screens this column sits inside the side menu (the @rail slot); phones show it here. */}
      <div className="rail-bg rounded-[28px] md:hidden">
        <ConsolePanel
          data={data}
          filter={filter}
          selectedId={conversation?.id ?? null}
        />
      </div>
      {conversation ? (
        <ConversationWorkspace
          conversation={conversation}
          draft={draft}
          connected={data.status.connected}
          savedReplies={savedReplies}
          canSend={can(user, "messaging.send")}
          userId={user.id}
          filter={filter}
          tab={tab}
        />
      ) : (
        <section className="glass-card rounded-[28px] p-10 text-center text-sm text-[#5E6B7E]">
          {data.conversations.length === 0
            ? "No open conversations. New chats logged in Messaging show up here."
            : "Pick a conversation to see it here."}
        </section>
      )}
    </div>
  );
}
