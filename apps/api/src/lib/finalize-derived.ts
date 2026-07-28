import { getEnv } from "../env";
import {
  findKapsoExecutionForHandoff,
  listKapsoExecutions,
  sendKapsoWhatsAppText,
  setKapsoExecutionEnded,
  setKapsoExecutionHandoff,
} from "./kapso";
import { getSupabase } from "./supabase";
import type { DbConversation } from "./mappers";

const DEFAULT_NUDGE =
  "Hola! ¿Tenés alguna consulta más? Si no recibimos respuesta, vamos a cerrar esta conversación. Quedamos atentos.";

const STUCK_RECOVERY_MESSAGE =
  "Disculpá — tuve un problema técnico y no pude responder. ¿Me repetís tu último mensaje?";

/** Solo estos statuses auto-pasan a Finalizado cuando vence la ventana. */
const HANDOFF_FINALIZE_STATUSES = [
  "sin_cobertura",
  "esperando_respuesta",
] as const;

/** Mid-flujo: IA esperando al lead (aún sin handoff). */
const MID_FLOW_STATUSES = ["ia_atendiendo", "nuevo"] as const;

export type PipelineTimeoutsResult = {
  stuckRunning: {
    scanned: number;
    recovered: number;
    items: Array<{
      executionId: string;
      whatsappConversationId: string | null;
      ageMinutes: number;
      kapsoEnded: boolean;
      messageSent: boolean;
      error?: string;
    }>;
  };
  escalated: {
    scanned: number;
    moved: number;
    items: Array<{
      conversationId: string;
      messageSent: boolean;
      kapsoHandoff: boolean;
      error?: string;
    }>;
  };
  finalized: {
    scanned: number;
    finalized: number;
    items: Array<{
      conversationId: string;
      fromStatus: string;
      kapsoExecutionId: string | null;
      kapsoEnded: boolean;
      kapsoError?: string;
      dbError?: string;
    }>;
  };
};

function hoursFromNow(hours: number, from = new Date()): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

function cutoffIso(hours: number, from = new Date()): string {
  return new Date(from.getTime() - hours * 60 * 60 * 1000).toISOString();
}

/**
 * 0) Executions Kapso stuck en `running` ≥ STUCK_RUNNING_MINUTES:
 *    → ended (+ mensaje de recuperación si hay teléfono en DB)
 * 1) Mid-flujo inactivo ≥ ABANDONED_TO_WAITING_HOURS (22):
 *    → Esperando respuesta + mensaje WA + handoff + finalize_at (+22h)
 * 2) Ventana vencida:
 *    - Sin cobertura → Descartado + Kapso ended
 *    - Esperando respuesta → Finalizado + Kapso ended
 *    (resto de columnas: quedan hasta cierre manual con resultado)
 */
export async function runPipelineTimeouts(): Promise<PipelineTimeoutsResult> {
  const stuckRunning = await recoverStuckRunningExecutions();
  const escalated = await escalateAbandonedToWaiting();
  const finalized = await finalizeHandoffWindows();
  return { stuckRunning, escalated, finalized };
}

/**
 * Si el agent Kapso se queda en `running` (p.ej. tras un tool call sin
 * send_notification / enter_waiting), los próximos WhatsApp se encolan en
 * esa execution y el lead no recibe respuesta. Forzamos `ended` para que el
 * siguiente mensaje abra una execution nueva.
 */
export async function recoverStuckRunningExecutions(): Promise<
  PipelineTimeoutsResult["stuckRunning"]
> {
  const env = getEnv();
  const minutes = env.STUCK_RUNNING_MINUTES;
  const cutoffMs = Date.now() - minutes * 60 * 1000;
  const items: PipelineTimeoutsResult["stuckRunning"]["items"] = [];

  const listed = await listKapsoExecutions({ status: "running", limit: 30 });
  if (!listed.ok) {
    return {
      scanned: 0,
      recovered: 0,
      items: [
        {
          executionId: "",
          whatsappConversationId: null,
          ageMinutes: 0,
          kapsoEnded: false,
          messageSent: false,
          error: listed.error,
        },
      ],
    };
  }

  const supabase = getSupabase();

  for (const exec of listed.executions) {
    const anchor = exec.last_event_at || exec.started_at;
    if (!anchor) continue;
    const anchorMs = Date.parse(anchor);
    if (!Number.isFinite(anchorMs) || anchorMs > cutoffMs) continue;

    const ageMinutes = Math.round((Date.now() - anchorMs) / 60000);
    const ended = await setKapsoExecutionEnded(exec.id);
    let messageSent = false;
    let error = ended.error;

    if (ended.ok && exec.whatsapp_conversation_id) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, phone, status")
        .eq("kapso_conversation_id", exec.whatsapp_conversation_id)
        .maybeSingle();

      const phone = (conv as { phone?: string } | null)?.phone;
      const status = (conv as { status?: string } | null)?.status;
      if (
        phone &&
        status &&
        (MID_FLOW_STATUSES as readonly string[]).includes(status)
      ) {
        const sent = await sendKapsoWhatsAppText({
          toPhone: phone,
          body: STUCK_RECOVERY_MESSAGE,
        });
        messageSent = sent.ok;
        if (!sent.ok) error = [error, sent.error].filter(Boolean).join("; ");
      }
    }

    items.push({
      executionId: exec.id,
      whatsappConversationId: exec.whatsapp_conversation_id ?? null,
      ageMinutes,
      kapsoEnded: ended.ok,
      messageSent,
      error,
    });
  }

  return {
    scanned: listed.executions.length,
    recovered: items.filter((i) => i.kapsoEnded).length,
    items,
  };
}

export async function escalateAbandonedToWaiting(): Promise<
  PipelineTimeoutsResult["escalated"]
> {
  const env = getEnv();
  const supabase = getSupabase();
  const hours = env.ABANDONED_TO_WAITING_HOURS;
  const finalizeHours = env.ESPERANDO_TO_FINALIZE_HOURS;
  const cutoff = cutoffIso(hours);
  const now = new Date();
  const finalizeAt = hoursFromNow(finalizeHours, now).toISOString();
  const nudge =
    process.env.ABANDONED_NUDGE_MESSAGE?.trim() || DEFAULT_NUDGE;

  const byId = new Map<string, DbConversation>();

  for (const status of MID_FLOW_STATUSES) {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("status", status)
      .lte("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(50);

    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as DbConversation[]) {
      byId.set(row.id, row);
    }
  }

  const rows = Array.from(byId.values());
  const items: PipelineTimeoutsResult["escalated"]["items"] = [];
  let moved = 0;

  for (const row of rows) {
    const item: PipelineTimeoutsResult["escalated"]["items"][number] = {
      conversationId: row.id,
      messageSent: false,
      kapsoHandoff: false,
    };

    try {
      const msg = await sendKapsoWhatsAppText({
        toPhone: row.phone,
        body: nudge,
      });
      item.messageSent = msg.ok;
      if (!msg.ok) item.error = msg.error;

      const executionId = await findKapsoExecutionForHandoff({
        executionId: row.kapso_execution_id,
        whatsappConversationId: row.kapso_conversation_id,
        statuses: ["waiting", "running", "handoff"],
      });
      const endId = executionId || row.kapso_execution_id || null;
      if (endId) {
        const handoff = await setKapsoExecutionHandoff(endId);
        item.kapsoHandoff = handoff.ok;
        if (!handoff.ok) {
          item.error = [item.error, handoff.error].filter(Boolean).join(" | ");
        }
      }

      const patch: Record<string, unknown> = {
        status: "esperando_respuesta",
        outcome: "handoff_humano",
        human_handoff_at: now.toISOString(),
        last_message: nudge,
        notes: [
          row.notes,
          "Auto: inactividad mid-flujo → Esperando respuesta + handoff (nudge de cierre)",
        ]
          .filter(Boolean)
          .join("\n"),
        kapso_execution_id: endId ?? row.kapso_execution_id,
      };
      patch.finalize_at = finalizeAt;

      let { error: updateError } = await supabase
        .from("conversations")
        .update(patch)
        .eq("id", row.id)
        .eq("status", row.status);

      if (updateError?.message.includes("finalize_at")) {
        delete patch.finalize_at;
        const retry = await supabase
          .from("conversations")
          .update(patch)
          .eq("id", row.id)
          .eq("status", row.status);
        updateError = retry.error;
      }

      if (updateError) {
        item.error = [item.error, updateError.message].filter(Boolean).join(" | ");
        items.push(item);
        continue;
      }

      moved += 1;
      items.push(item);
    } catch (error) {
      item.error = error instanceof Error ? error.message : String(error);
      items.push(item);
    }
  }

  return { scanned: rows.length, moved, items };
}

export async function finalizeHandoffWindows(): Promise<
  PipelineTimeoutsResult["finalized"]
> {
  const env = getEnv();
  const supabase = getSupabase();
  const now = new Date();
  const nowIso = now.toISOString();
  const esperandoHours = env.ESPERANDO_TO_FINALIZE_HOURS;

  const byId = new Map<string, DbConversation>();

  for (const status of HANDOFF_FINALIZE_STATUSES) {
    // Sin cobertura / Esperando respuesta: 22h → cierre automático.
    const fallbackHours = esperandoHours;
    const fallbackCutoff = cutoffIso(fallbackHours, now);

    const dueWithFinalize = await supabase
      .from("conversations")
      .select("*")
      .eq("status", status)
      .not("finalize_at", "is", null)
      .lte("finalize_at", nowIso)
      .order("finalize_at", { ascending: true })
      .limit(50);

    if (dueWithFinalize.error?.message.includes("finalize_at")) {
      // Migration ausente: por updated_at; esperando exige human_handoff_at
      let q = supabase
        .from("conversations")
        .select("*")
        .eq("status", status)
        .lte("updated_at", fallbackCutoff)
        .order("updated_at", { ascending: true })
        .limit(50);
      if (status === "esperando_respuesta") {
        q = q.not("human_handoff_at", "is", null);
      }
      const fb = await q;
      if (fb.error) throw new Error(fb.error.message);
      for (const row of (fb.data ?? []) as DbConversation[]) {
        byId.set(row.id, row);
      }
      continue;
    }

    if (dueWithFinalize.error) {
      throw new Error(dueWithFinalize.error.message);
    }

    for (const row of (dueWithFinalize.data ?? []) as DbConversation[]) {
      byId.set(row.id, row);
    }

    // Fallback sin finalize_at: por updated_at;
    // esperando_respuesta solo si ya hubo handoff (human_handoff_at).
    let q = supabase
      .from("conversations")
      .select("*")
      .eq("status", status)
      .is("finalize_at", null)
      .lte("updated_at", fallbackCutoff)
      .order("updated_at", { ascending: true })
      .limit(50);
    if (status === "esperando_respuesta") {
      q = q.not("human_handoff_at", "is", null);
    }
    const fb = await q;
    if (fb.error) throw new Error(fb.error.message);
    for (const row of (fb.data ?? []) as DbConversation[]) {
      byId.set(row.id, row);
    }
  }

  const rows = Array.from(byId.values());
  const items: PipelineTimeoutsResult["finalized"]["items"] = [];
  let finalized = 0;

  for (const row of rows) {
    const fromStatus = row.status;
    const executionId = await findKapsoExecutionForHandoff({
      executionId: row.kapso_execution_id,
      whatsappConversationId: row.kapso_conversation_id,
      statuses: ["handoff", "waiting", "running"],
    });

    const endId = executionId || row.kapso_execution_id || null;
    let kapsoEnded = false;
    let kapsoError: string | undefined;

    if (endId) {
      const result = await setKapsoExecutionEnded(endId);
      kapsoEnded = result.ok;
      kapsoError = result.error;
      if (
        !result.ok &&
        /ended|cannot transition/i.test(result.error ?? "")
      ) {
        kapsoEnded = true;
        kapsoError = undefined;
      }
    }

    const goesToDescartado = fromStatus === "sin_cobertura";
    const nextStatus = goesToDescartado ? "descartado" : "finalizado";
    const nextOutcome = goesToDescartado ? "descartado" : null;
    const note = goesToDescartado
      ? "Auto: Sin cobertura → Descartado tras ~22h de handoff + Kapso ended"
      : fromStatus === "esperando_respuesta"
        ? "Auto-finalizado tras ventana en Esperando respuesta (post-nudge/handoff)"
        : "Auto-finalizado tras ventana de handoff";

    const patch: Record<string, unknown> = {
      status: nextStatus,
      notes: [row.notes, note].filter(Boolean).join("\n"),
      finalize_at: null,
    };
    if (nextOutcome) patch.outcome = nextOutcome;

    const { error: updateError } = await supabase
      .from("conversations")
      .update(patch)
      .eq("id", row.id)
      .eq("status", fromStatus);

    if (updateError) {
      items.push({
        conversationId: row.id,
        fromStatus,
        kapsoExecutionId: endId,
        kapsoEnded,
        kapsoError,
        dbError: updateError.message,
      });
      continue;
    }

    finalized += 1;
    items.push({
      conversationId: row.id,
      fromStatus,
      kapsoExecutionId: endId,
      kapsoEnded,
      ...(kapsoError ? { kapsoError } : {}),
    });
  }

  return { scanned: rows.length, finalized, items };
}

/** @deprecated */
export type FinalizeHandoffResult = PipelineTimeoutsResult["finalized"];
/** @deprecated */
export type FinalizeDerivedResult = FinalizeHandoffResult;

/** Alias cron/scripts existentes. */
export async function finalizeDerivedConversations() {
  return finalizeHandoffWindows();
}

export function deriveFinalizeAt(from = new Date()): Date {
  const hours = getEnv().DERIVE_HANDOFF_HOURS;
  return hoursFromNow(hours, from);
}

export function esperandoFinalizeAt(from = new Date()): Date {
  const hours = getEnv().ESPERANDO_TO_FINALIZE_HOURS;
  return hoursFromNow(hours, from);
}

/**
 * Cierre manual desde Pipeline:
 * - éxito / sin éxito → status=finalizado + outcome
 * - descartado → status=descartado + outcome=descartado
 * En todos los casos: Kapso ended.
 */
export async function finalizeConversationWithResult(input: {
  conversationId: string;
  result: "finalizado_exito" | "finalizado_sin_exito" | "descartado";
  reason?: string;
  kapsoExecutionId?: string | null;
}): Promise<{
  ok: true;
  row: DbConversation;
  fromStatus: string;
  outcome: "finalizado_exito" | "finalizado_sin_exito" | "descartado";
  kapsoExecutionId: string | null;
  kapsoEnded: boolean;
  kapsoError?: string;
}> {
  const supabase = getSupabase();
  const { data: existing, error: findError } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", input.conversationId)
    .maybeSingle();

  if (findError) throw new Error(findError.message);
  if (!existing) throw new Error("Conversation not found");

  const row = existing as DbConversation;
  const fromStatus = row.status;

  const executionId = await findKapsoExecutionForHandoff({
    executionId: input.kapsoExecutionId ?? row.kapso_execution_id,
    whatsappConversationId: row.kapso_conversation_id,
    statuses: ["handoff", "waiting", "running"],
  });

  const endId = executionId || row.kapso_execution_id || null;
  let kapsoEnded = false;
  let kapsoError: string | undefined;

  if (endId) {
    const result = await setKapsoExecutionEnded(endId);
    kapsoEnded = result.ok;
    kapsoError = result.error;
    if (!result.ok && /ended|cannot transition/i.test(result.error ?? "")) {
      kapsoEnded = true;
      kapsoError = undefined;
    }
  } else {
    // Sin execution: ok (ej. card solo en Pipeline sin bot activo).
    kapsoEnded = true;
  }

  const isDescartado = input.result === "descartado";
  const label = isDescartado
    ? "Descartado"
    : input.result === "finalizado_exito"
      ? "Finalizado con éxito"
      : "Finalizado sin éxito";
  const note = [`Pipeline: ${label}`, input.reason?.trim() || null]
    .filter(Boolean)
    .join(" — ");

  const { data: updated, error: updateError } = await supabase
    .from("conversations")
    .update({
      status: isDescartado ? "descartado" : "finalizado",
      outcome: input.result,
      finalize_at: null,
      notes: [row.notes, note].filter(Boolean).join("\n"),
    })
    .eq("id", row.id)
    .select("*")
    .single();

  if (updateError) throw new Error(updateError.message);

  return {
    ok: true,
    row: updated as DbConversation,
    fromStatus,
    outcome: input.result,
    kapsoExecutionId: endId,
    kapsoEnded,
    ...(kapsoError ? { kapsoError } : {}),
  };
}
