import {
  createLeadSchema,
  fail,
  listLeadsQuerySchema,
  ok,
  updateLeadSchema,
} from "@coolmeals/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { mapLead, type DbLead } from "../lib/mappers";
import { getSupabase } from "../lib/supabase";
import { requireRole } from "../middleware/auth";

export const leadsRoutes = new Hono();

leadsRoutes.get(
  "/",
  requireRole("superadmin", "admin"),
  zValidator("query", listLeadsQuerySchema),
  async (c) => {
    const { status, clientType, search, limit, offset } = c.req.valid("query");
    const supabase = getSupabase();

    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (clientType) query = query.eq("client_type", clientType);

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%,phone.ilike.%${search}%`,
      );
    }

    const { data, error, count } = await query;
    if (error) return c.json(fail("DB_ERROR", error.message), 500);

    return c.json(
      ok({
        items: ((data ?? []) as DbLead[]).map(mapLead),
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

  if (error) return c.json(fail("DB_ERROR", error.message), 500);
  if (!data) return c.json(fail("NOT_FOUND", "Lead not found"), 404);
  return c.json(ok(mapLead(data as DbLead)));
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
        full_name: body.fullName,
        email: body.email ?? null,
        phone: body.phone ?? "",
        company: body.company ?? null,
        province: body.province,
        city: body.city ?? "",
        postal_code: body.postalCode ?? "",
        business_type: body.businessType ?? "",
        client_type: body.clientType ?? "minorista",
        distributor_id: body.distributorId ?? null,
        origin: body.origin ?? "otro",
        status: body.status ?? "nuevo",
        is_customer: body.isCustomer ?? false,
      })
      .select("*")
      .single();

    if (error) return c.json(fail("DB_ERROR", error.message), 500);
    return c.json(ok(mapLead(data as DbLead)), 201);
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

    const patch: Record<string, unknown> = {};
    if (body.fullName !== undefined) patch.full_name = body.fullName;
    if (body.email !== undefined) patch.email = body.email;
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.company !== undefined) patch.company = body.company;
    if (body.province !== undefined) patch.province = body.province;
    if (body.city !== undefined) patch.city = body.city;
    if (body.postalCode !== undefined) patch.postal_code = body.postalCode;
    if (body.businessType !== undefined) patch.business_type = body.businessType;
    if (body.clientType !== undefined) patch.client_type = body.clientType;
    if (body.distributorId !== undefined)
      patch.distributor_id = body.distributorId;
    if (body.origin !== undefined) patch.origin = body.origin;
    if (body.status !== undefined) patch.status = body.status;
    if (body.isCustomer !== undefined) patch.is_customer = body.isCustomer;

    const { data, error } = await supabase
      .from("leads")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) return c.json(fail("DB_ERROR", error.message), 500);
    if (!data) return c.json(fail("NOT_FOUND", "Lead not found"), 404);
    return c.json(ok(mapLead(data as DbLead)));
  },
);

leadsRoutes.delete("/:id", requireRole("superadmin"), async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("leads")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return c.json(fail("DB_ERROR", error.message), 500);
  if (!data) return c.json(fail("NOT_FOUND", "Lead not found"), 404);
  return c.json(ok({ id: (data as { id: string }).id }));
});
