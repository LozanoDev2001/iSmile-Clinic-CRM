"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setUserActiveAction } from "@backend/features/users/users.controller";

export function UserStatusToggle({ userId, isActive, name }: { userId: string; isActive: boolean; name: string }) {
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (isActive && !window.confirm(`Deactivate ${name}? They will be signed out immediately.`)) return;
    startTransition(async () => {
      const result = await setUserActiveAction({ userId, active: !isActive });
      if (result.success) toast.success(result.message);
      else toast.error(result.error.message);
    });
  };

  return (
    <Button size="sm" variant={isActive ? "destructive" : "outline"} disabled={pending} onClick={toggle}>
      {pending ? "Saving…" : isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
