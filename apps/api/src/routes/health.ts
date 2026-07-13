import { Hono } from "hono";
import { ok } from "@coolmeals/shared";

export const healthRoutes = new Hono();

healthRoutes.get("/", (c) => {
  return c.json(
    ok({
      status: "ok",
      service: "coolmeals-leads-api",
      timestamp: new Date().toISOString(),
    }),
  );
});
