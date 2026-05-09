"use client";
import { useState, useEffect, useCallback, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { OtpInput } from "@/components/participant/OtpInput";
import { OTP_TTL_SECONDS } from "@/lib/otp/constants";

const MAX_ATTEMPTS = 5;

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function VerifyPage() {
  const { activationSlug } = useParams<{ activationSlug: string }>();
  const router = useRouter();
  const [isPending, start] = useTransition();

  // Read all required session data once on mount via lazy initialiser — no setState in effect.
  const [session] = useState<{
    token: string | null;
    activationId: string | null;
    email: string | null;
    consentVersion: string | null;
  }>(() => {
    if (typeof window === "undefined") {
      return { token: null, activationId: null, email: null, consentVersion: null };
    }
    return {
      token: sessionStorage.getItem(`mrq:pendingToken:${activationSlug}`),
      activationId: sessionStorage.getItem(`mrq:activationId:${activationSlug}`),
      email: sessionStorage.getItem(`mrq:email:${activationSlug}`),
      consentVersion: sessionStorage.getItem(`mrq:consentVersion:${activationSlug}`),
    };
  });

  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SECONDS);
  const [offline, setOffline] = useState(() =>
    typeof window !== "undefined" ? !navigator.onLine : false
  );
  const [isResending, setIsResending] = useState(false);

  // Redirect to landing if no token.
  useEffect(() => {
    if (!session.token) router.replace(`/${activationSlug}`);
  }, [session.token, activationSlug, router]);

  // Online/offline listener — subscribes to browser events (legitimate effect).
  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Countdown — subscribes to timer (legitimate effect).
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const expired = secondsLeft <= 0;
  const inputDisabled = isPending || expired || offline;

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
          const data = await res.json() as { ok: boolean; entryCode?: string };
          sessionStorage.removeItem(`mrq:pendingToken:${activationSlug}`);
          if (data.entryCode) {
            sessionStorage.setItem(`mrq:entryCode:${activationSlug}`, data.entryCode);
          }
          router.replace(`/${activationSlug}/success`);
          return;
        }
        const next = att + 1;
        setAttempts(next);
        if (next >= MAX_ATTEMPTS) {
          router.replace(
            `/${activationSlug}/expired?email=${encodeURIComponent(session.email ?? "")}`
          );
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
    [activationSlug, router, session.email]
  );

  // Auto-submit via onChange — avoids setState-in-effect entirely.
  const handleOtpChange = useCallback(
    (value: string) => {
      setOtp(value);
      if (value.length === 6 && session.token && !isPending && !expired && !offline) {
        start(() => doVerify(value, session.token!, attempts));
      }
    },
    [session.token, isPending, expired, offline, attempts, doVerify, start]
  );

  const handleVerify = () => {
    if (!session.token || otp.length !== 6 || inputDisabled) return;
    start(() => doVerify(otp, session.token!, attempts));
  };

  const handleResend = async () => {
    const { activationId, email, consentVersion } = session;
    if (isResending || !activationId || !email || !consentVersion) return;
    setIsResending(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activationId, email, consentVersion }),
      });
      if (res.ok) {
        const { pendingToken } = (await res.json()) as { pendingToken: string };
        sessionStorage.setItem(`mrq:pendingToken:${activationSlug}`, pendingToken);
        setSecondsLeft(OTP_TTL_SECONDS);
        setOtp("");
        setError(null);
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col px-5 pb-8 pt-8">
      {offline && (
        <div className="mb-4 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-ink-3">
          You appear to be offline — your code will be submitted when you reconnect.
        </div>
      )}

      <div className="pt-6 text-center">
        <div className="font-mono text-5xl font-bold tabular-nums">
          {formatTime(Math.max(0, secondsLeft))}
        </div>
        <div className="mt-1 text-xs font-medium uppercase tracking-wider text-ink-3">
          code valid for
        </div>
      </div>

      {expired && (
        <p className="mt-4 text-center text-sm text-ink-3">
          Code expired —{" "}
          <a href={`/${activationSlug}`} className="underline">
            request a new one
          </a>
          .
        </p>
      )}

      <div className="mt-6 flex justify-center">
        <OtpInput value={otp} onChange={handleOtpChange} disabled={inputDisabled} />
      </div>

      {error && (
        <p className="mt-3 text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <p className="mt-4 text-center text-sm text-ink-3">
        Check your email — including spam.
        <br />
        Code is 6 digits.
      </p>

      <div className="mt-3 flex justify-center gap-4">
        <button
          type="button"
          onClick={handleResend}
          disabled={isResending || expired}
          className="text-sm text-primary underline disabled:opacity-50"
        >
          {isResending ? "Sending…" : "Resend"}
        </button>
        <a href={`/${activationSlug}`} className="text-sm text-ink-3">
          Wrong email?
        </a>
      </div>

      <button
        type="button"
        onClick={handleVerify}
        disabled={otp.length !== 6 || inputDisabled}
        className="mt-6 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {isPending ? "Verifying…" : "Verify"}
      </button>
    </main>
  );
}
