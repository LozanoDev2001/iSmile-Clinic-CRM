import { ConsolePanel } from "@/features/crwdforce/components/console-panel";
import { selectedConversationId } from "@/features/crwdforce/format";
import { getCrwdforceConsole } from "@backend/features/crwdforce/crwdforce.service";
import { pageCan } from "@backend/lib/authorization";

/** crwdForce's conversation column, shown inside the side menu as in the design. */
export default async function CrwdforceRail({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; filter?: string }>;
}) {
  const { user, allowed } = await pageCan("crwdforce.read");
  if (!allowed) return null;
  const params = await searchParams;
  const filter = params.filter === "staff" ? "staff" : "all";
  const data = await getCrwdforceConsole(user);
  return (
    <ConsolePanel
      data={data}
      filter={filter}
      selectedId={selectedConversationId(data.conversations, filter, params.c)}
    />
  );
}
