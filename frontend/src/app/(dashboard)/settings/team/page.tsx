import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { AccessLogCard } from "@/features/settings/components/access-log-card";
import { EmployeesList } from "@/features/settings/components/employees-list";
import { MEMBER_FORM_ID, MemberEditor } from "@/features/settings/components/member-editor";
import { SettingsShell } from "@/features/settings/components/settings-shell";
import { SignInRulesCard } from "@/features/settings/components/sign-in-rules-card";
import { TeamInvitePanel } from "@/features/settings/components/team-invite-panel";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@backend/config/permissions";
import { getSignInRules } from "@backend/features/settings/settings.service";
import { getAccessLog, getMemberAccess, getTeamOverview } from "@backend/features/users/team.service";
import { getInviteOptions } from "@backend/features/users/users.service";
import { can, pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Team & roles" };

export default async function TeamSettingsPage({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const { user, allowed } = await pageCan("users.read");
  if (!allowed) return <AccessDenied />;

  const [overview, inviteOptions, accessLog, signInRules] = await Promise.all([
    getTeamOverview(user),
    can(user, "users.create") ? getInviteOptions(user) : null,
    can(user, "audit.read") ? getAccessLog(user) : null,
    can(user, "settings.read") ? getSignInRules(user) : null,
  ]);

  const requested = (await searchParams).member;
  const selected =
    overview.members.find((m) => m.id === requested) ?? overview.members.find((m) => m.editable) ?? overview.members[0];
  const detail = selected ? await getMemberAccess(user, { userId: selected.id }) : null;
  const assignable = detail ? [...new Set([detail.member.role, ...ASSIGNABLE_ROLES[user.role]])] : [];
  const canSave = !!detail?.member.editable && !detail.fixedAccess;

  return (
    <SettingsShell
      actions={
        canSave ? (
          <button type="submit" form={MEMBER_FORM_ID} className="fill-orange h-12 rounded-full px-6 text-[15px] font-medium text-[#0E2A47] hover:brightness-105">
            Save changes
          </button>
        ) : null
      }
    >
      <TeamInvitePanel editorName={user.name} editorRole={ROLE_LABELS[user.role]} options={inviteOptions} />

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:items-start">
        <EmployeesList members={overview.members} activeCount={overview.activeCount} selectedId={selected?.id} />
        {detail ? (
          <MemberEditor key={detail.member.id} detail={detail} assignableRoles={assignable} ceiling={user.access} />
        ) : null}
      </div>

      {signInRules || accessLog ? (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          {signInRules ? <SignInRulesCard rules={signInRules} canEdit={can(user, "settings.update")} /> : null}
          {accessLog ? <AccessLogCard entries={accessLog} /> : null}
        </div>
      ) : null}
    </SettingsShell>
  );
}
