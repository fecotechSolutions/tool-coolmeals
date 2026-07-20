import { getEnv } from "../env";
import {
  findKapsoExecutionForHandoff,
  sendKapsoWhatsAppText,
  setKapsoExecutionEnded,
  setKapsoExecutionHandoff,
} from "./kapso";
import { getSupabase } from "./supabase";
import type { DbConversation } from "./mappers";

const DEFAULT_NUDGE =
  "Hola! ¿Tenés alguna consulta más? Si no recibimos respuesta, vamos a cerrar esta conversación. Quedamos atentos.";

/** Statuses que ya están en ventana de handoff → Finalizado. */
const HANDOFF_FINALIZE_STATUSES = [
  "derivado_distribuidor",
  "atencion_representante",
  "quiere_ser_distribuidor",
  "quiere_ser_representante",
  "quiere_ser_fason",
  "sin_cobertura",
  "muestras",
  "esperando_respuesta",
] as const;

/** Mid-flujo: IA esperando al lead (aún sin handoff). */
const MID_FLOW_STATUSES = ["ia_atendiendo", "nuevo"] as const;

export type PipelineTimeoutsResult = {
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
 * 1) Mid-flujo inactivo ≥ ABANDONED_TO_WAITING_HOURS (22):
 *    → Esperando respuesta + mensaje WA + handoff + finalize_at (+22h)
 * 2) Handoff windows vencidas (derive/atención 24h, esperando 22h):
 *    → Finalizado + Kapso ended
 */
export async function runPipelineTimeouts(): Promise<PipelineTimeoutsResult> {
  const escalated = await escalateAbandonedToWaiting();
  const finalized = await finalizeHandoffWindows();
  return { escalated, finalized };
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
  const deriveHours = env.DERIVE_HANDOFF_HOURS;
  const esperandoHours = env.ESPERANDO_TO_FINALIZE_HOURS;

  const byId = new Map<string, DbConversation>();

  for (const status of HANDOFF_FINALIZE_STATUSES) {
    const fallbackHours =
      status === "esperando_respuesta" ? esperandoHours : deriveHours;
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
      // Migration ausente: solo derivado/atención por updated_at; esperando exige human_handoff_at
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

    // Fallback sin finalize_at: derivado/atención por updated_at;
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

    const note =
      fromStatus === "esperando_respuesta"
        ? "Auto-finalizado tras ventana en Esperando respuesta (post-nudge/handoff)"
        : fromStatus === "atencion_representante"
          ? "Auto-finalizado tras ventana de handoff (atención humana)"
          : fromStatus === "quiere_ser_distribuidor"
            ? "Auto-finalizado tras ventana de handoff (quiere ser distribuidor)"
            : fromStatus === "quiere_ser_representante"
              ? "Auto-finalizado tras ventana de handoff (quiere ser representante)"
              : fromStatus === "quiere_ser_fason"
                ? "Auto-finalizado tras ventana de handoff (quiere ser fasón)"
                : fromStatus === "sin_cobertura"
                  ? "Auto-finalizado tras ventana de handoff (sin cobertura)"
                  : "Auto-finalizado tras ventana de handoff post-derivación";

    const { error: updateError } = await supabase
      .from("conversations")
      .update({
        status: "finalizado",
        notes: [row.notes, note].filter(Boolean).join("\n"),
      })
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
