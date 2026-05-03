"use client";
import { useState, useEffect, useCallback, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { OtpInput } from "@/components/participant/OtpInput";

const MAX_ATTEMPTS = 5;

export default function VerifyPage() {
  const { activationSlug } = useParams<{ activationSlug: string }>();
  const router = useRouter();

  const [otp, setOtp] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [offline, setOffline] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [isPending, start] = useTransition();

  const doVerify = useCallback(
    async (code: string, tok: string, att: number) => {
      setError(null);
      try {
        const res = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pendingToken: tok, otp: code }),
        });
        if (res.ok) {
          sessionStorage.removeItem(`mrq:pendingToken:${activationSlug}`);
          router.replace(`/${activationSlug}/success`);
          return;
        }
        const next = att + 1;
        setAttempts(next);
        if (next >= MAX_ATTEMPTS) {
          router.replace(`/${activationSlug}/expired`);
          return;
        }
        setError(
          `Incorrect code — ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next === 1 ? "" : "s"} remaining.`
        );
        setOtp("");
      } catch {
        setError("Network error. Please try again.");
      }
    },
    [activationSlug, router]
  );

  // Fire queued submit when connection returns.
  useEffect(() => {
    if (!offline && pendingSubmit && token && otp.length === 6 && !isPending) {
      setPendingSubmit(false);
      start(() => doVerify(otp, token, attempts));
    }
  }, [offline, pendingSubmit, token, otp, attempts, isPending, doVerify, start]);

  useEffect(() => {
    const stored = sessionStorage.getItem(`mrq:pendingToken:${activationSlug}`);
    if (!stored) {
      router.replace(`/${activationSlug}`);
      return;
    }
    setToken(stored);
    setOffline(!navigator.onLine);

    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [activationSlug, router]);

  function handleSubmit() {
    if (!token || otp.length !== 6 || isPending) return;
    if (!navigator.onLine) {
      setPendingSubmit(true);
      setOffline(true);
      return;
    }
    start(() => doVerify(otp, token, attempts));
  }

  // Auto-submit once all 6 digits are entered.
  useEffect(() => {
    if (otp.length === 6 && token && !isPending && !pendingSubmit) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  return (
    <main className="mx-auto max-w-md p-4 text-center">
      <h1 className="text-2xl font-semibold">Check your email</h1>
      <p className="mt-2 text-muted-foreground">
        We&apos;ve sent a six-digit code. Enter it below.
      </p>

      {offline && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You appear to be offline — your code will be submitted when you reconnect.
        </div>
      )}

      <div className="mt-6 flex flex-col items-center gap-4">
        <OtpInput value={otp} onChange={setOtp} disabled={isPending} />

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        <button
          type="button"
          disabled={otp.length !== 6 || isPending || offline}
          onClick={handleSubmit}
          className="rounded-md bg-primary px-6 py-2.5 text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Verifying…" : "Verify"}
        </button>
      </div>
    </main>
  );
}
