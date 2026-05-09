/**
 * Phase 2 unit tests for winner.pickWinners.
 *
 * Pattern matches activation.transition.test.ts: mocked Prisma + writeAuditLog
 * so each test exercises the procedure's branching without touching a DB.
 *
 * Determinism (same seed + drawId + pool produces identical positions across
 * runs) is a property of Postgres's digest() function, not JavaScript code, so
 * it's covered by an integration check on staging in Phase 6 — not here.
 *
 * Spec: §2.2 of MRQ_LIVE_ACTIVATION_WINNER_PICKING_PROMPT.md
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "test",
  },
}));

const mockActivationFindUnique = vi.fn();
const mockAdminUserFindUnique = vi.fn();
const mockRegistrationCount = vi.fn();
const mockWinnerDrawCreate = vi.fn();
const mockWinnerDrawSelectionCreateMany = vi.fn();
const mockExecuteRaw = vi.fn();
const mockQueryRaw = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    activation: { findUnique: mockActivationFindUnique },
    adminUser: { findUnique: mockAdminUserFindUnique },
    registration: { count: mockRegistrationCount },
    $transaction: mockTransaction,
  },
}));

const mockWriteAuditLog = vi.fn();

vi.mock("@/lib/audit/writeAuditLog", () => ({
  writeAuditLog: async (args: Record<string, unknown>) => {
    mockWriteAuditLog(args);
  },
}));

// ── helpers ──────────────────────────────────────────────────────────────────

function makeAdminCtx(role: "ADMIN" | "MEMBER" = "ADMIN") {
  return {
    session: {
      user: {
        adminUserId: "admin-1",
        role,
        active: true,
        name: "Test Admin",
        email: "admin@mrq.com",
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    },
    adminUser: { id: "admin-1", role, active: true },
    ip: "127.0.0.1",
  };
}

async function makeWinnerCaller(role: "ADMIN" | "MEMBER" = "ADMIN") {
  const { winnerRouter } = await import("../winner");
  return winnerRouter.createCaller(makeAdminCtx(role));
}

function stubAdminUser(role: "ADMIN" | "MEMBER" = "ADMIN") {
  mockAdminUserFindUnique.mockResolvedValue({
    id: "admin-1",
    role,
    active: true,
  });
}

/** Wires up the $transaction mock so the inner callback receives a `tx`
 *  object exposing the same Prisma surfaces the procedure uses. */
function stubTransaction() {
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
    return cb({
      winnerDraw: { create: mockWinnerDrawCreate },
      winnerDrawSelection: { createMany: mockWinnerDrawSelectionCreateMany },
      $executeRaw: mockExecuteRaw,
      $queryRaw: mockQueryRaw,
      auditLog: { create: vi.fn() },
    });
  });
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("winner.pickWinners — gate enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubAdminUser();
    stubTransaction();
  });

  it("rejects when activation does not exist", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(null);
    const caller = await makeWinnerCaller();
    await expect(
      caller.pickWinners({
        activationId: "missing",
        winnerCount: 5,
        reserveCount: 2,
        phrase: "DRAW",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects when activation status is DRAFT", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1",
      status: "DRAFT",
      endsAt: new Date(),
    });
    const caller = await makeWinnerCaller();
    await expect(
      caller.pickWinners({
        activationId: "act-1",
        winnerCount: 5,
        reserveCount: 2,
        phrase: "DRAW",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects when activation status is SCHEDULED", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1",
      status: "SCHEDULED",
      endsAt: new Date(),
    });
    const caller = await makeWinnerCaller();
    await expect(
      caller.pickWinners({
        activationId: "act-1",
        winnerCount: 5,
        reserveCount: 2,
        phrase: "DRAW",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects when winnerCount + reserveCount exceeds pool size", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1",
      status: "ENDED",
      endsAt: new Date(),
    });
    mockRegistrationCount.mockResolvedValueOnce(3); // pool of 3
    const caller = await makeWinnerCaller();
    await expect(
      caller.pickWinners({
        activationId: "act-1",
        winnerCount: 5,
        reserveCount: 2, // 5+2 = 7 > 3
        phrase: "DRAW",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects on phrase mismatch (Zod literal)", async () => {
    const caller = await makeWinnerCaller();
    await expect(
      caller.pickWinners({
        activationId: "act-1",
        winnerCount: 5,
        reserveCount: 2,
        // @ts-expect-error — deliberately wrong literal to verify Zod rejection
        phrase: "draw", // lowercase fails the literal "DRAW"
      }),
    ).rejects.toThrow();
  });

  it("rejects when caller is a MEMBER (not ADMIN)", async () => {
    stubAdminUser("MEMBER");
    const caller = await makeWinnerCaller("MEMBER");
    await expect(
      caller.pickWinners({
        activationId: "act-1",
        winnerCount: 5,
        reserveCount: 2,
        phrase: "DRAW",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("winner.pickWinners — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubAdminUser();
    stubTransaction();
  });

  it("creates a draw, snapshots pool, runs shuffle, inserts selections, and writes audit", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1",
      status: "ENDED",
      endsAt: new Date("2026-05-01T00:00:00Z"),
    });
    mockRegistrationCount.mockResolvedValueOnce(20); // pool of 20
    mockWinnerDrawCreate.mockResolvedValueOnce({ id: "draw-1" });
    // Pool snapshot: $executeRaw returns affected-row count (number)
    mockExecuteRaw.mockResolvedValueOnce(20);
    // Shuffle SELECT: 5 winners + 2 reserves = 7 ordered rows
    mockQueryRaw.mockResolvedValueOnce(
      Array.from({ length: 7 }, (_, i) => ({
        id: `reg-${i + 1}`,
        pos: i + 1,
      })),
    );
    mockWinnerDrawSelectionCreateMany.mockResolvedValueOnce({ count: 7 });

    const caller = await makeWinnerCaller();
    const result = await caller.pickWinners({
      activationId: "act-1",
      winnerCount: 5,
      reserveCount: 2,
      phrase: "DRAW",
    });

    expect(result.drawId).toBe("draw-1");
    expect(result.winnerCount).toBe(5);
    expect(result.reserveCount).toBe(2);
    expect(result.eligiblePoolSize).toBe(20);

    // Confirm createMany was called with positions 1..7 and types
    // matching: 1..5 = WINNER, 6..7 = RESERVE
    expect(mockWinnerDrawSelectionCreateMany).toHaveBeenCalledTimes(1);
    const createManyArg = mockWinnerDrawSelectionCreateMany.mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(7);
    expect(createManyArg.data[0]).toMatchObject({
      drawId: "draw-1",
      registrationId: "reg-1",
      activationId: "act-1",
      position: 1,
      type: "WINNER",
    });
    expect(createManyArg.data[4]).toMatchObject({ position: 5, type: "WINNER" });
    expect(createManyArg.data[5]).toMatchObject({ position: 6, type: "RESERVE" });
    expect(createManyArg.data[6]).toMatchObject({ position: 7, type: "RESERVE" });

    // Confirm audit log was written exactly once with the expected shape
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    const auditArg = mockWriteAuditLog.mock.calls[0][0];
    expect(auditArg).toMatchObject({
      category: "ADMIN",
      action: "winner.draw.created",
      actorId: "admin-1",
      targetType: "WinnerDraw",
      targetId: "draw-1",
    });
    // Seed must NOT be in audit metadata (audit references the WinnerDraw row,
    // which has the seed; storing it twice would duplicate sensitive data).
    expect(auditArg.metadata).not.toHaveProperty("seed");
    expect(auditArg.metadata).toMatchObject({
      activationId: "act-1",
      winnerCount: 5,
      reserveCount: 2,
      eligiblePoolSize: 20,
    });
  });

  it("does not return the seed in the response payload", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1",
      status: "LIVE",
      endsAt: new Date(Date.now() + 86400000), // tomorrow — LIVE activation
    });
    mockRegistrationCount.mockResolvedValueOnce(10);
    mockWinnerDrawCreate.mockResolvedValueOnce({ id: "draw-2" });
    mockExecuteRaw.mockResolvedValueOnce(10);
    mockQueryRaw.mockResolvedValueOnce([
      { id: "reg-a", pos: 1 },
      { id: "reg-b", pos: 2 },
      { id: "reg-c", pos: 3 },
    ]);
    mockWinnerDrawSelectionCreateMany.mockResolvedValueOnce({ count: 3 });

    const caller = await makeWinnerCaller();
    const result = await caller.pickWinners({
      activationId: "act-1",
      winnerCount: 1,
      reserveCount: 2,
      phrase: "DRAW",
    });

    expect(result).not.toHaveProperty("seed");
    expect(Object.keys(result).sort()).toEqual(
      ["drawId", "drawnAt", "eligiblePoolSize", "reserveCount", "winnerCount"],
    );
  });

  it("passes the seed to WinnerDraw.create — not in any other return value", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1",
      status: "ENDED",
      endsAt: new Date(),
    });
    mockRegistrationCount.mockResolvedValueOnce(5);
    mockWinnerDrawCreate.mockResolvedValueOnce({ id: "draw-3" });
    mockExecuteRaw.mockResolvedValueOnce(5);
    mockQueryRaw.mockResolvedValueOnce([{ id: "reg-x", pos: 1 }]);
    mockWinnerDrawSelectionCreateMany.mockResolvedValueOnce({ count: 1 });

    const caller = await makeWinnerCaller();
    await caller.pickWinners({
      activationId: "act-1",
      winnerCount: 1,
      reserveCount: 0,
      phrase: "DRAW",
    });

    // Verify the seed is on the WinnerDraw.create payload and is hex-shaped
    expect(mockWinnerDrawCreate).toHaveBeenCalledTimes(1);
    const createArg = mockWinnerDrawCreate.mock.calls[0][0];
    expect(createArg.data.seed).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex = 64 chars
  });
});

describe("winner.pickWinners — cutoff resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubAdminUser();
    stubTransaction();
    mockWinnerDrawCreate.mockResolvedValue({ id: "draw-cutoff" });
    mockExecuteRaw.mockResolvedValue(0);
    mockQueryRaw.mockResolvedValue([{ id: "reg-x", pos: 1 }]);
    mockWinnerDrawSelectionCreateMany.mockResolvedValue({ count: 1 });
  });

  it("defaults the cutoff to activation.endsAt when status is ENDED", async () => {
    const endsAt = new Date("2026-04-01T18:00:00Z");
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1",
      status: "ENDED",
      endsAt,
    });
    mockRegistrationCount.mockResolvedValueOnce(10);

    const caller = await makeWinnerCaller();
    await caller.pickWinners({
      activationId: "act-1",
      winnerCount: 1,
      reserveCount: 0,
      phrase: "DRAW",
    });

    const createArg = mockWinnerDrawCreate.mock.calls[0][0];
    expect(createArg.data.eligibilityCutoffAt.toISOString()).toBe(
      endsAt.toISOString(),
    );
  });

  it("defaults the cutoff to ~now when status is LIVE", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1",
      status: "LIVE",
      endsAt: new Date(Date.now() + 86400000),
    });
    mockRegistrationCount.mockResolvedValueOnce(10);

    const before = Date.now();
    const caller = await makeWinnerCaller();
    await caller.pickWinners({
      activationId: "act-1",
      winnerCount: 1,
      reserveCount: 0,
      phrase: "DRAW",
    });
    const after = Date.now();

    const createArg = mockWinnerDrawCreate.mock.calls[0][0];
    const cutoffMs = (createArg.data.eligibilityCutoffAt as Date).getTime();
    expect(cutoffMs).toBeGreaterThanOrEqual(before);
    expect(cutoffMs).toBeLessThanOrEqual(after);
  });

  it("respects an explicit eligibilityCutoffAt override", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({
      id: "act-1",
      status: "LIVE",
      endsAt: new Date(Date.now() + 86400000),
    });
    mockRegistrationCount.mockResolvedValueOnce(10);

    const customCutoff = new Date("2026-05-01T12:00:00Z");
    const caller = await makeWinnerCaller();
    await caller.pickWinners({
      activationId: "act-1",
      winnerCount: 1,
      reserveCount: 0,
      eligibilityCutoffAt: customCutoff,
      phrase: "DRAW",
    });

    const createArg = mockWinnerDrawCreate.mock.calls[0][0];
    expect(createArg.data.eligibilityCutoffAt.toISOString()).toBe(
      customCutoff.toISOString(),
    );
  });
});
