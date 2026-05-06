"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "./form-section";
import { trpcReact } from "@/lib/trpc/react";

interface Props {
  slug: string;
  activationId?: string;
  participantBaseUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  onUtmChange: (field: "utmSource" | "utmMedium" | "utmCampaign", value: string) => void;
}

export function ActivationFormUtm({ slug, activationId, participantBaseUrl, utmSource, utmMedium, utmCampaign, onUtmChange }: Props) {
  const [utmCopied, setUtmCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const utils = trpcReact.useUtils();

  const utmUrl = (() => {
    if (!slug) return "";
    const params = new URLSearchParams();
    if (utmSource.trim()) params.set("utm_source", utmSource.trim());
    if (utmMedium.trim()) params.set("utm_medium", utmMedium.trim());
    if (utmCampaign.trim()) params.set("utm_campaign", utmCampaign.trim());
    const qs = params.toString();
    const base = participantBaseUrl.replace(/\/$/, "");
    return `${base}/${slug}${qs ? `?${qs}` : ""}`;
  })();

  async function handleCopy() {
    if (!utmUrl) return;
    await navigator.clipboard.writeText(utmUrl);
    setUtmCopied(true);
    setTimeout(() => setUtmCopied(false), 2000);
  }

  async function handleDownloadQr() {
    if (!activationId || isDownloading) return;
    setIsDownloading(true);
    try {
      const { filename, base64 } = await utils.activation.getCampaignQrPng.fetch({
        activationId,
        utmSource: utmSource.trim() || undefined,
        utmMedium: utmMedium.trim() || undefined,
        utmCampaign: utmCampaign.trim() || undefined,
      });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "image/png" });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>UTM tracking</SectionLabel>
      <p className="text-muted-foreground text-xs">
        UTM parameters are captured automatically from the registration page URL — no extra setup
        needed. Use the builder below to create a tracked link for each campaign channel.
      </p>
      <div className="rounded-md border bg-muted/5 p-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Source", value: utmSource, onChange: (v: string) => onUtmChange("utmSource", v), placeholder: "email" },
            { label: "Medium", value: utmMedium, onChange: (v: string) => onUtmChange("utmMedium", v), placeholder: "newsletter" },
            { label: "Campaign", value: utmCampaign, onChange: (v: string) => onUtmChange("utmCampaign", v), placeholder: "boxing_2026" },
          ].map(({ label, value, onChange, placeholder }) => (
            <div key={label} className="flex flex-col gap-1">
              <label className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
                {label}
              </label>
              <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-7 text-xs"
              />
            </div>
          ))}
        </div>
        {slug && (
          <div className="mt-2 flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
            <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[10px]">
              {utmUrl}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground shrink-0 text-xs transition-colors"
            >
              {utmCopied ? "Copied ✓" : "Copy"}
            </button>
            {activationId && (
              <button
                type="button"
                onClick={handleDownloadQr}
                disabled={isDownloading}
                className="text-muted-foreground hover:text-foreground shrink-0 text-xs transition-colors disabled:opacity-50"
              >
                {isDownloading ? "…" : "QR ↓"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
