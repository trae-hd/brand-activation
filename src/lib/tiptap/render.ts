import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import React from "react";

// In Tiptap v3, Link and Underline are bundled inside StarterKit.
const CONTENT_EXTENSIONS = [StarterKit, Image];
const CONSENT_EXTENSIONS = [
  StarterKit.configure({
    horizontalRule: false,
    underline: false,
  }),
];

export function renderContent(doc: unknown): string {
  return generateHTML(doc as Parameters<typeof generateHTML>[0], CONTENT_EXTENSIONS);
}

export function renderConsent(doc: unknown): string {
  return generateHTML(doc as Parameters<typeof generateHTML>[0], CONSENT_EXTENSIONS);
}

// Generic render used by the participant surface. Returns a React element with
// the Tiptap HTML injected so prose styles apply to the generated markup.
export function renderTiptap(doc: unknown): React.ReactElement {
  const html = generateHTML(doc as Parameters<typeof generateHTML>[0], CONTENT_EXTENSIONS);
  return React.createElement("div", { dangerouslySetInnerHTML: { __html: html } });
}
