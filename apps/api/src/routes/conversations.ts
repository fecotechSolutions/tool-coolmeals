import { fail, ok, updateConversationSchema } from "@coolmeals/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getSupabase } from "../lib/supabase";
import {
  mapConversation,
  type DbConversation,
} from "../lib/mappers";
import { requireRole } from "../middleware/auth";

export const conversationsRoutes = new Hono();

conversationsRoutes.get("/", requireRole("superadmin", "admin"), async (c) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return c.json(fail("DB_ERROR", error.message), 500);
  return c.json(ok((data as DbConversation[]).map(mapConversation)));
});

conversationsRoutes.get("/:id", requireRole("superadmin", "admin"), async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return c.json(fail("DB_ERROR", error.message), 500);
  if (!data) return c.json(fail("NOT_FOUND", "Conversation not found"), 404);
  return c.json(ok(mapConversation(data as DbConversation)));
});

conversationsRoutes.patch(
  "/:id",
  requireRole("superadmin", "admin"),
  zValidator("json", updateConversationSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const supabase = getSupabase();

    const patch: Record<string, unknown> = {};
    if (body.status !== undefined) patch.status = body.status;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.assignedTo !== undefined) patch.assigned_to = body.assignedTo;
    if (body.aiSummary !== undefined) patch.ai_summary = body.aiSummary;
    if (body.tags !== undefined) patch.tags = body.tags;
    if (body.distributorId !== undefined)
      patch.distributor_id = body.distributorId;
    if (body.isCustomer !== undefined) patch.is_customer = body.isCustomer;
    if (body.clientType !== undefined) patch.client_type = body.clientType;
    if (body.province !== undefined) patch.province = body.province;
    if (body.estimatedVolume !== undefined)
      patch.estimated_volume = body.estimatedVolume;
    if (body.outcome !== undefined) patch.outcome = body.outcome;
    if (body.lastMessage !== undefined) patch.last_message = body.lastMessage;

    const { data, error } = await supabase
      .from("conversations")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) return c.json(fail("DB_ERROR", error.message), 500);
    if (!data) return c.json(fail("NOT_FOUND", "Conversation not found"), 404);
    return c.json(ok(mapConversation(data as DbConversation)));
  },
);
