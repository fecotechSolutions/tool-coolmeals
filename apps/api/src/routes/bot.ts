import {
  HASHTAG_ATENCION_HUMANA,
  botHandoffSchema,
  botUpsertConversationSchema,
  createSampleRequestSchema,
  decideRouteInputSchema,
  fail,
  ok,
  type CommercialSettings,
} from "@coolmeals/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  findKapsoExecutionForHandoff,
  setKapsoExecutionHandoff,
} from "../lib/kapso";
import { decideRoute } from "../lib/routing";
import { deriveFinalizeAt } from "../lib/finalize-derived";
import {
  appendSheetRow,
  commercialAttentionSheetRow,
  derivedLeadSheetRow,
  noCoverageSheetRow,
  sampleLogisticsSheetRow,
} from "../lib/sheets";
import { getSupabase } from "../lib/supabase";
import {
  mapConversation,
  mapDistributor,
  type DbConversation,
  type DbDistributor,
} from "../lib/mappers";
import { requireRole } from "../middleware/auth";

export const botRoutes = new Hono();

async function loadCommercialSettings(): Promise<CommercialSettings> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("commercial_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { minBundlesDefault: 50, provinceDistributorMap: [], rules: [] };
  }

  return {
    minBundlesDefault: data.min_bundles_default ?? 50,
    provinceDistributorMap: Array.isArray(data.province_distributor_map)
      ? data.province_distributor_map
      : [],
    rules: Array.isArray(data.rules) ? data.rules : [],
  };
}

botRoutes.post(
  "/upsert-conversation",
  requireRole("superadmin", "admin"),
  zValidator("json", botUpsertConversationSchema),
  async (c) => {
    const body = c.req.valid("json");
    const supabase = getSupabase();

    const { data: existing } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", body.phone)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      phone: body.phone,
      origin: body.origin,
    };

    if (body.name !== undefined) patch.name = body.name;
    if (body.status !== undefined) patch.status = body.status;
    if (body.clientType !== undefined) patch.client_type = body.clientType;
    if (body.province !== undefined) patch.province = body.province;
    if (body.distributorId !== undefined)
      patch.distributor_id = body.distributorId;
    if (body.aiSummary !== undefined) patch.ai_summary = body.aiSummary;
    if (body.lastMessage !== undefined) patch.last_message = body.lastMessage;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.tags !== undefined) patch.tags = body.tags;
    if (body.estimatedVolume !== undefined)
      patch.estimated_volume = body.estimatedVolume;
    if (body.outcome !== undefined) patch.outcome = body.outcome;
    if (body.kapsoConversationId !== undefined)
      patch.kapso_conversation_id = body.kapsoConversationId;
    if (body.kapsoExecutionId !== undefined)
      patch.kapso_execution_id = body.kapsoExecutionId;

    let row: DbConversation;

    if (existing) {
      const messages = Array.isArray(existing.messages)
        ? [...existing.messages]
        : [];
      if (body.message) messages.push(body.message);
      patch.messages = messages;

      const { data, error } = await supabase
        .from("conversations")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) return c.json(fail("DB_ERROR", error.message), 500);
      row = data as DbConversation;
    } else {
      const insert = {
        name: body.name ?? body.phone,
        phone: body.phone,
        origin: body.origin,
        status: body.status ?? "ia_atendiendo",
        client_type: body.clientType ?? "minorista",
        province: body.province ?? "Córdoba",
        distributor_id: body.distributorId ?? null,
        ai_summary: body.aiSummary ?? "",
        last_message: body.lastMessage ?? body.message?.content ?? "",
        notes: body.notes ?? "",
        tags: body.tags ?? [],
        estimated_volume: body.estimatedVolume ?? null,
        outcome: body.outcome ?? null,
        kapso_conversation_id: body.kapsoConversationId ?? null,
        kapso_execution_id: body.kapsoExecutionId ?? null,
        messages: body.message ? [body.message] : [],
        created_at: now,
      };

      const { data, error } = await supabase
        .from("conversations")
        .insert(insert)
        .select("*")
        .single();

      if (error) return c.json(fail("DB_ERROR", error.message), 500);
      row = data as DbConversation;
    }

    return c.json(ok(mapConversation(row)));
  },
);

botRoutes.post(
  "/decide-route",
  requireRole("superadmin", "admin"),
  zValidator("json", decideRouteInputSchema),
  async (c) => {
    const input = c.req.valid("json");
    const supabase = getSupabase();

    const [{ data: distRows, error }, settings] = await Promise.all([
      supabase.from("distributors").select("*").eq("active", true),
      loadCommercialSettings(),
    ]);

    if (error) return c.json(fail("DB_ERROR", error.message), 500);

    const distributors = ((distRows ?? []) as DbDistributor[]).map(
      mapDistributor,
    );
    const decision = decideRoute(input, distributors, settings);
    return c.json(ok(decision));
  },
);

botRoutes.post(
  "/handoff",
  requireRole("superadmin", "admin"),
  zValidator("json", botHandoffSchema),
  async (c) => {
    const body = c.req.valid("json");
    const supabase = getSupabase();

    let query = supabase.from("conversations").select("*");
    if (body.conversationId) {
      query = query.eq("id", body.conversationId);
    } else if (body.phone) {
      query = query.eq("phone", body.phone).order("updated_at", {
        ascending: false,
      });
    } else {
      return c.json(
        fail("VALIDATION_ERROR", "conversationId or phone required"),
        400,
      );
    }

    const { data: existing, error: findError } = await query
      .limit(1)
      .maybeSingle();

    if (findError) return c.json(fail("DB_ERROR", findError.message), 500);
    if (!existing) {
      return c.json(fail("NOT_FOUND", "Conversation not found"), 404);
    }

    const existingRow = existing as DbConversation;

    const executionId = await findKapsoExecutionForHandoff({
      executionId: body.kapsoExecutionId ?? existingRow.kapso_execution_id,
      whatsappConversationId: existingRow.kapso_conversation_id,
    });

    let kapsoHandoff: { ok: boolean; executionId: string | null; error?: string } =
      {
        ok: false,
        executionId,
        error: executionId
          ? undefined
          : "Sin execution Kapso activa para pausar el bot",
      };

    if (executionId) {
      const result = await setKapsoExecutionHandoff(executionId);
      kapsoHandoff = {
        ok: result.ok,
        executionId,
        error: result.error,
      };
    }

    const status =
      body.status === "quiere_ser_distribuidor" ||
      body.status === "quiere_ser_representante" ||
      body.status === "quiere_ser_fason" ||
      body.status === "sin_cobertura" ||
      body.status === "muestras" ||
      body.status === "esperando_respuesta"
        ? body.status
        : "atencion_representante";
    const outcome =
      body.outcome ??
      (status === "quiere_ser_distribuidor"
        ? "quiere_ser_distribuidor"
        : status === "quiere_ser_representante"
          ? "quiere_ser_representante"
          : status === "quiere_ser_fason"
            ? "quiere_ser_fason"
            : status === "sin_cobertura"
              ? "sin_cobertura"
              : status === "muestras"
                ? "muestras"
                : "handoff_humano");

    const tags = Array.from(
      new Set([
        ...(Array.isArray(existingRow.tags) ? existingRow.tags : []).filter(
          (tag) => tag !== "#atendido_por_representante",
        ),
        ...(status === "sin_cobertura" || status === "muestras"
          ? []
          : [HASHTAG_ATENCION_HUMANA]),
      ]),
    );

    const now = new Date();
    const finalizeAt = deriveFinalizeAt(now).toISOString();

    const { data, error } = await supabase
      .from("conversations")
      .update({
        status,
        outcome,
        human_handoff_at: now.toISOString(),
        finalize_at: finalizeAt,
        ai_summary: body.aiSummary ?? existingRow.ai_summary,
        notes: [existingRow.notes, `Handoff: ${body.reason}`]
          .filter(Boolean)
          .join("\n"),
        tags,
        assigned_to: existingRow.assigned_to ?? "admin@coolmeals.com",
        kapso_execution_id: executionId ?? existingRow.kapso_execution_id,
      })
      .eq("id", existingRow.id)
      .select("*")
      .single();

    if (error) {
      // Migration aún no aplicada: reintentar sin finalize_at
      if (error.message.includes("finalize_at")) {
        const retry = await supabase
          .from("conversations")
          .update({
            status,
            outcome,
            human_handoff_at: now.toISOString(),
            ai_summary: body.aiSummary ?? existingRow.ai_summary,
            notes: [existingRow.notes, `Handoff: ${body.reason}`]
              .filter(Boolean)
              .join("\n"),
            tags,
            assigned_to: existingRow.assigned_to ?? "admin@coolmeals.com",
            kapso_execution_id: executionId ?? existingRow.kapso_execution_id,
          })
          .eq("id", existingRow.id)
          .select("*")
          .single();
        if (retry.error) return c.json(fail("DB_ERROR", retry.error.message), 500);
        const sheetRetry = await syncHandoffSheets(
          retry.data as DbConversation,
          status,
          body.reason,
        );
        return c.json(
          ok({
            conversation: mapConversation(retry.data as DbConversation),
            handoff: {
              sameNumber: true,
              kapso: kapsoHandoff,
              finalizeAt: null,
              sheet: sheetRetry,
              instruction:
                "Operador responde en el mismo WhatsApp; el bot no procesa inbound mientras la execution esté en handoff.",
            },
          }),
        );
      }
      return c.json(fail("DB_ERROR", error.message), 500);
    }

    const sheet = await syncHandoffSheets(
      data as DbConversation,
      status,
      body.reason,
    );

    return c.json(
      ok({
        conversation: mapConversation(data as DbConversation),
        handoff: {
          sameNumber: true,
          kapso: kapsoHandoff,
          finalizeAt,
          sheet,
          instruction:
            "Operador responde en el mismo WhatsApp; el bot no procesa inbound mientras la execution esté en handoff. Tras la ventana (24h) pasa a Finalizado.",
        },
      }),
    );
  },
);

botRoutes.post(
  "/request-samples",
  requireRole("superadmin", "admin"),
  zValidator("json", createSampleRequestSchema),
  async (c) => {
    const body = c.req.valid("json");
    const supabase = getSupabase();

    let conversationId = body.conversationId ?? null;
    if (!conversationId && body.phone) {
      const { data: found } = await supabase
        .from("conversations")
        .select("id")
        .eq("phone", body.phone)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (found?.id) conversationId = found.id;
    }

    const { data, error } = await supabase
      .from("sample_requests")
      .insert({
        conversation_id: conversationId,
        lead_id: body.leadId ?? null,
        full_name: body.fullName,
        phone: body.phone,
        address: body.address,
        city: body.city ?? "",
        province: body.province ?? "",
        postal_code: body.postalCode ?? "",
        notes: body.notes ?? "",
        status: "pendiente",
      })
      .select("*")
      .single();

    if (error) return c.json(fail("DB_ERROR", error.message), 500);

    if (conversationId) {
      await supabase
        .from("conversations")
        .update({
          status: "muestras",
          outcome: "muestras",
        })
        .eq("id", conversationId);
    }

    const sheet = await appendSheetRow(
      "sample_logistics",
      "sample_request",
      data.id,
      sampleLogisticsSheetRow({
        fullName: body.fullName,
        phone: body.phone,
        address: body.address,
      }),
      { sampleRequestId: data.id },
    );

    if (sheet.success) {
      await supabase
        .from("sample_requests")
        .update({ sheet_synced_at: new Date().toISOString() })
        .eq("id", data.id);
    }

    return c.json(
      ok({
        sampleRequest: {
          id: data.id,
          conversationId: data.conversation_id,
          leadId: data.lead_id,
          fullName: data.full_name,
          phone: data.phone,
          address: data.address,
          city: data.city,
          province: data.province,
          postalCode: data.postal_code,
          status: data.status,
          sheetSyncedAt: sheet.success ? new Date().toISOString() : null,
          notes: data.notes,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
        sheet,
      }),
      201,
    );
  },
);

botRoutes.post(
  "/sync-derived",
  requireRole("superadmin", "admin"),
  async (c) => {
    const body = await c.req.json();
    const conversationId = body.conversationId as string | undefined;
    if (!conversationId) {
      return c.json(fail("VALIDATION_ERROR", "conversationId required"), 400);
    }

    const supabase = getSupabase();
    const { data: conv, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .maybeSingle();

    if (error) return c.json(fail("DB_ERROR", error.message), 500);
    if (!conv) return c.json(fail("NOT_FOUND", "Conversation not found"), 404);

    let distributorName = "";
    if (conv.distributor_id) {
      const { data: dist } = await supabase
        .from("distributors")
        .select("name")
        .eq("id", conv.distributor_id)
        .maybeSingle();
      distributorName = dist?.name ?? "";
    }

    const now = new Date();
    const finalizeAt = deriveFinalizeAt(now).toISOString();

    await supabase
      .from("conversations")
      .update({
        status: "derivado_distribuidor",
        outcome: "derivado_distribuidor",
        derived_at: now.toISOString(),
        finalize_at: finalizeAt,
      })
      .eq("id", conv.id);

    const sheet = await appendSheetRow(
      "derived_distributors",
      "conversation",
      conv.id,
      derivedLeadSheetRow({
        fullName: conv.name,
        phone: conv.phone,
        clientType: conv.client_type,
        province: conv.province,
        distributorName,
      }),
      {
        conversationId: conv.id,
        distributorId: conv.distributor_id,
      },
    );

    return c.json(ok({ sheet, finalizeAt }));
  },
);

/** Tercer feedback: sheets de interés comercial (dist/rep/fasón) y sin cobertura. */
async function syncHandoffSheets(
  conv: DbConversation,
  status: string,
  reason: string,
) {
  if (
    status === "quiere_ser_distribuidor" ||
    status === "quiere_ser_representante" ||
    status === "quiere_ser_fason"
  ) {
    const tipoCliente =
      status === "quiere_ser_distribuidor"
        ? "distribuidor"
        : status === "quiere_ser_representante"
          ? "representante"
          : "fason";
    return appendSheetRow(
      "commercial_attention",
      "conversation",
      conv.id,
      commercialAttentionSheetRow({
        fullName: conv.name,
        phone: conv.phone,
        tipoCliente,
        province: conv.province || "",
        reason,
      }),
      { conversationId: conv.id, status, tipoCliente },
    );
  }

  if (status === "sin_cobertura") {
    return appendSheetRow(
      "no_coverage",
      "conversation",
      conv.id,
      noCoverageSheetRow({
        fullName: conv.name,
        phone: conv.phone,
        province: conv.province || "",
        clientType: conv.client_type,
        reason,
      }),
      { conversationId: conv.id, status },
    );
  }

  return { attempted: false, success: true, spreadsheetId: null as string | null };
}
