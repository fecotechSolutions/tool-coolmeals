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

function phoneDigits(value) {
  return String(value == null ? "" : value).replace(/\D/g, "");
}

function canonicalizeArPhone(value) {
  let d = phoneDigits(value);
  if (!d) return "";
  while (d.indexOf("00") === 0) d = d.slice(2);
  while (d.charAt(0) === "0") d = d.slice(1);
  if (d.indexOf("549") === 0 && d.length >= 12) d = "54" + d.slice(3);
  if (d.indexOf("54") !== 0 && (d.length === 10 || d.length === 8)) d = "54" + d;
  if (d.indexOf("540") === 0) d = "54" + d.slice(3).replace(/^0+/, "");
  return d;
}

function phoneLookupVariants(value) {
  const raw = phoneDigits(value);
  const canon = canonicalizeArPhone(value);
  const set = {};
  if (raw) set[raw] = true;
  if (canon) {
    set[canon] = true;
    if (canon.indexOf("54") === 0 && canon.length > 2) {
      const national = canon.slice(2);
      set[national] = true;
      set["549" + national] = true;
      set["54" + national] = true;
    }
  }
  return Object.keys(set);
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

function blockDerivationInCordoba(_input) {
  // Córdoba <50 ya deriva a dist. (o sin_cobertura). No bloquear.
  return null;
}

function isExplicitSampleChoice(input) {
  if (!input) return false;
  if (input.sampleChoiceConfirmed === true || input.samplesChosen === true) return true;
  const choice = normalize(input.sampleChoice || input.menuChoice || "");
  if (
    choice === "1" ||
    choice === "muestras" ||
    choice === "pedir_muestras" ||
    choice === "pedir muestras" ||
    choice === "samples"
  ) {
    return true;
  }
  const blob = normalize(
    [input.lastMessage, input.reason, input.notes, input.aiSummary].filter(Boolean).join(" "),
  );
  if (!blob) return false;
  if (/(^|[^\w])(1|uno)\b/.test(blob) && /(muestra|menu|opcion)/.test(blob)) return true;
  return (
    /(quiero|pido|elegi|elijo|opto por|vamos con|me anoto)\s+(las\s+)?muestras/.test(blob) ||
    /pedir\s+muestras/.test(blob) ||
    /opcion\s*1/.test(blob)
  );
}

function gateRequestSamplesEligibility(input) {
  const clientType = sanitizeClientType(input && input.clientType) || "";
  if (clientType === "representante" || clientType === "fason") {
    return {
      ok: false,
      gate: "samples_not_for_rep_fason",
      reason: "Fasón/representante (SER) no usa menú de muestras Cool Meals.",
      agentInstruction:
        "GATE: NO request_samples para fasón/representante. Handoff quiere_ser_* sin menú.",
    };
  }
  const volume = resolveEstimatedVolume(input);
  if (volume === null || Number.isNaN(volume) || volume < MIN_BUNDLES) {
    return {
      ok: false,
      gate: "samples_requires_high_volume",
      needData: true,
      reason: "Muestras solo con volumen ≥ " + MIN_BUNDLES + " (menú).",
      agentInstruction:
        "GATE P6/P8: PROHIBIDO request_samples sin menú (≥" +
        MIN_BUNDLES +
        "). Calificá volumen o rutear operador/dist. Sin kit Cool Meals si <50.",
    };
  }
  if (!isExplicitSampleChoice(input)) {
    return {
      ok: false,
      gate: "samples_choice_unclear",
      needData: true,
      missing: ["sampleChoiceConfirmed"],
      reason: "Falta elección explícita de muestras.",
      agentInstruction:
        "GATE P8: desambiguá menú 1) muestras 2) pedido. sampleChoiceConfirmed=true solo con elección clara.",
    };
  }
  return null;
}

function looksLikeAskForHumanNotBeRep(input) {
  const blob = normalize(
    [input && input.reason, input && input.aiSummary, input && input.lastMessage, input && input.notes]
      .filter(Boolean)
      .join(" "),
  );
  if (!blob) return false;
  if (/(quiero ser|sumarme como|ser\s+representante|representar la marca|vender a comision)/.test(blob)) {
    return false;
  }
  return /(hablar con|pasar(me)? (con |a )?(un |una )?(humano|persona|asesor|operador|alguien|representante)|atencion humana|quiero (un )?asesor)/.test(
    blob,
  );
}

function gateMisclassifiedRepresentative(input, forAction) {
  if (!input) return null;
  const type = sanitizeClientType(input.clientType);
  const status = normalize(input.status || "");
  if (type !== "representante" && status !== "quiere_ser_representante") return null;
  if (!looksLikeAskForHumanNotBeRep(input)) return null;
  return {
    ok: false,
    gate: "ask_human_not_be_representative",
    needDisambiguation: true,
    reason: "Pedido de humano/asesor ≠ quiere ser representante.",
    agentInstruction:
      "GATE P1/P1b: handoff status=atencion_representante (NO quiere_ser_representante). " +
      (forAction === "decide_route" ? "No uses clientType=representante solo por pedir una persona. " : ""),
  };
}

function conversationBlob(input) {
  return normalize(
    [input && input.lastMessage, input && input.aiSummary, input && input.reason, input && input.notes]
      .filter(Boolean)
      .join(" \n "),
  );
}

function leadSaysBoxes(text) {
  return /(caja|bulto)/.test(text);
}

function leadSaysProductUnits(text) {
  return /(wraps?|viandas?|postres?|unidades?|\buds?\b|platos?(\s+listos?)?)/.test(text);
}

function looksLikeBareVolumeNumber(text) {
  if (!text) return false;
  if (leadSaysBoxes(text) || leadSaysProductUnits(text)) return false;
  return (
    /^\s*\d{1,4}\s*$/.test(text) ||
    /\b(justo\s+con|llegar\s+(justo\s+)?(a|con)|unos?|alrededor\s+de|cerca\s+de|tipo|mas\s+o\s+menos|aprox(imadamente)?|a\s+partir\s+de|menos\s+de|mas\s+de|como)\s+\d{1,4}\b/.test(
      text,
    ) ||
    /\b\d{1,4}\s*(al\s+mes|por\s+mes|mensuales?)?\s*$/.test(text)
  );
}

function volumeUnitIsBoxes(unit) {
  return unit === "cajas" || unit === "caja" || unit === "bultos" || unit === "bulto";
}

function volumeUnitIsProduct(unit) {
  return (
    unit === "unidades" ||
    unit === "unidad" ||
    unit === "wraps" ||
    unit === "wrap" ||
    unit === "viandas" ||
    unit === "vianda"
  );
}

function gateVolumeUnitsAmbiguous(input) {
  if (!input) return null;
  const unit = normalize(input.volumeUnit || input.quantityUnit || "");
  const lead = normalize(String(input.lastMessage || ""));
  const blob = conversationBlob(input);

  const askLiteral = {
    ok: false,
    gate: "volume_units_ambiguous",
    needDisambiguation: true,
    missing: ["volumeUnit"],
    reason: "Falta confirmación literal cajas/bultos vs wraps/unidades.",
    agentInstruction:
      "GATE unidades↔cajas (literal): NO asumas un número suelto (ej. 'justo con 50') = cajas. " +
      "Preguntá: ¿son cajas/bultos o wraps/unidades? + enter_waiting. " +
      "Luego volumeUnit=cajas|unidades, volumeUnitConfirmed=true, estimatedVolume en CAJAS.",
  };

  const hasProductQty =
    blob &&
    (/(\d+)\s*(viandas?|wraps?|postres?|unidades?|uds?|platos?(\s+listos?)?)/.test(blob) ||
      /(\d+)\s+de\s+cada\s+(una|uno|producto)/.test(blob));
  if (hasProductQty && !leadSaysBoxes(lead) && !leadSaysBoxes(blob) && !volumeUnitIsBoxes(unit)) {
    return askLiteral;
  }

  if (looksLikeBareVolumeNumber(lead) && !volumeUnitIsBoxes(unit) && !volumeUnitIsProduct(unit)) {
    return askLiteral;
  }

  if (input.volumeUnitConfirmed === true || input.volumeInBoxes === true) {
    if (volumeUnitIsBoxes(unit) || volumeUnitIsProduct(unit)) return null;
    if (leadSaysBoxes(lead) || leadSaysProductUnits(lead)) return null;
    return askLiteral;
  }

  if (volumeUnitIsBoxes(unit) || volumeUnitIsProduct(unit)) return null;

  return null;
}

function looksLikePurchaseIntent(blob) {
  return /(comprar|compra|precio|precios|minimo|m[ií]nimos|cotiz|delivery|vianda|wrap|postre|muestra|pedido|almacen|minimarket|supermercado|retail|revender|sumar productos|quiero producto)/.test(
    blob,
  );
}

function looksLikeBeDistributorIntent(blob) {
  return /(quiero ser|sumarme como|ser\s+distribuidor|distribuidor oficial|red de distribuidores|oficial de la marca)/.test(
    blob,
  );
}

function looksLikeAmbiguousDistributorMention(blob) {
  return /(tengo (una )?distribuidora|soy distribuidor|somos distribuidores|mi distribuidora)/.test(
    blob,
  );
}

function gateAmbiguousDistributorIntent(input) {
  if (!input) return null;
  if (
    input.distributorIntentCleared === true ||
    input.purchasePathConfirmed === true ||
    input.distributorPathConfirmed === true
  ) {
    return null;
  }
  const blob = conversationBlob(input);
  if (!blob || !looksLikeAmbiguousDistributorMention(blob)) return null;
  if (looksLikeBeDistributorIntent(blob)) return null;
  if (/(comprar|revender|sumar (sus |los )?productos)/.test(blob)) return null;
  return {
    ok: false,
    gate: "distributor_intent_ambiguous",
    needDisambiguation: true,
    reason: "Compra vs ser dist. poco claro.",
    agentInstruction:
      "GATE P3b: ¿comprar/revender o dist. oficial de la marca? + enter_waiting. " +
      "Luego distributorIntentCleared=true.",
  };
}

function gateStickyDistributorPurchase(input) {
  if (!input) return null;
  if (
    input.purchasePathConfirmed === true ||
    input.distributorPathConfirmed === true ||
    input.distributorIntentCleared === true
  ) {
    return null;
  }
  // Mock has no conv; use flags on input simulating sticky
  if (input.stickyDistributorColumn !== true && normalize(input.priorStatus) !== "quiere_ser_distribuidor") {
    return null;
  }
  const blob = conversationBlob(input);
  if (!blob || looksLikeBeDistributorIntent(blob) || !looksLikePurchaseIntent(blob)) return null;
  const inputType = sanitizeClientType(input.clientType);
  if (inputType && inputType !== "distribuidor") return null;
  return {
    ok: false,
    gate: "sticky_distributor_purchase_recontact",
    needDisambiguation: true,
    reason: "Card dist. + mensaje de compra.",
    agentInstruction:
      "GATE recontacto dist→compra: desambiguá compra vs ser dist. purchasePathConfirmed o distributorPathConfirmed.",
  };
}

function gateDeriveMessageFirst(input) {
  if (!input) return null;
  if (input.deriveMessageSent === true || input.farewellSent === true) return null;
  return {
    ok: false,
    gate: "derive_message_first",
    missing: ["deriveMessageSent"],
    reason: "Mensaje de cierre antes de sync_derived.",
    agentInstruction:
      "GATE orden derive: 1) mensaje WA con dist 2) sync_derived deriveMessageSent=true 3) handoff_to_human.",
  };
}

function gateBeaconsBeforeRoute(input) {
  if (!input) return null;
  if (input.beaconsSent === true) return null;
  const blob = conversationBlob(input);
  if (blob && /beacons\.ai\/froodie/.test(blob)) return null;
  return {
    ok: false,
    gate: "beacons_required",
    missing: ["beaconsSent"],
    reason: "Falta Beacons antes de rutear.",
    agentInstruction:
      "GATE Beacons: mandá https://beacons.ai/froodie (SIN precios) + beaconsSent=true.",
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
        nextStep: "ask_volume_insist",
        agentInstruction:
          "CHECKLIST dist. (gate). Provincia OK pero volumen INCERTO / pide precios o más data. " +
          "Si AÚN NO insististe 1 vez el aproximado: UNA pregunta con umbral a partir de 50 " +
          "(copy por zona) + enter_waiting. PROHIBIDO handoff e inventar bultos en este paso. " +
          "Si YA insististe y sigue sin número: " +
          contactChecklistInstruction() +
          " Mensaje: un asesor te contacta para precios/mínimos/condiciones + despedida. " +
          "Silencio: handoff_human status=atencion_representante + handoff_to_human " +
          "(PROHIBIDO status=quiere_ser_distribuidor).",
      };
    }
    return {
      nextStep: "ask_volume",
      agentInstruction:
        "CHECKLIST dist. (gate). Provincia OK. Falta VOLUMEN. " +
        "UNA pregunta de bultos/cajas/mes con aviso umbral a partir de 50 + enter_waiting. " +
        "Si responde que no sabe / quiere precios / más data: INSISTÍ UNA vez el aproximado " +
        "(misma regla a partir de 50) + enter_waiting; NO handoff todavía. " +
        "Si a la 2ª sigue sin número: " +
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

  const unitsGate = gateVolumeUnitsAmbiguous(input);
  if (unitsGate) return unitsGate;

  const stickyDist = gateStickyDistributorPurchase(input);
  if (stickyDist) return stickyDist;

  const ambDist = gateAmbiguousDistributorIntent(input);
  if (ambDist) return ambDist;

  const beaconsGate = gateBeaconsBeforeRoute(input);
  if (beaconsGate) return beaconsGate;

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
      nextStep: "ask_volume_insist",
      reason: "Volumen incerto: insistir aproximado (a partir de 50); 2ª sin número → operador.",
      agentInstruction:
        "GATE volumen incerto / dijo que no sabe. PROHIBIDO inventar bultos ni dist/sin_cobertura. " +
        "2ª insistencia (SOLO tras la pregunta normal de volumen): UN mensaje — precios/mínimos " +
        "los detalla un asistente comercial de tu zona + " +
        "¿creés que serían a partir de 50 cajas/mes o menos de 50? + enter_waiting. NO handoff. " +
        "Si responde ≥50 → Cool Meals (menú/Pedidos). Si <50 → dist/sin_cobertura. " +
        "Si YA hiciste esa 2ª y sigue sin orientar: " +
        "handoff_human status=atencion_representante + handoff_to_human.",
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
        "GATE: falta volumen. 1ª: pregunta NORMAL de bultos/cajas/mes (aviso a partir de 50) + enter_waiting. " +
        "Todavía NO uses '¿a partir de 50 o menos de 50?'. " +
        "Si responde que no sabe / quiere precios sin número: recién ahí la 2ª insistencia " +
        "(asistente comercial + ¿a partir de 50 o menos?). " +
        "Con número o ≥50/<50: decide_route. Si tampoco orienta: handoff atencion_representante.",
    };
  }
  return null;
}

function upsertConversation(input, phoneFromCtx) {
  const phoneRaw = String(input.phone || phoneFromCtx || "").trim();
  if (!phoneRaw) return { ok: false, error: "phone required" };
  const phone = canonicalizeArPhone(phoneRaw) || phoneDigits(phoneRaw);
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

  const repMisclass = gateMisclassifiedRepresentative(
    Object.assign({}, input, { clientType: clientType }),
    "decide_route",
  );
  if (repMisclass) return repMisclass;

  // Misma prioridad que producción: rep/fasón → ≥50 Cool Meals → <50 dist / sin cobertura (incluye Córdoba).
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
        "Cool Meals (≥50). Si YA quiere pedir: NO menú, NO Sheets. " +
        "Cliente: no pedir datos → pedido_cliente YA. Lead: pedí contacto en el cierre pero igual pedido_lead YA. " +
        "Aviso asesor + lista opcional. Menú 1/2 SOLO si aún no eligió. Muestras: ficha → request_samples → muestras (ended+sheet). " +
        "PROHIBIDO dejar pedido en atencion_representante.",
    };
  }

  // <50 (o sin volumen): dist. de zona o sin cobertura (incluye Córdoba)
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
        " Luego avisá que aún no hay cobertura. Llamá handoff_human con status=sin_cobertura (NO atencion_representante) y reason claro; después handoff_to_human. La card queda en Sin cobertura; en ~5 días pasa a Descartado.",
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
      " ORDEN OBLIGATORIO (si lo invertís el lead no recibe mensaje): " +
      "1) send_notification_to_user: 'Te va a contactar " +
      distributor.name +
      " de tu zona…' (nombre exacto) + despedida corta. " +
      "2) sync_derived (fullName, company, contactPhone, phoneConfirmed=true, distributorName). " +
      "3) handoff_to_human. PROHIBIDO sync_derived antes del mensaje. PROHIBIDO decir 'registro/derivación/sistema'. Si pidieron muestras: NO request_samples — el dist. se hace cargo.",
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

  const samplesGate = gateRequestSamplesEligibility(input);
  if (samplesGate) return samplesGate;

  const unitsGate = gateVolumeUnitsAmbiguous(input);
  if (unitsGate) return unitsGate;

  return {
    ok: true,
    sampleRequestId: "mock-sample-1",
    conversationId: input.conversationId || "mock-conv",
    sheet: { attempted: true, success: true },
    kapsoEnded: { ok: true, skipped: false },
    instruction:
      "Muestra agendada (Pipeline Muestras + sheet). Avisá que un REPRESENTANTE hace el seguimiento. Luego handoff_human status=muestras. La IA ya quedó en ended — NO handoff_to_human.",
  };
}

function handoff(input) {
  let status = normalize(input.status) || "atencion_representante";
  let gateRemap = null;
  if (status === "quiere_ser_distribuidor") {
    status = "atencion_representante";
    gateRemap = "quiere_ser_distribuidor_to_atencion_representante";
  }
  if (status === "quiere_ser_representante" && looksLikeAskForHumanNotBeRep(input)) {
    status = "atencion_representante";
    gateRemap = "ask_human_not_be_representative";
  }
  if (status !== "descartado" && status !== "muestras" && status !== "pedido_lead" && status !== "pedido_cliente") {
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
        ? "Muestras: sheet listo e IA en ended. NO uses handoff_to_human (ya cerró). Avisá que un representante hace el seguimiento."
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

  const cordobaBlock = blockDerivationInCordoba(input);
  if (cordobaBlock) return cordobaBlock;

  const deriveOrder = gateDeriveMessageFirst(input);
  if (deriveOrder) return deriveOrder;

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
    kapsoHandoff: { ok: false, skipped: true, mode: "agent_must_handoff_to_human" },
    instruction:
      "sync_derived OK (Pipeline/sheet). NO corta la IA. ORDEN: " +
      "1) Si todavía NO mandaste mensaje humano de cierre → send_notification_to_user YA: " +
      "'Te va a contactar " +
      (input.distributorName || "el distribuidor de tu zona") +
      "…' + despedida corta. " +
      "2) Después handoff_to_human. NUNCA complete_task. NUNCA sync_derived otra vez.",
  };
}
