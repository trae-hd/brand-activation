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
const mockSelectionFindUnique = vi.fn();
const mockSelectionFindFirst = vi.fn();
const mockSelectionFindMany = vi.fn();
const mockSelectionUpdate = vi.fn();
const mockWinnerDrawFindUnique = vi.fn();
const mockExecuteRaw = vi.fn();
const mockQueryRaw = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    activation: { findUnique: mockActivationFindUnique },
    adminUser: { findUnique: mockAdminUserFindUnique },
    registration: { count: mockRegistrationCount },
    winnerDraw: { findUnique: mockWinnerDrawFindUnique },
    winnerDrawSelection: {
      findUnique: mockSelectionFindUnique,
      findFirst: mockSelectionFindFirst,
      findMany: mockSelectionFindMany,
      update: mockSelectionUpdate,
    },
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
      winnerDrawSelection: {
        createMany: mockWinnerDrawSelectionCreateMany,
        findFirst: mockSelectionFindFirst,
        update: mockSelectionUpdate,
      },
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: selection lifecycle (disqualify / promote / mark notified / edit notes)
// ─────────────────────────────────────────────────────────────────────────────

describe("winner.disqualifySelection — gate enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubAdminUser();
    stubTransaction();
  });

  it("rejects with NOT_FOUND when the selection doesn't exist", async () => {
    mockSelectionFindUnique.mockResolvedValueOnce(null);
    const caller = await makeWinnerCaller();
    await expect(
      caller.disqualifySelection({
        selectionId: "missing",
        reason: "test",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects with BAD_REQUEST when the selection is already disqualified", async () => {
    mockSelectionFindUnique.mockResolvedValueOnce({
      id: "sel-1",
      drawId: "draw-1",
      activationId: "act-1",
      position: 1,
      type: "WINNER",
      status: "DISQUALIFIED",
    });
    const caller = await makeWinnerCaller();
    await expect(
      caller.disqualifySelection({
        selectionId: "sel-1",
        reason: "test",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects MEMBER role with FORBIDDEN", async () => {
    stubAdminUser("MEMBER");
    const caller = await makeWinnerCaller("MEMBER");
    await expect(
      caller.disqualifySelection({
        selectionId: "sel-1",
        reason: "test",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects when reason is empty (Zod min(1))", async () => {
    const caller = await makeWinnerCaller();
    await expect(
      caller.disqualifySelection({
        selectionId: "sel-1",
        reason: "",
      }),
    ).rejects.toThrow();
  });
});

describe("winner.disqualifySelection — disqualify-and-promote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubAdminUser();
    stubTransaction();
  });

  it("disqualifying a WINNER with a SELECTED reserve promotes the topmost reserve", async () => {
    mockSelectionFindUnique.mockResolvedValueOnce({
      id: "sel-winner",
      drawId: "draw-1",
      activationId: "act-1",
      position: 2,
      type: "WINNER",
      status: "SELECTED",
    });
    // Topmost RESERVE (lowest position with type=RESERVE, status=SELECTED)
    mockSelectionFindFirst.mockResolvedValueOnce({
      id: "sel-reserve-top",
      position: 6,
    });

    const caller = await makeWinnerCaller();
    const result = await caller.disqualifySelection({
      selectionId: "sel-winner",
      reason: "Failed fraud check",
    });

    expect(result).toEqual({
      disqualifiedSelectionId: "sel-winner",
      promotedSelectionId: "sel-reserve-top",
    });

    // Two selection updates: disqualify the winner, promote the reserve
    expect(mockSelectionUpdate).toHaveBeenCalledTimes(2);
    const [disqUpdate, promoteUpdate] = mockSelectionUpdate.mock.calls;
    expect(disqUpdate[0].where).toEqual({ id: "sel-winner" });
    expect(disqUpdate[0].data).toMatchObject({
      status: "DISQUALIFIED",
      disqualifiedById: "admin-1",
      disqualifiedReason: "Failed fraud check",
    });
    expect(promoteUpdate[0].where).toEqual({ id: "sel-reserve-top" });
    expect(promoteUpdate[0].data).toMatchObject({
      type: "WINNER",
    });
    expect(promoteUpdate[0].data.promotedFromReserveAt).toBeInstanceOf(Date);

    // Two audit log entries: disqualified + promoted
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(2);
    const actions = mockWriteAuditLog.mock.calls.map((c) => c[0].action);
    expect(actions).toEqual([
      "winner.selection.disqualified",
      "winner.selection.promoted",
    ]);
  });

  it("disqualifying a WINNER with NO available reserve writes only the disqualified row, no promotion", async () => {
    mockSelectionFindUnique.mockResolvedValueOnce({
      id: "sel-winner",
      drawId: "draw-1",
      activationId: "act-1",
      position: 1,
      type: "WINNER",
      status: "SELECTED",
    });
    mockSelectionFindFirst.mockResolvedValueOnce(null); // no SELECTED reserve

    const caller = await makeWinnerCaller();
    const result = await caller.disqualifySelection({
      selectionId: "sel-winner",
      reason: "Unreachable",
    });

    expect(result).toEqual({
      disqualifiedSelectionId: "sel-winner",
      promotedSelectionId: null,
    });

    // One update only — the disqualified winner. No promotion.
    expect(mockSelectionUpdate).toHaveBeenCalledTimes(1);

    // One audit log entry only — disqualified. No promoted entry.
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog.mock.calls[0][0].action).toBe(
      "winner.selection.disqualified",
    );
  });

  it("disqualifying a RESERVE does NOT trigger promotion (no reserve-to-reserve cascading in v1)", async () => {
    mockSelectionFindUnique.mockResolvedValueOnce({
      id: "sel-reserve",
      drawId: "draw-1",
      activationId: "act-1",
      position: 6,
      type: "RESERVE",
      status: "SELECTED",
    });

    const caller = await makeWinnerCaller();
    const result = await caller.disqualifySelection({
      selectionId: "sel-reserve",
      reason: "Declined",
    });

    expect(result).toEqual({
      disqualifiedSelectionId: "sel-reserve",
      promotedSelectionId: null,
    });

    // findFirst should not have been called — we don't look for a promotion target on reserve disqualifications
    expect(mockSelectionFindFirst).not.toHaveBeenCalled();
    expect(mockSelectionUpdate).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog.mock.calls[0][0].action).toBe(
      "winner.selection.disqualified",
    );
  });

  it("audit metadata includes the activation, draw, position, type, and reason", async () => {
    mockSelectionFindUnique.mockResolvedValueOnce({
      id: "sel-winner",
      drawId: "draw-1",
      activationId: "act-1",
      position: 3,
      type: "WINNER",
      status: "SELECTED",
    });
    mockSelectionFindFirst.mockResolvedValueOnce(null);

    const caller = await makeWinnerCaller();
    await caller.disqualifySelection({
      selectionId: "sel-winner",
      reason: "Withdrew",
    });

    const auditArg = mockWriteAuditLog.mock.calls[0][0];
    expect(auditArg.metadata).toEqual({
      activationId: "act-1",
      drawId: "draw-1",
      position: 3,
      type: "WINNER",
      reason: "Withdrew",
    });
  });
});

describe("winner.markNotified", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubAdminUser();
    stubTransaction();
  });

  it("works for ADMIN role and writes the notified audit row", async () => {
    mockSelectionFindUnique.mockResolvedValueOnce({
      id: "sel-1",
      drawId: "draw-1",
      activationId: "act-1",
      position: 1,
      notificationNotes: null,
    });

    const caller = await makeWinnerCaller();
    const result = await caller.markNotified({
      selectionId: "sel-1",
    });

    expect(result).toEqual({ ok: true });
    expect(mockSelectionUpdate).toHaveBeenCalledTimes(1);
    expect(mockSelectionUpdate.mock.calls[0][0].data).toMatchObject({
      notifiedById: "admin-1",
    });
    expect(mockSelectionUpdate.mock.calls[0][0].data.notifiedAt).toBeInstanceOf(
      Date,
    );

    // Without a note, only one audit row (notified). No notes_updated.
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog.mock.calls[0][0].action).toBe(
      "winner.selection.notified",
    );
  });

  it("works for MEMBER role too (notification is shared between ADMIN and MEMBER)", async () => {
    stubAdminUser("MEMBER");
    mockSelectionFindUnique.mockResolvedValueOnce({
      id: "sel-1",
      drawId: "draw-1",
      activationId: "act-1",
      position: 1,
      notificationNotes: null,
    });

    const caller = await makeWinnerCaller("MEMBER");
    const result = await caller.markNotified({ selectionId: "sel-1" });
    expect(result).toEqual({ ok: true });
  });

  it("when a note is supplied, also updates notes fields and writes a notes_updated audit row", async () => {
    mockSelectionFindUnique.mockResolvedValueOnce({
      id: "sel-1",
      drawId: "draw-1",
      activationId: "act-1",
      position: 1,
      notificationNotes: null,
    });

    const caller = await makeWinnerCaller();
    await caller.markNotified({
      selectionId: "sel-1",
      note: "Spoke on phone, will email entry code",
    });

    const updateArg = mockSelectionUpdate.mock.calls[0][0];
    expect(updateArg.data).toMatchObject({
      notificationNotes: "Spoke on phone, will email entry code",
      notesUpdatedById: "admin-1",
    });
    expect(updateArg.data.notesUpdatedAt).toBeInstanceOf(Date);

    // Two audit rows: notified + notes_updated
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(2);
    const actions = mockWriteAuditLog.mock.calls.map((c) => c[0].action);
    expect(actions).toEqual([
      "winner.selection.notified",
      "winner.selection.notes_updated",
    ]);

    // notes_updated metadata captures lengths only (no content)
    const notesAudit = mockWriteAuditLog.mock.calls[1][0];
    expect(notesAudit.metadata).toMatchObject({
      previousLength: 0,
      newLength: "Spoke on phone, will email entry code".length,
    });
    expect(notesAudit.metadata).not.toHaveProperty("note");
    expect(notesAudit.metadata).not.toHaveProperty("notes");
  });

  it("ignores whitespace-only notes (treats as no note)", async () => {
    mockSelectionFindUnique.mockResolvedValueOnce({
      id: "sel-1",
      drawId: "draw-1",
      activationId: "act-1",
      position: 1,
      notificationNotes: null,
    });

    const caller = await makeWinnerCaller();
    await caller.markNotified({
      selectionId: "sel-1",
      note: "   \n\t  ",
    });

    // Only the notified audit row, no notes_updated
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockSelectionUpdate.mock.calls[0][0].data).not.toHaveProperty(
      "notificationNotes",
    );
  });

  it("rejects with NOT_FOUND when selection doesn't exist", async () => {
    mockSelectionFindUnique.mockResolvedValueOnce(null);
    const caller = await makeWinnerCaller();
    await expect(
      caller.markNotified({ selectionId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("winner.updateSelectionNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubAdminUser();
    stubTransaction();
  });

  it("captures previousLength and newLength in audit metadata, never the content", async () => {
    mockSelectionFindUnique.mockResolvedValueOnce({
      id: "sel-1",
      drawId: "draw-1",
      activationId: "act-1",
      position: 1,
      notificationNotes: "old note",
    });

    const caller = await makeWinnerCaller();
    await caller.updateSelectionNotes({
      selectionId: "sel-1",
      notes: "an updated, longer note about the call",
    });

    const auditArg = mockWriteAuditLog.mock.calls[0][0];
    expect(auditArg.action).toBe("winner.selection.notes_updated");
    expect(auditArg.metadata).toMatchObject({
      activationId: "act-1",
      drawId: "draw-1",
      position: 1,
      previousLength: "old note".length,
      newLength: "an updated, longer note about the call".length,
    });
    // Content is never in audit metadata (PII guard)
    expect(auditArg.metadata).not.toHaveProperty("notes");
    expect(auditArg.metadata).not.toHaveProperty("content");
    expect(auditArg.metadata).not.toHaveProperty("previousNotes");
    expect(auditArg.metadata).not.toHaveProperty("newNotes");
  });

  it("treats whitespace-only input as a clear-notes operation (sets to null)", async () => {
    mockSelectionFindUnique.mockResolvedValueOnce({
      id: "sel-1",
      drawId: "draw-1",
      activationId: "act-1",
      position: 1,
      notificationNotes: "old note",
    });

    const caller = await makeWinnerCaller();
    await caller.updateSelectionNotes({
      selectionId: "sel-1",
      notes: "   \n   ",
    });

    expect(mockSelectionUpdate.mock.calls[0][0].data.notificationNotes).toBeNull();
    expect(mockWriteAuditLog.mock.calls[0][0].metadata.newLength).toBe(0);
  });

  it("works for both ADMIN and MEMBER", async () => {
    stubAdminUser("MEMBER");
    mockSelectionFindUnique.mockResolvedValueOnce({
      id: "sel-1",
      drawId: "draw-1",
      activationId: "act-1",
      position: 1,
      notificationNotes: null,
    });

    const caller = await makeWinnerCaller("MEMBER");
    const result = await caller.updateSelectionNotes({
      selectionId: "sel-1",
      notes: "MEMBER edited this",
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects with NOT_FOUND when selection doesn't exist", async () => {
    mockSelectionFindUnique.mockResolvedValueOnce(null);
    const caller = await makeWinnerCaller();
    await expect(
      caller.updateSelectionNotes({
        selectionId: "missing",
        notes: "anything",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: copyEmails (used by the Pick Winners modal's result state)
// ─────────────────────────────────────────────────────────────────────────────

describe("winner.copyEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubAdminUser();
  });

  it("rejects with FORBIDDEN when called by a MEMBER (bulk copy is ADMIN-only)", async () => {
    stubAdminUser("MEMBER");
    const caller = await makeWinnerCaller("MEMBER");
    await expect(
      caller.copyEmails({ drawId: "draw-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects with NOT_FOUND when the draw doesn't exist", async () => {
    mockWinnerDrawFindUnique.mockResolvedValueOnce(null);
    const caller = await makeWinnerCaller();
    await expect(
      caller.copyEmails({ drawId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns emails of WINNER selections only, excluding disqualified and reserves", async () => {
    mockWinnerDrawFindUnique.mockResolvedValueOnce({
      id: "draw-1",
      activationId: "act-1",
    });
    // The mock should reflect the WHERE filter the procedure applies — we
    // assert the filter shape below; here we return what the DB would
    // return given that filter.
    mockSelectionFindMany.mockResolvedValueOnce([
      { position: 1, registration: { email: "winner1@example.com" } },
      { position: 2, registration: { email: "winner2@example.com" } },
      { position: 3, registration: { email: "promoted-reserve@example.com" } },
    ]);

    const caller = await makeWinnerCaller();
    const result = await caller.copyEmails({ drawId: "draw-1" });

    expect(result.emails).toEqual([
      "winner1@example.com",
      "winner2@example.com",
      "promoted-reserve@example.com",
    ]);

    // Confirm the WHERE filter — type WINNER, status not DISQUALIFIED,
    // registrationId not null
    const findManyArg = mockSelectionFindMany.mock.calls[0][0];
    expect(findManyArg.where).toMatchObject({
      drawId: "draw-1",
      type: "WINNER",
      status: { not: "DISQUALIFIED" },
      registrationId: { not: null },
    });
    expect(findManyArg.orderBy).toEqual({ position: "asc" });
  });

  it("skips selections with null registration (erased participants)", async () => {
    mockWinnerDrawFindUnique.mockResolvedValueOnce({
      id: "draw-1",
      activationId: "act-1",
    });
    // findMany already filters registrationId not null, but the result
    // shape includes a nullable registration relation. Defensive filter
    // in the procedure handles edge cases (e.g. erasure between findMany
    // and the .registration?.email read).
    mockSelectionFindMany.mockResolvedValueOnce([
      { position: 1, registration: { email: "live@example.com" } },
      { position: 2, registration: null },
      { position: 3, registration: { email: "" } },
    ]);

    const caller = await makeWinnerCaller();
    const result = await caller.copyEmails({ drawId: "draw-1" });

    expect(result.emails).toEqual(["live@example.com"]);
  });

  it("writes a winner.draw.bulk_email_copied audit row with the count", async () => {
    mockWinnerDrawFindUnique.mockResolvedValueOnce({
      id: "draw-1",
      activationId: "act-1",
    });
    mockSelectionFindMany.mockResolvedValueOnce([
      { position: 1, registration: { email: "a@example.com" } },
      { position: 2, registration: { email: "b@example.com" } },
    ]);

    const caller = await makeWinnerCaller();
    await caller.copyEmails({ drawId: "draw-1" });

    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    const auditArg = mockWriteAuditLog.mock.calls[0][0];
    expect(auditArg).toMatchObject({
      category: "ADMIN",
      action: "winner.draw.bulk_email_copied",
      actorId: "admin-1",
      targetType: "WinnerDraw",
      targetId: "draw-1",
      metadata: {
        activationId: "act-1",
        count: 2,
      },
    });
    // Audit metadata must NOT contain the emails themselves (PII guard)
    expect(auditArg.metadata).not.toHaveProperty("emails");
    expect(JSON.stringify(auditArg.metadata)).not.toContain("@example.com");
  });
});
