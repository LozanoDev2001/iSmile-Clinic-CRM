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
  "h-[50px] rounded-[10px] border-[#CBD5E1] bg-white px-[18px] text-base text-[#10305A] md:text-base desk:h-14 placeholder:text-[#8A97A8] focus-visible:border-[#0B63D6] focus-visible:ring-[3px] focus-visible:ring-[#0B63D6]/15";

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
        <FieldGroup className="gap-3.5 sm:gap-4 desk:gap-5 [&_[data-slot=field-label]]:text-sm [&_[data-slot=field-label]]:font-medium [&_[data-slot=field-label]]:text-[#10305A] sm:[&_[data-slot=field-label]]:text-base">
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
                className="grid size-[42px] place-items-center rounded-lg text-[#4A5D75] transition-colors hover:bg-[#F2F7FE] hover:text-[#10305A] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7DB4F5]"
              >
                {showPassword ? <EyeOff className="size-[22px]" /> : <Eye className="size-[22px]" />}
              </button>
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-[15px] text-[#10305A] select-none sm:text-base">
              <input
                type="checkbox"
                {...form.register("remember")}
                className="size-5 cursor-pointer accent-[#0B63D6]"
              />
              Keep me signed in
            </label>
            <Link
              href="/forgot-password"
              className="text-[15px] font-medium text-[#0B63D6] underline-offset-4 hover:underline sm:text-base"
            >
              Forgot password?
            </Link>
          </div>

          <SubmitButton
            pending={isPending}
            pendingLabel="Signing in…"
            className="h-[52px] w-full gap-2.5 rounded-[10px] bg-[linear-gradient(135deg,#2B82EC_0%,#0B63D6_60%,#0951B3_100%)] text-[17px] font-semibold text-white shadow-[0_8px_20px_rgba(11,99,214,.25)] transition-[filter] hover:brightness-95 sm:text-lg desk:h-[58px] desk:text-[19px]"
          >
            Sign in
            <ArrowRight data-icon="inline-end" className="size-5" />
          </SubmitButton>
        </FieldGroup>
      </form>

      <div className="my-3.5 flex items-center gap-4 text-[15px] text-[#4A5D75] sm:my-4 desk:my-5" aria-hidden>
        <span className="h-px flex-1 bg-[#E2E8F0]" />
        or
        <span className="h-px flex-1 bg-[#E2E8F0]" />
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => toast.info("SMS sign-in is coming soon. Please use your email and password for now.")}
        className="h-[50px] w-full gap-2.5 rounded-[10px] border-[1.5px] border-[#0B63D6] bg-white text-base font-medium text-[#0B63D6] hover:bg-[#F2F7FE] hover:text-[#0B63D6] sm:text-[17px] desk:h-14 desk:text-lg"
      >
        <Smartphone data-icon="inline-start" className="size-[22px]" />
        Sign in with SMS
      </Button>

      {demo ? (
        <div className="mt-[18px] border-t border-[#E2E8F0] desk:mt-6">
          <button
            type="button"
            onClick={() => setDemoOpen((v) => !v)}
            aria-expanded={demoOpen}
            aria-controls="demo-accounts"
            className="flex w-full items-center justify-between pt-4 pb-1.5 text-left text-base font-medium text-[#10305A] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#7DB4F5] sm:text-[17px]"
          >
            Explore demo accounts
            {demoOpen ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5" />}
          </button>
          {demoOpen ? (
            <div id="demo-accounts" className="mt-2">
              <p className="text-xs text-[#4a5f7a]">
                Password: <span className="font-semibold text-[#0f2a4a]">{demo.password}</span> · tap an
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
