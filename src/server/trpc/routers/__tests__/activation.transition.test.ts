/**
 * Phase 4B atomicity test — §9.5 transition matrix + transaction rollback.
 *
 * These tests use mocked Prisma. They verify:
 *   1. Gate enforcement (legalApproved, typed phrases, invalid transitions).
 *   2. That transitionStatus calls prisma.$transaction so the status update
 *      and audit row are coupled — if the inner writeAuditLog throws, the
 *      status update is not committed (Prisma rolls back the transaction).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

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
  // Forward the call to our spy, then delegate to tx.auditLog.create so the
  // atomicity test can inject a tx that throws.
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
      await args.tx.auditLog.create({ data: { action: args.action, actorId: args.actorId, targetType: args.targetType, targetId: args.targetId } });
    } else {
      await mockAuditLogCreate({ data: { action: args.action } });
    }
  },
}));

// ── helpers ───────────────────────────────────────────────────────────────────

// Build a mock tRPC context for an ADMIN session.
function makeAdminCtx() {
  return {
    session: {
      user: {
        adminUserId: "admin-1",
        role: "ADMIN" as const,
        active: true,
        name: "Test Admin",
        email: "admin@mrq.com",
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    },
    adminUser: { id: "admin-1", role: "ADMIN" as const, active: true },
    ip: "127.0.0.1",
  };
}

// Build the tRPC caller by importing the router directly.
async function makeTransitionCaller() {
  const { activationRouter } = await import("../activation");
  return activationRouter.createCaller(makeAdminCtx());
}

// ── tests ─────────────────────────────────────────────────────────────────────

function stubAdminUser() {
  mockAdminUserFindUnique.mockResolvedValue({
    id: "admin-1",
    role: "ADMIN",
    active: true,
  });
}

describe("activation.transitionStatus — gate enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteAuditLog.mockReset();
    stubAdminUser();
  });

  it("throws NOT_FOUND when activation does not exist", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(null);
    const caller = await makeTransitionCaller();
    await expect(
      caller.transitionStatus({ activationId: "x", to: "SCHEDULED" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST for an illegal transition (DRAFT → ENDED)", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1", status: "DRAFT", startsAt: new Date(), endsAt: new Date(), legalApproved: false,
    });
    const caller = await makeTransitionCaller();
    await expect(
      caller.transitionStatus({ activationId: "act-1", to: "ENDED" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST for DRAFT → SCHEDULED when legalApproved is false", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1", status: "DRAFT", startsAt: new Date(), endsAt: new Date(), legalApproved: false,
    });
    const caller = await makeTransitionCaller();
    await expect(
      caller.transitionStatus({ activationId: "act-1", to: "SCHEDULED" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows DRAFT → SCHEDULED when legalApproved is true", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1", status: "DRAFT", startsAt: new Date(), endsAt: new Date(), legalApproved: true,
    });
    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        activation: { update: mockActivationUpdate.mockResolvedValueOnce({}) },
        auditLog: { create: mockAuditLogCreate.mockResolvedValueOnce({}) },
      };
      return fn(tx);
    });
    const caller = await makeTransitionCaller();
    await expect(
      caller.transitionStatus({ activationId: "act-1", to: "SCHEDULED" })
    ).resolves.toEqual({ ok: true });
    expect(mockActivationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "SCHEDULED" } })
    );
  });

  it("throws BAD_REQUEST for SCHEDULED → DRAFT without the correct phrase", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1", status: "SCHEDULED", startsAt: new Date(), endsAt: new Date(), legalApproved: true,
    });
    const caller = await makeTransitionCaller();
    await expect(
      caller.transitionStatus({ activationId: "act-1", to: "DRAFT", phrase: "WRONG PHRASE", reason: "test" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST for SCHEDULED → DRAFT without a reason", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1", status: "SCHEDULED", startsAt: new Date(), endsAt: new Date(), legalApproved: true,
    });
    const caller = await makeTransitionCaller();
    await expect(
      caller.transitionStatus({
        activationId: "act-1",
        to: "DRAFT",
        phrase: "EDIT LOCKED ACTIVATION",
        reason: "",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows SCHEDULED → DRAFT with correct phrase and reason", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1", status: "SCHEDULED", startsAt: new Date(), endsAt: new Date(), legalApproved: true,
    });
    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        activation: { update: mockActivationUpdate.mockResolvedValueOnce({}) },
        auditLog: { create: mockAuditLogCreate.mockResolvedValueOnce({}) },
      };
      return fn(tx);
    });
    const caller = await makeTransitionCaller();
    await expect(
      caller.transitionStatus({
        activationId: "act-1",
        to: "DRAFT",
        phrase: "EDIT LOCKED ACTIVATION",
        reason: "Fixing a consent error before event.",
      })
    ).resolves.toEqual({ ok: true });
  });

  it("rejects ENDED → LIVE without phrase ROLLBACK ENDED", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1", status: "ENDED", startsAt: new Date(), endsAt: new Date(), legalApproved: true,
    });
    const caller = await makeTransitionCaller();
    await expect(
      caller.transitionStatus({ activationId: "act-1", to: "LIVE", reason: "need it live again" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("activation.transitionStatus — atomicity (§9.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteAuditLog.mockReset();
    stubAdminUser();
  });

  it("rolls back the status update when writeAuditLog throws inside the transaction", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1", status: "DRAFT", startsAt: new Date(), endsAt: new Date(), legalApproved: true,
    });

    // Simulate a $transaction that executes the callback but whose auditLog.create throws.
    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        activation: { update: mockActivationUpdate.mockResolvedValueOnce({}) },
        // auditLog.create throws — simulating a DB error mid-transaction.
        auditLog: {
          create: vi.fn().mockRejectedValueOnce(new Error("simulated-audit-db-failure")),
        },
      };
      // Call the callback — it will throw when auditLog.create is hit.
      // $transaction re-throws (Prisma rolls back the DB state).
      return fn(tx);
    });

    const caller = await makeTransitionCaller();

    // The procedure must propagate the error.
    await expect(
      caller.transitionStatus({ activationId: "act-1", to: "SCHEDULED" })
    ).rejects.toThrow("simulated-audit-db-failure");

    // The transaction was attempted (activation.update was called) but threw.
    // In production Postgres, both the status update and audit row are absent.
    // Here we verify the mock threw before the transaction could commit.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockActivationUpdate).toHaveBeenCalledTimes(1);
  });

  it("writes exactly one audit row per successful transition", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1", status: "DRAFT", startsAt: new Date(), endsAt: new Date(), legalApproved: true,
    });
    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        activation: { update: mockActivationUpdate.mockResolvedValueOnce({}) },
        auditLog: { create: mockAuditLogCreate.mockResolvedValueOnce({}) },
      };
      return fn(tx);
    });

    const caller = await makeTransitionCaller();
    await caller.transitionStatus({ activationId: "act-1", to: "SCHEDULED" });

    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "activation.status.draft.scheduled",
        actorId: "admin-1",
        targetType: "Activation",
        targetId: "act-1",
        category: "ADMIN",
      })
    );
  });
});
