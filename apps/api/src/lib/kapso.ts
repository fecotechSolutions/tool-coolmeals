import { getEnv } from "../env";

const DEFAULT_WORKFLOW_ID = "454904ce-8fba-423f-bf08-32135f694b14";

type KapsoExecution = {
  id: string;
  status?: string;
  whatsapp_conversation_id?: string | null;
};

function kapsoConfig() {
  const env = getEnv();
  if (!env.KAPSO_API_BASE_URL || !env.KAPSO_API_KEY) {
    return null;
  }
  return {
    baseUrl: env.KAPSO_API_BASE_URL.replace(/\/+$/, ""),
    apiKey: env.KAPSO_API_KEY,
    workflowId: env.KAPSO_WORKFLOW_ID ?? DEFAULT_WORKFLOW_ID,
  };
}

async function kapsoRequest<T>(
  path: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string | undefined> },
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const config = kapsoConfig();
  if (!config) {
    return { ok: false, status: 0, error: "Kapso API not configured" };
  }

  const url = new URL(`${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  if (init?.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value) url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey,
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  let raw: unknown = null;
  try {
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = text;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error:
        typeof raw === "object" && raw && "error" in raw
          ? JSON.stringify((raw as { error: unknown }).error)
          : text || `HTTP ${response.status}`,
    };
  }

  return { ok: true, data: raw as T };
}

export async function setKapsoExecutionStatus(
  executionId: string,
  status: "handoff" | "ended" | "waiting",
): Promise<{ ok: boolean; error?: string }> {
  const result = await kapsoRequest<{ data?: KapsoExecution } | KapsoExecution>(
    `/platform/v1/workflow_executions/${executionId}`,
    {
      method: "PATCH",
      body: { workflow_execution: { status } },
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

export async function setKapsoExecutionHandoff(executionId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  return setKapsoExecutionStatus(executionId, "handoff");
}

export async function setKapsoExecutionEnded(executionId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  return setKapsoExecutionStatus(executionId, "ended");
}

export async function findKapsoExecutionForHandoff(input: {
  executionId?: string | null;
  whatsappConversationId?: string | null;
  statuses?: Array<"waiting" | "running" | "handoff">;
}): Promise<string | null> {
  if (input.executionId) return input.executionId;

  const config = kapsoConfig();
  if (!config || !input.whatsappConversationId) return null;

  const statuses = input.statuses ?? ["waiting", "running"];
  for (const status of statuses) {
    const listed = await kapsoRequest<{
      data?: KapsoExecution[];
      executions?: KapsoExecution[];
    }>(`/platform/v1/workflows/${config.workflowId}/executions`, {
      query: {
        status,
        whatsapp_conversation_id: input.whatsappConversationId,
        limit: "5",
      },
    });

    if (!listed.ok) continue;
    const payload = listed.data as
      | KapsoExecution[]
      | { data?: KapsoExecution[]; executions?: KapsoExecution[] };
    const rows = Array.isArray(payload)
      ? payload
      : (payload.data ?? payload.executions ?? []);
    const hit = rows.find((row) => row.id);
    if (hit?.id) return hit.id;
  }

  return null;
}

function normalizeWaTo(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/** Envía texto por el proxy Meta de Kapso (fuera del agent). */
export async function sendKapsoWhatsAppText(input: {
  toPhone: string;
  body: string;
  phoneNumberId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const env = getEnv();
  const phoneNumberId = input.phoneNumberId ?? env.KAPSO_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    return { ok: false, error: "KAPSO_PHONE_NUMBER_ID not configured" };
  }

  const to = normalizeWaTo(input.toPhone);
  if (!to) return { ok: false, error: "Invalid recipient phone" };

  const result = await kapsoRequest<unknown>(
    `/meta/whatsapp/v24.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: input.body },
      },
    },
  );

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
