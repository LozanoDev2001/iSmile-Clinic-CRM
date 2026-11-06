import type { ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { DashboardNav, type NavItem } from "@/components/layout/dashboard-nav";
import { Brand } from "@/components/shared/brand";
import { ServiceUnavailable } from "@/components/shared/service-unavailable";
import { ROLE_LABELS, type Permission } from "@backend/config/permissions";
import { LogoutButton } from "@/features/auth/components/session-buttons";
import { can, requirePageUser, type AuthUser } from "@backend/lib/authorization";
import { normalizeError } from "@backend/lib/errors/api-error-handler";

const NAV: (NavItem & { permission?: Permission })[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/users", label: "Staff accounts", icon: "users", permission: "users.read" },
  { href: "/profile", label: "My profile", icon: "profile" },
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  let user: AuthUser;
  try {
    user = await requirePageUser();
  } catch (error) {
    unstable_rethrow(error);
    if (normalizeError(error).code === "DATABASE_ERROR") return <ServiceUnavailable />;
    throw error;
  }

  const items = NAV.filter((item) => !item.permission || can(user, item.permission)).map(
    ({ href, label, icon }) => ({ href, label, icon }),
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-6 border-b bg-sidebar p-4 md:w-64 md:border-r md:border-b-0">
        <Brand />
        <DashboardNav items={items} />
        <div className="mt-auto space-y-2 border-t pt-4">
          <div className="px-3 text-sm">
            <p className="truncate font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
