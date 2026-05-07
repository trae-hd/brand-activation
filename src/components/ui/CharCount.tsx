/**
 * Inline character counter shown next to a SectionLabel or under an input.
 * Pattern matches the existing one used inline in ActivationSuccessTab for
 * sponsor body — extracted here so all length-limited fields can share it.
 *
 * Visual: muted "(current/max)". Turns destructive when the user has typed
 * past the limit (which can happen if maxLength isn't on the input itself,
 * or if pasted content overflows).
 */
export function CharCount({
  value,
  max,
  className = "",
}: {
  value: string;
  max: number;
  className?: string;
}) {
  const len = value?.length ?? 0;
  const over = len > max;
  return (
    <span
      className={`tracking-normal normal-case ${
        over ? "text-destructive" : "text-muted-foreground/60"
      } ${className}`}
      aria-live="polite"
    >
      ({len}/{max})
    </span>
  );
}
