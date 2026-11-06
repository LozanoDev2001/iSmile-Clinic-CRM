import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@backend/config/permissions";
import { requirePageUser } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePageUser(); // cached: same lookup as the layout

  const grouped = user.permissions.reduce<Record<string, string[]>>((acc, permission) => {
    const [area, ...rest] = permission.split(".");
    (acc[area] ??= []).push(rest.join("."));
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">Signed in as {ROLE_LABELS[user.role]}.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            Your access
          </CardTitle>
          <CardDescription>
            Permissions granted by your role. Patient records are further limited to your clinic
            {user.branchIds.length ? " and assigned branches" : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(grouped).map(([area, actions]) => (
            <div key={area} className="space-y-2">
              <p className="text-sm font-medium capitalize">{area}</p>
              <div className="flex flex-wrap gap-1">
                {actions.map((action) => (
                  <Badge key={action} variant="secondary">
                    {action}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
