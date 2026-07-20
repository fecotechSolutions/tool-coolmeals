import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../apps/api/src/app";

type App = ReturnType<typeof createApp>;

let app: App | null = null;
let bootError: string | null = null;

function getApp(): App {
  if (app) return app;
  if (bootError) throw new Error(bootError);
  try {
    app = createApp();
    return app;
  } catch (err) {
    bootError = err instanceof Error ? err.message : String(err);
    throw new Error(bootError);
  }
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `https://${host}`);

    // Root: avoid confusing 404 / crash when probing the domain
    if (url.pathname === "/" || url.pathname === "") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          service: "coolmeals-leads-api",
          health: "/api/health",
        }),
      );
      return;
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      headers.set(key, Array.isArray(value) ? value.join(",") : value);
    }

    const body = await readBody(req);
    const request = new Request(url, {
      method: req.method,
      headers,
      body: body && body.length > 0 ? body : undefined,
    });

    const response = await getApp().fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      res.setHeader(key, value);
    });
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/handler]", message);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error: {
          code: "BOOT_OR_RUNTIME_ERROR",
          message,
          hint: "Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the Vercel API project, then redeploy.",
        },
      }),
    );
  }
}
