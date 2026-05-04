"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { trpcReact } from "@/lib/trpc/react";

type FeedbackType = "Bug" | "Idea" | "Pain" | "Praise";

const TYPES: { value: FeedbackType; label: string }[] = [
  { value: "Bug", label: "🐛 Bug" },
  { value: "Idea", label: "💡 Idea" },
  { value: "Pain", label: "😤 Pain" },
  { value: "Praise", label: "🙌 Praise" },
];

export function FeedbackClient() {
  const [type, setType] = useState<FeedbackType>("Bug");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<number | null>(null);
  const [attachContext, setAttachContext] = useState(true);
  const [dropHighlight, setDropHighlight] = useState(false);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const submit = trpcReact.feedback.submit.useMutation({
    onSuccess(data) {
      setIssueUrl(data.issueUrl);
    },
  });

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && severity !== null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || submit.isPending || !severity) return;
    submit.mutate({ type, subject, body, severity, attachContext });
  }

  function handleReset() {
    setType("Bug");
    setSubject("");
    setBody("");
    setSeverity(null);
    setAttachContext(true);
    setIssueUrl(null);
    submit.reset();
  }

  if (submit.isSuccess) {
    return (
      <div className="max-w-xl space-y-4">
        <div className="rounded-md border p-6 text-center space-y-2">
          <p className="text-2xl">🙏</p>
          <p className="font-semibold">Thanks — feedback received.</p>
          <p className="text-sm text-muted-foreground">
            {severity !== null && severity >= 4
              ? "A Linear ticket has been raised automatically."
              : "It's been shared with the team."}
          </p>
          {issueUrl && (
            <a
              href={issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs underline text-muted-foreground"
            >
              View ticket →
            </a>
          )}
          <Button variant="outline" size="sm" className="mt-2 block mx-auto" onClick={handleReset}>
            Send another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Got something to say?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bugs, gripes, "wouldn't it be cool if…" — all welcome. Goes straight to the team.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Type */}
        <div className="space-y-2">
          <Label>Type</Label>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={
                  type === t.value
                    ? "rounded-md border bg-foreground px-3 py-1.5 text-sm text-background"
                    : "rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Subject */}
        <div className="space-y-1.5">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="OTP email took 4 minutes at the booth tonight"
            required
          />
        </div>

        {/* Body */}
        <div className="space-y-1.5">
          <Label htmlFor="body">What happened?</Label>
          <Textarea
            id="body"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe the issue, idea, or experience…"
            required
          />
        </div>

        {/* Severity */}
        <div className="space-y-2">
          <Label>Severity</Label>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSeverity(n)}
                className="flex h-9 w-9 items-center justify-center rounded-md border text-sm font-medium transition-colors"
                style={{
                  background: severity === n ? "#fef4a8" : undefined,
                  borderColor: severity === n ? "var(--accent)" : undefined,
                }}
              >
                {n}
              </button>
            ))}
            <span className="text-xs text-muted-foreground">1 = nit · 5 = on fire</span>
          </div>
        </div>

        {/* Screenshot drop zone (display only — no upload endpoint yet) */}
        <div className="space-y-1.5">
          <Label>Screenshot (optional)</Label>
          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setDropHighlight(true); }}
            onDragLeave={() => setDropHighlight(false)}
            onDrop={(e) => { e.preventDefault(); setDropHighlight(false); }}
            className={`rounded-md border border-dashed p-6 text-center transition-colors ${
              dropHighlight ? "border-foreground bg-muted/30" : "border-border"
            }`}
          >
            <p className="text-sm text-muted-foreground">Drop a screenshot or paste from clipboard</p>
            <p className="mt-1 text-xs text-muted-foreground">PNG · JPG · 5 MB</p>
          </div>
        </div>

        {/* Attach context */}
        <div className="flex items-start gap-2">
          <Checkbox
            id="attach-context"
            checked={attachContext}
            onCheckedChange={(v) => setAttachContext(!!v)}
          />
          <label htmlFor="attach-context" className="text-sm leading-snug">
            Attach context: my email + URL + browser. Helps us debug.
          </label>
        </div>

        {submit.error && (
          <p className="text-sm text-destructive">{submit.error.message}</p>
        )}

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Posts to <span className="underline">#mrq-live-feedback</span> · auto-creates Linear ticket if SEV ≥ 4
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleReset}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSend || submit.isPending}>
              {submit.isPending ? "Sending…" : "Send feedback →"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
