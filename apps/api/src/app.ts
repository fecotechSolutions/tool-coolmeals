import { fail } from "@coolmeals/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { getEnv } from "./env";
import { optionalInternalAuth } from "./middleware/auth";
import { healthRoutes } from "./routes/health";
import { leadsRoutes } from "./routes/leads";

export function createApp() {
  const env = getEnv();
  const app = new Hono().basePath("/api");

  app.use("*", logger());
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: env.CORS_ORIGINS,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "x-internal-secret"],
      maxAge: 86400,
    }),
  );

  app.route("/health", healthRoutes);

  app.use("/leads/*", optionalInternalAuth);
  app.use("/leads", optionalInternalAuth);
  app.route("/leads", leadsRoutes);

  app.notFound((c) => c.json(fail("NOT_FOUND", "Route not found"), 404));

  app.onError((err, c) => {
    console.error("[api]", err);
    return c.json(fail("INTERNAL_ERROR", "Unexpected server error"), 500);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
