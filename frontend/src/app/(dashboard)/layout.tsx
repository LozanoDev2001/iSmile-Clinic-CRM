import type { ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { IdleSignOut } from "@/components/layout/idle-sign-out";
import { TopBar } from "@/components/layout/top-bar";
import { ServiceUnavailable } from "@/components/shared/service-unavailable";
import { NAV_MODULES } from "@/config/navigation";
import { outfit } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@backend/config/permissions";
import { SECURITY } from "@backend/config/security";
import { can, requirePageUser, type AuthUser } from "@backend/lib/authorization";
import { normalizeError } from "@backend/lib/errors/api-error-handler";
import { miaStatus } from "@backend/features/crwdforce/crwdforce.service";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  let user: AuthUser;
  try {
    user = await requirePageUser();
  } catch (error) {
    unstable_rethrow(error);
    if (normalizeError(error).code === "DATABASE_ERROR") return <ServiceUnavailable />;
    throw error;
  }

  const allowedKeys = NAV_MODULES.filter((m) => !m.permission || can(user, m.permission)).map((m) => m.key);
  const roleLabel = ROLE_LABELS[user.role];

  return (
    <div className={cn(outfit.className, "app-bg flex min-h-dvh gap-4 p-3 text-[#0E2A47] sm:p-3.5")}>
      {user.idleSignOut ? <IdleSignOut minutes={SECURITY.idleSignOut.minutes} /> : null}
      <AppSidebar allowedKeys={allowedKeys} userName={user.name} roleLabel={roleLabel} />
      <div className="flex min-w-0 flex-1 flex-col gap-4 px-0 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-1 md:pb-6">
        <TopBar userName={user.name} roleLabel={roleLabel} miaConnected={can(user, "crwdforce.read") ? miaStatus().connected : null} />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
