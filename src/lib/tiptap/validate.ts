import { z } from "zod";
import type { Allowlist } from "./allowlists";

const TiptapNode: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.unknown()).optional(),
    content: z.array(TiptapNode).optional(),
    marks: z
      .array(
        z.object({
          type: z.string(),
          attrs: z.record(z.unknown()).optional(),
        })
      )
      .optional(),
    text: z.string().optional(),
  })
);

export const TiptapDoc = TiptapNode;

export function validateAgainstAllowlist(
  doc: unknown,
  allowlist: Allowlist
): { ok: true } | { ok: false; reason: string } {
  const parsed = TiptapDoc.safeParse(doc);
  if (!parsed.success) return { ok: false, reason: "malformed-tiptap-tree" };

  function walk(node: unknown): string | null {
    if (typeof node !== "object" || node === null) return null;
    const n = node as { type: string; content?: unknown[]; marks?: { type: string }[] };
    if (!allowlist.nodes.includes(n.type as never)) return `node:${n.type}`;
    for (const m of n.marks ?? []) {
      if (!allowlist.marks.includes(m.type as never)) return `mark:${m.type}`;
    }
    for (const c of n.content ?? []) {
      const v = walk(c);
      if (v) return v;
    }
    return null;
  }

  const violation = walk(parsed.data);
  if (violation) return { ok: false, reason: violation };
  return { ok: true };
}
