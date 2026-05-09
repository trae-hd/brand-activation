/**
 * Client-side validation for image uploads in the activation form.
 *
 * Two kinds of checks:
 *   1. File size — hard reject. Big files would slow the participant page on
 *      event Wi-Fi and bloat the activation payload.
 *   2. Aspect ratio — soft warning only. Off-ratio uploads still apply (the
 *      admin may know what they're doing — e.g. sponsor logos with extra
 *      whitespace), but we surface a clear "this won't render the way you
 *      probably expect" message so it isn't a silent footgun.
 */

export interface ImageConstraints {
  /** Maximum file size in bytes. Files exceeding this are rejected outright. */
  maxSizeBytes: number;
  /** Acceptable aspect-ratio range as [min, max] of width / height. */
  aspectRange?: [number, number];
  /** Human-readable description shown in warnings (e.g. "2:1" or "between 2:1 and 4:1"). */
  aspectLabel?: string;
}

export interface ValidationResult {
  /** Hard errors — file should not be uploaded. */
  errors: string[];
  /** Soft warnings — file can be uploaded but admin should know. */
  warnings: string[];
  /** Image dimensions if the file loaded successfully. */
  dimensions?: { width: number; height: number };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

/** Decode the file as an Image to measure its natural dimensions. */
function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export async function validateImageFile(
  file: File,
  constraints: ImageConstraints,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Type guard.
  if (!file.type.startsWith("image/")) {
    errors.push(`Only image files are allowed (got "${file.type || "unknown"}").`);
    return { errors, warnings };
  }

  // 2. File size — hard limit.
  if (file.size > constraints.maxSizeBytes) {
    errors.push(
      `File is ${formatBytes(file.size)} — must be ${formatBytes(constraints.maxSizeBytes)} or smaller.`,
    );
  }

  // 3. Aspect ratio — soft warning. Need to load the image first.
  const dimensions = await readImageDimensions(file);
  if (!dimensions) {
    errors.push("Couldn't read image dimensions — file may be corrupt.");
    return { errors, warnings };
  }

  if (constraints.aspectRange) {
    const ratio = dimensions.width / dimensions.height;
    const [min, max] = constraints.aspectRange;
    if (ratio < min || ratio > max) {
      const actualRatio = `${ratio.toFixed(2)}:1`;
      const target = constraints.aspectLabel ?? `${min}:1 to ${max}:1`;
      warnings.push(
        `Aspect ratio is ${actualRatio} (${dimensions.width} × ${dimensions.height}). ` +
          `Recommended ${target} — the image will be scaled or cropped to fit.`,
      );
    }
  }

  return { errors, warnings, dimensions };
}
