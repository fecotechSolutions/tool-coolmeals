import { createHmac, timingSafeEqual } from "node:crypto";
import { fail, ok } from "@coolmeals/shared";
import { Hono } from "hono";
import { getEnv } from "../env";
import { pauseBotOnHumanOutbound } from "../lib/pause-on-human-outbound";

export const kapsoWebhookRoutes = new Hono();

type KapsoMessagePayload = {
  event?: string;
  message?: {
    id?: string;
    kapso?: {
      direction?: string;
      origin?: string;
    };
  };
  conversation?: {
    id?: string;
    phone_number?: string;
  };
  phone_number_id?: string;
};

function verifySignature(rawBody: string, signature: string | undefined, secret: string) {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(signature, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function extractEvents(body: unknown, headerEvent?: string | null): KapsoMessagePayload[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;

  if (Array.isArray(root.events)) {
    return root.events.filter(Boolean) as KapsoMessagePayload[];
  }
  if (Array.isArray(root.data)) {
    return root.data.filter(Boolean) as KapsoMessagePayload[];
  }

  const single = root as KapsoMessagePayload;
  if (single.message || single.conversation) {
    if (!single.event && headerEvent) single.event = headerEvent;
    return [single];
  }
  if (root.data && typeof root.data === "object") {
    const nested = root.data as KapsoMessagePayload;
    if (!nested.event && headerEvent) nested.event = headerEvent;
    return [nested];
  }
  return [];
}

/**
 * Webhook Kapso (phone-number): `whatsapp.message.sent`.
 * Solo pausa cuando origin=business_app (WhatsApp Business App).
 */
kapsoWebhookRoutes.post("/", async (c) => {
  const env = getEnv();
  const rawBody = await c.req.text();
  const signature = c.req.header("X-Webhook-Signature") || c.req.header("x-webhook-signature");
  const headerEvent = c.req.header("X-Webhook-Event") || c.req.header("x-webhook-event");

  if (env.KAPSO_WEBHOOK_SECRET) {
    if (!verifySignature(rawBody, signature ?? undefined, env.KAPSO_WEBHOOK_SECRET)) {
      return c.json(fail("UNAUTHORIZED", "Invalid webhook signature"), 401);
    }
  } else if (env.APP_ENV === "production") {
    console.warn(
      "[webhooks/kapso] KAPSO_WEBHOOK_SECRET no configurado — aceptando sin firma (configurar en Vercel)",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody || "{}");
  } catch {
    return c.json(fail("VALIDATION_ERROR", "Invalid JSON"), 400);
  }

  const events = extractEvents(parsed, headerEvent);
  const results = [];

  for (const event of events) {
    const eventName = String(event.event || headerEvent || "");
    if (eventName && eventName !== "whatsapp.message.sent") {
      results.push({ skipped: true, reason: `ignored_event:${eventName}` });
      continue;
    }

    const direction = String(event.message?.kapso?.direction || "").toLowerCase();
    const origin = String(event.message?.kapso?.origin || "").toLowerCase();

    if (direction && direction !== "outbound") {
      results.push({ skipped: true, reason: `direction:${direction || "empty"}` });
      continue;
    }
    if (origin !== "business_app") {
      results.push({
        skipped: true,
        reason: `origin_not_business_app:${origin || "empty"}`,
      });
      continue;
    }

    const pause = await pauseBotOnHumanOutbound({
      leadPhone: event.conversation?.phone_number,
      kapsoConversationId: event.conversation?.id,
      reason:
        "Pausa auto: operador escribió desde WhatsApp Business App (fase E)",
    });
    results.push(pause);
  }

  // Siempre 200 para evitar reintentos agresivos de Kapso en skips.
  return c.json(ok({ processed: results.length, results }));
});
