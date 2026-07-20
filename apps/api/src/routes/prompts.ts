import { fail, ok, updatePromptConfigSchema } from "@coolmeals/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getSupabase } from "../lib/supabase";
import { requireRole } from "../middleware/auth";

export const promptsRoutes = new Hono();

function mapPrompt(row: {
  id: string;
  name: string;
  personality: string;
  tone: string;
  objectives: string;
  restrictions: string;
  flows: string;
  rules: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    name: row.name,
    personality: row.personality,
    tone: row.tone,
    objectives: row.objectives,
    restrictions: row.restrictions,
    flows: row.flows,
    rules: row.rules,
    updatedAt: row.updated_at,
  };
}

promptsRoutes.get("/", requireRole("superadmin", "admin"), async (c) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("prompt_configs")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return c.json(fail("DB_ERROR", error.message), 500);

  if (!data) {
    return c.json(
      ok({
        id: "00000000-0000-0000-0000-000000000000",
        name: "WhatsApp Agent",
        personality: "",
        tone: "",
        objectives: "",
        restrictions: "",
        flows: "",
        rules: "",
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  return c.json(ok(mapPrompt(data)));
});

promptsRoutes.put(
  "/",
  requireRole("superadmin", "admin"),
  zValidator("json", updatePromptConfigSchema),
  async (c) => {
    const body = c.req.valid("json");
    const supabase = getSupabase();

    const { data: existing } = await supabase
      .from("prompt_configs")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { data, error } = await supabase
        .from("prompt_configs")
        .insert({
          name: body.name ?? "WhatsApp Agent",
          personality: body.personality ?? "",
          tone: body.tone ?? "",
          objectives: body.objectives ?? "",
          restrictions: body.restrictions ?? "",
          flows: body.flows ?? "",
          rules: body.rules ?? "",
        })
        .select("*")
        .single();

      if (error) return c.json(fail("DB_ERROR", error.message), 500);
      return c.json(ok(mapPrompt(data)));
    }

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.personality !== undefined) patch.personality = body.personality;
    if (body.tone !== undefined) patch.tone = body.tone;
    if (body.objectives !== undefined) patch.objectives = body.objectives;
    if (body.restrictions !== undefined) patch.restrictions = body.restrictions;
    if (body.flows !== undefined) patch.flows = body.flows;
    if (body.rules !== undefined) patch.rules = body.rules;

    const { data, error } = await supabase
      .from("prompt_configs")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) return c.json(fail("DB_ERROR", error.message), 500);
    return c.json(ok(mapPrompt(data)));
  },
);
