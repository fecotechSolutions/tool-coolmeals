import { fail } from "@coolmeals/shared";
import type { Context, Next } from "hono";
import { getEnv } from "../env";

/**
 * Temporary internal gate until Supabase Auth is connected.
 * If INTERNAL_API_SECRET is set, requests must send header:
 *   x-internal-secret: <value>
 * When Auth lands, replace this with JWT verification + role checks.
 */
export async function optionalInternalAuth(c: Context, next: Next) {
  const { INTERNAL_API_SECRET } = getEnv();

  if (!INTERNAL_API_SECRET) {
    await next();
    return;
  }

  const provided = c.req.header("x-internal-secret");
  if (provided !== INTERNAL_API_SECRET) {
    return c.json(fail("UNAUTHORIZED", "Invalid or missing internal secret"), 401);
  }

  await next();
}

/**
 * Placeholder for future role-based access.
 * Usage after Auth: requireRole("superadmin")(c, next)
 */
export function requireRole(..._allowed: Array<"superadmin" | "admin">) {
  return async (c: Context, next: Next) => {
    // TODO: read user from JWT / session and enforce role
    // const user = c.get("user");
    // if (!user || !allowed.includes(user.role)) {
    //   return c.json(fail("FORBIDDEN", "Insufficient role"), 403);
    // }
    await next();
  };
}
