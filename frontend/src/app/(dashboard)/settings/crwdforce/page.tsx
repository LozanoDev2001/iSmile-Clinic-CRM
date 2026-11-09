import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { MiaSetupForm } from "@/features/crwdforce/components/mia-setup-form";
import { SettingsShell } from "@/features/settings/components/settings-shell";
import { getMiaSettings } from "@backend/features/crwdforce/crwdforce.service";
import { can, pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "crwdForce setup" };

export default async function MiaSetupPage() {
  const { user, allowed } = await pageCan("crwdforce.read");
  if (!allowed) return <AccessDenied />;

  return (
    <SettingsShell>
      <MiaSetupForm settings={await getMiaSettings(user)} canEdit={can(user, "crwdforce.update")} />
    </SettingsShell>
  );
}
