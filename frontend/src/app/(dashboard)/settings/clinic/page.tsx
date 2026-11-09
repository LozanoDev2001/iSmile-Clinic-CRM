import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { ClinicProfileForm } from "@/features/settings/components/clinic-profile-form";
import { SettingsShell } from "@/features/settings/components/settings-shell";
import { listServices } from "@backend/features/catalog/catalog.service";
import { getClinicProfile } from "@backend/features/settings/settings.service";
import { can, pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Clinic profile" };

export default async function ClinicProfilePage() {
  const { user, allowed } = await pageCan("settings.read");
  if (!allowed) return <AccessDenied />;

  const [profile, services] = await Promise.all([getClinicProfile(user), listServices(user)]);
  const servicesOffered = services.filter((s) => s.taxType === "exempt").map((s) => s.name);

  return (
    <SettingsShell>
      <ClinicProfileForm profile={profile} servicesOffered={servicesOffered} canEdit={can(user, "settings.update")} />
    </SettingsShell>
  );
}
