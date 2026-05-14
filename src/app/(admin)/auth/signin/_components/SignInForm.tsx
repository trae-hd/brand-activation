"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DynamicIcon } from "@/components/ui/DynamicIcon";

interface SignInFormProps {
  callbackUrl: string;
}

export function SignInForm({ callbackUrl }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [isSsoLoading, setIsSsoLoading] = useState(false);

  async function handlePasswordSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);
    setIsPasswordLoading(true);

    const result = await signIn("password", {
      email: email.trim().toLowerCase(),
      password,
      callbackUrl,
      redirect: false,
    });

    setIsPasswordLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }

    if (result?.ok) {
      window.location.href = callbackUrl;
    }
  }

  async function handleSsoSignIn() {
    setIsSsoLoading(true);
    await signIn("auth0", { callbackUrl });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-6">
        <div className="text-center">
          <div className="text-3xl font-bold tracking-tight">HQ</div>
          <div className="text-muted-foreground text-xs font-medium">
            MrQ Activation · Admin
          </div>
        </div>

        <Button
          type="button"
          className="w-full"
          onClick={handleSsoSignIn}
          disabled={isSsoLoading}
        >
          {isSsoLoading ? (
            <DynamicIcon name="Loader2" className="mr-2 animate-spin" />
          ) : (
            <DynamicIcon name="KeyRound" className="mr-2 h-4 w-4" />
          )}
          Continue with MrQ SSO
        </Button>

        <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
          <span className="bg-card text-muted-foreground relative z-10 px-2">or</span>
        </div>

        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@mrq.com"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center px-3"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <DynamicIcon name={showPassword ? "EyeOff" : "Eye"} className="h-4 w-4" />
              </button>
            </div>
          </div>

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between">
            <Link
              href="/auth/forgot-password"
              className="text-muted-foreground text-sm underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={isPasswordLoading}
            >
              {isPasswordLoading ? (
                <DynamicIcon name="Loader2" className="animate-spin" />
              ) : (
                "Sign in"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
