import type { Metadata } from "next";
import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { ErrorState } from "@/components/shared/error-state";
import { buttonVariants } from "@/components/ui/button";
import { AuthHeading } from "@/features/auth/components/auth-heading";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { isResetTokenValid } from "@backend/features/auth/password-reset.service";

export const metadata: Metadata = { title: "Set a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && (await isResetTokenValid(token));

  if (!valid) {
    return (
      <ErrorState
        icon={LinkIcon}
        tone="default"
        className="py-2"
        title="This link is invalid or has expired"
        description="Reset links can only be used once and expire after a short time. Request a new one to continue."
        actions={
          <Link href="/forgot-password" className={buttonVariants()}>
            Request a new link
          </Link>
        }
      />
    );
  }

  return (
    <>
      <AuthHeading title="Choose a new password" description="This will sign you out of all other devices." />
      <ResetPasswordForm token={token} />
    </>
  );
}
