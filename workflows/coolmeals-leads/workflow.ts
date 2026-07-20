import { START, Workflow } from "@kapso/workflows";

const PHONE_NUMBER_ID = "597907523413541"; // Sandbox WhatsApp — cambiar en produ
const PROVIDER_MODEL_ID = "8c6d57df-3f07-4290-b8a5-38047608c4df"; // claude-haiku-4-5
const PROVIDER_MODEL_NAME = "claude-haiku-4-5";
/** Obligatorio en update-graph: sin function_id las tools fallan con "Function is no longer available". */
const BOT_ACTIONS_FUNCTION_ID = "164dc11a-dc32-4b99-85c9-6d289e15f501";
const BOT_ACTIONS_FUNCTION_SLUG = "coolmeals-bot-actions";

const CLASSIFICATION_HINTS = `
Clasificá internamente al lead usando estos criterios (equivalente al form Meta Froodie):

1. Tipo de negocio declarado (local gastronómico, distribuidora, mayorista, retail, etc.)
2. Línea de productos de interés
3. Si ya compra congelados o está evaluando
4. Volumen estimado (bultos/cajas/pallet). Umbral 50 SOLO para retail y mayorista.
5. Si tiene freezer / capacidad de frío
6. Ciudad/zona → provincia (importante: Córdoba vs resto)
7. Nombre del negocio + nombre de contacto + teléfono

Mapeo a clientType:
- "distribuidor" SOLO si tiene (o declara) depósito + logística de congelados / preventa a negocios.
  Si dice "distribuidora" pero es almacén autoservicio / minorista grande → "minorista" u "otro".
- "mayorista" → compra por volumen para revender / abastecer.
- "retail" → canal retail / supermercado / cadena (usa umbral 50 + zona).
- "minorista" → local, rotisería, resto chico → SIEMPRE deriva (sin umbral).
- "representante" → quiere vender a comisión / representar Cool Meals.
- "fason" → producción a fasón / maquila / marca propia / "hacerme la comida con mi marca".
- "otro" → no calza (no asumir umbral 50).

REGLA DURA — fasón / representante / quiere ser distribuidor:
- En el MISMO turno del primer mensaje con intención clara:
  upsert_conversation (clientType correcto) → decide_route → mensaje de cierre → handoff_human + handoff_to_human.
- PROHIBIDO pedir ubicación, volumen, freezer, nombre de negocio o más preguntas.
- PROHIBIDO volver a saludar o reiniciar el formulario si el lead ya viene hablando del mismo tema.
- Si el lead dice que ya lo estaban atendiendo / ya era fasón: recuperá clientType=fason y cerrá el handoff YA.

Ruteo (decide_route es la fuente de verdad):
- distribuidor → columna Quiere ser distribuidor + handoff al agente comercial (sin umbral).
- representante → columna Quiere ser representante + handoff (sin umbral, SIN menú muestras/pedido).
- fason → columna Quiere ser fasón + handoff (sin umbral, SIN menú muestras/pedido).
  Incluye marca propia / maquila / "hacerme la comida con mi marca".
- retail o mayorista en Córdoba con volumen ≥ 50 → Cool Meals: menú muestras/pedido y después handoff.
- retail o mayorista fuera de Córdoba (aunque ≥ 50) → derivar a distribuidor de zona.
- minorista → siempre derivar si hay cobertura.
- sin cobertura de dist. → sin_cobertura.

Datos mínimos:
- Para DERIVAR a dist.: nombre, teléfono, tipo de negocio, ubicación (ciudad/provincia).
- Para representante / fasón / quiere ser distribuidor: con la INTENCIÓN clara alcanza.
  NO pedís volumen ni menú. Provincia ayuda pero NO bloquees el handoff: si no la dijo, usá
  "desconocida" o lo que haya, llamá decide_route YA y cerrá con contacto + despedida.

MUESTRAS / PEDIDO — SOLO si agentInstruction de decide_route lo pide (Cool Meals retail/mayorista Córdoba ≥50):
- Ofrecé SIEMPRE: 1) Pedir muestras  2) Agendar / armar pedido directo. Esperá.
- MUESTRAS → Nombre y Apellido + Teléfono + Domicilio → request_samples → LOGÍSTICA contacta →
  handoff_human status=muestras + handoff_to_human. NO digas que un asesor arma las muestras.
- PEDIDO → handoff_human + handoff_to_human.
- Si derive_to_distributor: NO request_samples (el dist. se encarga).
- NUNCA ofrezcas este menú en quiere_ser_distribuidor / quiere_ser_representante / quiere_ser_fason.
`.trim();

const SYSTEM_PROMPT = `Sos el asistente comercial de WhatsApp de Froodie / Cool Meals (alimentos ultracongelados: wraps, platos listos, postres).

Objetivo: calificar leads rápido, clasificar tipo de cliente, derivar o hacer handoff. Hablá en español argentino, breve y claro.

${CLASSIFICATION_HINTS}

Flujo sugerido:
1. En el PRIMER mensaje del usuario (antes o junto con tu respuesta), SIEMPRE llamá upsert_conversation
   con phone (del contexto WhatsApp), name (perfil si hay), status ia_atendiendo, lastMessage,
   y lo que ya sepas (provincia, clientType aproximado, aiSummary). Sin esto el lead NO aparece en el Pipeline.
   Guardá el conversationId que devuelve la tool: lo necesitás para request_samples si aplica.
2. Saludá. Si ya está clara la intención (fasón/marca propia, representante, quiere ser distribuidor):
   NO armes un formulario largo — upsert + decide_route + handoff con copy de contacto + DESPEDIDA.
3. Si falta calificar (minorista/retail/mayorista): pedí lo que falte (zona, volumen si aplica, etc.).
4. En cada dato nuevo relevante, volvé a llamar upsert_conversation.
5. Cuando tengas clientType (y provincia si hace falta para derivar), llamá decide_route.
6. Según decide_route.action — OBLIGATORIO seguir agentInstruction si viene (tiene prioridad sobre este resumen):
   - derive_to_distributor → avisá, sync_derived, handoff_to_human. NUNCA complete_task. Sin request_samples.
   - no_coverage → handoff_human status=sin_cobertura + handoff_to_human.
   - quiere_ser_distribuidor → handoff_human status=quiere_ser_distribuidor + handoff_to_human. Sin menú.
   - quiere_ser_representante → handoff_human status=quiere_ser_representante + handoff_to_human. Sin menú.
   - quiere_ser_fason → handoff_human status=quiere_ser_fason + handoff_to_human. Sin menú.
   - own_attention → Cool Meals (menú): ofrecé muestras/pedido; según elección request_samples o handoff comercial.
7. Si piden hablar con una persona por otro motivo: handoff_human + handoff_to_human.
8. Copy de handoff (IMPORTANTE): el mismo número de WhatsApp NO es un transfer live.
   Decí que un ASESOR COMERCIAL te va a CONTACTAR por teléfono o WhatsApp (otro canal; no este chat).
   Cerrá con una DESPEDIDA breve (gracias + cierre amable).
   PROHIBIDO: "te paso con…", "ahora te atiende…", "te hablo con un representante por acá".
9. No inventes precios ni condiciones no confirmadas. Ante duda, handoff.
`;

const workflow = new Workflow("coolmeals-leads", {
  name: "Cool Meals — Leads WhatsApp",
  status: "active",
});

workflow.addTrigger({
  type: "inbound_message",
  phoneNumberId: PHONE_NUMBER_ID,
  active: true,
});

workflow.addNode(START, {
  position: { x: 120, y: 80 },
});

workflow.addNode(
  "agent",
  {
    type: "raw",
    nodeType: "agent",
    config: {
      system_prompt: SYSTEM_PROMPT,
      provider_model_id: PROVIDER_MODEL_ID,
      provider_model_name: PROVIDER_MODEL_NAME,
      temperature: 0.2,
      max_iterations: 40,
      // no max_tokens — rompe modelos tipo gpt-5-*
      message_delivery_mode: "auto_send_assistant_text",
      enabled_default_tools: [
        "complete_task",
        "handoff_to_human",
        "enter_waiting",
        "send_notification_to_user",
        "get_whatsapp_context",
        "get_execution_metadata",
        "save_variable",
        "get_variable",
        "get_current_datetime",
      ],
      default_tool_configs: {},
      sandbox_enabled: false,
      flow_agent_function_tools: [
        {
          name: "upsert_conversation",
          function_id: BOT_ACTIONS_FUNCTION_ID,
          function_slug: BOT_ACTIONS_FUNCTION_SLUG,
          function_name: BOT_ACTIONS_FUNCTION_SLUG,
          description:
            "Crea o actualiza la conversación/lead en Supabase (pipeline UI).",
          input_schema: {
            type: "object",
            properties: {
              action: { type: "string", const: "upsert_conversation" },
              phone: { type: "string" },
              name: { type: "string" },
              status: { type: "string" },
              clientType: { type: "string" },
              province: { type: "string" },
              distributorId: { type: ["string", "null"] },
              aiSummary: { type: "string" },
              lastMessage: { type: "string" },
              notes: { type: "string" },
              estimatedVolume: { type: ["integer", "null"] },
              outcome: { type: ["string", "null"] },
            },
            required: ["action"],
          },
        },
        {
          name: "decide_route",
          function_id: BOT_ACTIONS_FUNCTION_ID,
          function_slug: BOT_ACTIONS_FUNCTION_SLUG,
          function_name: BOT_ACTIONS_FUNCTION_SLUG,
          description:
            "Decide derivación según tipo, volumen y cobertura. Si action=quiere_ser_distribuidor: handoff_human con status quiere_ser_distribuidor + handoff_to_human.",
          input_schema: {
            type: "object",
            properties: {
              action: { type: "string", const: "decide_route" },
              clientType: { type: "string" },
              province: { type: "string" },
              postalCode: { type: "string" },
              estimatedVolume: { type: ["integer", "null"] },
              wantsToBeDistributor: { type: "boolean" },
            },
            required: ["action", "clientType", "province"],
          },
        },
        {
          name: "request_samples",
          function_id: BOT_ACTIONS_FUNCTION_ID,
          function_slug: BOT_ACTIONS_FUNCTION_SLUG,
          function_name: BOT_ACTIONS_FUNCTION_SLUG,
          description:
            "SOLO atención Cool Meals (tras elegir 'pedir muestras'). Agenda Nombre+Tel+Domicilio → columna Muestras + sheet logística. Luego handoff_to_human. Si el lead se DERIVA a un dist., NO uses esta tool.",
          input_schema: {
            type: "object",
            properties: {
              action: { type: "string", const: "request_samples" },
              conversationId: { type: "string" },
              fullName: { type: "string" },
              phone: { type: "string" },
              address: { type: "string" },
              city: { type: "string" },
              province: { type: "string" },
              postalCode: { type: "string" },
            },
            required: ["action", "fullName", "phone", "address"],
          },
        },
        {
          name: "sync_derived",
          function_id: BOT_ACTIONS_FUNCTION_ID,
          function_slug: BOT_ACTIONS_FUNCTION_SLUG,
          function_name: BOT_ACTIONS_FUNCTION_SLUG,
          description:
            "Marca derivado a distribuidor, append al sheet, agenda finalize_at (~24h) y deja el bot en handoff. Después DEBES llamar handoff_to_human. NUNCA complete_task al derivar.",
          input_schema: {
            type: "object",
            properties: {
              action: { type: "string", const: "sync_derived" },
              conversationId: { type: "string" },
              phone: { type: "string" },
              distributorId: { type: "string" },
              distributorName: { type: "string" },
              clientType: { type: "string" },
              province: { type: "string" },
              city: { type: "string" },
              company: { type: "string" },
              businessType: { type: "string" },
              aiSummary: { type: "string" },
            },
            required: ["action"],
          },
        },
        {
          name: "handoff_human",
          function_id: BOT_ACTIONS_FUNCTION_ID,
          function_slug: BOT_ACTIONS_FUNCTION_SLUG,
          function_name: BOT_ACTIONS_FUNCTION_SLUG,
          description:
            "Marca handoff en la DB y agenda finalize_at. Después llamá handoff_to_human. Usá status=quiere_ser_distribuidor | quiere_ser_representante | quiere_ser_fason | sin_cobertura | muestras cuando corresponda (no siempre atencion_representante).",
          input_schema: {
            type: "object",
            properties: {
              action: { type: "string", const: "handoff" },
              conversationId: { type: "string" },
              phone: { type: "string" },
              reason: { type: "string" },
              aiSummary: { type: "string" },
              status: {
                type: "string",
                description:
                  "Columna Pipeline. Default atencion_representante. Usá quiere_ser_distribuidor, quiere_ser_representante, quiere_ser_fason, sin_cobertura o muestras cuando corresponda.",
              },
              outcome: { type: "string" },
            },
            required: ["action", "reason"],
          },
        },
      ],
      flow_agent_webhooks: [],
      flow_agent_mcp_servers: [],
      flow_agent_knowledge_bases: [],
      flow_agent_app_integration_tools: [],
      flow_agent_resources: [],
    },
  },
  {
    position: { x: 120, y: 280 },
    displayName: "Agente Leads",
  },
);

workflow.addEdge(START, "agent");

export default workflow;
