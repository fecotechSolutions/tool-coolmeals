import { fail, ok, updateSampleRequestSchema } from "@coolmeals/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getSupabase } from "../lib/supabase";
import { requireRole } from "../middleware/auth";

export const samplesRoutes = new Hono();

function mapSample(row: {
  id: string;
  conversation_id: string | null;
  lead_id: string | null;
  full_name: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  status: string;
  sheet_synced_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    leadId: row.lead_id,
    fullName: row.full_name,
    phone: row.phone,
    address: row.address,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    status: row.status,
    sheetSyncedAt: row.sheet_synced_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

samplesRoutes.get("/", requireRole("superadmin", "admin"), async (c) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("sample_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return c.json(fail("DB_ERROR", error.message), 500);
  return c.json(ok((data ?? []).map(mapSample)));
});

samplesRoutes.patch(
  "/:id",
  requireRole("superadmin", "admin"),
  zValidator("json", updateSampleRequestSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const supabase = getSupabase();

    const patch: Record<string, string> = {};
    if (body.status !== undefined) patch.status = body.status;
    if (body.notes !== undefined) patch.notes = body.notes;

    if (Object.keys(patch).length === 0) {
      return c.json(fail("VALIDATION_ERROR", "Nada para actualizar"), 400);
    }

    const { data, error } = await supabase
      .from("sample_requests")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return c.json(fail("DB_ERROR", error.message), 500);
    return c.json(ok(mapSample(data)));
  },
);
