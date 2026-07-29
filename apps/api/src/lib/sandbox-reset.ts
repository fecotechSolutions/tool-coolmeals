import { getEnv } from "../env";
import { listKapsoExecutions, setKapsoExecutionEnded } from "./kapso";
import { getSupabase } from "./supabase";

export type SandboxResetResult = {
  enabled: boolean;
  skippedReason?: string;
  kapso: {
    scanned: number;
    ended: number;
    errors: string[];
  };
  db: {
    conversationsDeleted: number;
    sampleRequestsDeleted: number;
    error?: string;
  };
};

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Reset agresivo para semana de pruebas sandbox:
 * 1) Kapso: waiting / running / handoff → ended
 * 2) Supabase: borra conversations (+ sample_requests) para que el mismo WA
 *    pueda tipificar de nuevo (incluye el lock de recontacto de 1 año).
 *
 * Solo corre si SANDBOX_RESET_ENABLED=true y (opcional) ahora < SANDBOX_RESET_UNTIL.
 */
export async function runSandboxReset(): Promise<SandboxResetResult> {
  const env = getEnv();
  const empty: SandboxResetResult = {
    enabled: false,
    kapso: { scanned: 0, ended: 0, errors: [] },
    db: { conversationsDeleted: 0, sampleRequestsDeleted: 0 },
  };

  if (!env.SANDBOX_RESET_ENABLED) {
    return { ...empty, skippedReason: "SANDBOX_RESET_ENABLED is not true" };
  }

  if (env.SANDBOX_RESET_UNTIL) {
    const until = Date.parse(env.SANDBOX_RESET_UNTIL);
    if (Number.isFinite(until) && Date.now() > until) {
      return {
        ...empty,
        skippedReason: `Past SANDBOX_RESET_UNTIL (${env.SANDBOX_RESET_UNTIL})`,
      };
    }
  }

  const kapso = await endActiveKapsoExecutions();
  const db = await wipeSandboxConversations(env.SANDBOX_RESET_PHONES ?? []);

  return {
    enabled: true,
    kapso,
    db,
  };
}

async function endActiveKapsoExecutions(): Promise<SandboxResetResult["kapso"]> {
  const errors: string[] = [];
  let scanned = 0;
  let ended = 0;

  for (const status of ["waiting", "running", "handoff"] as const) {
    const listed = await listKapsoExecutions({ status, limit: 50 });
    if (!listed.ok) {
      errors.push(`${status}: ${listed.error}`);
      continue;
    }
    scanned += listed.executions.length;
    for (const exec of listed.executions) {
      const res = await setKapsoExecutionEnded(exec.id);
      if (res.ok) ended += 1;
      else errors.push(`${exec.id}: ${res.error ?? "end failed"}`);
    }
  }

  return { scanned, ended, errors };
}

async function wipeSandboxConversations(
  phoneAllowlist: string[],
): Promise<SandboxResetResult["db"]> {
  const supabase = getSupabase();
  const allowDigits = phoneAllowlist
    .map((p) => normalizePhone(p))
    .filter(Boolean);

  const { data: rows, error: listError } = await supabase
    .from("conversations")
    .select("id, phone")
    .limit(500);

  if (listError) {
    return {
      conversationsDeleted: 0,
      sampleRequestsDeleted: 0,
      error: listError.message,
    };
  }

  let targets = (rows ?? []) as Array<{ id: string; phone: string }>;
  if (allowDigits.length > 0) {
    const allow = new Set(allowDigits);
    targets = targets.filter((r) => allow.has(normalizePhone(r.phone ?? "")));
  }

  if (targets.length === 0) {
    return { conversationsDeleted: 0, sampleRequestsDeleted: 0 };
  }

  const ids = targets.map((t) => t.id);

  const { data: samples, error: samplesError } = await supabase
    .from("sample_requests")
    .delete()
    .in("conversation_id", ids)
    .select("id");

  if (samplesError) {
    return {
      conversationsDeleted: 0,
      sampleRequestsDeleted: 0,
      error: samplesError.message,
    };
  }

  const { data: deleted, error: delError } = await supabase
    .from("conversations")
    .delete()
    .in("id", ids)
    .select("id");

  if (delError) {
    return {
      conversationsDeleted: 0,
      sampleRequestsDeleted: Array.isArray(samples) ? samples.length : 0,
      error: delError.message,
    };
  }

  return {
    conversationsDeleted: Array.isArray(deleted) ? deleted.length : 0,
    sampleRequestsDeleted: Array.isArray(samples) ? samples.length : 0,
  };
}
