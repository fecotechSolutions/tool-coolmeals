import { fail } from "@coolmeals/shared";
import type { Context, MiddlewareHandler } from "hono";
import { getEnv } from "../env";
import { type SessionUser, verifySessionToken } from "../lib/session";

function readBearer(c: Context): string | null {
  const header = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function resolveUser(c: Context): SessionUser | null {
  const token = readBearer(c);
  if (token) {
    const user = verifySessionToken(token);
    if (user) return user;
  }

  const { INTERNAL_API_SECRET } = getEnv();
  if (INTERNAL_API_SECRET) {
    const provided = c.req.header("x-internal-secret");
    if (provided === INTERNAL_API_SECRET) {
      return {
        id: "00000000-0000-0000-0000-000000000000",
        email: "internal@tooling",
        role: "superadmin",
        mustChangePassword: false,
      };
    }
  }

  return null;
}

export const requireSession: MiddlewareHandler = async (c, next) => {
  const user = resolveUser(c);
  if (!user) {
    return c.json(fail("UNAUTHORIZED", "Login requerido"), 401);
  }
  c.set("user", user);
  await next();
};

export function requireRole(
  ...allowed: Array<"superadmin" | "admin">
): MiddlewareHandler {
  return async (c, next) => {
    let user = c.get("user") as SessionUser | undefined;
    if (!user) {
      user = resolveUser(c) ?? undefined;
      if (user) c.set("user", user);
    }
    if (!user || !allowed.includes(user.role)) {
      return c.json(fail("FORBIDDEN", "Insufficient role"), 403);
    }
    await next();
  };
}

export const optionalInternalAuth = requireSession;
