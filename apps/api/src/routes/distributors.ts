import { fail, ok } from "@coolmeals/shared";
import { Hono } from "hono";
import { getSupabase } from "../lib/supabase";
import {
  mapDistributor,
  type DbDistributor,
} from "../lib/mappers";
import { requireRole } from "../middleware/auth";

export const distributorsRoutes = new Hono();

distributorsRoutes.get("/", requireRole("superadmin", "admin"), async (c) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("distributors")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return c.json(fail("DB_ERROR", error.message), 500);
  return c.json(ok((data as DbDistributor[]).map(mapDistributor)));
});

distributorsRoutes.post("/", requireRole("superadmin", "admin"), async (c) => {
  const body = await c.req.json();
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("distributors")
    .insert({
      name: body.name,
      province: body.province,
      zones: body.zones ?? [],
      contact_name: body.contactName ?? "",
      whatsapp: body.whatsapp ?? "",
      email: body.email ?? "",
      active: body.active ?? true,
      covered_provinces: body.coveredProvinces ?? [],
      postal_codes: body.postalCodes ?? [],
    })
    .select("*")
    .single();

  if (error) return c.json(fail("DB_ERROR", error.message), 500);
  return c.json(ok(mapDistributor(data as DbDistributor)), 201);
});

distributorsRoutes.patch("/:id", requireRole("superadmin", "admin"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const supabase = getSupabase();

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.province !== undefined) patch.province = body.province;
  if (body.zones !== undefined) patch.zones = body.zones;
  if (body.contactName !== undefined) patch.contact_name = body.contactName;
  if (body.whatsapp !== undefined) patch.whatsapp = body.whatsapp;
  if (body.email !== undefined) patch.email = body.email;
  if (body.active !== undefined) patch.active = body.active;
  if (body.coveredProvinces !== undefined)
    patch.covered_provinces = body.coveredProvinces;
  if (body.postalCodes !== undefined) patch.postal_codes = body.postalCodes;

  const { data, error } = await supabase
    .from("distributors")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return c.json(fail("DB_ERROR", error.message), 500);
  if (!data) return c.json(fail("NOT_FOUND", "Distributor not found"), 404);
  return c.json(ok(mapDistributor(data as DbDistributor)));
});

distributorsRoutes.delete(
  "/:id",
  requireRole("superadmin"),
  async (c) => {
    const id = c.req.param("id");
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("distributors")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return c.json(fail("DB_ERROR", error.message), 500);
    if (!data) return c.json(fail("NOT_FOUND", "Distributor not found"), 404);
    return c.json(ok({ id: (data as { id: string }).id }));
  },
);
