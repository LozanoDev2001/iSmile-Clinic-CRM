import type { Metadata } from "next";
import Link from "next/link";
import { Settings2, TriangleAlert } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { Avatar } from "@/components/shared/avatar";
import { formatLeadTime } from "@/features/leads/format";
import { CHANNEL_LABELS, labelOf } from "@/features/patients/format";
import { getCrwdforceConsole } from "@backend/features/crwdforce/crwdforce.service";
import { pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "crwdForce" };

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card flex flex-col gap-1 rounded-[20px] p-4">
      <span className="text-xs text-[#5E6B7E]">{label}</span>
      <span className="text-[28px] leading-none">{value}</span>
    </div>
  );
}

export default async function CrwdforcePage() {
  const { user, allowed } = await pageCan("crwdforce.read");
  if (!allowed) return <AccessDenied />;
  const { status, waiting, today } = await getCrwdforceConsole(user);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-normal tracking-[-0.01em] sm:text-[34px]">crwdForce</h1>
          <p className="text-[13px] text-[#5E6B7E]">Mia drafts replies to patient chats. Your team reads each draft and decides whether to send it.</p>
        </div>
        <Link href="/settings/crwdforce" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#D5DCE5] bg-white px-5 text-[15px] hover:bg-[#F4F6F9]">
          <Settings2 className="size-4" aria-hidden />
          Mia&apos;s setup
        </Link>
      </div>

      {status.connected ? (
        <p className="rounded-2xl bg-[#DDF3E4] px-4 py-2.5 text-sm text-[#1E5B33]">Mia is connected and drafting replies with {status.model}.</p>
      ) : (
        <div role="status" className="flex items-start gap-2 rounded-2xl bg-[#FDE3BD] px-4 py-3 text-sm text-[#5A3500]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Mia isn&apos;t connected yet. Add the clinic&apos;s Anthropic API key as <code className="rounded bg-white/60 px-1">ANTHROPIC_API_KEY</code> in the server&apos;s <code className="rounded bg-white/60 px-1">.env</code> file, then restart the app. Until
            then you can still set her up and reply to chats yourself.
          </p>
        </div>
      )}

      <section aria-label="Today" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Drafts today" value={today.drafts} />
        <Stat label="Sent by staff" value={today.used} />
        <Stat label="Dismissed" value={today.dismissed} />
        <Stat label="Handed over" value={today.handovers} />
      </section>

      <section aria-labelledby="waiting-heading" className="glass-card flex flex-col gap-3 rounded-[24px] p-4 sm:p-5">
        <h2 id="waiting-heading" className="text-lg font-normal">
          Waiting for a reply · {waiting.length}
        </h2>
        {waiting.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#5E6B7E]">Everyone has been answered.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[#EDF0F4]">
            {waiting.map((w) => (
              <li key={w.conversationId}>
                <Link href={`/messaging?c=${w.conversationId}`} className="flex items-start gap-3 rounded-[18px] px-2 py-3 hover:bg-[#F4F6F9]">
                  <Avatar name={w.name} letters={2} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-x-2 text-[15px]">
                      {w.name}
                      <span className="text-xs text-[#5E6B7E]">
                        {labelOf(CHANNEL_LABELS, w.channel) ?? w.channel}
                        {w.lastMessageAt ? ` · ${formatLeadTime(w.lastMessageAt)}` : ""}
                      </span>
                    </span>
                    <span className="truncate text-sm text-[#46566B]">{w.lastMessage ?? "No message text"}</span>
                    {w.draft ? (
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-[#7A4300]">
                        <span className="rounded-full bg-[#FFF1DA] px-2 py-0.5">Mia&apos;s draft ready</span>
                        {w.draft.handover ? <span className="rounded-full bg-[#FDECEA] px-2 py-0.5 text-[#A1301F]">Needs a person</span> : null}
                        {w.draft.summary}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
