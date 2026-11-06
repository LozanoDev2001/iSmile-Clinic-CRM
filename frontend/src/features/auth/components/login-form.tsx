"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight, Eye, EyeOff, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { FormRootError, FormTextField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { useActionForm } from "@/hooks/use-action-form";
import { loginAction } from "@backend/features/auth/auth.controller";
import type { DemoAccount } from "@backend/features/auth/demo-accounts.service";
import { loginSchema } from "@backend/features/auth/login.schema";

const inputClass =
  "h-12 rounded-xl border-[#d5dfea] bg-white px-4 text-[15px] md:text-[15px] placeholder:text-[#8a9bb0] focus-visible:border-[#2f80ed] focus-visible:ring-[#2f80ed]/20";

interface LoginFormProps {
  callbackUrl?: string;
  /** Development-only shortcuts; null/undefined hides the section. */
  demo?: { password: string; accounts: DemoAccount[] } | null;
}

export function LoginForm({ callbackUrl, demo }: LoginFormProps) {
  const { form, onSubmit, isPending } = useActionForm({
    schema: loginSchema,
    defaultValues: { email: "", password: "", remember: true, callbackUrl },
    action: loginAction,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  const fillDemo = (email: string) => {
    if (!demo) return;
    form.clearErrors();
    form.setValue("email", email, { shouldDirty: true });
    form.setValue("password", demo.password, { shouldDirty: true });
  };

  return (
    <div>
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-4">
          <FormRootError form={form} />
          <FormTextField
            form={form}
            name="email"
            label="Email or staff ID"
            type="text"
            inputMode="email"
            placeholder="Enter your email or staff ID"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className={inputClass}
          />
          <FormTextField
            form={form}
            name="password"
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className={inputClass}
            endAdornment={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="grid size-9 place-items-center rounded-lg text-[#4a5f7a] transition-colors hover:bg-[#eef4fa] hover:text-[#0f2a4a] focus-visible:ring-2 focus-visible:ring-[#2f80ed]/50 focus-visible:outline-none"
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[#1d3557] select-none">
              <input
                type="checkbox"
                {...form.register("remember")}
                className="size-[18px] cursor-pointer rounded accent-[#1f6fd1]"
              />
              Keep me signed in
            </label>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-[#1f6fd1] underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <SubmitButton
            pending={isPending}
            pendingLabel="Signing in…"
            className="mt-1 h-12 w-full rounded-xl bg-gradient-to-r from-[#2f86f0] to-[#0b4fb3] text-base font-semibold text-white shadow-[0_12px_24px_-10px_rgba(18,90,200,0.7)] transition-[filter] hover:brightness-110"
          >
            Sign in
            <ArrowRight data-icon="inline-end" className="size-4" />
          </SubmitButton>
        </FieldGroup>
      </form>

      <div className="my-5 flex items-center gap-4 text-sm text-[#6b7f97]" aria-hidden>
        <span className="h-px flex-1 bg-[#d5dfea]" />
        or
        <span className="h-px flex-1 bg-[#d5dfea]" />
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => toast.info("SMS sign-in is coming soon. Please use your email and password for now.")}
        className="h-12 w-full rounded-xl border-[#1f5fbf] bg-transparent text-[15px] font-medium text-[#1f5fbf] hover:bg-[#1f6fd1]/5 hover:text-[#1f5fbf]"
      >
        <Smartphone data-icon="inline-start" className="size-4" />
        Sign in with SMS
      </Button>

      {demo ? (
        <div className="mt-6 border-t border-[#d5dfea] pt-4">
          <button
            type="button"
            onClick={() => setDemoOpen((v) => !v)}
            aria-expanded={demoOpen}
            aria-controls="demo-accounts"
            className="flex w-full items-center justify-between rounded-lg py-1 text-left text-[15px] font-medium text-[#0f2a4a] focus-visible:ring-2 focus-visible:ring-[#2f80ed]/50 focus-visible:outline-none"
          >
            Explore demo accounts
            {demoOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          {demoOpen ? (
            <div id="demo-accounts" className="mt-2">
              <p className="text-xs text-[#4a5f7a]">
                Password for all: <span className="font-semibold text-[#0f2a4a]">{demo.password}</span> · tap an
                account to fill it in
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {demo.accounts.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => fillDemo(account.email)}
                    title={account.email}
                    className="rounded-lg border border-[#d5dfea] bg-white px-3 py-1.5 text-xs text-[#1d3557] transition-colors hover:border-[#1f6fd1] hover:text-[#1f6fd1] focus-visible:ring-2 focus-visible:ring-[#2f80ed]/50 focus-visible:outline-none"
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
