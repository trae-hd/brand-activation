import { requireRole } from "@/lib/auth/requireRole";
import { AdminShell } from "@/components/shared/layouts/AdminShell";

const ARTICLES = [
  { category: "Getting started", count: 8, headline: "Build your first activation in 5 min" },
  { category: "Builder", count: 12, headline: "Geofencing · throttling · OTP TTL" },
  { category: "Compliance", count: 6, headline: "GDPR · DSAR · erasure flow" },
  { category: "Admin", count: 5, headline: "Inviting your team · roles · 2FA" },
  { category: "Branding", count: 4, headline: "Brand defaults vs activation overrides" },
  { category: "Integrations", count: 3, headline: "Slack alerts · webhooks · API keys" },
] as const;

export default async function HelpPage() {
  await requireRole("ANY");

  return (
    <AdminShell>
      <div className="space-y-8">
        {/* Hero + search */}
        <div className="mx-auto max-w-2xl text-center space-y-4">
          <h1 className="text-4xl font-bold">How can we help?</h1>
          <p className="text-sm text-muted-foreground">
            Most answers live in the docs — try a search.
          </p>
          <div className="flex items-center gap-3 rounded-md border bg-background px-4 py-3 text-sm text-muted-foreground">
            <span className="text-lg" aria-hidden="true">🔍</span>
            <span className="flex-1 text-left">How do I publish an activation?</span>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">⌘K</kbd>
          </div>
        </div>

        {/* Article cards */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Popular
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ARTICLES.map((a) => (
              <div
                key={a.category}
                className="rounded-md border p-4 space-y-1 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {a.category} · {a.count} articles
                </p>
                <p className="text-sm font-medium">{a.headline}</p>
                <p className="text-xs" style={{ color: "var(--accent)" }}>
                  Read →
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Email support */}
        <div className="rounded-md border p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">✉</span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Email support</p>
              <p className="text-xs text-muted-foreground">
                live-support@mrq.com · reply within 1 business day
              </p>
            </div>
            <a
              href="mailto:live-support@mrq.com"
              className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 transition-opacity"
            >
              Compose →
            </a>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
