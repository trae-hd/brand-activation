"use client";
import { useState } from "react";
import { renderConsent } from "@/lib/tiptap/render";

interface Props {
  notice: unknown;
}

export function ConsentBlock({ notice }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-medium underline"
      >
        consent notice
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-background px-6 pb-10 pt-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold">Consent notice</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-lg leading-none text-ink-3"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div
              className="prose prose-sm"
              dangerouslySetInnerHTML={{
                __html: notice
                  ? renderConsent(notice)
                  : "<p>No consent notice configured.</p>",
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
