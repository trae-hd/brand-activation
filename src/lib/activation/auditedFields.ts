export const AUDITED_CONTENT_FIELDS = [
  "name",
  "slug",
  "startsAt",
  "endsAt",
  "content",
  "consentNotice",
  "consentItems",
  "termsContent",
  "ctaText",
  "heroImageUrl",
  "primaryColor",
  "successHeading",
  "successSubheading",
  "successContent",
  "successSponsorContent",
  "successCtaLabel",
  "successCtaUrl",
  "successHeroImageUrl",
  "successShowEntryCode",
  "successShowResend",
] as const;

export type AuditedField = (typeof AUDITED_CONTENT_FIELDS)[number];
