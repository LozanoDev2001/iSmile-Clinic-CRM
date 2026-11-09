import { redirect } from "next/navigation";
import { can, requirePageUser } from "@backend/lib/authorization";

export default async function SettingsPage() {
  const user = await requirePageUser();
  redirect(can(user, "users.read") ? "/settings/team" : "/profile");
}
