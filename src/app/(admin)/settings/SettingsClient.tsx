"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { trpcReact } from "@/lib/trpc/react";
import { TIMEZONE_GROUPS } from "@/lib/i18n/timezones";
import type { WorkspaceSettingsOutput } from "@/server/trpc/routers/settings";

function fmtSaved(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  return `${mins} min ago`;
}

function WorkspaceTab({ role }: { role: "ADMIN" | "MEMBER" }) {
  const { data, isLoading, isError, error } = trpcReact.settings.get.useQuery();
  const update = trpcReact.settings.update.useMutation();
  const utils = trpcReact.useUtils();

  const [form, setForm] = useState<WorkspaceSettingsOutput | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  const isAdmin = role === "ADMIN";

  function set<K extends keyof WorkspaceSettingsOutput>(k: K, v: WorkspaceSettingsOutput[K]) {
    setForm((prev) => prev ? { ...prev, [k]: v } : prev);
    setDirty(true);
  }

  function handleDiscard() {
    if (data) setForm(data);
    setDirty(false);
  }

  async function handleSave() {
    if (!form || !isAdmin) return;
    await update.mutateAsync({
      workspaceName: form.workspaceName,
      timezone: form.timezone,
      otpTtlMin: form.otpTtlMin,
      geofence: form.geofence,
      dataRetentionDays: form.dataRetentionDays,
      require2fa: form.require2fa,
      sessionTimeoutHours: form.sessionTimeoutHours,
    });
    await utils.settings.get.invalidate();
    setSavedAt(new Date());
    setDirty(false);
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive">Failed to load workspace settings</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {error?.message ?? "An unexpected error occurred. A pending database migration may need to be applied."}
        </p>
      </div>
    );
  }

  if (!form) return null;

  if (!isAdmin) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">Admin access required to edit workspace settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        {/* Left column */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Workspace name</Label>
            <Input value={form.workspaceName} onChange={(e) => set("workspaceName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Default timezone</Label>
            <NativeSelect
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className="w-full"
            >
              {TIMEZONE_GROUPS.map((g) => (
                <NativeSelectOptGroup key={g.group} label={g.group}>
                  {g.options.map((tz) => (
                    <NativeSelectOption key={tz.value} value={tz.value}>
                      {tz.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label>Default OTP TTL (min)</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={form.otpTtlMin}
              onChange={(e) => set("otpTtlMin", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default geofence</Label>
            <Input
              value={form.geofence ?? ""}
              onChange={(e) => set("geofence", e.target.value || null)}
              placeholder="e.g. UK only · 5 ip per email per hour"
            />
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Data retention (days)</Label>
            <Input
              type="number"
              min={30}
              value={form.dataRetentionDays}
              onChange={(e) => set("dataRetentionDays", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Registrations auto-purged after this period — emails hashed to suppression.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Require 2FA for admins</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="require2fa"
                checked={form.require2fa}
                onCheckedChange={(v) => set("require2fa", !!v)}
              />
              <label htmlFor="require2fa" className="text-sm">Enforced</label>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Session timeout (hours)</Label>
            <Input
              type="number"
              min={1}
              max={168}
              value={form.sessionTimeoutHours}
              onChange={(e) => set("sessionTimeoutHours", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {update.error && (
        <p className="text-sm text-destructive">{update.error.message}</p>
      )}

      <div className="flex items-center justify-between border-t border-dashed pt-4">
        {savedAt && !dirty ? (
          <p className="text-xs text-muted-foreground">Saved · {fmtSaved(savedAt)}</p>
        ) : <span />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDiscard} disabled={!dirty}>
            Discard
          </Button>
          <Button onClick={handleSave} disabled={!dirty || update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { data: me } = trpcReact.user.me.useQuery();
  const updateProfile = trpcReact.user.updateProfile.useMutation();
  const utils = trpcReact.useUtils();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (me) {
      setName(me.name);
      setEmail(me.email);
    }
  }, [me]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const input: Parameters<typeof updateProfile.mutateAsync>[0] = {};
    if (name !== me?.name) input.name = name;
    if (email !== me?.email) input.email = email;
    if (currentPw && newPw) {
      input.currentPassword = currentPw;
      input.newPassword = newPw;
    }
    if (Object.keys(input).length === 0) return;
    await updateProfile.mutateAsync(input);
    await utils.user.me.invalidate();
    setSavedAt(new Date());
    setCurrentPw("");
    setNewPw("");
  }

  return (
    <form onSubmit={handleSave} className="max-w-md space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="profile-name">Name</Label>
        <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <hr className="border-border" />

      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Change password</p>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="current-pw">Current password</Label>
          <Input
            id="current-pw"
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-pw">New password</Label>
          <Input
            id="new-pw"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
            minLength={12}
          />
          <p className="text-xs text-muted-foreground">Minimum 12 characters.</p>
        </div>
      </div>

      {updateProfile.error && (
        <p className="text-sm text-destructive">{updateProfile.error.message}</p>
      )}

      <div className="flex items-center justify-between pt-2">
        {savedAt && !updateProfile.isPending ? (
          <p className="text-xs text-muted-foreground">Saved · {fmtSaved(savedAt)}</p>
        ) : <span />}
        <Button type="submit" disabled={updateProfile.isPending}>
          {updateProfile.isPending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}

function ComingSoonTab({ name }: { name: string }) {
  return (
    <div className="rounded-md border border-dashed p-10 text-center">
      <p className="text-sm font-medium">{name}</p>
      <p className="mt-1 text-xs text-muted-foreground">Coming soon.</p>
    </div>
  );
}

function AccessDeniedTab() {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-16 text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mb-3 h-8 w-8 text-muted-foreground/40"
      >
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <p className="text-sm font-medium">Admin access required</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        Contact your workspace admin if you need access to this section.
      </p>
    </div>
  );
}

const TABS = [
  { value: "profile", label: "Profile", adminOnly: false },
  { value: "workspace", label: "Workspace", adminOnly: true },
  { value: "brand-defaults", label: "Brand defaults", adminOnly: true },
  { value: "email-sender", label: "Email sender", adminOnly: true },
  { value: "integrations", label: "Integrations", adminOnly: true },
  { value: "danger-zone", label: "Danger zone", adminOnly: true },
] as const;

export function SettingsClient({ role }: { role: "ADMIN" | "MEMBER" }) {
  const isAdmin = role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">MrQ Activation · workspace</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="h-auto rounded-none border-b bg-transparent p-0 gap-0">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className={[
                "rounded-none border-b-2 border-transparent px-4 py-2 text-sm",
                "data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none",
                !isAdmin && t.adminOnly ? "text-muted-foreground/50" : "",
              ].join(" ")}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="pt-6">
          <TabsContent value="profile"><ProfileTab /></TabsContent>
          <TabsContent value="workspace">
            {isAdmin ? <WorkspaceTab role={role} /> : <AccessDeniedTab />}
          </TabsContent>
          <TabsContent value="brand-defaults">
            {isAdmin ? <ComingSoonTab name="Brand defaults" /> : <AccessDeniedTab />}
          </TabsContent>
          <TabsContent value="email-sender">
            {isAdmin ? <ComingSoonTab name="Email sender" /> : <AccessDeniedTab />}
          </TabsContent>
          <TabsContent value="integrations">
            {isAdmin ? <ComingSoonTab name="Integrations" /> : <AccessDeniedTab />}
          </TabsContent>
          <TabsContent value="danger-zone">
            {isAdmin ? <ComingSoonTab name="Danger zone" /> : <AccessDeniedTab />}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
