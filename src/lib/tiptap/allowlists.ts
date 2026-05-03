export const CONTENT_ALLOWLIST = {
  nodes: ["doc", "paragraph", "heading", "bulletList", "orderedList", "listItem", "horizontalRule", "image"],
  marks: ["bold", "italic", "underline", "link"],
  attrs: {
    heading: { level: [1, 2, 3] },
    image: { src: { type: "url" }, alt: { type: "string" } },
    link: { href: { type: "url" } },
  },
} as const;

export const CONSENT_ALLOWLIST = {
  nodes: ["doc", "paragraph", "heading", "bulletList", "orderedList", "listItem"],
  marks: ["bold", "italic", "link"],
  attrs: {
    heading: { level: [2, 3] },
    link: { href: { type: "url" } },
  },
} as const;

export type Allowlist = typeof CONTENT_ALLOWLIST | typeof CONSENT_ALLOWLIST;
