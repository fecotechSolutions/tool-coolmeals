import { commercialSettingsSchema, fail, ok } from "@coolmeals/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getSupabase } from "../lib/supabase";
import { requireRole } from "../middleware/auth";

export const commercialRoutes = new Hono();

function mapRow(row: {
  min_bundles_default: number;
  province_distributor_map: unknown;
  rules: unknown;
}): {
  minBundlesDefault: number;
  provinceDistributorMap: Array<{ province: string; distributorId: string }>;
  rules: unknown[];
} {
  return {
    minBundlesDefault: row.min_bundles_default ?? 50,
    provinceDistributorMap: Array.isArray(row.province_distributor_map)
      ? (row.province_distributor_map as Array<{
          province: string;
          distributorId: string;
        }>)
      : [],
    rules: Array.isArray(row.rules) ? row.rules : [],
  };
}

commercialRoutes.get("/", requireRole("superadmin", "admin"), async (c) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("commercial_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return c.json(fail("DB_ERROR", error.message), 500);

  if (!data) {
    return c.json(
      ok({ minBundlesDefault: 50, provinceDistributorMap: [], rules: [] }),
    );
  }

  return c.json(ok(mapRow(data)));
});

commercialRoutes.put(
  "/",
  requireRole("superadmin", "admin"),
  zValidator("json", commercialSettingsSchema),
  async (c) => {
    const body = c.req.valid("json");
    const supabase = getSupabase();

    const { data: existing } = await supabase
      .from("commercial_settings")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = {
      min_bundles_default: body.minBundlesDefault,
      province_distributor_map: body.provinceDistributorMap,
      rules: body.rules,
    };

    const query = existing
      ? supabase
          .from("commercial_settings")
          .update(payload)
          .eq("id", existing.id)
          .select("*")
          .single()
      : supabase.from("commercial_settings").insert(payload).select("*").single();

    const { data, error } = await query;
    if (error) return c.json(fail("DB_ERROR", error.message), 500);
    return c.json(ok(mapRow(data)));
  },
);
