"use client";

import { useState } from "react";
import React from "react";

// ── Simple Tiptap JSON → React nodes ─────────────────────────────
function flatText(nodes: unknown[]): string {
  return nodes
    .map((n) => {
      const node = n as { type?: string; text?: string; content?: unknown[] };
      if (node.type === "text") return node.text ?? "";
      if (node.content) return flatText(node.content);
      return "";
    })
    .join("");
}

function renderInline(nodes: unknown[]): React.ReactNode {
  return nodes.map((n, i) => {
    const node = n as { type?: string; text?: string; marks?: Array<{ type: string }> };
    if (node.type !== "text") return null;
    let content: React.ReactNode = node.text ?? "";
    const marks = node.marks ?? [];
    if (marks.some((m) => m.type === "bold")) content = <strong key={i}>{content}</strong>;
    if (marks.some((m) => m.type === "italic")) content = <em key={i}>{content}</em>;
    if (marks.some((m) => m.type === "underline"))
      content = <u key={i}>{content}</u>;
    return <React.Fragment key={i}>{content}</React.Fragment>;
  });
}

function renderNode(node: unknown, key: number): React.ReactNode {
  if (!node || typeof node !== "object") return null;
  const n = node as { type?: string; content?: unknown[]; attrs?: Record<string, unknown> };
  switch (n.type) {
    case "heading": {
      const level = (n.attrs?.level as number) ?? 2;
      const cls = level === 1 ? "font-bold text-sm" : level === 2 ? "font-semibold text-sm" : "font-medium text-xs";
      return <p key={key} className={cls}>{renderInline(n.content ?? [])}</p>;
    }
    case "paragraph": {
      const text = flatText(n.content ?? []);
      if (!text.trim()) return null;
      return (
        <p key={key} className="text-xs leading-relaxed break-words">
          {renderInline(n.content ?? [])}
        </p>
      );
    }
    case "bulletList":
      return (
        <ul key={key} className="list-disc list-inside text-xs space-y-0.5 break-words">
          {(n.content ?? []).map((c, i) => renderNode(c, i))}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} className="list-decimal list-inside text-xs space-y-0.5 break-words">
          {(n.content ?? []).map((c, i) => renderNode(c, i))}
        </ol>
      );
    case "listItem":
      return (
        <li key={key}>
          {renderInline(
            (n.content ?? []).flatMap(
              (c: unknown) => (c as { content?: unknown[] }).content ?? []
            )
          )}
        </li>
      );
    default:
      return null;
  }
}

function hasContent(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const root = doc as { content?: unknown[] };
  if (!Array.isArray(root.content)) return false;
  return root.content.some((n) => {
    const node = n as { content?: unknown[] };
    return flatText(node.content ?? []).trim().length > 0;
  });
}

// ── Component ─────────────────────────────────────────────────────
interface TermsAccordionProps {
  content: unknown;
}

export function TermsAccordion({ content }: TermsAccordionProps) {
  const [open, setOpen] = useState(false);
  const hasTcs = hasContent(content);

  if (!hasTcs) {
    return <p className="text-xs text-ink-3">T&amp;Cs apply.</p>;
  }

  const root = content as { content?: unknown[] };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-ink-3 underline underline-offset-2"
        aria-expanded={open}
      >
        T&amp;Cs apply
        <span className="text-[10px] no-underline" aria-hidden>
          {open ? "↑" : "↓"}
        </span>
      </button>
      {open && (
        <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-ink-3 space-y-2 max-w-full overflow-x-auto">
          {(root.content ?? []).map((node, i) => renderNode(node, i))}
        </div>
      )}
    </div>
  );
}
