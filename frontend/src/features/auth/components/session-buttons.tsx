"use client";

import { useTransition } from "react";
import { LogOut, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { logoutAction, revokeAllSessionsAction } from "@backend/features/auth/auth.controller";

export function LogoutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => logoutAction())}
      className="w-full justify-start"
    >
      <LogOut data-icon="inline-start" />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}

export function RevokeSessionsButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="destructive"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await revokeAllSessionsAction();
          if (result && !result.success) toast.error(result.error.message);
        })
      }
    >
      <ShieldOff data-icon="inline-start" />
      {pending ? "Signing out everywhere…" : "Sign out of all devices"}
    </Button>
  );
}

export function LogoutIconButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => logoutAction())}
      aria-label="Sign out"
      title="Sign out"
      className="grid size-9 place-items-center rounded-full text-[#0E2A47] transition-colors hover:bg-[#0E2A47]/5 disabled:opacity-50"
    >
      <LogOut className="size-[18px]" strokeWidth={1.8} aria-hidden />
    </button>
  );
}
