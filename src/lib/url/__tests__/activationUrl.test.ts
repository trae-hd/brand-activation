import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { PUBLIC_BASE_URL: "https://activation.mrq.com" },
}));

const { getActivationUrl } = await import("../activationUrl");

describe("getActivationUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns base URL with slug and no params", () => {
    expect(getActivationUrl("boxing-2026")).toBe("https://activation.mrq.com/boxing-2026");
  });

  it("appends booth param", () => {
    const url = getActivationUrl("boxing-2026", { boothCode: "VIP" });
    expect(url).toBe("https://activation.mrq.com/boxing-2026?booth=VIP");
  });

  it("appends utm_source", () => {
    const url = getActivationUrl("boxing-2026", { utmSource: "email" });
    expect(url).toBe("https://activation.mrq.com/boxing-2026?utm_source=email");
  });

  it("appends utm_medium", () => {
    const url = getActivationUrl("boxing-2026", { utmMedium: "newsletter" });
    expect(url).toBe("https://activation.mrq.com/boxing-2026?utm_medium=newsletter");
  });

  it("appends utm_campaign", () => {
    const url = getActivationUrl("boxing-2026", { utmCampaign: "q1" });
    expect(url).toBe("https://activation.mrq.com/boxing-2026?utm_campaign=q1");
  });

  it("appends all UTM params together", () => {
    const url = getActivationUrl("boxing-2026", {
      utmSource: "email",
      utmMedium: "newsletter",
      utmCampaign: "boxing_q1",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("utm_source")).toBe("email");
    expect(parsed.searchParams.get("utm_medium")).toBe("newsletter");
    expect(parsed.searchParams.get("utm_campaign")).toBe("boxing_q1");
  });

  it("appends booth plus all UTM params", () => {
    const url = getActivationUrl("boxing-2026", {
      boothCode: "RINGSIDE",
      utmSource: "qr",
      utmMedium: "physical",
      utmCampaign: "venue",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("booth")).toBe("RINGSIDE");
    expect(parsed.searchParams.get("utm_source")).toBe("qr");
    expect(parsed.searchParams.get("utm_medium")).toBe("physical");
    expect(parsed.searchParams.get("utm_campaign")).toBe("venue");
  });

  it("does not append null params", () => {
    const url = getActivationUrl("boxing-2026", {
      boothCode: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    });
    expect(url).toBe("https://activation.mrq.com/boxing-2026");
  });

  it("does not append empty-string params", () => {
    const url = getActivationUrl("boxing-2026", {
      boothCode: "",
      utmSource: "",
    });
    expect(url).toBe("https://activation.mrq.com/boxing-2026");
  });

  it("URL-encodes special characters in params", () => {
    const url = getActivationUrl("boxing-2026", { utmCampaign: "summer sale 2026" });
    expect(url).toContain("utm_campaign=summer+sale+2026");
  });
});
