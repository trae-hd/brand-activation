"use client";
import { renderTiptap } from "@/lib/tiptap/render";

interface Props {
  notice: unknown;
  accepted: boolean;
  onAccept: (next: boolean) => void;
}

export function ConsentBlock({ notice, accepted, onAccept }: Props) {
  return (
    <div className="rounded-md border border-border p-4 text-sm">
      <div className="prose prose-sm">{renderTiptap(notice)}</div>
      <label className="mt-3 flex items-start gap-2">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAccept(e.target.checked)}
          className="mt-1"
          required
        />
        <span>I have read and accept the above.</span>
      </label>
    </div>
  );
}
