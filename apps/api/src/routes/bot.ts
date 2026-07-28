import {
  HASHTAG_ATENCION_HUMANA,
  botFinalizeSchema,
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
  setKapsoExecutionEnded,
  setKapsoExecutionHandoff,
} from "../lib/kapso";
import { decideRoute } from "../lib/routing";
import {
  esperandoFinalizeAt,
  finalizeConversationWithResult,
} from "../lib/finalize-derived";
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

    const status =
      body.status === "quiere_ser_distribuidor" ||
      body.status === "quiere_ser_representante" ||
      body.status === "quiere_ser_fason" ||
      body.status === "sin_cobertura" ||
      body.status === "muestras" ||
      body.status === "esperando_respuesta" ||
      body.status === "descartado"
        ? body.status
        : "atencion_representante";

    const closesBot = status === "descartado";

    // Descartado: cerrar IA (ended). Muestras y resto: pausar (handoff) para seguimiento humano.
    // Incluir handoff en la búsqueda por si la card ya venía de otra columna pausada.
    const executionId = await findKapsoExecutionForHandoff({
      executionId: body.kapsoExecutionId ?? existingRow.kapso_execution_id,
      whatsappConversationId: existingRow.kapso_conversation_id,
      statuses: closesBot
        ? ["waiting", "running", "handoff"]
        : ["waiting", "running"],
    });

    let kapsoHandoff: {
      ok: boolean;
      executionId: string | null;
      ended?: boolean;
      error?: string;
    } = {
      ok: false,
      executionId,
      error: executionId
        ? undefined
        : closesBot
          ? "Sin execution Kapso activa para cerrar el bot"
          : "Sin execution Kapso activa para pausar el bot",
    };

    if (executionId) {
      if (closesBot) {
        const result = await setKapsoExecutionEnded(executionId);
        let ended = result.ok;
        let error = result.error;
        if (!result.ok && /ended|cannot transition/i.test(result.error ?? "")) {
          ended = true;
          error = undefined;
        }
        kapsoHandoff = {
          ok: ended,
          executionId,
          ended: true,
          error,
        };
      } else {
        const result = await setKapsoExecutionHandoff(executionId);
        kapsoHandoff = {
          ok: result.ok,
          executionId,
          error: result.error,
        };
      }
    }

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
                : status === "descartado"
                  ? "descartado"
                  : "handoff_humano");

    const tags = Array.from(
      new Set([
        ...(Array.isArray(existingRow.tags) ? existingRow.tags : []).filter(
          (tag) => tag !== "#atendido_por_representante",
        ),
        ...(status === "sin_cobertura" || status === "descartado"
          ? []
          : [HASHTAG_ATENCION_HUMANA]),
      ]),
    );

    const now = new Date();
    // Sin cobertura → auto Descartado (~22h). Esperando respuesta → auto Finalizado (~22h).
    const schedulesAutoFinalize =
      status === "sin_cobertura" || status === "esperando_respuesta";
    const finalizeAt = schedulesAutoFinalize
      ? esperandoFinalizeAt(now).toISOString()
      : null;

    const notePrefix =
      status === "muestras"
        ? "Handoff muestras (seguimiento representante)"
        : status === "descartado"
          ? "Descartado + IA cerrada (ended)"
          : "Handoff";

    const { data, error } = await supabase
      .from("conversations")
      .update({
        status,
        outcome,
        human_handoff_at: now.toISOString(),
        finalize_at: finalizeAt,
        ai_summary: body.aiSummary ?? existingRow.ai_summary,
        notes: [existingRow.notes, `${notePrefix}: ${body.reason}`]
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
          supabase,
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
      supabase,
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
            status === "muestras"
              ? "Muestras: sheet logística + handoff (representante hace seguimiento)."
              : status === "descartado"
                ? "Descartado: IA cerrada (Kapso ended). No aparece en columnas activas."
              : schedulesAutoFinalize
                ? status === "sin_cobertura"
                  ? "Bot en handoff. Tras ~22h pasa a Descartado y la IA queda cerrada (ended)."
                  : "Operador responde en el mismo WhatsApp; el bot no procesa inbound mientras la execution esté en handoff. Tras la ventana (~22h) pasa a Finalizado."
                : "Operador responde en el mismo WhatsApp; el bot no procesa inbound mientras la execution esté en handoff. Esta columna no auto-finaliza: cerrá con el desplegable de Resultado cuando corresponda.",
        },
      }),
    );
  },
);

botRoutes.post(
  "/finalize",
  requireRole("superadmin", "admin"),
  zValidator("json", botFinalizeSchema),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const result = await finalizeConversationWithResult({
        conversationId: body.conversationId,
        result: body.result,
        reason: body.reason,
        kapsoExecutionId: body.kapsoExecutionId,
      });
      return c.json(
        ok({
          conversation: mapConversation(result.row),
          finalize: {
            fromStatus: result.fromStatus,
            outcome: result.outcome,
            kapsoExecutionId: result.kapsoExecutionId,
            kapsoEnded: result.kapsoEnded,
            ...(result.kapsoError ? { kapsoError: result.kapsoError } : {}),
          },
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "Conversation not found") {
        return c.json(fail("NOT_FOUND", message), 404);
      }
      return c.json(fail("DB_ERROR", message), 500);
    }
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
        company: body.company,
        province: body.province,
        dni: body.dni,
        email: body.email,
        address: body.address,
        city: body.city ?? "",
        postal_code: body.postalCode,
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

    let clientType = "";
    if (conversationId) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("client_type")
        .eq("id", conversationId)
        .maybeSingle();
      clientType = (conv as { client_type?: string } | null)?.client_type ?? "";
    }

    const sheet = await appendSheetRow(
      "sample_logistics",
      "sample_request",
      data.id,
      sampleLogisticsSheetRow({
        fullName: body.fullName,
        phone: body.phone,
        clientType,
        company: body.company,
        province: body.province,
        dni: body.dni,
        email: body.email,
        postalCode: body.postalCode,
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
          company: data.company ?? "",
          province: data.province,
          dni: data.dni ?? "",
          email: data.email ?? "",
          address: data.address,
          city: data.city,
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

    await supabase
      .from("conversations")
      .update({
        status: "derivado_distribuidor",
        outcome: "derivado_distribuidor",
        derived_at: now.toISOString(),
        // Derivados no auto-finalizan: quedan hasta cierre manual.
        finalize_at: null,
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

    return c.json(ok({ sheet, finalizeAt: null }));
  },
);

/** Sheets al handoff: interés comercial, sin cobertura, o muestras (Pipeline). */
async function syncHandoffSheets(
  supabase: ReturnType<typeof getSupabase>,
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

  if (status === "muestras") {
    const { data: sample, error: sampleError } = await supabase
      .from("sample_requests")
      .insert({
        conversation_id: conv.id,
        full_name: conv.name || "",
        phone: conv.phone || "",
        company: "",
        province: conv.province || "",
        dni: "",
        email: "",
        address: "",
        city: "",
        postal_code: "",
        notes: reason || "Pipeline → Muestras",
        status: "pendiente",
      })
      .select("*")
      .single();

    if (sampleError) {
      // Igual intentamos el sheet con los datos de la conversación
      return appendSheetRow(
        "sample_logistics",
        "conversation",
        conv.id,
        sampleLogisticsSheetRow({
          fullName: conv.name || "",
          phone: conv.phone || "",
          clientType: conv.client_type || "",
          company: "",
          province: conv.province || "",
          dni: "",
          email: "",
          postalCode: "",
          address: "",
        }),
        { conversationId: conv.id, status, sampleError: sampleError.message },
      );
    }

    const sheet = await appendSheetRow(
      "sample_logistics",
      "sample_request",
      sample.id,
      sampleLogisticsSheetRow({
        fullName: sample.full_name || conv.name || "",
        phone: sample.phone || conv.phone || "",
        clientType: conv.client_type || "",
        company: sample.company || "",
        province: sample.province || conv.province || "",
        dni: sample.dni || "",
        email: sample.email || "",
        postalCode: sample.postal_code || "",
        address: sample.address || "",
      }),
      { sampleRequestId: sample.id, conversationId: conv.id, status },
    );

    if (sheet.success) {
      await supabase
        .from("sample_requests")
        .update({ sheet_synced_at: new Date().toISOString() })
        .eq("id", sample.id);
    }

    return sheet;
  }

  return { attempted: false, success: true, spreadsheetId: null as string | null };
}
