import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function loadDotEnv() {
  const file = path.join(REPO_ROOT, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

loadDotEnv();

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BASE_URL = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/+$/, "");
const API_KEY = process.env.KAPSO_API_KEY;

if (!API_KEY) {
  throw new Error("Falta KAPSO_API_KEY (en .env o en el entorno)");
}

export async function api(method, apiPath, body) {
  const raw = await apiRaw(method, apiPath, body);
  return raw?.data ?? raw;
}

export async function apiRaw(method, apiPath, body, { retries = 6 } = {}) {
  let attempt = 0;
  for (;;) {
    const res = await fetch(`${BASE_URL}/platform/v1${apiPath}`, {
      method,
      headers: {
        "X-API-Key": API_KEY,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (res.ok) return data;

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(30_000, 2000 * 2 ** attempt);
      attempt += 1;
      await sleep(waitMs + Math.random() * 500);
      continue;
    }

    const detail = typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300);
    throw new Error(`${method} ${apiPath} → HTTP ${res.status}: ${detail}`);
  }
}

export async function listWorkflows() {
  const data = await api("GET", "/workflows");
  return Array.isArray(data) ? data : data?.workflows || [];
}

export async function getWorkflow(id) {
  return api("GET", `/workflows/${id}`);
}

export async function createWorkflow({ name, description, definition }) {
  return api("POST", "/workflows", { workflow: { name, description, definition } });
}

export async function updateWorkflow(id, workflow) {
  return api("PATCH", `/workflows/${id}`, { workflow });
}

export async function listTriggers(workflowId) {
  const data = await api("GET", `/workflows/${workflowId}/triggers`);
  return Array.isArray(data) ? data : data?.triggers || [];
}

export async function createTrigger(workflowId, trigger) {
  return api("POST", `/workflows/${workflowId}/triggers`, { trigger });
}

export async function startExecution(workflowId, workflowExecution) {
  return api("POST", `/workflows/${workflowId}/executions`, {
    workflow_execution: workflowExecution,
  });
}

export async function getExecution(executionId) {
  return api("GET", `/workflow_executions/${executionId}`);
}

export async function resumeExecution(executionId, data) {
  return api("POST", `/workflow_executions/${executionId}/resume`, {
    message: { kind: "payload", data },
  });
}

export async function listExecutionEvents(executionId, limit = 100) {
  // El endpoint corta en 100 por página; paginamos hacia atrás hasta juntar lo pedido.
  const events = [];
  let after;
  while (events.length < limit) {
    const query = new URLSearchParams({ limit: String(Math.min(100, limit - events.length)) });
    if (after) query.set("after", after);
    const raw = await apiRaw("GET", `/workflow_executions/${executionId}/events?${query}`);
    const page = raw?.data ?? raw?.events ?? [];
    events.push(...(Array.isArray(page) ? page : []));
    after = raw?.paging?.next || raw?.meta?.paging?.next;
    if (!page.length || !after) break;
  }
  return events.reverse(); // la API devuelve más reciente primero
}

export async function setExecutionStatus(executionId, status) {
  return api("PATCH", `/workflow_executions/${executionId}`, {
    workflow_execution: { status },
  });
}
