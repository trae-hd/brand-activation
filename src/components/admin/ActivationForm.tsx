"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { TiptapEditor } from "@/components/admin/TiptapEditor";
import { StatusTransitionDialog } from "@/components/admin/StatusTransitionDialog";
import { CONTENT_ALLOWLIST, CONSENT_ALLOWLIST } from "@/lib/tiptap/allowlists";
import { consentVersionOf } from "@/lib/tiptap/consentVersion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { ActivationStatus, AdminRole } from "@prisma/client";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

interface BoothRow {
  id: string;
  code: string;
  label: string;
}

export interface ActivationFormProps {
  mode: "create" | "edit";
  userRole?: AdminRole;
  initialData?: {
    id: string;
    name: string;
    slug: string;
    status: ActivationStatus;
    startsAt: Date;
    endsAt: Date;
    content: unknown;
    consentNotice: unknown;
    consentVersion: string;
    primaryColor: string | null;
    heroImageUrl: string | null;
    legalApproved: boolean;
    booths: BoothRow[];
  };
}

function statusVariant(status: ActivationStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "LIVE") return "default";
  if (status === "ENDED") return "destructive";
  if (status === "SCHEDULED") return "secondary";
  return "outline";
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ActivationForm({ mode, userRole, initialData }: ActivationFormProps) {
  const router = useRouter();
  const isAdmin = userRole === "ADMIN";

  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [startsAt, setStartsAt] = useState(
    initialData ? toDatetimeLocal(new Date(initialData.startsAt)) : ""
  );
  const [endsAt, setEndsAt] = useState(
    initialData ? toDatetimeLocal(new Date(initialData.endsAt)) : ""
  );
  const [content, setContent] = useState<unknown>(initialData?.content ?? EMPTY_DOC);
  const [consentNotice, setConsentNotice] = useState<unknown>(initialData?.consentNotice ?? EMPTY_DOC);
  const [primaryColor, setPrimaryColor] = useState(initialData?.primaryColor ?? "");
  const [heroImageUrl, setHeroImageUrl] = useState(initialData?.heroImageUrl ?? "");

  const savedConsentVersion = initialData?.consentVersion ?? "";
  const currentConsentVersion = consentVersionOf(consentNotice);
  const consentChanged = mode === "edit" && savedConsentVersion !== "" && currentConsentVersion !== savedConsentVersion;

  // Optimistic local state for legalApproved (syncs from DB on page refresh).
  const [legalApproved, setLegalApproved] = useState(initialData?.legalApproved ?? false);
  const [legalNotes, setLegalNotes] = useState("");
  const [isTogglingLegal, setIsTogglingLegal] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);

  // Status transition dialog.
  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<ActivationStatus>(
    initialData?.status ?? "DRAFT"
  );

  const [booths, setBooths] = useState<BoothRow[]>(initialData?.booths ?? []);
  const [newBoothCode, setNewBoothCode] = useState("");
  const [newBoothLabel, setNewBoothLabel] = useState("");
  const [boothError, setBoothError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleContentChange = useCallback((doc: unknown) => setContent(doc), []);
  const handleConsentChange = useCallback((doc: unknown) => setConsentNotice(doc), []);

  async function handleToggleLegal(approved: boolean) {
    setLegalError(null);
    setIsTogglingLegal(true);
    try {
      await trpc.activation.setLegalApproved.mutate({
        activationId: initialData!.id,
        approved,
        notes: legalNotes || undefined,
      });
      setLegalApproved(approved);
      if (!approved) setLegalNotes("");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to update legal approval.";
      setLegalError(msg);
    } finally {
      setIsTogglingLegal(false);
    }
  }

  function autoSlug(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  }

  async function handleSave() {
    setSaveError(null);
    setIsSaving(true);
    try {
      const payload = {
        name,
        slug,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        content: content as Record<string, unknown>,
        consentNotice: consentNotice as Record<string, unknown>,
        primaryColor: primaryColor || null,
        heroImageUrl: heroImageUrl || null,
      };

      if (mode === "create") {
        const result = await trpc.activation.create.mutate(payload);
        router.push(`/activations/${result.id}/edit`);
      } else {
        await trpc.activation.update.mutate({ id: initialData!.id, data: payload });
        router.refresh();
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Save failed. Please try again.";
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddBooth() {
    setBoothError(null);
    const code = newBoothCode.trim().toUpperCase();
    const label = newBoothLabel.trim();
    if (!code || !label) {
      setBoothError("Both code and label are required.");
      return;
    }
    try {
      const result = await trpc.booth.add.mutate({
        activationId: initialData!.id,
        code,
        label,
      });
      setBooths((prev) => [...prev, { id: result.id, code, label }]);
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
      setBooths((prev) => prev.filter((b) => b.id !== boothId));
    } catch {
      // Keep in list on error — user can retry.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {mode === "create" ? "New Activation" : name || "Edit Activation"}
          </h1>
          {initialData && (
            <Badge variant={statusVariant(currentStatus)}>{currentStatus}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {initialData && isAdmin && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setTransitionDialogOpen(true)}
            >
              Change status
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <DynamicIcon name="Loader2" className="animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>

      {saveError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {saveError}
        </p>
      )}

      {!legalApproved && mode === "edit" && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          Legal approval required before this activation can be scheduled.
        </p>
      )}

      {initialData && (
        <StatusTransitionDialog
          open={transitionDialogOpen}
          onOpenChange={setTransitionDialogOpen}
          activationId={initialData.id}
          currentStatus={currentStatus}
          legalApproved={legalApproved}
          startsAt={new Date(initialData.startsAt)}
          endsAt={new Date(initialData.endsAt)}
          onSuccess={(newStatus) => {
            setCurrentStatus(newStatus);
            router.refresh();
          }}
        />
      )}

      <Tabs defaultValue="header">
        <TabsList>
          <TabsTrigger value="header">Header</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="consent">
            Consent
            {consentChanged && (
              <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500" aria-label="changed" />
            )}
          </TabsTrigger>
          <TabsTrigger value="booths" disabled={mode === "create"}>
            Booths
          </TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
        </TabsList>

        {/* ── Header ── */}
        <TabsContent value="header" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (mode === "create") setSlug(autoSlug(e.target.value));
              }}
              placeholder="Summer 2026 Activation"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="summer-2026"
              required
            />
            <p className="text-xs text-muted-foreground">
              Used in the participant URL: <code>/{slug || "…"}</code>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startsAt">Starts at</Label>
              <Input
                id="startsAt"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endsAt">Ends at</Label>
              <Input
                id="endsAt"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Legal approval — ADMIN only, edit mode only */}
          {mode === "edit" && isAdmin && (
            <div className="flex flex-col gap-3 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Legal approval</p>
                  <p className="text-xs text-muted-foreground">
                    Required before this activation can be scheduled.
                  </p>
                </div>
                <Switch
                  checked={legalApproved}
                  onCheckedChange={handleToggleLegal}
                  disabled={isTogglingLegal}
                  aria-label="Toggle legal approval"
                />
              </div>
              {!legalApproved && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="legalNotes" className="text-xs">Approval notes (optional)</Label>
                  <Textarea
                    id="legalNotes"
                    value={legalNotes}
                    onChange={(e) => setLegalNotes(e.target.value)}
                    placeholder="Add notes for the record…"
                    rows={2}
                    maxLength={500}
                    className="text-sm"
                  />
                </div>
              )}
              {legalError && (
                <p className="text-xs text-destructive" role="alert">{legalError}</p>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Content ── */}
        <TabsContent value="content" className="mt-4">
          <div className="flex flex-col gap-2">
            <Label>Landing page content</Label>
            <TiptapEditor
              content={content}
              onChange={handleContentChange}
              allowlist={CONTENT_ALLOWLIST}
            />
          </div>
        </TabsContent>

        {/* ── Consent ── */}
        <TabsContent value="consent" className="mt-4 flex flex-col gap-3">
          {consentChanged && (
            <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              Consent notice changed — re-approval required before this activation can be scheduled.
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label>Consent notice</Label>
            <TiptapEditor
              content={consentNotice}
              onChange={handleConsentChange}
              allowlist={CONSENT_ALLOWLIST}
            />
          </div>
        </TabsContent>

        {/* ── Booths ── */}
        <TabsContent value="booths" className="mt-4 flex flex-col gap-4">
          {mode === "create" ? (
            <p className="text-sm text-muted-foreground">Save the activation first to manage booths.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {booths.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No booths yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {booths.map((b) => (
                      <li key={b.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="text-sm">
                          <span className="font-mono font-medium">{b.code}</span>
                          <span className="ml-2 text-muted-foreground">{b.label}</span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveBooth(b.id)}
                          aria-label={`Remove booth ${b.code}`}
                        >
                          <DynamicIcon name="Trash2" className="h-4 w-4 text-destructive" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-3 rounded-md border p-4">
                <p className="text-sm font-medium">Add booth</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="boothCode" className="text-xs">Code (uppercase)</Label>
                    <Input
                      id="boothCode"
                      value={newBoothCode}
                      onChange={(e) => setNewBoothCode(e.target.value.toUpperCase())}
                      placeholder="BOOTH-A"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="boothLabel" className="text-xs">Label</Label>
                    <Input
                      id="boothLabel"
                      value={newBoothLabel}
                      onChange={(e) => setNewBoothLabel(e.target.value)}
                      placeholder="Booth A"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                {boothError && (
                  <p className="text-xs text-destructive" role="alert">{boothError}</p>
                )}
                <Button type="button" size="sm" onClick={handleAddBooth} className="w-fit">
                  Add booth
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Branding ── */}
        <TabsContent value="branding" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="heroImageUrl">Hero image URL</Label>
            <Input
              id="heroImageUrl"
              type="url"
              value={heroImageUrl}
              onChange={(e) => setHeroImageUrl(e.target.value)}
              placeholder="https://cdn.example.com/hero.jpg"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="primaryColor">Primary colour</Label>
            <div className="flex items-center gap-2">
              <Input
                id="primaryColor"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#FF3366"
                className="max-w-[140px] font-mono"
                maxLength={7}
              />
              {primaryColor.match(/^#[0-9a-fA-F]{6}$/) && (
                <span
                  className="h-7 w-7 rounded-md border"
                  style={{ backgroundColor: primaryColor }}
                />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
