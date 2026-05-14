"use client";

import { useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style/text-style";
import { FontSize } from "@tiptap/extension-text-style/font-size";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Allowlist } from "@/lib/tiptap/allowlists";
import { CONTENT_ALLOWLIST, ALLOWED_FONT_SIZES } from "@/lib/tiptap/allowlists";

const FONT_SIZE_OPTIONS = [
  { label: "Sm", value: ALLOWED_FONT_SIZES[0] },
  { label: "Lg", value: ALLOWED_FONT_SIZES[1] },
  { label: "XL", value: ALLOWED_FONT_SIZES[2] },
] as const;

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
    TextStyle,
    FontSize,
  ];
}

export function TiptapEditor({
  content,
  onChange,
  allowlist = CONTENT_ALLOWLIST,
  disabled = false,
  className,
}: TiptapEditorProps) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: getExtensions(allowlist),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: content as any,
    editable: !disabled,
    immediatelyRender: false,
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
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            B
          </Button>
          <Button
            type="button"
            variant={editor.isActive("italic") ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs italic"
            onMouseDown={(e) => e.preventDefault()}
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
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              U
            </Button>
          )}
          <Button
            type="button"
            variant={editor.isActive("link") || showLinkInput ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (showLinkInput) {
                setShowLinkInput(false);
                return;
              }
              setLinkUrl(editor.getAttributes("link").href ?? "");
              setShowLinkInput(true);
              setTimeout(() => { linkInputRef.current?.focus(); linkInputRef.current?.select(); }, 30);
            }}
          >
            Link
          </Button>
          {FONT_SIZE_OPTIONS.map(({ label, value }) => {
            const isActive = editor.getAttributes("textStyle").fontSize === value;
            return (
              <Button
                key={value}
                type="button"
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (isActive) {
                    editor.chain().focus().unsetFontSize().run();
                  } else {
                    editor.chain().focus().setFontSize(value).run();
                  }
                }}
              >
                {label}
              </Button>
            );
          })}
          <Button
            type="button"
            variant={!editor.isActive("heading") && !editor.isActive("bulletList") && !editor.isActive("orderedList") ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            P
          </Button>
          <Button
            type="button"
            variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </Button>
          <Button
            type="button"
            variant={editor.isActive("heading", { level: 3 }) ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </Button>
          <Button
            type="button"
            variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            •—
          </Button>
          <Button
            type="button"
            variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1—
          </Button>
          {isContent && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              —
            </Button>
          )}
        </div>
      )}
      {editor && !disabled && showLinkInput && (
        <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1">
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (linkUrl.trim()) editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl.trim() }).run();
                setShowLinkInput(false);
              }
              if (e.key === "Escape") setShowLinkInput(false);
            }}
          />
          <Button
            type="button"
            size="sm"
            className="h-6 shrink-0 px-2 text-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (linkUrl.trim()) editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl.trim() }).run();
              setShowLinkInput(false);
            }}
          >
            Apply
          </Button>
          {editor.isActive("link") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 px-2 text-xs text-destructive hover:text-destructive"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setShowLinkInput(false);
              }}
            >
              Remove
            </Button>
          )}
        </div>
      )}
      <EditorContent
        editor={editor}
        className={cn(
          "min-h-[160px] rounded-md border bg-background px-3 py-2 text-sm",
          // Tiptap content area
          "[&_.tiptap]:outline-none [&_.tiptap]:min-h-[140px]",
          // Headings
          "[&_.tiptap_h2]:mb-0.5 [&_.tiptap_h2]:mt-2 [&_.tiptap_h2]:text-base [&_.tiptap_h2]:font-semibold",
          "[&_.tiptap_h3]:mb-0.5 [&_.tiptap_h3]:mt-1.5 [&_.tiptap_h3]:text-sm [&_.tiptap_h3]:font-semibold",
          // Paragraphs
          "[&_.tiptap_p]:my-0.5 [&_.tiptap_p]:leading-relaxed",
          // Lists — Tailwind resets list-style globally so we must opt back in
          "[&_.tiptap_ul]:my-1 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5",
          "[&_.tiptap_ol]:my-1 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5",
          "[&_.tiptap_li]:my-0.5 [&_.tiptap_li]:leading-snug",
          // Horizontal rule
          "[&_.tiptap_hr]:my-2 [&_.tiptap_hr]:border-t [&_.tiptap_hr]:border-border",
          // Inline marks
          "[&_.tiptap_strong]:font-semibold",
          "[&_.tiptap_em]:italic",
          "[&_.tiptap_u]:underline",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      />
    </div>
  );
}
