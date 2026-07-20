import { fail } from "@coolmeals/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { getEnv } from "./env";
import { optionalInternalAuth } from "./middleware/auth";
import { botRoutes } from "./routes/bot";
import { commercialRoutes } from "./routes/commercial";
import { conversationsRoutes } from "./routes/conversations";
import { dashboardRoutes } from "./routes/dashboard";
import { distributorsRoutes } from "./routes/distributors";
import { healthRoutes } from "./routes/health";
import { knowledgeRoutes } from "./routes/knowledge";
import { leadsRoutes } from "./routes/leads";
import { promptsRoutes } from "./routes/prompts";
import { samplesRoutes } from "./routes/samples";
import { cronRoutes } from "./routes/cron";

export function createApp() {
  const env = getEnv();
  const app = new Hono().basePath("/api");

  app.use("*", logger());
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: env.CORS_ORIGINS,
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "x-internal-secret", "x-cron-secret"],
      maxAge: 86400,
    }),
  );

  app.route("/health", healthRoutes);
  app.route("/cron", cronRoutes);

  const protectedPaths = [
    "/leads",
    "/distributors",
    "/conversations",
    "/dashboard",
    "/commercial",
    "/knowledge",
    "/prompts",
    "/samples",
    "/bot",
  ] as const;

  for (const path of protectedPaths) {
    app.use(`${path}/*`, optionalInternalAuth);
    app.use(path, optionalInternalAuth);
  }

  app.route("/leads", leadsRoutes);
  app.route("/distributors", distributorsRoutes);
  app.route("/conversations", conversationsRoutes);
  app.route("/dashboard", dashboardRoutes);
  app.route("/commercial", commercialRoutes);
  app.route("/knowledge", knowledgeRoutes);
  app.route("/prompts", promptsRoutes);
  app.route("/samples", samplesRoutes);
  app.route("/bot", botRoutes);

  app.notFound((c) => c.json(fail("NOT_FOUND", "Route not found"), 404));

  app.onError((err, c) => {
    console.error("[api]", err);
    return c.json(fail("INTERNAL_ERROR", "Unexpected server error"), 500);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
