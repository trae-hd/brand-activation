"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import { cn } from "@/lib/utils";
import type { BoothRow } from "@/types/activation";
import { SectionLabel } from "./form-section";
import { BoothQrButton } from "@/components/shared/BoothQrButton";

interface Props {
  mode: "create" | "edit";
  activationId?: string;
  booths: BoothRow[];
  onBoothsChange: (booths: BoothRow[]) => void;
}

export function ActivationFormBooths({ mode, activationId, booths, onBoothsChange }: Props) {
  const [newBoothCode, setNewBoothCode] = useState("");
  const [newBoothLabel, setNewBoothLabel] = useState("");
  const [boothError, setBoothError] = useState<string | null>(null);

  async function handleAddBooth() {
    setBoothError(null);
    const code = newBoothCode.trim().toUpperCase();
    const label = newBoothLabel.trim();
    if (!code || !label) {
      setBoothError("Both code and label are required.");
      return;
    }
    try {
      const result = await trpc.booth.add.mutate({ activationId: activationId!, code, label });
      onBoothsChange([...booths, { id: result.id, code, label, scanCount: 0 }]);
      setNewBoothCode("");
      setNewBoothLabel("");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to add booth.";
      setBoothError(msg);
    }
  }

  async function handleRemoveBooth(boothId: string) {
    try {
      await trpc.booth.remove.mutate({ boothId });
      onBoothsChange(booths.filter((b) => b.id !== boothId));
    } catch {
      // Keep in list on error.
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <SectionLabel>Booths</SectionLabel>
        {mode === "edit" && activationId && booths.length > 0 && (
          <a
            href={`/api/admin/activations/${activationId}/qr-zip`}
            download
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Download all QRs (zip)
          </a>
        )}
      </div>
      {mode === "create" ? (
        <div className="border-muted-foreground/20 text-muted-foreground rounded-md border-2 border-dashed px-4 py-8 text-center text-sm">
          Save the activation first to manage booths.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          {booths.length === 0 ? (
            <p className="text-muted-foreground px-4 py-5 text-sm">No booths yet.</p>
          ) : (
            <div>
              {booths.map((b, i) => (
                <div
                  key={b.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5",
                    i < booths.length - 1 && "border-b border-dashed",
                  )}
                >
                  <span className="font-mono text-sm font-medium">{b.code}</span>
                  <span className="text-muted-foreground flex-1 text-sm">{b.label}</span>
                  {b.scanCount !== undefined && (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {b.scanCount} scans
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <BoothQrButton
                      activationId={activationId!}
                      boothCode={b.code}
                      label="QR ↓"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive h-7 w-7 p-0"
                      onClick={() => handleRemoveBooth(b.id)}
                      aria-label={`Remove booth ${b.code}`}
                    >
                      <DynamicIcon name="Trash2" className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="bg-muted/20 border-t p-3">
            <div className="flex gap-2">
              <Input
                value={newBoothCode}
                onChange={(e) => setNewBoothCode(e.target.value.toUpperCase())}
                placeholder="CODE"
                className="h-8 w-28 font-mono text-xs"
                aria-label="New booth code"
              />
              <Input
                value={newBoothLabel}
                onChange={(e) => setNewBoothLabel(e.target.value)}
                placeholder="Label"
                className="h-8 flex-1 text-xs"
                aria-label="New booth label"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddBooth}
                className="h-8 shrink-0 text-xs"
              >
                + Add booth
              </Button>
            </div>
            {boothError && (
              <p className="text-destructive mt-1.5 text-xs" role="alert">
                {boothError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
