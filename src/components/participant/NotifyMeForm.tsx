"use client";
import { useState } from "react";

export function NotifyMeForm() {
  const [email, setEmail] = useState("");
  const [notified, setNotified] = useState(false);

  if (notified) {
    return (
      <p className="py-2 text-center text-sm text-ink-3">
        Thanks, we&apos;ll let you know.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="block w-full rounded-md border border-border px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={!email}
        onClick={() => setNotified(true)}
        className="w-full rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
      >
        Notify me
      </button>
    </div>
  );
}
