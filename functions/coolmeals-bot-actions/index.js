async function handler(request, env) {
  const payload = await request.json();
  const input = payload.input || payload || {};
  const ctx = payload.execution_context || {};
  const phoneFromCtx =
    (ctx.context && ctx.context.phone_number) ||
    (ctx.context && ctx.context.contact && ctx.context.contact.wa_id) ||
    "";

  const action = String(input.action || "").trim();
  if (!action) {
    return json({ ok: false, error: "action required" }, 400);
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return json(
      {
        ok: false,
        error:
          "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY function secrets in Kapso",
      },
      500,
    );
  }

  try {
    if (action === "upsert_conversation") {
      return json(await upsertConversation(input, phoneFromCtx, supabaseUrl, supabaseKey, ctx));
    }
    if (action === "decide_route") {
      return json(await decideRoute(input, supabaseUrl, supabaseKey));
    }
    if (action === "request_samples") {
      return json(await requestSamples(input, phoneFromCtx, supabaseUrl, supabaseKey, env, ctx));
    }
    if (action === "handoff") {
      return json(await handoff(input, phoneFromCtx, supabaseUrl, supabaseKey, ctx, env));
    }
    if (action === "sync_derived") {
      return json(await syncDerived(input, phoneFromCtx, supabaseUrl, supabaseKey, env, ctx));
    }
    return json({ ok: false, error: "Unknown action: " + action }, 400);
  } catch (err) {
    return json(
      { ok: false, error: err && err.message ? err.message : String(err) },
      500,
    );
  }
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
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

// Postgres enum client_type — cualquier otro valor (ej. "por_calificar") rompe el insert.
var VALID_CLIENT_TYPES = {
  mayorista: true,
  minorista: true,
  retail: true,
  representante: true,
  distribuidor: true,
  fason: true,
  otro: true,
};

function sanitizeClientType(value) {
  const n = normalize(value);
  return VALID_CLIENT_TYPES[n] ? n : null;
}

/** El modelo a veces manda "<UNKNOWN>" / "N/A" como nombre o provincia. */
function sanitizeHumanField(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "";
  const n = normalize(raw);
  if (
    n === "unknown" ||
    n === "<unknown>" ||
    n === "n/a" ||
    n === "na" ||
    n === "null" ||
    n === "undefined" ||
    n === "sin dato" ||
    n === "s/d" ||
    n === "-" ||
    n === "none"
  ) {
    return "";
  }
  if (/^<[^>]+>$/.test(raw)) return "";
  return raw;
}

var ARG_PROVINCES = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

/** Preferí un valor limpio; si falta, intentá detectar provincia en textos (motivo / resumen). */
function resolveProvince() {
  const candidates = [];
  for (let i = 0; i < arguments.length; i++) {
    const cleaned = sanitizeHumanField(arguments[i]);
    if (cleaned) candidates.push(cleaned);
  }
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const hit = ARG_PROVINCES.find(function (p) {
      return normalize(p) === normalize(c);
    });
    if (hit) return hit;
  }
  const blob = normalize(candidates.join(" \n "));
  if (!blob) return candidates[0] || "";
  for (let i = 0; i < ARG_PROVINCES.length; i++) {
    const p = ARG_PROVINCES[i];
    if (blob.indexOf(normalize(p)) !== -1) return p;
  }
  return candidates[0] || "";
}

/** high = tipificación segura para avanzar; low/missing = forzar desambiguación. */
function normalizeCertainty(value) {
  const n = normalize(value);
  if (
    n === "high" ||
    n === "sure" ||
    n === "seguro" ||
    n === "cierta" ||
    n === "claro" ||
    n === "clear"
  ) {
    return "high";
  }
  if (
    n === "low" ||
    n === "unsure" ||
    n === "inseguro" ||
    n === "incierto" ||
    n === "dudoso" ||
    n === "unclear"
  ) {
    return "low";
  }
  return null;
}

function disambiguationBlock(contextHint) {
  return {
    ok: false,
    needDisambiguation: true,
    certainty: "low",
    reason:
      "Tipificación poco clara: no se puede avanzar al ruteo/cierre hasta desambiguar.",
    agentInstruction:
      "DESAMBIGUACIÓN OBLIGATORIA (gate duro). NO llames decide_route / request_samples / sync_derived / handoff comercial todavía. " +
      "Mandá UNA pregunta clara con 2 opciones (máx. 3) sobre lo que no esté claro" +
      (contextHint ? " (" + contextHint + ")" : "") +
      " + enter_waiting. " +
      "Ej. dist.: ¿comprar/revender producto Cool Meals o sumarte como distribuidor oficial de la marca? " +
      "Ej. retail vs mayorista: ¿supermercado/cadena o compra por volumen para revender? " +
      "Cuando el lead responda y estés segura, volvé a llamar la tool con certainty=high.",
  };
}

function requireHighCertainty(input, contextHint) {
  if (normalizeCertainty(input && input.certainty) === "high") return null;
  return disambiguationBlock(contextHint);
}

function resolveEstimatedVolume(input, conv) {
  if (input && input.estimatedVolume !== undefined && input.estimatedVolume !== null) {
    return Number(input.estimatedVolume);
  }
  if (conv && conv.estimated_volume !== undefined && conv.estimated_volume !== null) {
    return Number(conv.estimated_volume);
  }
  return null;
}

/** ≥50 → Cool Meals directo en cualquier provincia; sync_derived a dist. queda bloqueado. */
function blockDerivationAtHighVolume(input, conv, minBundles) {
  const volume = resolveEstimatedVolume(input, conv);
  const threshold = minBundles || 50;
  if (volume === null || Number.isNaN(volume) || volume < threshold) return null;
  return {
    ok: false,
    error:
      "Volumen ≥ " + threshold + ": Cool Meals atiende directo. No derivar a distribuidor de zona.",
    agentInstruction:
      "GATE ≥" +
      threshold +
      ". PROHIBIDO sync_derived / nombrar distribuidor de zona. " +
      "Llamá decide_route con clientType + provincia + estimatedVolume y certainty=high. " +
      "Seguí agentInstruction: menú 1) Pedir muestras  2) Agendar pedido (cualquier provincia).",
  };
}

function needsVolumeForClientType(clientType) {
  const t = normalize(clientType);
  return t === "retail" || t === "mayorista" || t === "distribuidor";
}

function isVolumeUncertain(input) {
  if (!input) return false;
  if (input.volumeUncertain === true || input.wantsPricesBeforeVolume === true) return true;
  const flag = normalize(
    input.volumeUncertain || input.volumeStatus || input.volumeCertainty || "",
  );
  if (
    flag === "uncertain" ||
    flag === "unknown" ||
    flag === "incierto" ||
    flag === "inseguro" ||
    flag === "low" ||
    flag === "true" ||
    flag === "1"
  ) {
    return true;
  }
  const blob = normalize(
    [input.aiSummary, input.reason, input.lastMessage, input.notes].filter(Boolean).join(" "),
  );
  if (!blob) return false;
  return (
    /(no se|no lo se|no sabe|todavia no|aun no|después vemos|despues vemos|quiero (saber |ver )?precios|necesito (mas |más )?data|necesito (mas |más )?info)/.test(
      blob,
    ) && /(volumen|bulto|caja|cantidad|precio|comprar)/.test(blob)
  );
}

/**
 * Checklist duro antes de rutear/cerrar.
 * La IA conversa; el código decide si se puede avanzar.
 */
function buildQualification(input, conv) {
  const clientType =
    sanitizeClientType(input && input.clientType) ||
    sanitizeClientType(conv && conv.client_type) ||
    "otro";
  const province = resolveProvince(
    input && input.province,
    conv && conv.province,
    input && input.aiSummary,
    conv && conv.ai_summary,
    input && input.reason,
    input && input.notes,
  );
  const volume = resolveEstimatedVolume(input, conv);
  const volumeUncertain = isVolumeUncertain(input);
  const hasVolume = volume !== null && !Number.isNaN(volume);

  return {
    clientType: clientType,
    province: province,
    volume: hasVolume ? volume : null,
    volumeUncertain: volumeUncertain,
    needsVolume: needsVolumeForClientType(clientType),
  };
}

function nextStepAfterDistributorColumn(q) {
  if (!q.province) {
    return {
      nextStep: "ask_province",
      agentInstruction:
        "CHECKLIST dist. (gate). Columna Quiere ser distribuidor OK. Falta PROVINCIA. " +
        "Preguntá SOLO la provincia + enter_waiting. PROHIBIDO handoff, decide_route, prometer asesor todavía.",
    };
  }
  if (q.volumeUncertain || q.volume === null) {
    if (q.volumeUncertain) {
      return {
        nextStep: "handoff_operator",
        agentInstruction:
          "CHECKLIST dist. (gate). Provincia OK pero volumen INCERTO / pide precios o más data. " +
          "PROHIBIDO inventar bultos y PROHIBIDO status=quiere_ser_distribuidor en handoff. " +
          contactChecklistInstruction() +
          " Mensaje: un asesor te contacta para precios/volumen/condiciones + despedida. " +
          "Silencio: handoff_human status=atencion_representante + handoff_to_human.",
      };
    }
    return {
      nextStep: "ask_volume",
      agentInstruction:
        "CHECKLIST dist. (gate). Provincia OK. Falta VOLUMEN. " +
        "UNA pregunta de bultos/cajas/mes con aviso umbral 50 + enter_waiting. " +
        "Si responde que no sabe / quiere precios / más data: " +
        contactChecklistInstruction() +
        " Luego handoff_human status=atencion_representante " +
        "(NO quiere_ser_distribuidor) + handoff_to_human. " +
        "Si da número claro: decide_route con estimatedVolume + certainty=high.",
    };
  }
  return {
    nextStep: "decide_route",
    agentInstruction:
      "CHECKLIST dist. completo (provincia+volumen). Llamá decide_route certainty=high " +
      "con clientType=distribuidor, province y estimatedVolume. Seguí agentInstruction (menú / operador / dist.). " +
      "PROHIBIDO handoff status=quiere_ser_distribuidor.",
  };
}

/** Texto fijo: cualquier cierre comercial exige contacto (o negativa explícita). */
function contactChecklistInstruction() {
  return (
    "CONTACTO OBLIGATORIO antes de cerrar (gate duro): " +
    "pedí nombre completo + nombre del negocio/local + teléfono de contacto. " +
    "El teléfono hay que EXIGIRLO/CONFIRMARLO aunque aparezca en WhatsApp " +
    "(ej. '¿Este mismo número te sirve de contacto o preferís otro?'). " +
    "Después handoff_human o sync_derived con fullName, company, contactPhone y phoneConfirmed=true. " +
    "Si el lead SE NIEGA a dar alguno: contactRefused=true y recién ahí cerrá " +
    "(operador atencion_representante). PROHIBIDO cerrar solo con el nombre del perfil WA."
  );
}

function isContactRefused(input) {
  if (!input) return false;
  if (input.contactRefused === true || input.refusedContactData === true) return true;
  const flag = normalize(input.contactRefused || input.refusedContactData || "");
  return flag === "true" || flag === "1" || flag === "si" || flag === "yes";
}

function isPhoneConfirmed(input) {
  if (!input) return false;
  if (input.phoneConfirmed === true || input.contactPhoneConfirmed === true) return true;
  const flag = normalize(input.phoneConfirmed || input.contactPhoneConfirmed || "");
  return flag === "true" || flag === "1" || flag === "si" || flag === "yes";
}

function resolveExplicitContactPhone(input) {
  return sanitizeHumanField(
    (input && (input.contactPhone || input.confirmedPhone || input.phoneExplicit)) || "",
  );
}

function resolveExplicitFullName(input) {
  return sanitizeHumanField((input && (input.fullName || input.contactName)) || "");
}

function resolveExplicitCompany(input) {
  return sanitizeHumanField(
    (input && (input.company || input.businessName || input.negocio)) || "",
  );
}

/**
 * Antes de cualquier derivación/handoff comercial: nombre + negocio + tel confirmado.
 * No alcanza el phone del contexto WA ni el name del perfil.
 * Si contactRefused=true → se permite (operador sin esos datos).
 */
function gateContactBeforeClose(input, forAction) {
  if (isContactRefused(input)) {
    return {
      ok: true,
      contactRefused: true,
      agentInstruction:
        "Lead se negó a dar datos de contacto. Cerrá a operador: mensaje breve + " +
        "handoff_human status=atencion_representante contactRefused=true + handoff_to_human.",
    };
  }
  const missing = [];
  const fullName = resolveExplicitFullName(input);
  const company = resolveExplicitCompany(input);
  const contactPhone = resolveExplicitContactPhone(input);
  if (!fullName) missing.push("fullName");
  if (!company) missing.push("company");
  if (!contactPhone) missing.push("contactPhone");
  if (!isPhoneConfirmed(input)) missing.push("phoneConfirmed");
  if (!missing.length) return null;
  return {
    ok: false,
    gate: "missing_contact",
    needData: true,
    missing: missing,
    forAction: forAction || "close",
    reason:
      "Faltan datos de contacto obligatorios antes de derivar/handoff (nombre, negocio, teléfono confirmado).",
    agentInstruction: contactChecklistInstruction(),
  };
}

function gateDecideRouteQualification(input, conv) {
  const earlyType =
    sanitizeClientType(input && input.clientType) ||
    sanitizeClientType(conv && conv.client_type) ||
    "";
  // Rep / fasón: handoff comercial sin checklist de volumen.
  if (earlyType === "representante" || earlyType === "fason") return null;

  const q = buildQualification(input, conv);
  if (!q.province) {
    return {
      ok: false,
      gate: "missing_province",
      needData: true,
      missing: ["province"],
      reason: "Falta provincia/zona antes de rutear.",
      agentInstruction:
        "GATE: falta provincia. NO inventes zona. Preguntá SOLO provincia + enter_waiting. " +
        "Después volvé a decide_route con province y certainty=high.",
    };
  }
  if (q.needsVolume && q.volumeUncertain) {
    return {
      ok: false,
      gate: "volume_uncertain",
      needData: true,
      nextStep: "handoff_operator",
      reason: "Volumen incerto: no rutea; va a operador.",
      agentInstruction:
        "GATE volumen incerto. PROHIBIDO estimar bultos bajos ni sin_cobertura/dist por eso. " +
        "handoff_human status=atencion_representante + handoff_to_human. " +
        "Mensaje: asesor te contacta para definir cantidades/precios/condiciones.",
    };
  }
  if (q.needsVolume && q.volume === null) {
    return {
      ok: false,
      gate: "missing_volume",
      needData: true,
      missing: ["estimatedVolume"],
      reason: "Falta volumen numérico para tipologías retail/mayorista/distribuidor.",
      agentInstruction:
        "GATE: falta volumen. UNA pregunta de bultos/cajas/mes (aviso umbral 50) + enter_waiting. " +
        "Si no sabe / quiere precios: handoff status=atencion_representante. " +
        "Si da número: decide_route con estimatedVolume + certainty=high.",
    };
  }
  return null;
}

async function sb(supabaseUrl, supabaseKey, path, init) {
  const res = await fetch(supabaseUrl.replace(/\/$/, "") + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: supabaseKey,
      Authorization: "Bearer " + supabaseKey,
      "Content-Type": "application/json",
      Prefer: init && init.prefer ? init.prefer : "return=representation",
      ...(init && init.headers ? init.headers : {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }
  if (!res.ok) {
    throw new Error(
      "Supabase " + res.status + ": " + (typeof data === "string" ? data : JSON.stringify(data)),
    );
  }
  return data;
}

/** Días desde created_at: mismo teléfono = misma card (sin métrica nueva). */
const RECONTACT_LOCK_DAYS = 365;

/** Todavía calificando: se pueden actualizar datos. */
const MID_FLOW_STATUSES = {
  nuevo: true,
  ia_atendiendo: true,
  // 4 SÍ ya marcó la columna, pero aún faltan zona/volumen antes del ruteo final.
  quiere_ser_distribuidor: true,
};

function isWithinRecontactLock(createdAt) {
  if (!createdAt) return false;
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return false;
  const ageMs = Date.now() - createdMs;
  return ageMs >= 0 && ageMs < RECONTACT_LOCK_DAYS * 24 * 60 * 60 * 1000;
}

async function upsertConversation(input, phoneFromCtx, supabaseUrl, supabaseKey, ctx) {
  const phone = String(input.phone || phoneFromCtx || "").trim();
  if (!phone) throw new Error("phone required");

  const system = (ctx && ctx.system) || {};
  const context = (ctx && ctx.context) || {};
  const kapsoExecutionId =
    input.kapsoExecutionId ||
    system.workflow_execution_id ||
    system.flow_execution_id ||
    null;
  const kapsoConversationId =
    input.kapsoConversationId || context.conversation_id || null;

  const existing = await sb(
    supabaseUrl,
    supabaseKey,
    "conversations?phone=eq." + encodeURIComponent(phone) + "&order=created_at.desc&limit=1",
    { method: "GET", prefer: "return=representation" },
  );

  const prior = Array.isArray(existing) && existing[0] ? existing[0] : null;

  // Mismo teléfono con card de hace < 1 año:
  // - mid-flujo: seguir calificando (upsert completo)
  // - muestras: IA ya ended; la card queda para el operador → INSERT 2ª card fresca (no merge)
  // - resto ya calificado/cerrado: NO pisar datos ni crear lead nuevo (métricas)
  const priorStatus = prior ? prior.status || "ia_atendiendo" : null;
  const spawnFreshAfterMuestras =
    !!prior &&
    isWithinRecontactLock(prior.created_at) &&
    priorStatus === "muestras";

  if (prior && isWithinRecontactLock(prior.created_at) && !spawnFreshAfterMuestras) {
    const stillQualifying = !!MID_FLOW_STATUSES[priorStatus];

    if (!stillQualifying) {
      const touch = {};
      if (input.lastMessage !== undefined) touch.last_message = input.lastMessage;
      else if (input.message && input.message.content) {
        touch.last_message = input.message.content;
      }
      if (kapsoConversationId) touch.kapso_conversation_id = kapsoConversationId;
      if (kapsoExecutionId) touch.kapso_execution_id = kapsoExecutionId;
      const messages = Array.isArray(prior.messages) ? prior.messages.slice() : [];
      if (input.message) messages.push(input.message);
      touch.messages = messages;

      const updated = await sb(
        supabaseUrl,
        supabaseKey,
        "conversations?id=eq." + prior.id,
        { method: "PATCH", body: JSON.stringify(touch) },
      );
      const row = Array.isArray(updated) ? updated[0] : updated;
      return {
        ok: true,
        conversationId: row.id,
        status: row.status,
        phone: row.phone,
        recontactLocked: true,
        lockDays: RECONTACT_LOCK_DAYS,
        agentInstruction:
          "RECONTACTO (<1 año, ya calificado). NO vuelvas a tipificar ni llames decide_route / request_samples / sync_derived como lead nuevo. " +
          "UN mensaje corto: ya estás en proceso / un asesor o el distribuidor te contacta según tu caso + despedida. " +
          "Si status es finalizado/descartado: agradecé y ofrecé que un asesor retome si hace falta; NO armes menú ni samples. " +
          "No crees métricas nuevas: es la misma card.",
      };
    }
  }

  // Card ≥ 1 año o no existe → INSERT (nueva métrica + recalificar).
  // Mid-flujo < 1 año → PATCH completo.

  const patch = {
    phone: phone,
    origin: input.origin || "whatsapp",
  };
  if (input.name) {
    const cleanName = sanitizeHumanField(input.name);
    if (cleanName) patch.name = cleanName;
  }

  const protectedStatuses = {
    derivado_distribuidor: true,
    finalizado: true,
    atencion_representante: true,
    quiere_ser_distribuidor: true,
    quiere_ser_representante: true,
    quiere_ser_fason: true,
    sin_cobertura: true,
    muestras: true,
    descartado: true,
    esperando_respuesta: true,
  };
  const existingStatus =
    prior && isWithinRecontactLock(prior.created_at) ? prior.status : null;
  if (input.status) {
    if (
      existingStatus &&
      protectedStatuses[existingStatus] &&
      input.status === "ia_atendiendo"
    ) {
      // keep existing status
    } else {
      patch.status = input.status;
    }
  }
  const patchClientType = sanitizeClientType(input.clientType);
  if (patchClientType) patch.client_type = patchClientType;
  if (input.province) {
    const cleanProvince = resolveProvince(input.province, input.aiSummary, input.notes);
    if (cleanProvince) patch.province = cleanProvince;
  }
  if (input.distributorId !== undefined) patch.distributor_id = input.distributorId;
  if (input.aiSummary !== undefined) patch.ai_summary = input.aiSummary;
  if (input.lastMessage !== undefined) patch.last_message = input.lastMessage;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.estimatedVolume !== undefined) patch.estimated_volume = input.estimatedVolume;
  if (input.outcome !== undefined) patch.outcome = input.outcome;
  if (kapsoConversationId) patch.kapso_conversation_id = kapsoConversationId;
  if (kapsoExecutionId) patch.kapso_execution_id = kapsoExecutionId;

  let row;
  const canPatchExisting =
    prior &&
    isWithinRecontactLock(prior.created_at) &&
    MID_FLOW_STATUSES[prior.status || ""];

  if (canPatchExisting) {
    const messages = Array.isArray(prior.messages) ? prior.messages.slice() : [];
    if (input.message) messages.push(input.message);
    patch.messages = messages;
    const updated = await sb(
      supabaseUrl,
      supabaseKey,
      "conversations?id=eq." + prior.id,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
    row = Array.isArray(updated) ? updated[0] : updated;
  } else {
    const insert = {
      name: input.name || (context.contact && context.contact.profile_name) || phone,
      phone: phone,
      origin: input.origin || "whatsapp",
      status: input.status || "ia_atendiendo",
      client_type: sanitizeClientType(input.clientType) || "otro",
      province: input.province || "Córdoba",
      distributor_id: input.distributorId || null,
      ai_summary: input.aiSummary || "",
      last_message: input.lastMessage || (input.message && input.message.content) || "",
      notes: input.notes || "",
      tags: input.tags || [],
      estimated_volume: input.estimatedVolume || null,
      outcome: input.outcome || null,
      kapso_conversation_id: kapsoConversationId,
      kapso_execution_id: kapsoExecutionId,
      messages: input.message ? [input.message] : [],
    };
    const created = await sb(supabaseUrl, supabaseKey, "conversations", {
      method: "POST",
      body: JSON.stringify(insert),
    });
    row = Array.isArray(created) ? created[0] : created;
  }

  const out = {
    ok: true,
    conversationId: row.id,
    status: row.status,
    phone: row.phone,
    recontactLocked: false,
    isNewConversation: !canPatchExisting,
  };
  if (spawnFreshAfterMuestras) {
    out.priorConversationId = prior.id;
    out.spawnedAfterMuestras = true;
    out.agentInstruction =
      "Hay otra card del mismo teléfono en Muestras (el operador la cierra con Resultado). " +
      "ESTA es una conversación NUEVA: tipificá de cero con lo que diga el lead ahora. " +
      "NO copies ni merges datos de la card de muestras. Esperá dos cards del mismo número (Pipeline rojo).";
  } else if (
    row.status === "quiere_ser_distribuidor" ||
    normalize(input.status) === "quiere_ser_distribuidor"
  ) {
    const next = nextStepAfterDistributorColumn(
      buildQualification(
        {
          clientType: "distribuidor",
          province: row.province,
          estimatedVolume: row.estimated_volume,
          aiSummary: row.ai_summary,
          notes: row.notes,
          volumeUncertain: input.volumeUncertain,
          wantsPricesBeforeVolume: input.wantsPricesBeforeVolume,
          reason: input.reason || input.aiSummary,
        },
        row,
      ),
    );
    out.nextStep = next.nextStep;
    out.gate = "dist_checklist";
    out.agentInstruction = next.agentInstruction;
  }
  return out;
}

async function decideRoute(input, supabaseUrl, supabaseKey) {
  const blocked = requireHighCertainty(
    input,
    "tipo de cliente / compra vs ser dist. / retail vs mayorista / zona o volumen",
  );
  if (blocked) return blocked;

  let conv = null;
  if (input.conversationId) {
    const convRows = await sb(
      supabaseUrl,
      supabaseKey,
      "conversations?id=eq." + input.conversationId + "&limit=1",
      { method: "GET" },
    );
    conv = Array.isArray(convRows) && convRows[0] ? convRows[0] : null;
  }

  const qualBlock = gateDecideRouteQualification(input, conv);
  if (qualBlock) return qualBlock;

  const q = buildQualification(input, conv);
  const clientType =
    sanitizeClientType(input.clientType) ||
    sanitizeClientType(conv && conv.client_type) ||
    input.clientType ||
    "minorista";
  const province = q.province || "";
  const postalCode = input.postalCode || "";
  const estimatedVolume = q.volume;
  const wantsToBeDistributor = Boolean(
    input.wantsToBeDistributor || clientType === "distribuidor",
  );

  const settingsRows = await sb(
    supabaseUrl,
    supabaseKey,
    "commercial_settings?order=updated_at.desc&limit=1",
    { method: "GET" },
  );
  const settings = (Array.isArray(settingsRows) && settingsRows[0]) || {
    min_bundles_default: 50,
    province_distributor_map: [],
  };
  const minBundles = settings.min_bundles_default || 50;
  const map = Array.isArray(settings.province_distributor_map)
    ? settings.province_distributor_map
    : [];

  const dists = await sb(
    supabaseUrl,
    supabaseKey,
    "distributors?active=eq.true",
    { method: "GET" },
  );
  const distributors = Array.isArray(dists) ? dists : [];

  if (clientType === "representante") {
    return {
      ok: true,
      action: "quiere_ser_representante",
      conversationStatus: "quiere_ser_representante",
      outcome: "quiere_ser_representante",
      distributorId: null,
      distributorName: null,
      reason:
        "Quiere ser representante — columna + handoff comercial (sin menú muestras).",
      syncDerivedSheet: false,
      coolMealsMenu: false,
      agentInstruction:
        "REPRESENTANTE — " +
        contactChecklistInstruction() +
        " Luego mensaje: asesor te contacta (NO este número) + despedida. Silencio: handoff_human status=quiere_ser_representante + handoff_to_human. Sin menú muestras aunque diga volumen alto.",
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
        "Quiere ser fasón — columna + handoff comercial (sin menú muestras).",
      syncDerivedSheet: false,
      coolMealsMenu: false,
      agentInstruction:
        "FASÓN — " +
        contactChecklistInstruction() +
        " Luego mensaje: sí hacemos fasón/marca propia; asesor te contacta + despedida. Silencio: handoff_human status=quiere_ser_fason + handoff_to_human. Sin menú muestras aunque diga volumen alto.",
    };
  }

  let distributor = null;
  if (postalCode) {
    distributor =
      distributors.find(function (d) {
        return (d.postal_codes || []).some(function (c) {
          return String(c).trim() === String(postalCode).trim();
        });
      }) || null;
  }
  if (!distributor) {
    const mapped = map.find(function (row) {
      return normalize(row.province) === normalize(province);
    });
    if (mapped) {
      distributor =
        distributors.find(function (d) {
          return d.id === mapped.distributorId;
        }) || null;
    }
  }
  if (!distributor) {
    distributor =
      distributors.find(function (d) {
        return (d.covered_provinces || []).some(function (p) {
          return normalize(p) === normalize(province);
        });
      }) ||
      distributors.find(function (d) {
        return normalize(d.province) === normalize(province);
      }) ||
      null;
  }

  const isCordoba = normalize(province) === "cordoba";
  const highVolume =
    estimatedVolume !== null && estimatedVolume >= minBundles;
  const distNote = wantsToBeDistributor
    ? " (lead dist.; columna Quiere ser distribuidor vía upsert, sin handoff)"
    : "";

  // Prioridad: ≥50 → menú muestras/pedido (cualquier provincia / tipo)
  if (highVolume) {
    return {
      ok: true,
      action: "own_attention",
      conversationStatus: "atencion_representante",
      outcome: "handoff_humano",
      distributorId: null,
      distributorName: null,
      reason:
        "Volumen ≥ " +
        minBundles +
        " (" +
        clientType +
        ", " +
        province +
        ") — menú muestras/pedido." +
        distNote,
      syncDerivedSheet: false,
      coolMealsMenu: true,
      agentInstruction:
        "Cool Meals (≥50, cualquier provincia). Menú: 1) Pedir muestras 2) Agendar pedido. Esperá. " +
        "Si muestras: pedí Nombre, Tel, Empresa, Provincia, DNI, Correo, CP y Dirección completa → request_samples → mensaje: se acuerdan/envían las muestras y un REPRESENTANTE se comunica para el seguimiento → handoff_human status=muestras (IA ended; NO handoff_to_human). " +
        "Si pedido: " +
        contactChecklistInstruction() +
        " Luego asesor te contacta; handoff_human + handoff_to_human.",
    };
  }

  // <50 (o sin volumen): Córdoba → operador
  if (isCordoba) {
    return {
      ok: true,
      action: "own_attention",
      conversationStatus: "atencion_representante",
      outcome: "handoff_humano",
      distributorId: null,
      distributorName: null,
      reason:
        clientType +
        " en Córdoba con volumen < " +
        minBundles +
        " (o sin volumen) — operador Cool Meals." +
        distNote,
      syncDerivedSheet: false,
      coolMealsMenu: false,
      agentInstruction:
        "Cool Meals operador (Córdoba <50). SIN menú muestras. PROHIBIDO decir 'asesor/distribuidor de la zona'. " +
        contactChecklistInstruction() +
        " Luego mensaje: un asesor Cool Meals te contacta + despedida. Silencio: handoff_human status=atencion_representante + handoff_to_human.",
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
      reason: "Sin cobertura en " + province + distNote,
      syncDerivedSheet: false,
      agentInstruction:
        contactChecklistInstruction() +
        " Luego avisá que aún no hay cobertura; te avisamos cuando lleguemos. handoff_human status=sin_cobertura + handoff_to_human.",
    };
  }

  return {
    ok: true,
    action: "derive_to_distributor",
    conversationStatus: "derivado_distribuidor",
    outcome: "derivado_distribuidor",
    distributorId: distributor.id,
    distributorName: distributor.name,
    reason:
      "Derivado a " + distributor.name + " (" + province + ")" + distNote,
    syncDerivedSheet: true,
    agentInstruction:
      "DERIVAR a " +
      distributor.name +
      ". " +
      contactChecklistInstruction() +
      " PROHIBIDO sync_derived hasta tener esos datos (o contactRefused). " +
      "Mensaje: 'Te va a contactar " +
      distributor.name +
      "…' + despedida. Silencio: sync_derived (fullName, company, contactPhone, phoneConfirmed=true) + handoff_to_human. Si pidieron muestras con <50: NO request_samples.",
  };
}

async function appendSheet(env, kind, spreadsheetId, values) {
  const url = env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = env.GOOGLE_SHEETS_WEBHOOK_SECRET;
  if (!url || !secret) {
    return { attempted: false, success: false, error: "Sheets webhook secrets missing" };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: secret,
      kind: kind,
      spreadsheetId: spreadsheetId,
      sheetName: env.GOOGLE_SHEETS_RANGE || "Sheet1",
      values: values,
    }),
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch (_) {}
  if (!res.ok || body.ok === false) {
    return {
      attempted: true,
      success: false,
      error: body.error || text.slice(0, 200),
    };
  }
  return { attempted: true, success: true };
}

async function requestSamples(input, phoneFromCtx, supabaseUrl, supabaseKey, env, ctx) {
  const blocked = requireHighCertainty(
    input,
    "que el lead eligió muestras tras menú Cool Meals calificado",
  );
  if (blocked) return blocked;

  const fullName = String(input.fullName || "").trim();
  const phone = String(input.phone || phoneFromCtx || "").trim();
  const company = String(input.company || "").trim();
  const province = String(input.province || "").trim();
  const dni = String(input.dni || "").trim();
  const email = String(input.email || "").trim();
  const postalCode = String(input.postalCode || "").trim();
  const address = String(input.address || "").trim();
  if (
    !fullName ||
    !phone ||
    !company ||
    !province ||
    !dni ||
    !email ||
    !postalCode ||
    !address
  ) {
    throw new Error(
      "fullName, phone, company, province, dni, email, postalCode and address required for samples",
    );
  }

  let conversationId = input.conversationId || null;
  if (!conversationId && phone) {
    const found = await sb(
      supabaseUrl,
      supabaseKey,
      "conversations?phone=eq." +
        encodeURIComponent(phone) +
        "&order=updated_at.desc&limit=1",
      { method: "GET" },
    );
    if (Array.isArray(found) && found[0]) conversationId = found[0].id;
  }

  const created = await sb(supabaseUrl, supabaseKey, "sample_requests", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      lead_id: input.leadId || null,
      full_name: fullName,
      phone: phone,
      company: company,
      province: province,
      dni: dni,
      email: email,
      address: address,
      city: input.city || "",
      postal_code: postalCode,
      notes: input.notes || "",
      status: "pendiente",
    }),
  });
  const row = Array.isArray(created) ? created[0] : created;

  // Cool Meals se hace cargo: card en columna Muestras (logística ve sheet + Pipeline).
  if (conversationId) {
    const notesExtra =
      "Muestra agendada — representante hace seguimiento; sheet logística.";
    const existingConv = await sb(
      supabaseUrl,
      supabaseKey,
      "conversations?id=eq." + conversationId + "&select=notes&limit=1",
      { method: "GET" },
    );
    const prevNotes =
      Array.isArray(existingConv) && existingConv[0]
        ? existingConv[0].notes || ""
        : "";
    await sb(supabaseUrl, supabaseKey, "conversations?id=eq." + conversationId, {
      method: "PATCH",
      body: JSON.stringify({
        status: "muestras",
        outcome: "muestras",
        notes: [prevNotes, notesExtra].filter(Boolean).join("\n"),
      }),
    });
  }

  const sheetId = env.GOOGLE_SHEET_SAMPLE_LOGISTICS_ID;
  const today = new Date().toISOString().slice(0, 10);
  let clientType = input.clientType || "";
  if (!clientType && conversationId) {
    const convRows = await sb(
      supabaseUrl,
      supabaseKey,
      "conversations?id=eq." + conversationId + "&select=client_type&limit=1",
      { method: "GET" },
    );
    clientType =
      Array.isArray(convRows) && convRows[0] ? convRows[0].client_type || "" : "";
  }
  const sheet = await appendSheet(env, "sample_logistics", sheetId, [
    today,
    fullName,
    phone,
    clientType,
    company,
    province,
    dni,
    email,
    postalCode,
    address,
  ]);

  if (sheet.success && row && row.id) {
    await sb(supabaseUrl, supabaseKey, "sample_requests?id=eq." + row.id, {
      method: "PATCH",
      body: JSON.stringify({ sheet_synced_at: new Date().toISOString() }),
    });
  }

  return {
    ok: true,
    sampleRequestId: row && row.id,
    conversationId: conversationId,
    sheet: sheet,
    instruction:
      "Muestra agendada (Pipeline Muestras + sheet logística). Mensaje al lead: se acuerdan/envían las muestras y un REPRESENTANTE se va a comunicar para el seguimiento. Luego handoff_human status=muestras (IA ended; NO handoff_to_human). La card queda en Muestras hasta Resultado del operador. NO digas solo 'logística'; priorizá representante/seguimiento.",
  };
}

async function handoff(input, phoneFromCtx, supabaseUrl, supabaseKey, ctx, env) {
  const phone = String(input.phone || phoneFromCtx || "").trim();
  const system = (ctx && ctx.system) || {};
  const context = (ctx && ctx.context) || {};
  const kapsoExecutionId =
    input.kapsoExecutionId ||
    system.workflow_execution_id ||
    system.flow_execution_id ||
    null;
  const kapsoConversationId =
    input.kapsoConversationId || context.conversation_id || null;

  let rows;
  if (input.conversationId) {
    rows = await sb(
      supabaseUrl,
      supabaseKey,
      "conversations?id=eq." + input.conversationId + "&limit=1",
      { method: "GET" },
    );
  } else if (phone) {
    rows = await sb(
      supabaseUrl,
      supabaseKey,
      "conversations?phone=eq." + encodeURIComponent(phone) + "&order=updated_at.desc&limit=1",
      { method: "GET" },
    );
  } else {
    throw new Error("conversationId or phone required");
  }
  const existing = Array.isArray(rows) && rows[0];
  if (!existing) throw new Error("Conversation not found");

  const allowedStatus = {
    atencion_representante: true,
    quiere_ser_representante: true,
    quiere_ser_fason: true,
    sin_cobertura: true,
    muestras: true,
    esperando_respuesta: true,
    descartado: true,
  };
  // Quiere ser distribuidor = SOLO columna vía upsert. Nunca handoff con ese status:
  // si el modelo lo manda (precios / volumen inseguro / cierre), va a operador.
  let status =
    input.status && allowedStatus[input.status]
      ? input.status
      : "atencion_representante";
  let gateRemap = null;
  if (normalize(input.status) === "quiere_ser_distribuidor") {
    status = "atencion_representante";
    gateRemap = "quiere_ser_distribuidor_to_atencion_representante";
  }

  // Descartado / muestras: no exigen checklist de contacto de esta gate
  // (muestras ya pasó por request_samples; descartado es rechazo).
  if (status !== "descartado" && status !== "muestras") {
    const contactGate = gateContactBeforeClose(input, "handoff");
    if (contactGate && contactGate.ok === false) return contactGate;
    if (contactGate && contactGate.contactRefused) {
      // fuerza operador si se negó a dar datos en un cierre que no era operador
      if (status === "sin_cobertura" || status === "quiere_ser_representante" || status === "quiere_ser_fason") {
        // keep status: still a valid commercial close; note refusal below
      }
    }
  }

  if (status === "sin_cobertura") {
    const coverageProvince = resolveProvince(
      input.province,
      existing.province,
      input.aiSummary,
      existing.ai_summary,
      input.reason,
    );
    if (!coverageProvince) {
      return {
        ok: false,
        gate: "missing_province",
        needData: true,
        missing: ["province"],
        reason: "No se puede marcar sin_cobertura sin provincia.",
        agentInstruction:
          "GATE: falta provincia antes de sin_cobertura. Preguntá SOLO provincia + enter_waiting. " +
          "Si el lead no sabe zona y pide precios/humano: handoff status=atencion_representante (no sin_cobertura).",
      };
    }
  }
  const outcome =
    input.outcome ||
    (status === "quiere_ser_representante"
      ? "quiere_ser_representante"
      : status === "quiere_ser_fason"
        ? "quiere_ser_fason"
        : status === "sin_cobertura"
          ? "sin_cobertura"
          : status === "muestras"
            ? "muestras"
            : status === "descartado"
              ? "descartado"
              : "handoff_humano");

  const handoffCompany = resolveExplicitCompany(input);
  const notes = [
    existing.notes,
    handoffCompany ? "Negocio/empresa: " + handoffCompany : null,
    isContactRefused(input)
      ? "Contacto incompleto: el lead se negó a dar nombre/negocio/teléfono confirmado."
      : null,
    normalize(input.status) === "quiere_ser_distribuidor"
      ? "Handoff operador (no usar columna Quiere ser distribuidor para handoff): " +
        (input.reason || "faltan precios/volumen u otro dato comercial")
      : status === "descartado"
      ? "Descartado + IA cerrada (ended): " + (input.reason || "sin perfil comercial")
      : status === "muestras"
        ? "Muestras agendadas + IA cerrada (ended); card queda hasta Resultado: " +
          (input.reason || "muestras")
        : "Handoff: " + (input.reason || "atención humana"),
  ]
    .filter(Boolean)
    .join("\n");

  const tagsBase = (
    Array.isArray(existing.tags) ? existing.tags : []
  ).filter(function (t) {
    return t !== "#atendido_por_representante";
  });
  // Sin cobertura / descartado / muestras (IA ended): sin forzar hashtag de handoff.
  const tags = Array.from(
    new Set(
      status === "sin_cobertura" ||
        status === "descartado" ||
        status === "muestras"
        ? tagsBase
        : tagsBase.concat(["#atencion_humana"]),
    ),
  );

  const now = new Date();
  const esperandoHoursRaw = Number(env && env.ESPERANDO_TO_FINALIZE_HOURS);
  const autoFinalizeHours =
    Number.isFinite(esperandoHoursRaw) && esperandoHoursRaw > 0
      ? esperandoHoursRaw
      : 22;
  // Solo sin cobertura / esperando respuesta programan auto-cierre (~22h).
  // sin_cobertura → Descartado; esperando_respuesta → Finalizado (lo hace el cron API).
  const schedulesAutoFinalize =
    status === "sin_cobertura" || status === "esperando_respuesta";
  const finalizeAt = schedulesAutoFinalize
    ? new Date(now.getTime() + autoFinalizeHours * 60 * 60 * 1000).toISOString()
    : null;

  const patchBody = {
    status: status,
    outcome: outcome,
    human_handoff_at: now.toISOString(),
    finalize_at: finalizeAt,
    ai_summary: input.aiSummary || existing.ai_summary,
    notes: notes,
    tags: tags,
    kapso_execution_id: kapsoExecutionId || existing.kapso_execution_id || null,
    kapso_conversation_id: kapsoConversationId || existing.kapso_conversation_id || null,
  };

  const handoffProvince = resolveProvince(
    input.province,
    existing.province,
    input.aiSummary,
    existing.ai_summary,
    input.reason,
  );
  if (handoffProvince && sanitizeHumanField(existing.province) !== handoffProvince) {
    patchBody.province = handoffProvince;
  }
  const handoffName =
    resolveExplicitFullName(input) ||
    sanitizeHumanField(input.name) ||
    sanitizeHumanField(existing.name);
  if (handoffName && sanitizeHumanField(existing.name) !== handoffName) {
    patchBody.name = handoffName;
  }
  const handoffContactPhone = resolveExplicitContactPhone(input);
  if (handoffContactPhone && String(existing.phone || "").trim() !== handoffContactPhone) {
    patchBody.phone = handoffContactPhone;
  }

  let updated;
  try {
    updated = await sb(supabaseUrl, supabaseKey, "conversations?id=eq." + existing.id, {
      method: "PATCH",
      body: JSON.stringify(patchBody),
    });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    if (msg.includes("finalize_at")) {
      delete patchBody.finalize_at;
      updated = await sb(supabaseUrl, supabaseKey, "conversations?id=eq." + existing.id, {
        method: "PATCH",
        body: JSON.stringify(patchBody),
      });
    } else {
      throw err;
    }
  }
  const row = Array.isArray(updated) ? updated[0] : updated;

  let sheet = { attempted: false, success: true, spreadsheetId: null };
  try {
    sheet = await syncHandoffInterestSheets(env, row, status, input.reason || "");
  } catch (err) {
    sheet = {
      attempted: true,
      success: false,
      spreadsheetId: null,
      error: err && err.message ? String(err.message) : String(err),
    };
  }

  // Descartado + Muestras: cerrar IA (ended). Resto: el agent usa handoff_to_human.
  // Muestras: la card permanece en Pipeline hasta Resultado del operador.
  let kapsoClose = { ok: false, skipped: true, mode: null };
  if ((status === "descartado" || status === "muestras") && kapsoExecutionId) {
    kapsoClose = await kapsoSetExecutionStatus(env, kapsoExecutionId, "ended");
    kapsoClose.mode = "ended";
  }

  return {
    ok: true,
    conversationId: row.id,
    status: row.status,
    sameNumber: true,
    finalizeAt: finalizeAt,
    sheet: sheet,
    kapsoClose: kapsoClose,
    gateRemap: gateRemap,
    instruction:
      status === "muestras"
        ? "Muestras: sheet/Pipeline listos e IA en ended. NO uses handoff_to_human. Avisá que un representante hace el seguimiento. La card queda en Muestras hasta Resultado."
        : status === "descartado"
          ? "Descartado: IA en ended. NO uses handoff_to_human. Solo mensaje humano breve de cierre (sin decir 'descartado')."
          : "Usá handoff_to_human en el agent. Octavio responde en el mismo WhatsApp.",
  };
}

async function syncHandoffInterestSheets(env, row, status, reason) {
  const date = new Date().toISOString().slice(0, 10);
  if (
    status === "quiere_ser_distribuidor" ||
    status === "quiere_ser_representante" ||
    status === "quiere_ser_fason"
  ) {
    const tipoCliente =
      status === "quiere_ser_distribuidor"
        ? "distribuidor"
        : status === "quiere_ser_representante"
          ? "representante"
          : "fason";
    const sheetId = env.GOOGLE_SHEET_COMMERCIAL_ATTENTION_ID;
    if (!sheetId) {
      return { attempted: false, success: false, error: "GOOGLE_SHEET_COMMERCIAL_ATTENTION_ID missing" };
    }
    const sheet = await appendSheet(env, "commercial_attention", sheetId, [
      date,
      sanitizeHumanField(row.name) || "",
      row.phone || "",
      "",
      tipoCliente,
      resolveProvince(row.province, reason, row.ai_summary),
      "",
      reason || "",
      "",
    ]);
    return sheet;
  }
  if (status === "sin_cobertura") {
    const sheetId = env.GOOGLE_SHEET_NO_COVERAGE_ID;
    if (!sheetId) {
      return { attempted: false, success: false, error: "GOOGLE_SHEET_NO_COVERAGE_ID missing" };
    }
    const province = resolveProvince(row.province, reason, row.ai_summary);
    const sheet = await appendSheet(env, "no_coverage", sheetId, [
      date,
      sanitizeHumanField(row.name) || "",
      row.phone || "",
      "",
      province,
      "",
      row.client_type || "",
      reason || "",
      "",
    ]);
    return sheet;
  }
  return { attempted: false, success: true, spreadsheetId: null };
}

async function kapsoSetExecutionStatus(env, executionId, status) {
  const base = String(env.KAPSO_API_BASE_URL || "").replace(/\/+$/, "");
  const key = env.KAPSO_API_KEY;
  if (!base || !key || !executionId) {
    return { ok: false, skipped: true, error: "Kapso API or execution id missing" };
  }
  const res = await fetch(base + "/platform/v1/workflow_executions/" + executionId, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": key,
    },
    body: JSON.stringify({ workflow_execution: { status: status } }),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, skipped: false, error: text || "HTTP " + res.status };
  }
  return { ok: true, skipped: false };
}

function deriveHandoffHours(env) {
  const raw = Number(env.DERIVE_HANDOFF_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
}

async function syncDerived(input, phoneFromCtx, supabaseUrl, supabaseKey, env, ctx) {
  const blocked = requireHighCertainty(
    input,
    "derivación a dist. de zona ya confirmada por decide_route",
  );
  if (blocked) return blocked;

  const system = (ctx && ctx.system) || {};
  const context = (ctx && ctx.context) || {};
  const kapsoExecutionId =
    input.kapsoExecutionId ||
    system.workflow_execution_id ||
    system.flow_execution_id ||
    null;
  const kapsoConversationId =
    input.kapsoConversationId || context.conversation_id || null;

  let conv;
  if (input.conversationId) {
    const rows = await sb(
      supabaseUrl,
      supabaseKey,
      "conversations?id=eq." + input.conversationId + "&limit=1",
      { method: "GET" },
    );
    conv = Array.isArray(rows) && rows[0];
  } else {
    const phone = String(input.phone || phoneFromCtx || "").trim();
    const rows = await sb(
      supabaseUrl,
      supabaseKey,
      "conversations?phone=eq." + encodeURIComponent(phone) + "&order=updated_at.desc&limit=1",
      { method: "GET" },
    );
    conv = Array.isArray(rows) && rows[0];
  }
  if (!conv) throw new Error("Conversation not found");

  const volumeBlock = blockDerivationAtHighVolume(input, conv, 50);
  if (volumeBlock) return volumeBlock;

  const contactGate = gateContactBeforeClose(input, "sync_derived");
  if (contactGate && contactGate.ok === false) return contactGate;
  // Si se negó al contacto en un derive: no sync_derived a dist.; devolver instrucción a operador.
  if (contactGate && contactGate.contactRefused) {
    return {
      ok: false,
      gate: "contact_refused_use_operator",
      needData: false,
      reason: "Lead se negó a dar contacto: no derivar a dist.; va a operador.",
      agentInstruction:
        "Lead se negó a dar nombre/negocio/teléfono. PROHIBIDO sync_derived. " +
        "Mensaje: un asesor Cool Meals te contacta + despedida. " +
        "handoff_human status=atencion_representante contactRefused=true + handoff_to_human.",
    };
  }

  let distributorName = input.distributorName || "";
  if (!distributorName && (input.distributorId || conv.distributor_id)) {
    const distId = input.distributorId || conv.distributor_id;
    const dists = await sb(
      supabaseUrl,
      supabaseKey,
      "distributors?id=eq." + distId + "&select=name&limit=1",
      { method: "GET" },
    );
    distributorName = Array.isArray(dists) && dists[0] ? dists[0].name : "";
  }

  const now = new Date();
  const hours = deriveHandoffHours(env);

  const patch = {
    status: "derivado_distribuidor",
    outcome: "derivado_distribuidor",
    derived_at: now.toISOString(),
    // Derivados no auto-finalizan: quedan hasta cierre manual.
    finalize_at: null,
    kapso_execution_id: kapsoExecutionId || conv.kapso_execution_id || null,
    kapso_conversation_id: kapsoConversationId || conv.kapso_conversation_id || null,
  };
  if (input.distributorId) patch.distributor_id = input.distributorId;
  const derivedClientType = sanitizeClientType(input.clientType);
  if (derivedClientType) patch.client_type = derivedClientType;
  if (input.province) patch.province = input.province;
  if (input.aiSummary) patch.ai_summary = input.aiSummary;
  const derivedName = resolveExplicitFullName(input);
  if (derivedName) patch.name = derivedName;
  const derivedPhone = resolveExplicitContactPhone(input);
  if (derivedPhone) patch.phone = derivedPhone;
  const derivedCompany = resolveExplicitCompany(input);
  if (derivedCompany) {
    patch.notes = [conv.notes, "Negocio/empresa: " + derivedCompany]
      .filter(Boolean)
      .join("\n");
  }

  if (distributorName) {
    const slug = String(distributorName)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const distTag = "#" + slug;
    const existingTags = Array.isArray(conv.tags) ? conv.tags : [];
    patch.tags = Array.from(new Set([...existingTags, distTag]));
  }

  try {
    await sb(supabaseUrl, supabaseKey, "conversations?id=eq." + conv.id, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    if (msg.includes("derived_at") || msg.includes("finalize_at")) {
      delete patch.derived_at;
      delete patch.finalize_at;
      await sb(supabaseUrl, supabaseKey, "conversations?id=eq." + conv.id, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    } else {
      throw err;
    }
  }

  const sheetId = env.GOOGLE_SHEET_DERIVED_DISTRIBUTORS_ID;
  const today = new Date().toISOString().slice(0, 10);
  const sheet = await appendSheet(env, "derived_distributors", sheetId, [
    today,
    conv.name || "",
    conv.phone || "",
    input.company || "",
    input.businessType || "",
    input.clientType || conv.client_type || "",
    input.province || conv.province || "",
    input.city || "",
    input.postalCode || "",
    distributorName,
    "",
  ]);

  const handoff = await kapsoSetExecutionStatus(
    env,
    kapsoExecutionId || conv.kapso_execution_id,
    "handoff",
  );

  return {
    ok: true,
    conversationId: conv.id,
    distributorName: distributorName,
    sheet: sheet,
    finalizeAt: null,
    handoffHours: hours,
    kapsoHandoff: handoff,
    instruction:
      "Después de sync_derived: llamá handoff_to_human. NUNCA complete_task al derivar. " +
      "El bot queda en handoff. Esta columna NO auto-finaliza: el operador cierra con Resultado cuando corresponda.",
  };
}
