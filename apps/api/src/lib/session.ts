import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "../env";
import type { AppUserRole } from "./app-users";

export type SessionUser = {
  id: string;
  email: string;
  role: AppUserRole;
  mustChangePassword: boolean;
};

type SessionPayload = SessionUser & {
  exp: number;
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

function b64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(input: string): Buffer {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function sign(payloadPart: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payloadPart).digest());
}

function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function createSessionToken(user: SessionUser): string {
  const { SESSION_SECRET } = getEnv();
  const payload: SessionPayload = {
    ...user,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadPart = b64url(JSON.stringify(payload));
  return `${payloadPart}.${sign(payloadPart, SESSION_SECRET)}`;
}

export function verifySessionToken(token: string): SessionUser | null {
  const { SESSION_SECRET } = getEnv();
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const payloadPart = parts[0];
  const sig = parts[1];
  if (!payloadPart || !sig) return null;
  if (!safeEqualStr(sig, sign(payloadPart, SESSION_SECRET))) return null;

  try {
    const payload = JSON.parse(
      fromB64url(payloadPart).toString("utf8"),
    ) as SessionPayload;
    if (!payload?.email || !payload?.id) return null;
    if (payload.role !== "superadmin" && payload.role !== "admin") return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      mustChangePassword: Boolean(payload.mustChangePassword),
    };
  } catch {
    return null;
  }
}
