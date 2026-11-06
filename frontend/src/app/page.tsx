import { redirect } from "next/navigation";
import { DEFAULT_LOGIN_REDIRECT } from "@backend/config/security";

export default function Home() {
  redirect(DEFAULT_LOGIN_REDIRECT);
}
