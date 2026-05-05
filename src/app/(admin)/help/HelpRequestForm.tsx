"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpcReact } from "@/lib/trpc/react";

type Priority = "urgent" | "high" | "medium" | "low";

const PRIORITIES: { value: Priority; label: string; hint: string }[] = [
  { value: "urgent", label: "Urgent", hint: "Blocking a live event" },
  { value: "high", label: "High", hint: "Same-day impact" },
  { value: "medium", label: "Medium", hint: "Needed soon" },
  { value: "low", label: "Low", hint: "When you can" },
];

export function HelpRequestForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [issueUrl, setIssueUrl] = useState<string | null>(null);

  const submit = trpcReact.help.submitRequest.useMutation({
    onSuccess(data) {
      setIssueUrl(data.issueUrl);
    },
  });

  const canSend = title.trim().length > 0 && description.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || submit.isPending) return;
    submit.mutate({ title: title.trim(), description: description.trim(), priority });
  }

  function handleReset() {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setIssueUrl(null);
    submit.reset();
  }

  if (submit.isSuccess) {
    return (
      <div className="rounded-md border p-6 text-center space-y-2">
        <p className="text-2xl" aria-hidden="true">✅</p>
        <p className="font-semibold">Request submitted.</p>
        <p className="text-sm text-muted-foreground">
          A ticket has been raised with the MarOps team — they&apos;ll be in touch.
        </p>
        {issueUrl && (
          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs underline text-muted-foreground"
          >
            View ticket in Linear →
          </a>
        )}
        <Button variant="outline" size="sm" className="mt-2 block mx-auto" onClick={handleReset}>
          Submit another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="help-title">Title</Label>
        <Input
          id="help-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. OTP emails not arriving at the venue"
          maxLength={200}
          required
        />
        {title.trim() && (
          <p className="text-xs text-muted-foreground font-mono">
            Activation Help Request - {title.trim()}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="help-description">Description</Label>
        <Textarea
          id="help-description"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the problem or what you need help with…"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Priority</Label>
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              className={
                priority === p.value
                  ? "rounded-md border bg-foreground px-3 py-1.5 text-sm text-background"
                  : "rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {p.label}
              <span className="ml-1.5 text-xs opacity-60">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {submit.error && (
        <p className="text-sm text-destructive">{submit.error.message}</p>
      )}

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-xs text-muted-foreground">
          Your name and email are attached automatically so MarOps can follow up.
        </p>
        <Button type="submit" disabled={!canSend || submit.isPending}>
          {submit.isPending ? "Submitting…" : "Submit request →"}
        </Button>
      </div>
    </form>
  );
}
