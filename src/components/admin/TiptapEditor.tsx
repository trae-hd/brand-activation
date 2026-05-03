"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Allowlist } from "@/lib/tiptap/allowlists";
import { CONTENT_ALLOWLIST } from "@/lib/tiptap/allowlists";

interface TiptapEditorProps {
  content: unknown;
  onChange: (content: unknown) => void;
  allowlist?: Allowlist;
  disabled?: boolean;
  className?: string;
}

// In Tiptap v3, link and underline are bundled into StarterKit.
function getExtensions(allowlist: Allowlist) {
  const isContent = allowlist === CONTENT_ALLOWLIST;
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      hardBreak: false,
      strike: false,
      dropcursor: false,
      gapcursor: false,
      // undoRedo replaces history in Tiptap v3; undefined = enabled.
      undoRedo: undefined,
      horizontalRule: isContent ? undefined : false,
      // Consent allowlist forbids underline.
      underline: isContent ? undefined : false,
      link: { openOnClick: false },
    }),
    ...(isContent ? [Image] : []),
  ];
}

export function TiptapEditor({
  content,
  onChange,
  allowlist = CONTENT_ALLOWLIST,
  disabled = false,
  className,
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: getExtensions(allowlist),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: content as any,
    editable: !disabled,
    onUpdate({ editor }) {
      onChange(editor.getJSON());
    },
  });

  const isContent = allowlist === CONTENT_ALLOWLIST;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {editor && !disabled && (
        <div className="flex flex-wrap gap-1 rounded-md border bg-muted/40 p-1">
          <Button
            type="button"
            variant={editor.isActive("bold") ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            B
          </Button>
          <Button
            type="button"
            variant={editor.isActive("italic") ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs italic"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            I
          </Button>
          {isContent && (
            <Button
              type="button"
              variant={editor.isActive("underline") ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs underline"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              U
            </Button>
          )}
          <Button
            type="button"
            variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </Button>
          <Button
            type="button"
            variant={editor.isActive("heading", { level: 3 }) ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </Button>
          <Button
            type="button"
            variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            •—
          </Button>
          <Button
            type="button"
            variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1—
          </Button>
        </div>
      )}
      <EditorContent
        editor={editor}
        className={cn(
          "min-h-[160px] rounded-md border bg-background px-3 py-2 text-sm",
          "prose prose-sm max-w-none",
          "[&_.tiptap]:outline-none [&_.tiptap]:min-h-[140px]",
          disabled && "opacity-60 cursor-not-allowed"
        )}
      />
    </div>
  );
}
