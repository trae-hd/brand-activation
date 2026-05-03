import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;
const MIN_LENGTH = 12;
const MAX_LENGTH = 256;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type PasswordStrength = "weak" | "fair" | "strong";

export function checkPasswordStrength(password: string): {
  ok: boolean;
  level: PasswordStrength;
  message?: string;
} {
  if (password.length < MIN_LENGTH) {
    return { ok: false, level: "weak", message: `Password must be at least ${MIN_LENGTH} characters.` };
  }
  if (password.length > MAX_LENGTH) {
    return { ok: false, level: "weak", message: `Password must be at most ${MAX_LENGTH} characters.` };
  }
  // Length-based strength guidance (NIST SP 800-63B: favour length over composition rules).
  if (password.length >= 20) return { ok: true, level: "strong" };
  if (password.length >= 16) return { ok: true, level: "fair" };
  return { ok: true, level: "weak" };
}
