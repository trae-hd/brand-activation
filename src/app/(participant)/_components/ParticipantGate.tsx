/**
 * Empty/landing state served at:
 *   - activation.mrq.com/                 → variant="root"        (via proxy rewrite to /welcome)
 *   - activation.mrq.com/<unknown-slug>   → variant="not-found"   (via [activationSlug]/not-found.tsx)
 *
 * Calm, type-led page. Static — no state beyond the prop. No marketing,
 * no forms, no images, no DB calls. Brand-light by design (multi-tenant host).
 */

type Variant = "root" | "not-found";

interface ParticipantGateProps {
  variant: Variant;
}

const HEADLINES: Record<Variant, string> = {
  root: "You need an event link to take part",
  "not-found": "We couldn’t find that activation",
};

/** Minimal geometric mark — a stacked square + circle. The lone accent on the page. */
function Mark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3.5" y="3.5" width="9" height="9" rx="0.5" />
      <circle cx="16" cy="16" r="4.5" />
    </svg>
  );
}

export function ParticipantGate({ variant }: ParticipantGateProps) {
  const headline = HEADLINES[variant];
  return (
    <main
      role="main"
      className="min-h-[100dvh] w-full bg-zinc-950 text-zinc-50 antialiased flex flex-col"
    >
      {/* Wordmark + mark — top-left, small */}
      <header className="px-6 pt-6 sm:px-8 sm:pt-8">
        <div className="flex items-center gap-2.5">
          <Mark className="h-5 w-5 text-indigo-400" />
          <span className="text-[13px] font-medium tracking-tight text-zinc-200">
            MrQ <span className="text-zinc-500">Live</span>
          </span>
        </div>
      </header>

      {/* Centered content */}
      <section className="flex-1 flex items-center justify-center px-6 sm:px-8">
        <div className="w-full max-w-sm sm:max-w-md text-left sm:text-center">
          <h1 className="text-balance text-[28px] leading-[1.15] sm:text-3xl font-semibold tracking-tight text-zinc-50">
            {headline}
          </h1>
          <p className="mt-4 text-pretty text-[15px] leading-relaxed text-zinc-400">
            Your event organiser will provide a QR code or link. Scan or tap that to register.
          </p>
        </div>
      </section>

      {/* Footer — discreet contact */}
      <footer className="px-6 pb-8 sm:px-8 sm:pb-10">
        <p className="text-[12px] text-zinc-500">
          Need help?{" "}
          <a
            href="mailto:hello@mrqlive.com"
            className="text-zinc-300 underline decoration-zinc-700 underline-offset-4 hover:decoration-zinc-400 transition-colors"
          >
            hello@mrqlive.com
          </a>
        </p>
      </footer>
    </main>
  );
}
