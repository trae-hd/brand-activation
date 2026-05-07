import type { ActivationStatus, ActivationReviewStatus, AdminRole } from "@prisma/client";

export interface ConsentItem {
  id: string;
  text: string;
}

export interface BoothRow {
  id: string;
  code: string;
  label: string;
  scanCount?: number;
}

export interface ActivationRow {
  id: string;
  name: string;
  slug: string;
  status: ActivationStatus;
  reviewStatus: ActivationReviewStatus;
  startsAt: string;
  endsAt: string;
  archivedAt: string | null;
  boothCount: number;
  verifiedCount: number;
  pendingCount: number;
}

// ── Form state slices (lifted state in ActivationForm) ─────────────────────

export interface RegistrationFormState {
  content: unknown;
  consentNotice: unknown;
  consentItems: ConsentItem[];
  ctaText: string;
  termsContent: unknown;
  heroImageUrl: string;
  heroImageAlt: string;
  mrqContactConsentEnabled: boolean;
}

export interface SuccessFormState {
  successHeading: string;
  successSubheading: string;
  successContent: unknown;
  successCtaLabel: string;
  successCtaUrl: string;
  successShowEntryCode: boolean;
  successShowResend: boolean;
  successShowCta: boolean;
  // Sponsor block
  successSponsorName: string;
  successSponsorLogoUrl: string;
  successSponsorLogoAlt: string;
  successSponsorHeadline: string;
  successSponsorBody: string;
  successSponsorCtaLabel: string;
  successSponsorCtaUrl: string;
}

// ── Full initial data shape returned from DB ───────────────────────────────

export interface ActivationFormInitialData {
  id: string;
  name: string;
  slug: string;
  status: ActivationStatus;
  reviewStatus: ActivationReviewStatus;
  startsAt: Date;
  endsAt: Date;
  content: unknown;
  consentNotice: unknown;
  consentVersion: string;
  consentItems?: unknown;
  ctaText?: string | null;
  termsContent?: unknown;
  primaryColor: string | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  reviewNotes: string | null;
  createdById: string;
  timezone: string;
  entryCodePrefix: string | null;
  booths: BoothRow[];
  // Success page fields
  successHeading: string | null;
  successSubheading: string | null;
  successContent: unknown;
  successCtaLabel: string | null;
  successCtaUrl: string | null;
  successShowEntryCode: boolean;
  successShowResend: boolean;
  successShowCta: boolean;
  // Sponsor block
  successSponsorName: string | null;
  successSponsorLogoUrl: string | null;
  successSponsorLogoAlt: string | null;
  successSponsorHeadline: string | null;
  successSponsorBody: string | null;
  successSponsorCtaLabel: string | null;
  successSponsorCtaUrl: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  mrqContactConsentEnabled: boolean;
}

export interface ActivationFormProps {
  mode: "create" | "edit";
  userRole?: AdminRole;
  currentUserId?: string;
  initialData?: ActivationFormInitialData;
  participantBaseUrl: string;
  /** Short-lived HMAC token that lets the participant page render a DRAFT for preview without requiring a cross-domain admin session. */
  previewToken?: string;
}

export interface StatusTransitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activationId: string;
  currentStatus: ActivationStatus;
  reviewStatus: ActivationReviewStatus;
  startsAt: Date;
  endsAt: Date;
  slug: string;
  content: unknown;
  consentNotice: unknown;
  consentItems?: unknown;
  boothCount: number;
  isCreator?: boolean;
  onSuccess: (newStatus: ActivationStatus) => void;
  onReviewStatusChange?: (newReviewStatus: ActivationReviewStatus) => void;
}
