import { createHash } from "crypto";

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    // Codepoint-order sort, NOT localeCompare — locale-sensitive sorting would
    // produce different hashes across Railway workers, Mac, and Windows locales.
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function consentVersionOf(notice: unknown): string {
  return createHash("sha256").update(canonicalStringify(notice)).digest("hex");
}
