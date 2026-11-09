"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SECURITY } from "@backend/config/security";
import { updateSignInRulesAction } from "@backend/features/settings/settings.controller";
import type { SignInRules } from "@backend/features/settings/settings.types";

const RULES: { key: keyof SignInRules; title: string; description: string }[] = [
  {
    key: "lockAfterFailedLogins",
    title: `Lock after ${SECURITY.accountLock.maxFailedLogins} wrong passwords`,
    description: "The owner or manager unlocks the account",
  },
  {
    key: "idleSignOut",
    title: `Sign out after ${SECURITY.idleSignOut.minutes} minutes idle`,
    description: "Shared front-desk computers",
  },
];

export function SignInRulesCard({ rules, canEdit }: { rules: SignInRules; canEdit: boolean }) {
  const [value, setValue] = useState(rules);
  const [pending, startTransition] = useTransition();

  const toggle = (key: keyof SignInRules) => {
    const next = { ...value, [key]: !value[key] };
    setValue(next);
    startTransition(async () => {
      const result = await updateSignInRulesAction(next);
      if (result.success) {
        toast.success(result.message ?? "Saved.");
        return;
      }
      setValue(value);
      toast.error(result.error.message);
    });
  };

  return (
    <section aria-label="Sign-in rules" className="glass-card flex min-w-0 flex-col gap-3 rounded-[24px] p-5">
      <h2 className="text-lg font-medium">Sign-in rules</h2>
      {RULES.map((rule) => (
        <div key={rule.key} className="flex items-center justify-between gap-4 rounded-2xl bg-[#F4F6F9]/80 px-3.5 py-3">
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px]">{rule.title}</span>
            <span className="text-xs text-[#5E6B7E]">{rule.description}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={value[rule.key]}
            aria-label={rule.title}
            disabled={!canEdit || pending}
            onClick={() => toggle(rule.key)}
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              value[rule.key] ? "bg-[#2E9E63]" : "bg-[#D5DCE5]",
            )}
          >
            <span className={cn("absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform", value[rule.key] && "translate-x-5")} />
          </button>
        </div>
      ))}
      {canEdit ? null : <p className="text-xs text-[#5E6B7E]">Only people with full Settings access can change these.</p>}
    </section>
  );
}
