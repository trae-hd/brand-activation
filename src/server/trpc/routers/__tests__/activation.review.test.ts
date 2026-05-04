/**
 * Phase 4B review mutation tests — §9.1–9.3 two-pair-eyes review.
 *
 * Covers:
 *   - submitForReview  : creator-only, valid source states
 *   - approveReview    : non-creator only, consent-diff gate
 *   - requestChanges   : non-creator only, notes required by schema
 *   - update (soft invalidation): APPROVED → DRAFT_EDITED, CHANGES_REQUESTED → DRAFT
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "test",
    INVITE_TOKEN_HMAC_KEY: "test-invite-key-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
    RESET_TOKEN_HMAC_KEY: "test-reset-key-bbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
}));

const mockActivationUpdate = vi.fn();
const mockAuditLogCreate = vi.fn();
const mockActivationFindUnique = vi.fn();
const mockAdminUserFindUnique = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    activation: { findUnique: mockActivationFindUnique },
    adminUser: { findUnique: mockAdminUserFindUnique },
    $transaction: mockTransaction,
  },
}));

const mockWriteAuditLog = vi.fn();

vi.mock("@/lib/audit/writeAuditLog", () => ({
  writeAuditLog: async (args: {
    tx?: { auditLog: { create: (d: unknown) => Promise<unknown> } };
    action: string;
    actorId?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    category: string;
    metadata?: unknown;
  }) => {
    mockWriteAuditLog(args);
    if (args.tx) {
      await args.tx.auditLog.create({ data: { action: args.action, actorId: args.actorId } });
    } else {
      await mockAuditLogCreate({ data: { action: args.action } });
    }
  },
}));

const mockBuildReviewSnapshot = vi.fn().mockReturnValue({ snapshot: "stub" });

vi.mock("@/lib/activation/reviewSnapshot", () => ({
  buildReviewSnapshot: (...args: unknown[]) => mockBuildReviewSnapshot(...args),
}));

const mockFetchLastApprovedConsentVersion = vi.fn();

vi.mock("@/lib/activation/lastApprovedConsentVersion", () => ({
  fetchLastApprovedConsentVersion: (...args: unknown[]) =>
    mockFetchLastApprovedConsentVersion(...args),
}));

vi.mock("@/lib/tiptap/validate", () => ({
  validateAgainstAllowlist: () => ({ ok: true }),
}));

vi.mock("@/lib/tiptap/consentVersion", () => ({
  consentVersionOf: () => "consent-hash-v1",
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCreatorCtx() {
  return {
    session: {
      user: {
        adminUserId: "creator-1",
        role: "ADMIN" as const,
        active: true,
        name: "Creator Admin",
        email: "creator@mrq.com",
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    },
    adminUser: { id: "creator-1", role: "ADMIN" as const, active: true },
    ip: "127.0.0.1",
  };
}

function makeReviewerCtx() {
  return {
    session: {
      user: {
        adminUserId: "reviewer-1",
        role: "ADMIN" as const,
        active: true,
        name: "Reviewer Admin",
        email: "reviewer@mrq.com",
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    },
    adminUser: { id: "reviewer-1", role: "ADMIN" as const, active: true },
    ip: "127.0.0.1",
  };
}

async function makeCreatorCaller() {
  const { activationRouter } = await import("../activation");
  return activationRouter.createCaller(makeCreatorCtx());
}

async function makeReviewerCaller() {
  const { activationRouter } = await import("../activation");
  return activationRouter.createCaller(makeReviewerCtx());
}

function stubActiveAdmin() {
  mockAdminUserFindUnique.mockResolvedValue({ id: "admin", role: "ADMIN", active: true });
}

function stubActivation(overrides: Record<string, unknown> = {}) {
  return {
    id: "act-1",
    status: "DRAFT",
    reviewStatus: "DRAFT",
    createdById: "creator-1",
    consentVersion: "consent-hash-v1",
    name: "Test Activation",
    slug: "test-activation",
    startsAt: new Date("2026-01-01"),
    endsAt: new Date("2026-12-31"),
    content: { type: "doc", content: [{ type: "paragraph" }] },
    consentNotice: { type: "doc", content: [{ type: "paragraph" }] },
    consentItems: [],
    termsContent: null,
    ctaText: null,
    heroImageUrl: null,
    primaryColor: null,
    successHeading: null,
    successSubheading: null,
    successContent: null,
    successSponsorContent: null,
    successCtaLabel: null,
    successCtaUrl: null,
    successHeroImageUrl: null,
    successShowEntryCode: true,
    successShowResend: true,
    ...overrides,
  };
}

/** Stubs a single-step transaction used by submitForReview / approveReview / requestChanges. */
function stubSimpleTx() {
  mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      activation: { update: mockActivationUpdate.mockResolvedValueOnce({}) },
      auditLog: { create: mockAuditLogCreate.mockResolvedValueOnce({}) },
    };
    return fn(tx);
  });
}

/** Stubs the update mutation's transaction (needs tx.activation.findUnique). */
function stubUpdateTx(existing: ReturnType<typeof stubActivation>) {
  mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      activation: {
        findUnique: vi.fn().mockResolvedValueOnce(existing),
        update: mockActivationUpdate.mockResolvedValueOnce({ id: "act-1" }),
      },
      auditLog: {
        create: mockAuditLogCreate
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({}),
      },
    };
    return fn(tx);
  });
}

const VALID_WRITE_DATA = {
  name: "Updated Activation",
  slug: "test-activation",
  startsAt: new Date("2026-01-01"),
  endsAt: new Date("2026-12-31"),
  content: { type: "doc", content: [{ type: "paragraph" }] },
  consentNotice: { type: "doc", content: [{ type: "paragraph" }] },
};

// ── submitForReview ───────────────────────────────────────────────────────────

describe("activation.submitForReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteAuditLog.mockReset();
    stubActiveAdmin();
  });

  it("throws NOT_FOUND when activation does not exist", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(null);
    const caller = await makeCreatorCaller();
    await expect(caller.submitForReview({ activationId: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws FORBIDDEN when a non-creator calls submitForReview", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "DRAFT" }));
    const caller = await makeReviewerCaller(); // reviewer-1 ≠ creator-1
    await expect(caller.submitForReview({ activationId: "act-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws BAD_REQUEST when reviewStatus is APPROVED", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "APPROVED" }));
    const caller = await makeCreatorCaller();
    await expect(caller.submitForReview({ activationId: "act-1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("throws BAD_REQUEST when reviewStatus is already SUBMITTED", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "SUBMITTED" }));
    const caller = await makeCreatorCaller();
    await expect(caller.submitForReview({ activationId: "act-1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("resolves from DRAFT", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "DRAFT" }));
    stubSimpleTx();
    const caller = await makeCreatorCaller();
    await expect(caller.submitForReview({ activationId: "act-1" })).resolves.toEqual({ ok: true });
  });

  it("resolves from DRAFT_EDITED", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "DRAFT_EDITED" }));
    stubSimpleTx();
    const caller = await makeCreatorCaller();
    await expect(caller.submitForReview({ activationId: "act-1" })).resolves.toEqual({ ok: true });
  });

  it("resolves from CHANGES_REQUESTED", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(
      stubActivation({ reviewStatus: "CHANGES_REQUESTED" }),
    );
    stubSimpleTx();
    const caller = await makeCreatorCaller();
    await expect(caller.submitForReview({ activationId: "act-1" })).resolves.toEqual({ ok: true });
  });

  it("writes exactly one audit row per submit", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "DRAFT" }));
    stubSimpleTx();
    const caller = await makeCreatorCaller();
    await caller.submitForReview({ activationId: "act-1" });
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "activation.review.submitted",
        actorId: "creator-1",
        targetType: "Activation",
        targetId: "act-1",
        category: "ADMIN",
      }),
    );
  });
});

// ── approveReview ─────────────────────────────────────────────────────────────

describe("activation.approveReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteAuditLog.mockReset();
    stubActiveAdmin();
  });

  it("throws NOT_FOUND when activation does not exist", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(null);
    const caller = await makeReviewerCaller();
    await expect(
      caller.approveReview({ activationId: "x", acknowledgedConsentDiff: false }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws FORBIDDEN when the creator attempts to approve their own activation", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "SUBMITTED" }));
    const caller = await makeCreatorCaller(); // actorId === createdById
    await expect(
      caller.approveReview({ activationId: "act-1", acknowledgedConsentDiff: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws BAD_REQUEST when reviewStatus is not SUBMITTED", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "DRAFT" }));
    const caller = await makeReviewerCaller();
    await expect(
      caller.approveReview({ activationId: "act-1", acknowledgedConsentDiff: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when consent changed and not acknowledged", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(
      stubActivation({ reviewStatus: "SUBMITTED", consentVersion: "new-hash" }),
    );
    mockFetchLastApprovedConsentVersion.mockResolvedValueOnce("old-hash");
    const caller = await makeReviewerCaller();
    await expect(
      caller.approveReview({ activationId: "act-1", acknowledgedConsentDiff: false }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("resolves when there is no prior approval (first approval skips consent diff check)", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "SUBMITTED" }));
    mockFetchLastApprovedConsentVersion.mockResolvedValueOnce(null);
    stubSimpleTx();
    const caller = await makeReviewerCaller();
    await expect(
      caller.approveReview({ activationId: "act-1", acknowledgedConsentDiff: false }),
    ).resolves.toEqual({ ok: true });
  });

  it("resolves when consent version is unchanged", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(
      stubActivation({ reviewStatus: "SUBMITTED", consentVersion: "same-hash" }),
    );
    mockFetchLastApprovedConsentVersion.mockResolvedValueOnce("same-hash");
    stubSimpleTx();
    const caller = await makeReviewerCaller();
    await expect(
      caller.approveReview({ activationId: "act-1", acknowledgedConsentDiff: false }),
    ).resolves.toEqual({ ok: true });
  });

  it("resolves when consent changed but acknowledgedConsentDiff is true", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(
      stubActivation({ reviewStatus: "SUBMITTED", consentVersion: "new-hash" }),
    );
    mockFetchLastApprovedConsentVersion.mockResolvedValueOnce("old-hash");
    stubSimpleTx();
    const caller = await makeReviewerCaller();
    await expect(
      caller.approveReview({ activationId: "act-1", acknowledgedConsentDiff: true }),
    ).resolves.toEqual({ ok: true });
  });

  it("writes exactly one audit row with snapshot on approval", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "SUBMITTED" }));
    mockFetchLastApprovedConsentVersion.mockResolvedValueOnce(null);
    stubSimpleTx();
    const caller = await makeReviewerCaller();
    await caller.approveReview({ activationId: "act-1", acknowledgedConsentDiff: false });
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "activation.review.approved",
        actorId: "reviewer-1",
        targetType: "Activation",
        targetId: "act-1",
        category: "ADMIN",
      }),
    );
  });
});

// ── requestChanges ────────────────────────────────────────────────────────────

describe("activation.requestChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteAuditLog.mockReset();
    stubActiveAdmin();
  });

  it("throws NOT_FOUND when activation does not exist", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(null);
    const caller = await makeReviewerCaller();
    await expect(
      caller.requestChanges({ activationId: "x", notes: "Needs work" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws FORBIDDEN when the creator tries to review their own activation", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "SUBMITTED" }));
    const caller = await makeCreatorCaller();
    await expect(
      caller.requestChanges({ activationId: "act-1", notes: "Needs work" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws BAD_REQUEST when reviewStatus is not SUBMITTED", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "APPROVED" }));
    const caller = await makeReviewerCaller();
    await expect(
      caller.requestChanges({ activationId: "act-1", notes: "Needs work" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("resolves when reviewer requests changes on a SUBMITTED activation", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "SUBMITTED" }));
    stubSimpleTx();
    const caller = await makeReviewerCaller();
    await expect(
      caller.requestChanges({ activationId: "act-1", notes: "Please fix the consent notice." }),
    ).resolves.toEqual({ ok: true });
  });

  it("writes exactly one audit row with the notes on successful request", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(stubActivation({ reviewStatus: "SUBMITTED" }));
    stubSimpleTx();
    const caller = await makeReviewerCaller();
    await caller.requestChanges({ activationId: "act-1", notes: "Fix the dates." });
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "activation.review.changes_requested",
        actorId: "reviewer-1",
        targetType: "Activation",
        targetId: "act-1",
        category: "ADMIN",
        metadata: { notes: "Fix the dates." },
      }),
    );
  });
});

// ── update — soft invalidation ────────────────────────────────────────────────

describe("activation.update — soft invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteAuditLog.mockReset();
    stubActiveAdmin();
  });

  it("transitions APPROVED → DRAFT_EDITED and writes a review.invalidated_by_edit audit row when an audited field changes", async () => {
    const existing = stubActivation({ reviewStatus: "APPROVED", name: "Original Name" });
    stubUpdateTx(existing);

    const caller = await makeCreatorCaller();
    await expect(
      caller.update({ id: "act-1", data: { ...VALID_WRITE_DATA, name: "Changed Name" } }),
    ).resolves.toEqual({ id: "act-1" });

    expect(mockActivationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewStatus: "DRAFT_EDITED" }),
      }),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(2);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "activation.review.invalidated_by_edit" }),
    );
  });

  it("APPROVED activation with no changed audited fields stays APPROVED (only one audit row)", async () => {
    const existing = stubActivation({
      reviewStatus: "APPROVED",
      name: "Updated Activation", // same as VALID_WRITE_DATA.name
    });
    stubUpdateTx(existing);

    const caller = await makeCreatorCaller();
    await expect(
      caller.update({ id: "act-1", data: { ...VALID_WRITE_DATA } }),
    ).resolves.toEqual({ id: "act-1" });

    expect(mockActivationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewStatus: "APPROVED" }),
      }),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "activation.updated" }),
    );
  });

  it("transitions CHANGES_REQUESTED → DRAFT and clears submission on any edit", async () => {
    const existing = stubActivation({
      reviewStatus: "CHANGES_REQUESTED",
      name: "Updated Activation", // same as VALID_WRITE_DATA — no field change needed
    });
    stubUpdateTx(existing);

    const caller = await makeCreatorCaller();
    await expect(
      caller.update({ id: "act-1", data: { ...VALID_WRITE_DATA } }),
    ).resolves.toEqual({ id: "act-1" });

    expect(mockActivationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewStatus: "DRAFT",
          submittedAt: null,
          submittedById: null,
        }),
      }),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "activation.review.changes_addressed" }),
    );
  });

  it("DRAFT activation with changed fields stays DRAFT — only activation.updated audit row", async () => {
    const existing = stubActivation({ reviewStatus: "DRAFT", name: "Original Name" });
    stubUpdateTx(existing);

    const caller = await makeCreatorCaller();
    await expect(
      caller.update({ id: "act-1", data: { ...VALID_WRITE_DATA, name: "Changed Name" } }),
    ).resolves.toEqual({ id: "act-1" });

    expect(mockActivationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewStatus: "DRAFT" }),
      }),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "activation.updated" }),
    );
  });
});
