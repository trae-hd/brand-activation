import { Suspense } from "react";
import type { Metadata } from "next";
import { SetPasswordForm } from "./_components/SetPasswordForm";

export const metadata: Metadata = {
  title: "Set password — MrQ Activation Admin",
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; token?: string }>;
}) {
  const { type, token } = await searchParams;

  if ((type !== "invite" && type !== "reset") || !token) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm text-center">
          <p className="text-muted-foreground">
            This link has expired or already been used. Request a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense>
          <SetPasswordForm type={type} token={token} />
        </Suspense>
      </div>
    </div>
  );
}
