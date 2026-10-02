import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Raw token for email link + sha256 hash for DB storage. */
export function createResetToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  const hash = hashToken(raw);
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function isStrongEnoughPassword(password: string): boolean {
  return password.length >= 8;
}
