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
import { statusBadgeClass } from "@/lib/activationStatus";
import type { ActivationStatus, AdminRole } from "@prisma/client";
import { PickWinnersButton } from "./winner/PickWinnersButton";

interface Props {
  activationId: string;
  activationName: string;
  status: ActivationStatus;
  endsAt: string;
  userRole: AdminRole;
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
  userRole,
}: Props) {
  const { data, dataUpdatedAt } = trpcReact.registration.dashboardStats.useQuery(
    { activationId },
    { refetchInterval: 30_000 }
  );

  const [secondsSince, setSecondsSince] = useState(0);
  useEffect(() => {
    if (!dataUpdatedAt) return;
    setSecondsSince(0);
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
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Dashboard · {status}
          </p>
          <h2 className="text-2xl font-semibold">{activationName}</h2>
        </div>
        <div className="flex items-center gap-3">
          <PickWinnersButton
            activationId={activationId}
            activationStatus={status}
            userRole={userRole}
          />
          <a
            href={`/api/admin/registrations/export?activationId=${activationId}`}
            download
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Download CSV
          </a>
          <Badge className={statusBadgeClass(status)}>
            {status === "LIVE"
              ? `● LIVE${formatTimeRemaining(endsAt)}`
              : status}
          </Badge>
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-muted-foreground">
              Updated {secondsSince}s ago
            </span>
          )}
        </div>
      </div>

      {/* KPI tiles */}
      <div className="flex gap-3">
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

      {/* Charts row */}
      <div className="flex gap-3">
        {/* Sparkline */}
        <div className="flex-[2] rounded-md border p-4">
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
        <div className="flex-1 rounded-md border p-4">
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
