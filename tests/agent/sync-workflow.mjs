/**
 * Sincroniza el workflow de test a partir de la definición de producción.
 *
 * El prompt vive en un solo lugar (`workflows/coolmeals-leads/workflow.ts` → `definition.json`).
 * Este script clona esa definición y solo cambia las tools para que apunten a la function mock,
 * de modo que los tests corran exactamente el mismo agente que producción.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  REPO_ROOT,
  createTrigger,
  createWorkflow,
  getWorkflow,
  listTriggers,
  listWorkflows,
  updateWorkflow,
} from "./lib/kapso.mjs";

export const TEST_WORKFLOW_NAME = "Cool Meals — Leads WhatsApp [TEST]";
export const MOCK_FUNCTION_ID = "00bf0b57-5efb-4b90-b008-5aeafc8c4c23";
export const MOCK_FUNCTION_SLUG = "coolmeals-bot-actions-mock";

const PROD_DEFINITION = path.join(REPO_ROOT, "workflows/coolmeals-leads/definition.json");

export function buildTestDefinition() {
  const definition = JSON.parse(readFileSync(PROD_DEFINITION, "utf8"));

  for (const node of definition.nodes || []) {
    const tools = node?.data?.config?.flow_agent_function_tools;
    if (!Array.isArray(tools)) continue;
    for (const tool of tools) {
      tool.function_id = MOCK_FUNCTION_ID;
      tool.function_slug = MOCK_FUNCTION_SLUG;
      tool.function_name = MOCK_FUNCTION_SLUG;
    }
  }

  return definition;
}

export async function syncTestWorkflow() {
  const definition = buildTestDefinition();
  const workflows = await listWorkflows();
  let workflow = workflows.find((w) => w.name === TEST_WORKFLOW_NAME);

  if (!workflow) {
    workflow = await createWorkflow({
      name: TEST_WORKFLOW_NAME,
      description: "Clon de coolmeals-leads con tools mock. Lo maneja tests/agent.",
      definition,
    });
  }

  await updateWorkflow(workflow.id, {
    definition,
    status: "active",
    // Los tests conducen la conversación turno a turno: sin debounce para no esperar de más.
    message_debounce_seconds: 0,
  });

  const triggers = await listTriggers(workflow.id);
  if (!triggers.some((t) => t.trigger_type === "api_call")) {
    await createTrigger(workflow.id, { trigger_type: "api_call", active: true });
  }

  return getWorkflow(workflow.id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const workflow = await syncTestWorkflow();
  console.log(
    JSON.stringify(
      {
        id: workflow.id,
        name: workflow.name,
        status: workflow.status,
        lock_version: workflow.lock_version,
      },
      null,
      2,
    ),
  );
}
