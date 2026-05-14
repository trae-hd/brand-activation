"use client";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { CharCount } from "@/components/ui/CharCount";
import { TiptapEditor } from "@/components/admin/TiptapEditor";
import { CONTENT_ALLOWLIST } from "@/lib/tiptap/allowlists";
import type { EmailFormState } from "@/types/activation";
import { SectionLabel, Rule } from "./form-section";
import { DynamicIcon } from "@/components/ui/DynamicIcon";

interface Props {
  value: EmailFormState;
  onChange: (next: EmailFormState) => void;
  onAnyChange: () => void;
  activationId?: string;
  mode: "create" | "edit";
}

export function ActivationEmailTab({ value, onChange, onAnyChange }: Props) {
  function set<K extends keyof EmailFormState>(key: K, val: EmailFormState[K]) {
    onChange({ ...value, [key]: val });
    onAnyChange();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Info banner */}
      <div className="flex items-start gap-2.5 rounded-md border bg-muted/20 px-3 py-2.5">
        <DynamicIcon name="Mail" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          This controls the email sent to participants after their code is verified. Leave any field
          blank to use the default copy.
        </p>
      </div>

      {/* ── Subject line ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>
          Subject line <CharCount value={value.emailSubject} max={200} />
        </SectionLabel>
        <Input
          value={value.emailSubject}
          onChange={(e) => set("emailSubject", e.target.value)}
          placeholder="Your entry code for {activation name}"
          maxLength={200}
          className="text-sm"
        />
        <p className="text-muted-foreground text-xs">
          Defaults to &ldquo;Your entry code for {"{activation name}"}&rdquo; if left blank.
        </p>
      </div>

      {/* ── Preheader ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>
          Preheader <CharCount value={value.emailPreheader} max={200} />
        </SectionLabel>
        <Input
          value={value.emailPreheader}
          onChange={(e) => set("emailPreheader", e.target.value)}
          placeholder="Your entry code for {activation name}: {code}. Keep this email."
          maxLength={200}
          className="text-sm"
        />
        <p className="text-muted-foreground text-xs">
          Preview text shown in inbox summaries before the email is opened. Defaults to a generated summary if left blank.
        </p>
      </div>

      {/* ── Heading ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>
          Heading <CharCount value={value.emailHeading} max={200} />
        </SectionLabel>
        <Input
          value={value.emailHeading}
          onChange={(e) => set("emailHeading", e.target.value)}
          placeholder="You're registered for {activation name}."
          maxLength={200}
          className="text-sm"
        />
        <p className="text-muted-foreground text-xs">
          Defaults to &ldquo;You&apos;re registered for {"{activation name}"}.&rdquo; if left blank.
        </p>
      </div>

      {/* ── Body copy ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>
          Body copy{" "}
          <span className="text-muted-foreground/60 tracking-normal normal-case">(optional)</span>
        </SectionLabel>
        <p className="text-muted-foreground text-xs mb-1">
          Appears between the heading and the entry code. Use it to add a personal message or instructions.
        </p>
        <TiptapEditor
          content={value.emailBodyContent}
          onChange={(v) => { set("emailBodyContent", v); }}
          allowlist={CONTENT_ALLOWLIST}
        />
      </div>

      {/* ── Entry code ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <SectionLabel>Entry code</SectionLabel>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Checkbox
            checked={value.emailShowEntryCode}
            onCheckedChange={(checked) => set("emailShowEntryCode", checked === true)}
          />
          <span className="text-sm">Include entry code in email</span>
        </label>
        {value.emailShowEntryCode && (
          <div className="ml-7 flex flex-col gap-1.5">
            <SectionLabel>
              Booth helper copy{" "}
              <span className="text-muted-foreground/60 tracking-normal normal-case">(optional)</span>{" "}
              <CharCount value={value.emailBodyCopy} max={300} />
            </SectionLabel>
            <Input
              value={value.emailBodyCopy}
              onChange={(e) => set("emailBodyCopy", e.target.value)}
              placeholder="Show this at the booth to claim your reward. Keep this email — it's the only place you'll find your code if you close the page."
              maxLength={300}
              className="text-sm"
            />
            <p className="text-muted-foreground text-xs">
              Shown below the entry code. Leave blank to use the default.
            </p>
          </div>
        )}
      </div>

      {/* ── End date line ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <SectionLabel>Additional details</SectionLabel>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Checkbox
            checked={value.emailShowEndDate}
            onCheckedChange={(checked) => set("emailShowEndDate", checked === true)}
          />
          <span className="text-sm">Show activation end date</span>
        </label>
        <p className="text-muted-foreground -mt-1 ml-7 text-xs">
          Adds &ldquo;The activation runs until {"{end date}"}.&rdquo; below the entry code.
        </p>
      </div>

      <Rule />

      {/* ── T&Cs ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>
          Terms &amp; conditions{" "}
          <span className="text-muted-foreground/60 tracking-normal normal-case">(optional)</span>
        </SectionLabel>
        <p className="text-muted-foreground text-xs mb-1">
          Appears in a tinted section just above the email footer. Leave empty to omit the T&amp;Cs block entirely.
        </p>
        <TiptapEditor
          content={value.emailTermsContent}
          onChange={(v) => { set("emailTermsContent", v); }}
          allowlist={CONTENT_ALLOWLIST}
        />
      </div>

      <Rule />

      {/* ── Footer ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>
          Footer <CharCount value={value.emailFooter} max={200} />
        </SectionLabel>
        <Input
          value={value.emailFooter}
          onChange={(e) => set("emailFooter", e.target.value)}
          placeholder="— The MrQ Activation team"
          maxLength={200}
          className="text-sm"
        />
        <p className="text-muted-foreground text-xs">
          Defaults to &ldquo;— The MrQ Activation team&rdquo; if left blank.
        </p>
      </div>
    </div>
  );
}
