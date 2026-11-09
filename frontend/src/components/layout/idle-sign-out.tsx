"use client";

import { useEffect } from "react";
import { logoutAction } from "@backend/features/auth/auth.controller";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

/** Signs the user out after `minutes` without interaction (clinic sign-in rule). */
export function IdleSignOut({ minutes }: { minutes: number }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void logoutAction(), minutes * 60_000);
    };
    reset();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);
  return null;
}
