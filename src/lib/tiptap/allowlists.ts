export const ALLOWED_FONT_SIZES = ["0.75rem", "1.125rem", "1.5rem"] as const;
export type AllowedFontSize = typeof ALLOWED_FONT_SIZES[number];

export const CONTENT_ALLOWLIST = {
  nodes: ["doc", "text", "paragraph", "heading", "bulletList", "orderedList", "listItem", "horizontalRule", "image"],
  marks: ["bold", "italic", "underline", "link", "textStyle"],
  attrs: {
    heading: { level: [1, 2, 3] },
    image: { src: { type: "url" }, alt: { type: "string" } },
    link: { href: { type: "url" } },
    textStyle: { fontSize: ALLOWED_FONT_SIZES },
  },
} as const;

export const CONSENT_ALLOWLIST = {
  nodes: ["doc", "text", "paragraph", "heading", "bulletList", "orderedList", "listItem"],
  marks: ["bold", "italic", "link", "textStyle"],
  attrs: {
    heading: { level: [2, 3] },
    link: { href: { type: "url" } },
    textStyle: { fontSize: ALLOWED_FONT_SIZES },
  },
} as const;

export type Allowlist = typeof CONTENT_ALLOWLIST | typeof CONSENT_ALLOWLIST;
