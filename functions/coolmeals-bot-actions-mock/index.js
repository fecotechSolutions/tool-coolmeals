/**
 * Mock de `coolmeals-bot-actions` para los tests del agente.
 *
 * Mismas actions y mismas respuestas (incluido `agentInstruction`) que la function real,
 * pero sin Supabase, sin Sheets y sin cerrar executions en Kapso. Las decisiones de ruteo
 * usan una tabla fija de distribuidores para que los tests sean determinísticos.
 *
 * Mantener alineado con `functions/coolmeals-bot-actions/index.js`.
 */

const MIN_BUNDLES = 50;

const DISTRIBUTORS = [
  { id: "mock-cuyo", name: "Cool Logística Cuyo", provinces: ["mendoza", "san juan"] },
  { id: "mock-norte", name: "Distribuidora Norte SA", provinces: ["cordoba"] },
  { id: "mock-litoral", name: "Litoral Fresh", provinces: ["santa fe", "entre rios"] },
  { id: "mock-pampa", name: "Pampa Fría SRL", provinces: ["buenos aires", "caba"] },
];

async function handler(request, env) {
  const payload = await request.json();
  const input = payload.input || payload || {};
  const ctx = payload.execution_context || {};
  const phoneFromCtx =
    (ctx.context && ctx.context.phone_number) ||
    (ctx.context && ctx.context.contact && ctx.context.contact.wa_id) ||
    "";

  const action = String(input.action || "").trim();
  if (!action) return json({ ok: false, error: "action required" }, 400);

  if (action === "upsert_conversation") return json(upsertConversation(input, phoneFromCtx));
  if (action === "decide_route") return json(decideRoute(input));
  if (action === "request_samples") return json(requestSamples(input, phoneFromCtx));
  if (action === "handoff") return json(handoff(input));
  if (action === "sync_derived") return json(syncDerived(input));

  return json({ ok: false, error: "Unknown action: " + action }, 400);
}

function json(body, status) {
  return new Response(JSON.stringify({ ...body, _mock: true }), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function upsertConversation(input, phoneFromCtx) {
  const phone = String(input.phone || phoneFromCtx || "").trim();
  if (!phone) return { ok: false, error: "phone required" };
  return {
    ok: true,
    conversationId: "mock-conv-" + phone.slice(-6),
    status: input.status || "ia_atendiendo",
    phone,
  };
}

function decideRoute(input) {
  const clientType = normalize(input.clientType) || "minorista";
  const province = input.province || "";
  const estimatedVolume =
    input.estimatedVolume === null || input.estimatedVolume === undefined
      ? null
      : Number(input.estimatedVolume);
  const wantsToBeDistributor = Boolean(
    input.wantsToBeDistributor || clientType === "distribuidor",
  );

  if (wantsToBeDistributor) {
    return {
      ok: true,
      action: "quiere_ser_distribuidor",
      conversationStatus: "quiere_ser_distribuidor",
      outcome: "quiere_ser_distribuidor",
      distributorId: null,
      distributorName: null,
      reason:
        "Quiere ser distribuidor — columna Quiere ser distribuidor + handoff comercial (sin umbral 50).",
      syncDerivedSheet: false,
      agentInstruction:
        "Mensaje humano corto al lead: un asesor te contacta (NO este número) + despedida. PROHIBIDO decir handoff/transfiero/completo el handoff. Luego en silencio: handoff_human status=quiere_ser_distribuidor + handoff_to_human.",
    };
  }

  if (clientType === "representante") {
    return {
      ok: true,
      action: "quiere_ser_representante",
      conversationStatus: "quiere_ser_representante",
      outcome: "quiere_ser_representante",
      distributorId: null,
      distributorName: null,
      reason:
        "Quiere ser representante — columna Quiere ser representante + handoff comercial (sin umbral 50, sin menú muestras).",
      syncDerivedSheet: false,
      coolMealsMenu: false,
      agentInstruction:
        "REPRESENTANTE — solo mensaje humano: confirmá interés; asesor te contacta (NO este número); despedida. PROHIBIDO narrar handoff/transferencia. Luego en silencio handoff_human status=quiere_ser_representante + handoff_to_human.",
    };
  }

  if (clientType === "fason") {
    return {
      ok: true,
      action: "quiere_ser_fason",
      conversationStatus: "quiere_ser_fason",
      outcome: "quiere_ser_fason",
      distributorId: null,
      distributorName: null,
      reason:
        "Quiere ser fasón — columna Quiere ser fasón + handoff comercial (sin umbral 50, sin menú muestras).",
      syncDerivedSheet: false,
      coolMealsMenu: false,
      agentInstruction:
        "FASÓN — solo mensaje humano: sí hacemos fasón/marca propia; asesor te contacta (NO este número); despedida. PROHIBIDO narrar handoff/transferencia. Luego en silencio handoff_human status=quiere_ser_fason + handoff_to_human.",
    };
  }

  const distributor =
    DISTRIBUTORS.find((d) => d.provinces.some((p) => p === normalize(province))) || null;

  const isCordoba = normalize(province) === "cordoba";
  const usesVolumeThreshold = clientType === "mayorista" || clientType === "retail";
  const highVolume = estimatedVolume !== null && estimatedVolume >= MIN_BUNDLES;

  if (usesVolumeThreshold && isCordoba && highVolume) {
    return {
      ok: true,
      action: "own_attention",
      conversationStatus: "atencion_representante",
      outcome: "handoff_humano",
      distributorId: null,
      distributorName: null,
      reason:
        clientType + " en Córdoba con volumen ≥ " + MIN_BUNDLES + " bultos — atención Cool Meals.",
      syncDerivedSheet: false,
      coolMealsMenu: true,
      agentInstruction:
        "Cool Meals. Menú corto: 1) Pedir muestras 2) Agendar pedido. Esperá. Si muestras: pedí Nombre, Tel, Empresa, Provincia, DNI, Correo, CP y Dirección completa → request_samples → logística te contacta → handoff_human status=muestras (IA ended; sin handoff_to_human). Si pedido: un asesor te contacta; handoff_human + handoff_to_human. Sin procesos internos ni 'te registro'.",
    };
  }

  if (!distributor) {
    return {
      ok: true,
      action: "no_coverage",
      conversationStatus: "sin_cobertura",
      outcome: "sin_cobertura",
      distributorId: null,
      distributorName: null,
      reason: "Sin cobertura en " + province,
      syncDerivedSheet: false,
      agentInstruction:
        "Avisá que aún no hay cobertura. Llamá handoff_human con status=sin_cobertura (NO atencion_representante) y reason claro; después handoff_to_human. La card queda en Sin cobertura; en ~22h pasa a Finalizado.",
    };
  }

  const volumeNote =
    usesVolumeThreshold && highVolume && !isCordoba
      ? " (volumen ≥ " + MIN_BUNDLES + " fuera de Córdoba → red de distribuidores)"
      : "";

  return {
    ok: true,
    action: "derive_to_distributor",
    conversationStatus: "derivado_distribuidor",
    outcome: "derivado_distribuidor",
    distributorId: distributor.id,
    distributorName: distributor.name,
    reason: "Derivado a " + distributor.name + " (" + province + ")" + volumeNote,
    syncDerivedSheet: true,
    agentInstruction:
      "DERIVAR: 1) Si faltan nombre completo, teléfono de contacto (confirmá si este WhatsApp sirve) o nombre del negocio → pedilos YA, NO sync_derived todavía. 2) Mensaje humano: 'Te va a contactar " +
      distributor.name +
      " de tu zona…' (usá ese nombre exacto) + despedida corta. 3) En silencio: sync_derived (con company=nombre negocio) + handoff_to_human. PROHIBIDO decir 'registro/derivación/sistema'. Si pidieron muestras: NO request_samples — el dist. se hace cargo.",
  };
}

function requestSamples(input, phoneFromCtx) {
  const required = [
    "fullName",
    "phone",
    "company",
    "province",
    "dni",
    "email",
    "postalCode",
    "address",
  ];
  const missing = required.filter((field) => {
    if (field === "phone") return !String(input.phone || phoneFromCtx || "").trim();
    return !String(input[field] || "").trim();
  });
  if (missing.length) {
    return { ok: false, error: "Faltan datos: " + missing.join(", "), missing };
  }
  return {
    ok: true,
    sampleRequestId: "mock-sample-1",
    conversationId: input.conversationId || "mock-conv",
    sheet: { attempted: true, success: true },
    kapsoEnded: { ok: true, skipped: false },
    instruction:
      "Muestra agendada (Pipeline Muestras + sheet). Avisá que logística contacta para el envío. Luego handoff_human status=muestras. La IA ya quedó en ended — NO hace falta handoff_to_human. NO digas que un asesor comercial arma las muestras.",
  };
}

function handoff(input) {
  const status = normalize(input.status) || "atencion_representante";
  return {
    ok: true,
    conversationId: input.conversationId || "mock-conv",
    status,
    sameNumber: true,
    finalizeAt: status === "sin_cobertura" ? "mock-finalize-at" : null,
    sheet: { attempted: true, success: true },
    kapsoClose: { ok: true, skipped: status !== "muestras" && status !== "descartado" },
    instruction:
      status === "muestras"
        ? "Muestras: sheet listo e IA en ended. NO uses handoff_to_human (ya cerró). Avisá que logística contacta."
        : status === "descartado"
          ? "Descartado: IA en ended. NO uses handoff_to_human. Solo mensaje humano breve de cierre (sin decir 'descartado')."
          : "Usá handoff_to_human en el agent. Un asesor comercial responde por otro canal.",
  };
}

function syncDerived(input) {
  return {
    ok: true,
    conversationId: input.conversationId || "mock-conv",
    distributorName: input.distributorName || "Distribuidor mock",
    sheet: { attempted: true, success: true },
    finalizeAt: null,
    handoffHours: 24,
    kapsoHandoff: { ok: true, skipped: false },
    instruction:
      "Después de sync_derived: llamá handoff_to_human. NUNCA complete_task al derivar.",
  };
}
