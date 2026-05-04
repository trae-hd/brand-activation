import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "test",
    PUBLIC_BASE_URL: "https://mrqlive.co.uk",
    INVITE_TOKEN_HMAC_KEY: "test-invite-key-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
    RESET_TOKEN_HMAC_KEY: "test-reset-key-bbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
}));

const mockActivationFindUnique = vi.fn();
const mockAdminUserFindUnique = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    activation: { findUnique: mockActivationFindUnique },
    adminUser: { findUnique: mockAdminUserFindUnique },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/audit/writeAuditLog", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/activation/reviewSnapshot", () => ({ buildReviewSnapshot: vi.fn() }));
vi.mock("@/lib/activation/lastApprovedConsentVersion", () => ({
  fetchLastApprovedConsentVersion: vi.fn(),
}));
vi.mock("@/lib/tiptap/validate", () => ({ validateAgainstAllowlist: () => ({ ok: true }) }));
vi.mock("@/lib/tiptap/consentVersion", () => ({ consentVersionOf: () => "hash" }));

// Mock QR render — return a predictable buffer containing the encoded URL
vi.mock("@/lib/qr/render", () => ({
  renderQrPng: vi.fn(async (url: string) => Buffer.from(url)),
  renderBoothQrPng: vi.fn(async () => Buffer.from("booth-qr")),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

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

async function makeCaller() {
  const { activationRouter } = await import("../activation");
  return activationRouter.createCaller(makeAdminCtx());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminUserFindUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", active: true });
});

// ── getCampaignQrPng ──────────────────────────────────────────────────────────

describe("activation.getCampaignQrPng", () => {
  it("throws NOT_FOUND when activation does not exist", async () => {
    mockActivationFindUnique.mockResolvedValueOnce(null);
    const caller = await makeCaller();
    await expect(
      caller.getCampaignQrPng({ activationId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns a base64-encoded PNG and filename with no UTM params", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({ slug: "boxing-2026" });
    const caller = await makeCaller();
    const result = await caller.getCampaignQrPng({ activationId: "act-1" });

    expect(result.filename).toBe("boxing-2026.png");
    // The mock renders Buffer.from(url) — decode and check it matches getActivationUrl output
    const encoded = Buffer.from(result.base64, "base64").toString("utf8");
    expect(encoded).toBe("https://mrqlive.co.uk/boxing-2026");
  });

  it("URL matches getActivationUrl with all UTM params", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({ slug: "boxing-2026" });
    const caller = await makeCaller();
    const result = await caller.getCampaignQrPng({
      activationId: "act-1",
      utmSource: "email",
      utmMedium: "newsletter",
      utmCampaign: "q1",
    });

    const encoded = Buffer.from(result.base64, "base64").toString("utf8");
    const parsed = new URL(encoded);
    expect(parsed.hostname).toBe("mrqlive.co.uk");
    expect(parsed.pathname).toBe("/boxing-2026");
    expect(parsed.searchParams.get("utm_source")).toBe("email");
    expect(parsed.searchParams.get("utm_medium")).toBe("newsletter");
    expect(parsed.searchParams.get("utm_campaign")).toBe("q1");
  });

  it("filename includes UTM parts", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({ slug: "boxing-2026" });
    const caller = await makeCaller();
    const result = await caller.getCampaignQrPng({
      activationId: "act-1",
      utmSource: "email",
      utmMedium: "newsletter",
      utmCampaign: "q1",
    });

    expect(result.filename).toBe("boxing-2026__email__newsletter__q1.png");
  });

  it("filename only includes provided UTM parts", async () => {
    mockActivationFindUnique.mockResolvedValueOnce({ slug: "boxing-2026" });
    const caller = await makeCaller();
    const result = await caller.getCampaignQrPng({
      activationId: "act-1",
      utmSource: "qr",
    });

    expect(result.filename).toBe("boxing-2026__qr.png");
  });
});
