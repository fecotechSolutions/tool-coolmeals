import { fail, ok } from "@coolmeals/shared";
import { Hono } from "hono";
import { getEnv } from "../env";
import {
  finalizeDerivedConversations,
  runPipelineTimeouts,
} from "../lib/finalize-derived";

export const cronRoutes = new Hono();

function authorizeCron(c: {
  req: { header: (name: string) => string | undefined };
}) {
  const env = getEnv();
  const secret = env.CRON_SECRET ?? env.INTERNAL_API_SECRET;
  if (!secret) {
    return env.NODE_ENV === "development";
  }
  const header =
    c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ??
    c.req.header("x-cron-secret") ??
    "";
  return header === secret;
}

async function runTimeouts(c: {
  json: (body: unknown, status?: number) => Response;
}) {
  if (!authorizeCron(c as never)) {
    return c.json(fail("UNAUTHORIZED", "Invalid cron secret"), 401);
  }

  try {
    const result = await runPipelineTimeouts();
    return c.json(ok(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(fail("CRON_ERROR", message), 500);
  }
}

/** Preferido: escala abandonados + finaliza handoffs vencidos. */
cronRoutes.post("/pipeline-timeouts", (c) => runTimeouts(c));
cronRoutes.get("/pipeline-timeouts", (c) => runTimeouts(c));

/** Alias legacy (mismo comportamiento ampliado). */
cronRoutes.post("/finalize-derived", (c) => runTimeouts(c));
cronRoutes.get("/finalize-derived", (c) => runTimeouts(c));

/** Solo finaliza ventanas de handoff (sin escalar abandonados). */
cronRoutes.post("/finalize-handoffs-only", async (c) => {
  if (!authorizeCron(c)) {
    return c.json(fail("UNAUTHORIZED", "Invalid cron secret"), 401);
  }
  try {
    const result = await finalizeDerivedConversations();
    return c.json(ok(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(fail("CRON_ERROR", message), 500);
  }
});
