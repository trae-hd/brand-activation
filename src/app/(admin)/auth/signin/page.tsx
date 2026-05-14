import { Suspense } from "react";
import type { Metadata } from "next";
import { env } from "@/lib/env";
import { SignInForm } from "./_components/SignInForm";

export const metadata: Metadata = {
  title: "Sign in — MrQ Activation Admin",
};

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

function getSafeCallbackUrl(raw: string | undefined): string {
  if (!raw) return "/";
  if (raw.startsWith("/")) return raw;

  try {
    const { origin } = new URL(raw);
    const allowed = new Set([
      new URL(env.NEXTAUTH_URL).origin,
      new URL(env.PUBLIC_BASE_URL).origin,
    ]);
    return allowed.has(origin) ? raw : "/";
  } catch {
    return "/";
  }
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { callbackUrl } = await searchParams;
  const safeCallbackUrl = getSafeCallbackUrl(callbackUrl);

  // Phase 3: add getSession() check — redirect to "/" if already authenticated.

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense>
          <SignInForm callbackUrl={safeCallbackUrl} />
        </Suspense>
      </div>
    </div>
  );
}
