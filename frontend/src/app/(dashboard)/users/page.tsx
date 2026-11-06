import type { Metadata } from "next";
import { Users } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABELS } from "@backend/config/permissions";
import { getInviteOptions, listUsers } from "@backend/features/users/users.service";
import { InviteUserForm } from "@/features/users/components/invite-user-form";
import { UserStatusToggle } from "@/features/users/components/user-status-toggle";
import { can, pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Staff accounts" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { user, allowed } = await pageCan("users.read");
  if (!allowed) return <AccessDenied />;

  const { page } = await searchParams;
  const canInvite = can(user, "users.create");
  const canUpdate = can(user, "users.update");
  const [{ items, total }, inviteOptions] = await Promise.all([
    listUsers(user, Number(page) || 1),
    canInvite ? getInviteOptions(user) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff accounts</h1>
          <p className="text-sm text-muted-foreground">{total} account{total === 1 ? "" : "s"}</p>
        </div>
      </div>

      {inviteOptions ? <InviteUserForm options={inviteOptions} /> : null}

      {items.length === 0 ? (
        <EmptyState icon={Users} title="No staff accounts yet" description="Invite your team to get started." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last sign-in</TableHead>
                {canUpdate ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                  </TableCell>
                  <TableCell>{ROLE_LABELS[row.role]}</TableCell>
                  <TableCell>
                    <Badge variant={row.isActive ? "secondary" : "destructive"}>{row.isActive ? "Active" : "Deactivated"}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.lastLoginAt ? dateFormat.format(row.lastLoginAt) : "Never"}
                  </TableCell>
                  {canUpdate ? (
                    <TableCell className="text-right">
                      {row.id !== user.id ? <UserStatusToggle userId={row.id} isActive={row.isActive} name={row.name} /> : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
