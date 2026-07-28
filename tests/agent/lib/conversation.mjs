import {
  api,
  getExecution,
  listExecutionEvents,
  resumeExecution,
  setExecutionStatus,
  sleep,
  startExecution,
} from "./kapso.mjs";

const SANDBOX_PHONE_NUMBER_ID = "597907523413541";
const TERMINAL_STATUSES = new Set(["waiting", "ended", "failed", "handoff"]);

async function waitForPause(executionId, { timeoutMs = 240_000, pollMs = 4000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    last = await getExecution(executionId);
    if (TERMINAL_STATUSES.has(last.status)) return last;
  }
  throw new Error(`Timeout esperando la ejecución ${executionId} (último estado: ${last?.status})`);
}

async function listOutboundMessages(conversationId) {
  if (!conversationId) return [];
  const data = await api(
    "GET",
    `/whatsapp/messages?conversation_id=${conversationId}&limit=100`,
  );
  const messages = Array.isArray(data) ? data : data?.messages || [];
  return messages
    .filter((m) => (m.kapso?.direction || m.direction) === "outbound")
    .map((m) => ({
      text: m.kapso?.content ?? m.text?.body ?? "",
      timestamp: Number(m.timestamp || 0),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function summarizeEvents(events) {
  const toolCalls = [];
  const agentMessages = [];
  const errors = [];

  for (const event of events) {
    const payload = event.payload || {};
    if (event.event_type === "agent_tool_called") {
      toolCalls.push({
        name: payload.tool_name,
        input: payload.parameters?.input ?? payload.parameters ?? {},
      });
    }
    if (event.event_type === "agent_message_sent" && payload.message) {
      agentMessages.push(payload.message);
    }
    if (event.event_type === "error" || payload.error) {
      errors.push(payload.error || payload);
    }
  }

  return { toolCalls, agentMessages, errors };
}

/**
 * Corre una conversación scripteada contra el workflow de test.
 *
 * `turns` son los mensajes del lead, en orden. Si la ejecución termina antes
 * (handoff / ended), los turnos restantes se descartan.
 */
export async function runConversation({ workflowId, phone, turns, timeoutMs }) {
  const accepted = await startExecution(workflowId, {
    phone_number: phone,
    phone_number_id: SANDBOX_PHONE_NUMBER_ID,
    initial_data: { text: turns[0] },
  });

  const executionId = accepted.id;
  let execution = await waitForPause(executionId, { timeoutMs });

  for (const turn of turns.slice(1)) {
    if (execution.status !== "waiting") break;
    await resumeExecution(executionId, { text: turn });
    execution = await waitForPause(executionId, { timeoutMs });
  }

  const events = await listExecutionEvents(executionId, 200);
  const { toolCalls, agentMessages, errors } = summarizeEvents(events);

  if (execution.status === "failed") {
    const reason = errors.map((e) => (typeof e === "string" ? e : JSON.stringify(e)))[0];
    throw new Error(`La ejecución falló en Kapso: ${reason || "sin detalle"}`);
  }
  const outbound = await listOutboundMessages(execution.whatsapp_conversation_id);

  // Lo que realmente le llega al lead por WhatsApp. Si la conversación no quedó
  // registrada (caso raro), caemos a los mensajes del agente en los eventos.
  const userVisible = outbound.length ? outbound.map((m) => m.text) : agentMessages;

  if (execution.status === "waiting") {
    await setExecutionStatus(executionId, "ended").catch(() => {});
  }

  return {
    executionId,
    status: execution.status,
    conversationId: execution.whatsapp_conversation_id,
    userVisible,
    agentMessages,
    toolCalls,
    errors,
    turnsSent: turns.length,
  };
}
