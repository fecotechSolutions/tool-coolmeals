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

function normalizeCertainty(value) {
  const n = normalize(value);
  if (!n) return null;
  if (n === "high" || n === "alta" || n === "alto" || n === "segura" || n === "seguro" || n === "claro") {
    return "high";
  }
  if (
    n === "low" ||
    n === "baja" ||
    n === "bajo" ||
    n === "media" ||
    n === "medio" ||
    n === "medium" ||
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

function resolveEstimatedVolume(input) {
  if (input && input.estimatedVolume !== undefined && input.estimatedVolume !== null) {
    return Number(input.estimatedVolume);
  }
  return null;
}

function blockDerivationAtHighVolume(input) {
  const volume = resolveEstimatedVolume(input);
  if (volume === null || Number.isNaN(volume) || volume < MIN_BUNDLES) return null;
  return {
    ok: false,
    error:
      "Volumen ≥ " + MIN_BUNDLES + ": Cool Meals atiende directo. No derivar a distribuidor de zona.",
    agentInstruction:
      "GATE ≥" +
      MIN_BUNDLES +
      ". PROHIBIDO sync_derived / nombrar distribuidor de zona. " +
      "Llamá decide_route con clientType + provincia + estimatedVolume y certainty=high. " +
      "Seguí agentInstruction: menú 1) Pedir muestras  2) Agendar pedido (cualquier provincia).",
  };
}

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

function buildQualification(input) {
  const clientType = sanitizeClientType(input && input.clientType) || "otro";
  const province = resolveProvince(
    input && input.province,
    input && input.aiSummary,
    input && input.reason,
    input && input.notes,
  );
  const volume = resolveEstimatedVolume(input);
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
  if (!resolveExplicitFullName(input)) missing.push("fullName");
  if (!resolveExplicitCompany(input)) missing.push("company");
  if (!resolveExplicitContactPhone(input)) missing.push("contactPhone");
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

function gateDecideRouteQualification(input) {
  const earlyType = sanitizeClientType(input && input.clientType) || "";
  if (earlyType === "representante" || earlyType === "fason") return null;

  const q = buildQualification(input);
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

function upsertConversation(input, phoneFromCtx) {
  const phone = String(input.phone || phoneFromCtx || "").trim();
  if (!phone) return { ok: false, error: "phone required" };
  const status = input.status || "ia_atendiendo";
  const out = {
    ok: true,
    conversationId: "mock-conv-" + phone.slice(-6),
    status: status,
    phone: phone,
  };
  if (normalize(status) === "quiere_ser_distribuidor") {
    const next = nextStepAfterDistributorColumn(
      buildQualification({
        clientType: "distribuidor",
        province: input.province,
        estimatedVolume: input.estimatedVolume,
        aiSummary: input.aiSummary,
        notes: input.notes,
        volumeUncertain: input.volumeUncertain,
        wantsPricesBeforeVolume: input.wantsPricesBeforeVolume,
        reason: input.reason || input.aiSummary,
      }),
    );
    out.nextStep = next.nextStep;
    out.gate = "dist_checklist";
    out.agentInstruction = next.agentInstruction;
  }
  return out;
}

function decideRoute(input) {
  const blocked = requireHighCertainty(
    input,
    "tipo de cliente o intención (comprar vs ser distribuidor / retail vs mayorista)",
  );
  if (blocked) return blocked;

  const qualBlock = gateDecideRouteQualification(input);
  if (qualBlock) return qualBlock;

  const q = buildQualification(input);
  const clientType = sanitizeClientType(input.clientType) || normalize(input.clientType) || "minorista";
  const province = q.province || input.province || "";
  const estimatedVolume = q.volume;
  const wantsToBeDistributor = Boolean(
    input.wantsToBeDistributor || clientType === "distribuidor",
  );

  // Misma prioridad que producción: rep/fasón → ≥50 cualquier zona → Córdoba <50 → dist/<cobertura.
  // Quiere-ser-dist (4 SÍ): la columna va por upsert; decide_route rutea por volumen/zona (sin handoff "quiere ser dist").
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
        "REPRESENTANTE — " +
        contactChecklistInstruction() +
        " Luego mensaje humano: confirmá interés; asesor te contacta (NO este número); despedida. PROHIBIDO narrar handoff/transferencia. Luego en silencio handoff_human status=quiere_ser_representante + handoff_to_human.",
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
        "FASÓN — " +
        contactChecklistInstruction() +
        " Luego mensaje humano: sí hacemos fasón/marca propia; asesor te contacta (NO este número); despedida. PROHIBIDO narrar handoff/transferencia. Luego en silencio handoff_human status=quiere_ser_fason + handoff_to_human.",
    };
  }

  const distributor =
    DISTRIBUTORS.find((d) => d.provinces.some((p) => p === normalize(province))) || null;

  const isCordoba = normalize(province) === "cordoba";
  const highVolume = estimatedVolume !== null && estimatedVolume >= MIN_BUNDLES;
  const distNote = wantsToBeDistributor
    ? " (lead dist.; columna Quiere ser distribuidor vía upsert, sin handoff)"
    : "";

  // ≥50 → Cool Meals directo SIEMPRE (cualquier provincia / tipo). Nunca derivar a dist. asociados.
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
        MIN_BUNDLES +
        " (" +
        clientType +
        ", " +
        province +
        ") — menú muestras/pedido." +
        distNote,
      syncDerivedSheet: false,
      coolMealsMenu: true,
      agentInstruction:
        "Cool Meals (≥50, cualquier provincia). Menú: 1) Pedir muestras 2) Agendar pedido. Esperá. Si muestras: pedí Nombre, Tel, Empresa, Provincia, DNI, Correo, CP y Dirección completa → request_samples → mensaje: se acuerdan/envían las muestras y un REPRESENTANTE se comunica para el seguimiento → handoff_human status=muestras (IA ended; NO handoff_to_human). Si pedido: " +
        contactChecklistInstruction() +
        " Luego asesor te contacta; handoff_human + handoff_to_human.",
    };
  }

  // <50 (o sin volumen): Córdoba → operador Cool Meals (sin menú)
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
        MIN_BUNDLES +
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
        " Luego avisá que aún no hay cobertura. Llamá handoff_human con status=sin_cobertura (NO atencion_representante) y reason claro; después handoff_to_human. La card queda en Sin cobertura; en ~22h pasa a Finalizado.",
    };
  }

  return {
    ok: true,
    action: "derive_to_distributor",
    conversationStatus: "derivado_distribuidor",
    outcome: "derivado_distribuidor",
    distributorId: distributor.id,
    distributorName: distributor.name,
    reason: "Derivado a " + distributor.name + " (" + province + ")" + distNote,
    syncDerivedSheet: true,
    agentInstruction:
      "DERIVAR a " +
      distributor.name +
      ". " +
      contactChecklistInstruction() +
      " PROHIBIDO sync_derived hasta tener esos datos (o contactRefused). " +
      "Mensaje humano: 'Te va a contactar " +
      distributor.name +
      " de tu zona…' (usá ese nombre exacto) + despedida corta. 3) En silencio: sync_derived (con company=nombre negocio) + handoff_to_human. PROHIBIDO decir 'registro/derivación/sistema'. Si pidieron muestras: NO request_samples — el dist. se hace cargo.",
  };
}

function requestSamples(input, phoneFromCtx) {
  const blocked = requireHighCertainty(input, "pedido de muestras");
  if (blocked) return blocked;

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
  let status = normalize(input.status) || "atencion_representante";
  let gateRemap = null;
  if (status === "quiere_ser_distribuidor") {
    status = "atencion_representante";
    gateRemap = "quiere_ser_distribuidor_to_atencion_representante";
  }
  if (status !== "descartado" && status !== "muestras") {
    const contactGate = gateContactBeforeClose(input, "handoff");
    if (contactGate && contactGate.ok === false) return contactGate;
  }
  if (status === "sin_cobertura") {
    const province = resolveProvince(input.province, input.aiSummary, input.reason);
    if (!province) {
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
  return {
    ok: true,
    conversationId: input.conversationId || "mock-conv",
    status,
    sameNumber: true,
    finalizeAt: status === "sin_cobertura" ? "mock-finalize-at" : null,
    sheet: { attempted: true, success: true },
    kapsoClose: { ok: true, skipped: status !== "muestras" && status !== "descartado" },
    gateRemap: gateRemap,
    instruction:
      status === "muestras"
        ? "Muestras: sheet listo e IA en ended. NO uses handoff_to_human (ya cerró). Avisá que logística contacta."
        : status === "descartado"
          ? "Descartado: IA en ended. NO uses handoff_to_human. Solo mensaje humano breve de cierre (sin decir 'descartado')."
          : "Usá handoff_to_human en el agent. Un asesor comercial responde por otro canal.",
  };
}

function syncDerived(input) {
  const blocked = requireHighCertainty(input, "derivación a distribuidor");
  if (blocked) return blocked;

  const volumeBlock = blockDerivationAtHighVolume(input);
  if (volumeBlock) return volumeBlock;

  const contactGate = gateContactBeforeClose(input, "sync_derived");
  if (contactGate && contactGate.ok === false) return contactGate;
  if (contactGate && contactGate.contactRefused) {
    return {
      ok: false,
      gate: "contact_refused_use_operator",
      reason: "Lead se negó a dar contacto: no derivar a dist.; va a operador.",
      agentInstruction:
        "Lead se negó a dar nombre/negocio/teléfono. PROHIBIDO sync_derived. " +
        "Mensaje: un asesor Cool Meals te contacta + despedida. " +
        "handoff_human status=atencion_representante contactRefused=true + handoff_to_human.",
    };
  }

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
