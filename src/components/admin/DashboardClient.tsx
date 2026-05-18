"use client";

import { useState, useEffect } from "react";
import { trpcReact } from "@/lib/trpc/react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import { statusBadgeClass } from "@/lib/activationStatus";
import type { ActivationStatus } from "@prisma/client";

interface Props {
  activationId: string;
  activationName: string;
  status: ActivationStatus;
  endsAt: string;
}

function formatTimeRemaining(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? ` · ${h}h ${m}m left` : ` · ${m}m left`;
}

function KpiTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="flex-1 rounded-md border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-4xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

export function DashboardClient({
  activationId,
  activationName,
  status,
  endsAt,
}: Props) {
  const { data, dataUpdatedAt } = trpcReact.registration.dashboardStats.useQuery(
    { activationId },
    { refetchInterval: 30_000 }
  );

  const [secondsSince, setSecondsSince] = useState(0);
  // Reset the counter as soon as a fresh query result arrives. React 19
  // disallows the equivalent setState-in-effect (cascading renders); doing
  // it during render with a "last seen" guard is the recommended pattern.
  const [lastUpdate, setLastUpdate] = useState(dataUpdatedAt);
  if (dataUpdatedAt !== lastUpdate) {
    setLastUpdate(dataUpdatedAt);
    setSecondsSince(0);
  }
  useEffect(() => {
    if (!dataUpdatedAt) return;
    const id = setInterval(() => {
      setSecondsSince(Math.floor((Date.now() - dataUpdatedAt) / 1_000));
    }, 1_000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

  const maxBoothCount = data ? Math.max(...data.booths.map((b) => b.count), 1) : 1;
  const maxUtmCount = data?.utmBreakdown?.length
    ? Math.max(...data.utmBreakdown.map((u) => u.count), 1)
    : 1;

  return (
    <div className="space-y-6">
      {/* Header — title and status badge wrap onto separate lines on mobile
          so a long activation name + LIVE counter don't get squished together. */}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Dashboard · {status}
          </p>
          <h2 className="text-2xl font-semibold">{activationName}</h2>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={statusBadgeClass(status)}>
            {status === "LIVE"
              ? `● LIVE${formatTimeRemaining(endsAt)}`
              : status}
          </Badge>
        </div>
      </div>

      {/* Live freshness indicator — kept on its own row so its width changes
          (1s → 10s → 100s) don't shift the header buttons next to it. */}
      {dataUpdatedAt > 0 && (
        <div className="flex justify-end">
          <span
            className="text-xs text-muted-foreground tabular-nums"
            aria-live="polite"
          >
            Updated {secondsSince}s ago
          </span>
        </div>
      )}

      {/* Test-exclusion disclosure. Counters here (verified, pending, scans,
          sparkline, booth/UTM breakdowns) all exclude admin-flagged test
          rows; surfacing the count makes the omission visible to anyone
          looking at the dashboard. Hidden when no test rows exist. */}
      {data && data.testCount > 0 && (
        <div
          className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
          role="note"
        >
          <DynamicIcon name="FlaskConical" className="h-3.5 w-3.5 shrink-0" />
          <span>
            {data.testCount} test {data.testCount === 1 ? "entry" : "entries"} excluded
            from these counts, the CSV export, and the winner picker.
          </span>
        </div>
      )}

      {/* KPI tiles — 2-up on mobile, 4-up on sm+ so values stay readable */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Verified"
          value={data?.verified ?? "—"}
          sub={data ? `+${data.recentVerified} last 5m` : "loading…"}
        />
        <KpiTile
          label="Pending"
          value={data?.pending ?? "—"}
          sub={
            data?.avgVerifySeconds != null
              ? `avg ${data.avgVerifySeconds}s to verify`
              : "no data yet"
          }
        />
        <KpiTile
          label="Scans"
          value={data?.scans ?? "—"}
          sub={
            data
              ? `across ${data.boothCount} booth${data.boothCount !== 1 ? "s" : ""}`
              : "loading…"
          }
        />
        <KpiTile
          label="Drop-off"
          value={data?.dropOffPct != null ? `${data.dropOffPct}%` : "—"}
          sub="scan→verify"
        />
      </div>

      {/* Charts row — stacked on mobile/tablet, side-by-side on lg+ where the
          sparkline has enough width to render axis labels without overlap. */}
      <div className="flex flex-col gap-3 lg:flex-row">
        {/* Sparkline */}
        <div className="rounded-md border p-4 lg:flex-[2]">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Verifications · last 60m
          </p>
          {data ? (
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart
                data={data.sparkline}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="accentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  interval={9}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--card-foreground)",
                  }}
                  formatter={(value) => [value, "verifications"]}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  fill="url(#accentGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[100px] animate-pulse rounded bg-muted/40" />
          )}
        </div>

        {/* Per-booth bars */}
        <div className="rounded-md border p-4 lg:flex-1">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            By booth
          </p>
          {data ? (
            data.booths.length > 0 ? (
              <div className="flex flex-col gap-2">
                {data.booths.map((b) => (
                  <div key={b.code} className="flex items-center gap-2">
                    <span className="w-20 truncate font-mono text-xs text-muted-foreground">
                      {b.code}
                    </span>
                    <div className="flex-1 h-2 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full rounded bg-accent"
                        style={{ width: `${(b.count / maxBoothCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-7 text-right font-mono text-xs tabular-nums">
                      {b.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No booth scans yet.</p>
            )
          ) : (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-muted/40" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* UTM source breakdown */}
      <div className="rounded-md border p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          By UTM source (verified)
        </p>
        {data ? (
          data.utmBreakdown && data.utmBreakdown.length > 0 ? (
            <div className="flex flex-col gap-2">
              {data.utmBreakdown.map((u, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-28 truncate text-xs text-muted-foreground">
                    {u.source ?? "(no source)"}
                  </span>
                  <div className="flex-1 h-2 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded bg-accent"
                      style={{ width: `${(u.count / maxUtmCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-7 text-right font-mono text-xs tabular-nums">
                    {u.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No verified registrations yet.</p>
          )
        ) : (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-muted/40" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
