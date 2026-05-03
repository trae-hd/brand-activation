import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, checkPasswordStrength } from "../password";

describe("hashPassword / verifyPassword", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple");
    expect(await verifyPassword("CorrectHorseBatteryStaple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple");
    expect(await verifyPassword("WrongPassword", hash)).toBe(false);
  });

  it("produces a bcrypt hash (starts with $2a$12$)", async () => {
    const hash = await hashPassword("SomeValidPassword123!");
    expect(hash).toMatch(/^\$2a\$12\$/);
  });
}, { timeout: 30000 }); // bcrypt cost 12 is intentionally slow

describe("checkPasswordStrength", () => {
  it("rejects passwords shorter than 12 chars", () => {
    const result = checkPasswordStrength("short");
    expect(result.ok).toBe(false);
    expect(result.level).toBe("weak");
  });

  it("rejects passwords longer than 256 chars", () => {
    const result = checkPasswordStrength("a".repeat(257));
    expect(result.ok).toBe(false);
  });

  it("accepts a 12-char password as weak", () => {
    const result = checkPasswordStrength("abcdefghijkl");
    expect(result.ok).toBe(true);
    expect(result.level).toBe("weak");
  });

  it("rates 16-char passwords as fair", () => {
    const result = checkPasswordStrength("abcdefghijklmnop");
    expect(result.ok).toBe(true);
    expect(result.level).toBe("fair");
  });

  it("rates 20-char passwords as strong", () => {
    const result = checkPasswordStrength("abcdefghijklmnopqrst");
    expect(result.ok).toBe(true);
    expect(result.level).toBe("strong");
  });
});
