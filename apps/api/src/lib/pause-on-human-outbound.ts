import {
  HASHTAG_ATENCION_HUMANA,
  phoneLookupVariants,
} from "@coolmeals/shared";
import {
  findKapsoExecutionForHandoff,
  setKapsoExecutionHandoff,
} from "./kapso";
import { getSupabase } from "./supabase";
import type { DbConversation } from "./mappers";

/** Columnas donde la IA aún puede estar activa y conviene pausar. */
const PAUSABLE_STATUSES = new Set([
  "nuevo",
  "ia_atendiendo",
  "quiere_ser_distribuidor",
  "esperando_respuesta",
]);

export type HumanOutboundPauseResult =
  | { ok: true; skipped: true; reason: string }
  | {
      ok: true;
      skipped: false;
      conversationId: string;
      executionId: string | null;
      kapsoHandoffOk: boolean;
      kapsoError?: string;
    }
  | { ok: false; error: string };

/**
 * Fase E (parcial): si un humano escribe desde WhatsApp Business App
 * (`origin=business_app`), pausa la execution Kapso y mueve la card a
 * Atención humana. No aplica a outbound `cloud_api` (bot / Kapso Inbox).
 */
export async function pauseBotOnHumanOutbound(input: {
  leadPhone?: string | null;
  kapsoConversationId?: string | null;
  reason?: string;
}): Promise<HumanOutboundPauseResult> {
  const supabase = getSupabase();
  const reason =
    input.reason ||
    "Pausa auto: mensaje outbound desde WhatsApp Business App (humano)";

  let existing: DbConversation | null = null;

  if (input.kapsoConversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("kapso_conversation_id", input.kapsoConversationId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    existing = (data as DbConversation) || null;
  }

  if (!existing && input.leadPhone) {
    const variants = phoneLookupVariants(input.leadPhone);
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .in("phone", variants.length ? variants : [input.leadPhone])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    existing = (data as DbConversation) || null;
  }

  if (!existing) {
    return { ok: true, skipped: true, reason: "conversation_not_found" };
  }

  const status = String(existing.status || "");
  if (!PAUSABLE_STATUSES.has(status)) {
    return {
      ok: true,
      skipped: true,
      reason: `status_not_pausable:${status || "empty"}`,
    };
  }

  const executionId = await findKapsoExecutionForHandoff({
    executionId: existing.kapso_execution_id,
    whatsappConversationId:
      input.kapsoConversationId || existing.kapso_conversation_id,
    statuses: ["waiting", "running"],
  });

  let kapsoHandoffOk = false;
  let kapsoError: string | undefined;
  if (executionId) {
    const result = await setKapsoExecutionHandoff(executionId);
    kapsoHandoffOk = result.ok;
    kapsoError = result.error;
  } else {
    kapsoError = "Sin execution Kapso activa (waiting/running) para pausar";
  }

  const tags = Array.from(
    new Set([
      ...(Array.isArray(existing.tags) ? existing.tags : []).filter(
        (tag) => tag !== "#atendido_por_representante",
      ),
      HASHTAG_ATENCION_HUMANA,
    ]),
  );

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("conversations")
    .update({
      status: "atencion_representante",
      outcome: "handoff_humano",
      human_handoff_at: now,
      notes: [existing.notes, `Handoff: ${reason}`].filter(Boolean).join("\n"),
      tags,
      assigned_to: existing.assigned_to ?? "admin@coolmeals.com",
      kapso_execution_id: executionId ?? existing.kapso_execution_id,
      kapso_conversation_id:
        input.kapsoConversationId || existing.kapso_conversation_id,
    })
    .eq("id", existing.id);

  if (updateError) return { ok: false, error: updateError.message };

  return {
    ok: true,
    skipped: false,
    conversationId: existing.id,
    executionId,
    kapsoHandoffOk,
    kapsoError,
  };
}
