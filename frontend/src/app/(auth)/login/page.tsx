import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthHeading } from "@/features/auth/components/auth-heading";
import { LoginForm } from "@/features/auth/components/login-form";
import { safeCallbackUrl } from "@backend/config/security";
import { getDemoAccounts } from "@backend/features/auth/demo-accounts.service";

export const metadata: Metadata = { title: "Sign in" };

const REASONS: Record<string, { tone: "default" | "destructive"; text: string }> = {
  expired: { tone: "default", text: "Your session has expired. Please sign in again." },
  "password-changed": { tone: "default", text: "Your password was changed. Please sign in with your new password." },
  "password-reset": { tone: "default", text: "Your password has been set. You can now sign in." },
  "signed-out-everywhere": { tone: "default", text: "You have been signed out of all devices." },
  CredentialsSignin: { tone: "destructive", text: "Invalid email or password." },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const reasonKey = typeof params.reason === "string" ? params.reason : typeof params.error === "string" ? params.error : undefined;
  const reason = reasonKey ? REASONS[reasonKey] : undefined;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);

  return (
    <>
      <AuthHeading title="Welcome back" description="Sign in to your iSmile workspace." />
      {reason ? (
        <Alert variant={reason.tone} role="status" className="mb-5">
          <AlertDescription>{reason.text}</AlertDescription>
        </Alert>
      ) : null}
      <LoginForm callbackUrl={callbackUrl} demo={getDemoAccounts()} />
    </>
  );
}
