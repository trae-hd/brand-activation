"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import { Input } from "@/components/ui/input";
import { CharCount } from "@/components/ui/CharCount";
import { SectionLabel } from "./form-section";
import { validateImageFile, type ImageConstraints } from "@/lib/upload/validateImage";

interface Props {
  heroImageUrl: string;
  onChange: (url: string) => void;
  altText?: string;
  onAltTextChange?: (alt: string) => void;
  label?: string;
  /** Upload constraints. Required for client-side validation. The methodology
   *  page documents the recommended values for each slot. */
  constraints: ImageConstraints;
}

export function ActivationFormHeroImage({
  heroImageUrl,
  onChange,
  altText,
  onAltTextChange,
  label = "Hero image",
  constraints,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function readFileAsDataUrl(file: File) {
    setErrors([]);
    setWarnings([]);
    setIsUploading(true);

    const result = await validateImageFile(file, constraints);
    if (result.errors.length > 0) {
      setErrors(result.errors);
      setIsUploading(false);
      return;
    }
    setWarnings(result.warnings);

    const reader = new FileReader();
    reader.onload = (e) => {
      onChange((e.target?.result as string) ?? "");
      setIsUploading(false);
    };
    reader.onerror = () => {
      setErrors(["Couldn't read the file. Please try again."]);
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void readFileAsDataUrl(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void readFileAsDataUrl(file);
    e.target.value = "";
  }

  function handleRemove() {
    onChange("");
    setErrors([]);
    setWarnings([]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>
        {label}{" "}
        <span className="text-muted-foreground/60 tracking-normal normal-case">(optional)</span>
      </SectionLabel>

      {/* Drop zone */}
      <div
        className={cn(
          "relative flex aspect-[2/1] w-full flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/20 bg-muted/10",
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {isUploading ? (
          <p className="text-muted-foreground text-sm">Reading file…</p>
        ) : heroImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImageUrl}
              alt={altText || ""}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={handleRemove}
              className="bg-background/80 hover:bg-background absolute top-2 right-2 rounded-full p-1 shadow transition-colors"
              aria-label="Remove image"
            >
              <DynamicIcon name="X" className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-2">
            <DynamicIcon name="Image" className="h-8 w-8 opacity-25" />
            <p className="text-sm">drop image here</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-background border text-foreground hover:bg-muted/50 rounded px-3 py-1 text-xs font-medium transition-colors"
              >
                Choose file
              </button>
              <span className="text-xs text-muted-foreground">or</span>
              <input
                type="url"
                value={heroImageUrl}
                onChange={(e) => onChange(e.target.value)}
                placeholder="paste a URL…"
                className="bg-background text-foreground placeholder:text-muted-foreground/50 focus:border-primary w-40 rounded border px-2 py-1 text-xs transition-colors outline-none"
              />
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileInput}
        />
      </div>

      {/* Validation surface — errors block the upload, warnings are advisory. */}
      {errors.length > 0 && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border border-destructive/30 px-2.5 py-2 text-xs"
        >
          <DynamicIcon name="AlertCircle" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <ul className="flex-1 space-y-0.5">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-start gap-2 rounded-md border border-amber-500/30 px-2.5 py-2 text-xs">
          <DynamicIcon name="AlertTriangle" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex-1 space-y-0.5">
            <ul className="space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setWarnings([])}
              className="underline-offset-2 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Alt text — only shown when an image is set and a handler is provided */}
      {heroImageUrl && onAltTextChange !== undefined && (
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
            Alt text <CharCount value={altText ?? ""} max={500} className="text-[10px]" />
          </label>
          <Input
            value={altText ?? ""}
            onChange={(e) => onAltTextChange(e.target.value)}
            placeholder="Describe the image for screen readers…"
            maxLength={500}
            className="h-8 text-xs"
          />
        </div>
      )}
    </div>
  );
}
