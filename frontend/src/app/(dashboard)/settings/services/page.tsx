import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PriceList } from "@/features/settings/components/price-list";
import { SettingsShell } from "@/features/settings/components/settings-shell";
import { listServices } from "@backend/features/catalog/catalog.service";
import { getClinicProfile } from "@backend/features/settings/settings.service";
import { can, pageCan } from "@backend/lib/authorization";

export const metadata: Metadata = { title: "Services & prices" };

export default async function ServicesSettingsPage() {
  const { user, allowed } = await pageCan("settings.read");
  if (!allowed) return <AccessDenied />;

  const [services, profile] = await Promise.all([listServices(user), getClinicProfile(user)]);

  return (
    <SettingsShell>
      <PriceList services={services} canEdit={can(user, "settings.update")} vatRegistered={profile.vatRegistered} />
    </SettingsShell>
  );
}
