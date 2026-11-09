import { redirect } from "next/navigation";

// Staff accounts now live in Settings → Team & roles.
export default function UsersPage() {
  redirect("/settings/team");
}
