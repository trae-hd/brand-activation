"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import { trpc } from "@/lib/trpc/client";
import { checkPasswordStrength } from "@/lib/auth/password";

interface Props {
  type: "invite" | "reset";
  token: string;
}

export function SetPasswordForm({ type, token }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const strength = password ? checkPasswordStrength(password) : null;

  useEffect(() => {
    const validate = async () => {
      try {
        if (type === "invite") {
          const { email: e } = await trpc.auth.validateInvite.query({ token });
          setEmail(e);
        } else {
          const { email: e } = await trpc.auth.validateReset.query({ token });
          setEmail(e);
        }
      } catch {
        setTokenError("This link has expired or already been used. Request a new one.");
      }
    };
    validate();
  }, [type, token]);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setFormError(null);
    if (password !== confirm) {
      setFormError("Passwords do not match.");
      return;
    }
    const check = checkPasswordStrength(password);
    if (!check.ok) {
      setFormError(check.message ?? "Password too short.");
      return;
    }
    setIsLoading(true);
    try {
      if (type === "invite") {
        await trpc.auth.consumeInvite.mutate({ token, password });
      } else {
        await trpc.auth.consumePasswordReset.mutate({ token, password });
      }
      router.push("/auth/signin?success=password-set");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setFormError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  if (tokenError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Link unavailable</CardTitle>
          <CardDescription>{tokenError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/auth/forgot-password"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Request a new link
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (!email) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <DynamicIcon name="Loader2" className="animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const title = type === "invite" ? "Welcome — set your password" : "Reset your password";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>
          Account: <strong>{email}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                required
                minLength={12}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <DynamicIcon name={showPassword ? "EyeOff" : "Eye"} className="h-4 w-4" />
              </button>
            </div>
            {strength && (
              <p className={`text-xs ${strength.level === "strong" ? "text-green-600" : strength.level === "fair" ? "text-yellow-600" : "text-muted-foreground"}`}>
                Strength: {strength.level}
                {!strength.ok && ` — ${strength.message}`}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isLoading || !password || !confirm}>
            {isLoading ? (
              <>
                <DynamicIcon name="Loader2" className="animate-spin" />
                Setting password…
              </>
            ) : (
              "Set password"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
