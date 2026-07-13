import {
  createLeadSchema,
  fail,
  listLeadsQuerySchema,
  ok,
  updateLeadSchema,
  type Lead,
} from "@coolmeals/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getSupabase } from "../lib/supabase";
import { requireRole } from "../middleware/auth";

export const leadsRoutes = new Hono();

leadsRoutes.get(
  "/",
  requireRole("superadmin", "admin"),
  zValidator("query", listLeadsQuerySchema),
  async (c) => {
    const { status, search, limit, offset } = c.req.valid("query");
    const supabase = getSupabase();

    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%,phone.ilike.%${search}%`,
      );
    }

    const { data, error, count } = await query;

    if (error) {
      return c.json(fail("DB_ERROR", error.message), 500);
    }

    return c.json(
      ok({
        items: (data ?? []) as Lead[],
        total: count ?? 0,
        limit,
        offset,
      }),
    );
  },
);

leadsRoutes.get("/:id", requireRole("superadmin", "admin"), async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return c.json(fail("DB_ERROR", error.message), 500);
  }

  if (!data) {
    return c.json(fail("NOT_FOUND", "Lead not found"), 404);
  }

  return c.json(ok(data as Lead));
});

leadsRoutes.post(
  "/",
  requireRole("superadmin", "admin"),
  zValidator("json", createLeadSchema),
  async (c) => {
    const body = c.req.valid("json");
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("leads")
      .insert({
        full_name: body.full_name,
        email: body.email ?? null,
        phone: body.phone ?? null,
        company: body.company ?? null,
        source: body.source ?? null,
        status: body.status ?? "new",
        notes: body.notes ?? null,
        assigned_to: body.assigned_to ?? null,
      })
      .select("*")
      .single();

    if (error) {
      return c.json(fail("DB_ERROR", error.message), 500);
    }

    return c.json(ok(data as Lead), 201);
  },
);

leadsRoutes.patch(
  "/:id",
  requireRole("superadmin", "admin"),
  zValidator("json", updateLeadSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("leads")
      .update(body)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      return c.json(fail("DB_ERROR", error.message), 500);
    }

    if (!data) {
      return c.json(fail("NOT_FOUND", "Lead not found"), 404);
    }

    return c.json(ok(data as Lead));
  },
);

leadsRoutes.delete(
  "/:id",
  requireRole("superadmin"),
  async (c) => {
    const id = c.req.param("id");
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("leads")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      return c.json(fail("DB_ERROR", error.message), 500);
    }

    if (!data) {
      return c.json(fail("NOT_FOUND", "Lead not found"), 404);
    }

    return c.json(ok({ id: (data as { id: string }).id }));
  },
);
