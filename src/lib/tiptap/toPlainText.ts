interface TiptapNode {
  type?: string;
  text?: string;
  content?: TiptapNode[];
}

function walk(node: TiptapNode, lines: string[]): void {
  if (node.type === "text" && node.text) {
    const last = lines.length - 1;
    lines[last] = (lines[last] ?? "") + node.text;
    return;
  }

  const isBlock =
    node.type === "paragraph" ||
    node.type === "heading" ||
    node.type === "listItem" ||
    node.type === "blockquote";

  if (isBlock && lines.length > 0 && lines[lines.length - 1] !== "") {
    lines.push("");
  }

  if (node.content) {
    for (const child of node.content) {
      walk(child, lines);
    }
  }

  if (isBlock) {
    lines.push("");
  }
}

export function tiptapToPlainText(doc: unknown): string | null {
  if (!doc || typeof doc !== "object") return null;
  const lines: string[] = [""];
  walk(doc as TiptapNode, lines);
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() || null;
}
