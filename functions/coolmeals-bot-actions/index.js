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

  const runtime = resolveRuntime(env, ctx);
  const supabaseUrl = runtime.supabaseUrl;
  const supabaseKey = runtime.supabaseKey;
  const envForSideEffects = runtime.envForSideEffects;
  if (!supabaseUrl || !supabaseKey) {
    return json(
      {
        ok: false,
        error: runtime.isSandbox
          ? "Missing SUPABASE_URL_DEV / SUPABASE_SERVICE_ROLE_KEY_DEV (sandbox → DEV)"
          : "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY function secrets in Kapso",
      },
      500,
    );
  }

  try {
    if (action === "upsert_conversation") {
      return json(
        await upsertConversation(input, phoneFromCtx, supabaseUrl, supabaseKey, ctx),
      );
    }
    if (action === "decide_route") {
      return json(await decideRoute(input, supabaseUrl, supabaseKey));
    }
    if (action === "request_samples") {
      return json(
        await requestSamples(
          input,
          phoneFromCtx,
          supabaseUrl,
          supabaseKey,
          envForSideEffects,
          ctx,
        ),
      );
    }
    if (action === "handoff") {
      return json(
        await handoff(
          input,
          phoneFromCtx,
          supabaseUrl,
          supabaseKey,
          ctx,
          envForSideEffects,
        ),
      );
    }
    if (action === "sync_derived") {
      return json(
        await syncDerived(
          input,
          phoneFromCtx,
          supabaseUrl,
          supabaseKey,
          envForSideEffects,
          ctx,
        ),
      );
    }
    return json({ ok: false, error: "Unknown action: " + action }, 400);
  } catch (err) {
    return json(
      { ok: false, error: err && err.message ? err.message : String(err) },
      500,
    );
  }
}

/** Sandbox WhatsApp → Supabase DEV; número prod → Supabase PROD. */
function resolveRuntime(env, ctx) {
  const system = ctx.system || {};
  const whatsappConfig = system.whatsapp_config || {};
  const phoneNumberId = String(
    whatsappConfig.phone_number_id ||
      system.phone_number_id ||
      inputPhoneNumberId(ctx) ||
      "",
  );
  const sandboxId = String(
    env.KAPSO_SANDBOX_PHONE_NUMBER_ID || "597907523413541",
  );
  const isSandbox = phoneNumberId === sandboxId;

  if (isSandbox) {
    return {
      isSandbox: true,
      supabaseUrl: env.SUPABASE_URL_DEV || "",
      supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY_DEV || "",
      // No escribir Sheets de prod desde pruebas sandbox
      envForSideEffects: Object.assign({}, env, { __skipSheets: true }),
    };
  }

  return {
    isSandbox: false,
    supabaseUrl: env.SUPABASE_URL || "",
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
    envForSideEffects: env,
  };
}

function inputPhoneNumberId(ctx) {
  const meta = ctx.metadata || {};
  const req = meta.request || {};
  return req.phone_number_id || meta.phone_number_id || "";
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

function phoneDigits(value) {
  return String(value == null ? "" : value).replace(/\D/g, "");
}

/** Canon AR: 54 + nacional (sin 9 móvil). 351… y 54351… y 549351… → mismo valor. */
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

/** Extrae bultos/cajas de texto libre ("50 cajas", "50 o 100", "a partir de 50"). */
function inferVolumeFromText(text) {
  const blob = normalize(text || "");
  if (!blob) return null;
  let m = blob.match(
    /\b(\d{1,4})\s*(o|\/|-|a)\s*(\d{1,4})\s*(cajas?|bultos?)\b/,
  );
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return Math.min(a, b);
  }
  m = blob.match(
    /\b(a partir de|desde|unas?|alrededor de|aprox(?:imadamente)?)\s*(\d{1,4})\s*(cajas?|bultos?)\b/,
  );
  if (m) {
    const n = Number(m[2]);
    return Number.isNaN(n) ? null : n;
  }
  m = blob.match(/\b(\d{1,4})\s*(cajas?|bultos?)(?:\s*(\/|al)\s*mes)?\b/);
  if (m) {
    const n = Number(m[1]);
    return Number.isNaN(n) ? null : n;
  }
  m = blob.match(/\binversi[oó]n\s*(de\s*)?(\d{1,4})\b/);
  if (m) {
    const n = Number(m[2]);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function resolveEstimatedVolume(input, conv) {
  if (input && input.estimatedVolume !== undefined && input.estimatedVolume !== null) {
    return Number(input.estimatedVolume);
  }
  if (conv && conv.estimated_volume !== undefined && conv.estimated_volume !== null) {
    return Number(conv.estimated_volume);
  }
  const blob = [
    input && input.lastMessage,
    input && input.aiSummary,
    input && input.reason,
    input && input.notes,
    conv && conv.ai_summary,
    conv && conv.notes,
  ]
    .filter(Boolean)
    .join(" ");
  const inferred = inferVolumeFromText(blob);
  if (inferred !== null) return inferred;
  return null;
}

function isTruthyToolFlag(v) {
  if (v === true) return true;
  const n = normalize(v);
  return n === "true" || n === "1" || n === "yes" || n === "si" || n === "sí";
}

/**
 * Escape anti-loop precios (caso Jorge): handoff a operador sin trabarse en contacto.
 * Flags explícitos o copy de cierre tras 2 insistencias sin número.
 */
function isPriceLoopEscape(input) {
  if (!input) return false;
  if (
    isTruthyToolFlag(input.priceLoopEscape) ||
    isTruthyToolFlag(input.volumeInsisted) ||
    isTruthyToolFlag(input.priceInsisted)
  ) {
    return true;
  }
  const blob = normalize(
    [input.reason, input.notes, input.aiSummary, input.lastMessage]
      .filter(Boolean)
      .join(" "),
  );
  if (!blob) return false;
  if (
    /(anti[- ]?loop|price[- ]?loop|escape[- ]?precios|volumen sin orient|sigue sin (n[uú]mero|orientar)|2a? insist|segunda insist)/.test(
      blob,
    )
  ) {
    return true;
  }
  return (
    /(precio|cotiz|m[ií]nimo|condiciones comerciales|ejemplo de (lo que )?vale|inversi[oó]n|margen)/.test(
      blob,
    ) &&
    /(no (se|sabe|puedo)|nunca (lo )?vend|sin (volumen|n[uú]mero)|despu[eé]s vemos|atencion_representante|operador)/.test(
      blob,
    )
  );
}

function looksLikePriceAsk(input) {
  if (!input) return false;
  const blob = normalize(
    [input.reason, input.notes, input.aiSummary, input.lastMessage]
      .filter(Boolean)
      .join(" "),
  );
  return /(precio|cotiz|m[ií]nimo|condiciones comerciales|ejemplo de (lo que )?vale|inversi[oó]n)/.test(
    blob,
  );
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

/** (histórico P5) Córdoba ya puede derivar a dist. si <50; no bloquear. */
function blockDerivationInCordoba(_input, _conv) {
  return null;
}

/** True solo si el lead eligió muestras de forma explícita (P8). */
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
  // Elección clara; evita "me viene bien también" flojo.
  if (
    /(^|[^\w])(1|uno)\b/.test(blob) &&
    /(muestra|menu|opcion)/.test(blob)
  ) {
    return true;
  }
  return (
    /(quiero|pido|elegi|elijo|opto por|vamos con|me anoto)\s+(las\s+)?muestras/.test(blob) ||
    /pedir\s+muestras/.test(blob) ||
    /opcion\s*1/.test(blob)
  );
}

/**
 * P6/P8: request_samples solo con menú Cool Meals (≥50) + elección clara de muestras.
 * Bloquea <50, sin menú, derive, rep/fasón.
 */
function gateRequestSamplesEligibility(input, conv, minBundles) {
  const threshold = minBundles || 50;
  const clientType =
    sanitizeClientType(input && input.clientType) ||
    sanitizeClientType(conv && conv.client_type) ||
    "";
  if (clientType === "representante" || clientType === "fason") {
    return {
      ok: false,
      gate: "samples_not_for_rep_fason",
      needData: false,
      reason: "Fasón/representante (SER) no usa menú de muestras Cool Meals.",
      agentInstruction:
        "GATE: NO request_samples para fasón/representante. Cierre comercial + handoff_human " +
        "status=quiere_ser_representante o quiere_ser_fason (sin menú).",
    };
  }

  const volume = resolveEstimatedVolume(input, conv);
  if (volume === null || Number.isNaN(volume) || volume < threshold) {
    return {
      ok: false,
      gate: "samples_requires_high_volume",
      needData: true,
      missing: volume === null || Number.isNaN(volume) ? ["estimatedVolume"] : [],
      reason:
        "Muestras Cool Meals solo con volumen ≥ " +
        threshold +
        " (menú). No agendar kit si <50 / sin menú / derive.",
      agentInstruction:
        "GATE P6/P8: PROHIBIDO request_samples sin menú Cool Meals (≥" +
        threshold +
        "). " +
        "Si aún no hay volumen claro: calificá (cajas/bultos). Si <50 → dist/sin_cobertura (también Córdoba; NO kit). " +
        "Si ≥50 → menú Cool Meals. " +
        "Solo tras decide_route coolMealsMenu=true + eligió 1 muestras → ficha + request_samples.",
    };
  }

  if (!isExplicitSampleChoice(input)) {
    return {
      ok: false,
      gate: "samples_choice_unclear",
      needData: true,
      missing: ["sampleChoiceConfirmed"],
      reason: "Falta elección explícita de muestras (menú opción 1).",
      agentInstruction:
        "GATE P8: el lead NO eligió muestras de forma clara. PROHIBIDO request_samples. " +
        "Mandá el menú o desambiguá: 1) Pedir muestras  2) Agendar pedido + enter_waiting. " +
        "Un 'me viene bien también' / duda mezclada con pedido NO alcanza. " +
        "Recién con elección explícita: sampleChoiceConfirmed=true (o sampleChoice=muestras) + certainty=high + request_samples.",
    };
  }

  return null;
}

/**
 * P1/P1b: "hablar con un humano/asesor" ≠ clientType representante / status quiere_ser_representante.
 * True si el blob parece pedido de atención humana, no intención de SER representante.
 */
function looksLikeAskForHumanNotBeRep(input) {
  const blob = normalize(
    [
      input && input.reason,
      input && input.aiSummary,
      input && input.lastMessage,
      input && input.notes,
      input && input.intent,
    ]
      .filter(Boolean)
      .join(" "),
  );
  if (!blob) return false;
  const wantsToBe =
    /(quiero ser|sumarme como|ser\s+representante|representar la marca|vender a comision)/.test(
      blob,
    );
  if (wantsToBe) return false;
  return /(hablar con|pasar(me)? (con |a )?(un |una )?(humano|persona|asesor|operador|alguien|representante)|atencion humana|quiero (un )?asesor)/.test(
    blob,
  );
}

function gateMisclassifiedRepresentative(input, forAction) {
  if (!input) return null;
  const type = sanitizeClientType(input.clientType);
  const status = normalize(input.status || "");
  const asRepType = type === "representante";
  const asRepStatus = status === "quiere_ser_representante";
  if (!asRepType && !asRepStatus) return null;
  if (!looksLikeAskForHumanNotBeRep(input)) return null;
  return {
    ok: false,
    gate: "ask_human_not_be_representative",
    needDisambiguation: true,
    reason:
      "Pedido de hablar con persona/asesor: NO es 'quiere ser representante'. Va a atención humana.",
    agentInstruction:
      "GATE P1/P1b: el lead pide hablar con un humano/asesor — NO uses clientType=representante " +
      "ni status=quiere_ser_representante. " +
      (forAction === "decide_route"
        ? "Tipificá el negocio real (o 'otro') + decide_route, O handoff status=atencion_representante. "
        : "handoff_human status=atencion_representante + handoff_to_human. ") +
      "Solo si dice explícitamente QUIERO SER representante de la marca → columna quiere_ser_representante.",
  };
}

function conversationBlob(input, conv) {
  return normalize(
    [
      input && input.lastMessage,
      input && input.aiSummary,
      input && input.reason,
      input && input.notes,
      input && input.intent,
      conv && conv.ai_summary,
      conv && conv.last_message,
      conv && conv.notes,
    ]
      .filter(Boolean)
      .join(" \n "),
  );
}

/**
 * Volumen: exige confirmación LITERAL de unidad (cajas/bultos vs wraps/unidades).
 * No alcanza volumeUnitConfirmed solo ni un "50" suelto tras preguntar por cajas.
 */
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

function gateVolumeUnitsAmbiguous(input, conv) {
  if (!input) return null;
  const unit = normalize(input.volumeUnit || input.quantityUnit || "");
  const lead = normalize(String(input.lastMessage || ""));
  const blob = conversationBlob(input, conv);

  const askLiteral = {
    ok: false,
    gate: "volume_units_ambiguous",
    needData: true,
    needDisambiguation: true,
    missing: ["volumeUnit"],
    reason:
      "Falta confirmación literal: el número de volumen ¿son cajas/bultos o wraps/unidades?",
    agentInstruction:
      "GATE unidades↔cajas (literal): NO asumas que un número suelto (ej. 'justo con 50') son cajas. " +
      "UNA pregunta: '¿Esas 50 son cajas/bultos o wraps/unidades sueltas?' " +
      "(wraps 24 u/caja, platos 12, postres 24). enter_waiting. " +
      "Cuando el lead diga cajas/bultos o wraps/unidades: volumeUnit=cajas|unidades, " +
      "volumeUnitConfirmed=true, estimatedVolume en CAJAS (convirtiendo si hace falta), certainty=high. " +
      "PROHIBIDO decide_route / request_samples / menú sin esa palabra literal del lead.",
  };

  // Product qty explícita sin cajas (60 wraps / 90 viandas)
  const hasProductQty =
    blob &&
    (/(\d+)\s*(viandas?|wraps?|postres?|unidades?|uds?|platos?(\s+listos?)?)/.test(blob) ||
      /(viandas?|wraps?|postres?|unidades?)\s*(por\s+mes|aprox|aproximadamente|:)?\s*\d+/.test(blob) ||
      /(\d+)\s+de\s+cada\s+(una|uno|producto)/.test(blob));
  if (hasProductQty && !leadSaysBoxes(lead) && !leadSaysBoxes(blob) && !volumeUnitIsBoxes(unit)) {
    return askLiteral;
  }

  // Número suelto en el mensaje del lead ("justo con 50") sin decir cajas ni wraps
  if (looksLikeBareVolumeNumber(lead) && !volumeUnitIsBoxes(unit) && !volumeUnitIsProduct(unit)) {
    return askLiteral;
  }

  // volumeUnitConfirmed solo NO alcanza: hace falta volumeUnit o palabra literal del lead
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

/**
 * P3b: "tengo distribuidora / soy dist" sin aclarar compra vs ser marca.
 */
function gateAmbiguousDistributorIntent(input, conv) {
  if (!input) return null;
  if (
    input.distributorIntentCleared === true ||
    input.purchasePathConfirmed === true ||
    input.distributorPathConfirmed === true
  ) {
    return null;
  }
  const blob = conversationBlob(input, conv);
  if (!blob || !looksLikeAmbiguousDistributorMention(blob)) return null;
  if (looksLikeBeDistributorIntent(blob)) return null;
  if (/(comprar|revender|sumar (sus |los )?productos)/.test(blob)) return null;
  return {
    ok: false,
    gate: "distributor_intent_ambiguous",
    needDisambiguation: true,
    reason: "No está claro si quiere COMPRAR o SER distribuidor oficial de la marca.",
    agentInstruction:
      "GATE P3b: desambiguá ANTES de decide_route / las 4 de dist. UNA pregunta: " +
      "'¿Querés comprar/revender producto Cool Meals desde tu distribuidora, o sumarte como distribuidor oficial de la marca?' " +
      "+ enter_waiting. Compra→clientType=mayorista (sin las 4). Ser marca→las 4 preguntas. " +
      "Cuando aclare: distributorIntentCleared=true (y purchasePathConfirmed o distributorPathConfirmed).",
  };
}

/**
 * Recontacto: card en Quiere ser dist / client_type dist, pero el chat actual es compra.
 */
function gateStickyDistributorPurchase(input, conv) {
  if (!conv) return null;
  if (
    input.purchasePathConfirmed === true ||
    input.distributorPathConfirmed === true ||
    input.distributorIntentCleared === true
  ) {
    return null;
  }
  const sticky =
    normalize(conv.status) === "quiere_ser_distribuidor" ||
    sanitizeClientType(conv.client_type) === "distribuidor";
  if (!sticky) return null;
  const blob = conversationBlob(input, conv);
  if (!blob) return null;
  if (looksLikeBeDistributorIntent(blob)) return null;
  if (!looksLikePurchaseIntent(blob)) return null;
  const inputType = sanitizeClientType(input.clientType);
  // Si ya tipificó compra en este turno, OK
  if (inputType && inputType !== "distribuidor" && input.purchasePathConfirmed !== false) {
    if (["mayorista", "retail", "minorista", "otro"].indexOf(inputType) >= 0) {
      return null;
    }
  }
  if (inputType === "distribuidor" || !inputType) {
    return {
      ok: false,
      gate: "sticky_distributor_purchase_recontact",
      needDisambiguation: true,
      reason:
        "Card/columna dist. pero el mensaje actual parece compra. No arrastrar tipificación dist.",
      agentInstruction:
        "GATE recontacto dist→compra: la card estaba en Quiere ser distribuidor / clientType dist, " +
        "pero ahora habla de compra/precios/producto/delivery. PROHIBIDO decide_route como distribuidor automático. " +
        "Preguntá: ¿seguís queriendo sumarte como dist. oficial de la marca, o querés comprar producto? " +
        "+ enter_waiting. Compra→tipificá mayorista/retail/minorista + purchasePathConfirmed=true + decide_route. " +
        "Ser dist→distributorPathConfirmed=true y seguí checklist 4 SÍ si falta.",
    };
  }
  return null;
}

/** Orden derive: mensaje WA al lead ANTES de sync_derived. */
function gateDeriveMessageFirst(input) {
  if (!input) return null;
  if (input.deriveMessageSent === true || input.farewellSent === true) return null;
  return {
    ok: false,
    gate: "derive_message_first",
    needData: true,
    missing: ["deriveMessageSent"],
    reason: "Orden derive: falta el mensaje humano de cierre antes de sync_derived.",
    agentInstruction:
      "GATE orden derive (P6): PROHIBIDO sync_derived antes del mensaje. ORDEN: " +
      "1) send_notification_to_user nombrando al distribuidor + despedida. " +
      "2) sync_derived con deriveMessageSent=true, contacto y certainty=high. " +
      "3) handoff_to_human. Si sync va primero, el lead puede no recibir el WhatsApp.",
  };
}

/** Beacons en calificación nueva (soft-hard): no rutear sin haber enviado el link. */
function gateBeaconsBeforeRoute(input, conv) {
  if (!input) return null;
  if (input.beaconsSent === true) return null;
  // Recontactos ya calificados / mid dist column: no exigir de nuevo
  if (conv) {
    const st = normalize(conv.status);
    if (st && st !== "ia_atendiendo" && st !== "nuevo") return null;
  }
  const blob = conversationBlob(input, conv);
  if (blob && /beacons\.ai\/froodie/.test(blob)) return null;
  return {
    ok: false,
    gate: "beacons_required",
    needData: true,
    missing: ["beaconsSent"],
    reason: "Falta enviar Beacons antes de rutear.",
    agentInstruction:
      "GATE Beacons: en el mensaje humano incluí https://beacons.ai/froodie (catálogo SIN precios) " +
      "si aún no está en el chat. Luego upsert/decide_route con beaconsSent=true. " +
      "PROHIBIDO decir que Beacons tiene precios.",
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
  const hasVolume = volume !== null && !Number.isNaN(volume);
  // Número claro (o inferido "50 cajas") gana sobre flags/texto de "no sé / precios".
  const volumeUncertain = hasVolume ? false : isVolumeUncertain(input);

  return {
    clientType: clientType,
    province: province,
    volume: hasVolume ? volume : null,
    volumeUncertain: volumeUncertain,
    volumeInsisted:
      isTruthyToolFlag(input && input.volumeInsisted) ||
      isTruthyToolFlag(input && input.priceInsisted) ||
      isTruthyToolFlag(input && input.priceLoopEscape),
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
      if (q.volumeInsisted) {
        return {
          nextStep: "handoff_operator",
          agentInstruction:
            "CHECKLIST dist. anti-loop: YA insististe volumen sin número. " +
            contactChecklistInstruction() +
            " O con contactRefused=true priceLoopEscape=true si no hay datos. " +
            "Mensaje asesor + handoff_human status=atencion_representante + handoff_to_human YA.",
        };
      }
      return {
        nextStep: "ask_volume_insist",
        agentInstruction:
          "CHECKLIST dist. (gate). Provincia OK pero volumen INCERTO / pide precios o más data. " +
          "Si AÚN NO insististe 1 vez el aproximado: UNA pregunta con umbral a partir de 50 " +
          "(copy por zona) + enter_waiting. PROHIBIDO handoff e inventar bultos en este paso. " +
          "Si YA insististe y sigue sin número: " +
          contactChecklistInstruction() +
          " Mensaje: un asesor te contacta para precios/mínimos/condiciones + despedida. " +
          "Silencio: handoff_human status=atencion_representante contactRefused=true " +
          "priceLoopEscape=true + handoff_to_human " +
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
  const raw = sanitizeHumanField(
    (input && (input.contactPhone || input.confirmedPhone || input.phoneExplicit)) || "",
  );
  if (!raw) return "";
  return canonicalizeArPhone(raw) || phoneDigits(raw);
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
 * Escape anti-loop precios (handoff): no bloquear por contacto (caso Jorge).
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
  if (forAction === "handoff" && isPriceLoopEscape(input)) {
    return {
      ok: true,
      contactRefused: true,
      priceLoopEscape: true,
      agentInstruction:
        "Escape anti-loop precios: NO pedís más datos. Mensaje cierre (asesor te contacta) + " +
        "handoff_human status=atencion_representante contactRefused=true priceLoopEscape=true + " +
        "handoff_to_human EN ESTE TURNO.",
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
    agentInstruction: looksLikePriceAsk(input)
      ? "GATE contacto + precios: PROHIBIDO otra vuelta de 'no puedo dar precios'. " +
        "Si ya insististe volumen/orientación: handoff_human status=atencion_representante " +
        "contactRefused=true priceLoopEscape=true + handoff_to_human YA. " +
        "Si todavía no pediste contacto y el lead cooperó: pedí nombre+negocio+tel en UN mensaje, " +
        "después handoff. Si sigue pidiendo precio sin datos → contactRefused=true y handoff."
      : contactChecklistInstruction(),
  };
}

function gateDecideRouteQualification(input, conv) {
  const earlyType =
    sanitizeClientType(input && input.clientType) ||
    sanitizeClientType(conv && conv.client_type) ||
    "";
  // Rep / fasón: handoff comercial sin checklist de volumen.
  if (earlyType === "representante" || earlyType === "fason") return null;

  const unitsGate = gateVolumeUnitsAmbiguous(input, conv);
  if (unitsGate) return unitsGate;

  const stickyDist = gateStickyDistributorPurchase(input, conv);
  if (stickyDist) return stickyDist;

  const ambDist = gateAmbiguousDistributorIntent(input, conv);
  if (ambDist) return ambDist;

  const beaconsGate = gateBeaconsBeforeRoute(input, conv);
  if (beaconsGate) return beaconsGate;

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
    if (q.volumeInsisted) {
      return {
        ok: false,
        gate: "force_operator_price_loop",
        needData: false,
        nextStep: "handoff_operator",
        reason:
          "Anti-loop precios: ya se insistió volumen/orientación sin número → operador.",
        agentInstruction:
          "GATE force_operator_price_loop (caso Jorge): PROHIBIDO otra pregunta de volumen/precios/Beacons. " +
          "Mensaje de cierre (asesor te contacta por otro canal) + despedida. " +
          "Silencio: handoff_human status=atencion_representante contactRefused=true " +
          "priceLoopEscape=true + handoff_to_human EN ESTE TURNO.",
      };
    }
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
        "Si YA hiciste esa 2ª y sigue sin orientar: decide_route otra vez con volumeInsisted=true " +
        "O directo handoff_human status=atencion_representante contactRefused=true " +
        "priceLoopEscape=true + handoff_to_human.",
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
  const phoneRaw = String(input.phone || phoneFromCtx || "").trim();
  if (!phoneRaw) throw new Error("phone required");
  const phone = canonicalizeArPhone(phoneRaw) || phoneDigits(phoneRaw);
  if (!phone) throw new Error("phone required");
  const phoneVariants = phoneLookupVariants(phoneRaw);

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
    "conversations?phone=in.(" +
      phoneVariants.map(encodeURIComponent).join(",") +
      ")&order=created_at.desc&limit=1",
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
      if (phone && String(prior.phone || "") !== phone) touch.phone = phone;
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

  const repMisclass = gateMisclassifiedRepresentative(
    Object.assign({}, input, { clientType: clientType }),
    "decide_route",
  );
  if (repMisclass) return repMisclass;

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
        "Cool Meals (≥50, cualquier provincia). " +
        "Si YA quiere pedir: NO menú. NO Sheets. Solo Pipeline Pedidos. " +
        "CLIENTE (dijo que ya es cliente / trabaja la marca): PROHIBIDO pedir nombre/negocio/tel. " +
        "Alcanza el WA. Mensaje asesor contacta + lista opcional → handoff_human status=pedido_cliente isCustomer=true + handoff_to_human YA. " +
        "LEAD: en el mismo cierre pedí nombre+negocio+tel UNA vez, PERO igual handoff status=pedido_lead aunque falten datos. " +
        "Copy: 'Un asesor Cool Meals se va a comunicar para confirmar tu pedido, stock y logística. Si querés, dejá la lista acá.' " +
        "Menú 1/2 SOLO si ≥50 y todavía NO eligió camino. Muestras: ficha → request_samples → status=muestras (ended+sheet). " +
        "PROHIBIDO dejar un pedido en atencion_representante.",
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
      " ORDEN OBLIGATORIO (si lo invertís el lead no recibe mensaje): " +
      "1) send_notification_to_user: 'Te va a contactar " +
      distributor.name +
      "…' + despedida. " +
      "2) sync_derived (fullName, company, contactPhone, phoneConfirmed=true, distributorName). " +
      "3) handoff_to_human. PROHIBIDO sync_derived antes del mensaje. Si pidieron muestras con <50: NO request_samples.",
  };
}

async function appendSheet(env, kind, spreadsheetId, values) {
  if (env && env.__skipSheets) {
    return {
      ok: true,
      skipped: true,
      reason: "sandbox_dev_skip_sheets",
      kind: kind,
    };
  }
  if (!spreadsheetId) {
    return {
      attempted: true,
      success: false,
      error: "spreadsheetId missing for " + kind,
    };
  }
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
  return { attempted: true, success: true, spreadsheetId: spreadsheetId };
}

/** Sheet de derivados por distribuidor (misma estructura). */
var DEFAULT_DERIVED_DISTRIBUTOR_SHEETS = {
  "FELIPE AVINCETA": "19kty71fNjLCJVSUx8ZaQ67YGqHa5ZAlbCqnM-7qobYI",
  "GABASTOU JORGE ALBERTO": "1-iaH3jwslDUSl65SsNv6qB_dtD5Mt-D6ISoeUOD4Mgs",
  "NOVA ERA SA": "18MCF06P4rQyst8Nm7W3aR-IhPq3G_25JyKvruqZMfX0",
  "GudFud Distribuidora": "1wBk4t9JuXX64zaCUCMm7YX1MFVtRoyj94YJr3kt9W9E",
  "La Corona Alimentos": "1Q0KDRW2um-Ukl7ex6uXIjx_c8cY1Z-DD-DoE3y1ZRMU",
  Diprom: "1ESCf5fcXjf0CqHfv2vcgtlktuOL4DXDEvgQT0NWc50Q",
};

function normalizeDistributorSheetKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(distribuidora|distribuidor|alimentos|sa|s\.?a\.?|srl|sas)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function resolveDerivedDistributorSheetId(env, distributorName) {
  var merged = Object.assign({}, DEFAULT_DERIVED_DISTRIBUTOR_SHEETS);
  var raw = env && env.GOOGLE_SHEET_DERIVED_BY_DISTRIBUTOR;
  if (raw && String(raw).trim()) {
    try {
      var parsed = JSON.parse(String(raw));
      Object.keys(parsed || {}).forEach(function (k) {
        if (parsed[k]) merged[k] = String(parsed[k]).trim();
      });
    } catch (_) {}
  }
  var want = normalizeDistributorSheetKey(distributorName);
  if (!want) return null;
  var entries = Object.keys(merged).map(function (name) {
    return {
      name: name,
      id: merged[name],
      key: normalizeDistributorSheetKey(name),
    };
  });
  var exact = entries.find(function (e) {
    return e.key === want;
  });
  if (exact) return { spreadsheetId: exact.id, matchedAs: exact.name };
  var fuzzy = entries.filter(function (e) {
    return (
      e.key.length >= 4 &&
      want.length >= 4 &&
      (e.key.indexOf(want) !== -1 || want.indexOf(e.key) !== -1)
    );
  });
  if (fuzzy.length === 1) {
    return { spreadsheetId: fuzzy[0].id, matchedAs: fuzzy[0].name };
  }
  return null;
}

async function requestSamples(input, phoneFromCtx, supabaseUrl, supabaseKey, env, ctx) {
  const blocked = requireHighCertainty(
    input,
    "que el lead eligió muestras tras menú Cool Meals calificado",
  );
  if (blocked) return blocked;

  const fullName = String(input.fullName || "").trim();
  const phoneRaw = String(input.phone || phoneFromCtx || "").trim();
  const phone = canonicalizeArPhone(phoneRaw) || phoneDigits(phoneRaw);
  const phoneVariants = phoneLookupVariants(phoneRaw || phone);
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
  let conv = null;
  if (conversationId) {
    const foundById = await sb(
      supabaseUrl,
      supabaseKey,
      "conversations?id=eq." + conversationId + "&limit=1",
      { method: "GET" },
    );
    conv = Array.isArray(foundById) && foundById[0] ? foundById[0] : null;
  }
  if (!conversationId && phone) {
    const found = await sb(
      supabaseUrl,
      supabaseKey,
      "conversations?phone=in.(" +
        phoneVariants.map(encodeURIComponent).join(",") +
        ")&order=updated_at.desc&limit=1",
      { method: "GET" },
    );
    if (Array.isArray(found) && found[0]) {
      conv = found[0];
      conversationId = found[0].id;
    }
  }

  const samplesGate = gateRequestSamplesEligibility(input, conv, 50);
  if (samplesGate) return samplesGate;

  const unitsGate = gateVolumeUnitsAmbiguous(input, conv);
  if (unitsGate) return unitsGate;

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
  const phoneRaw = String(input.phone || phoneFromCtx || "").trim();
  const phone = canonicalizeArPhone(phoneRaw) || phoneDigits(phoneRaw);
  const phoneVariants = phoneLookupVariants(phoneRaw || phone);
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
      "conversations?phone=in.(" +
        phoneVariants.map(encodeURIComponent).join(",") +
        ")&order=updated_at.desc&limit=1",
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
    pedido_lead: true,
    pedido_cliente: true,
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

  // Alias genérico "pedido" / "pedidos"
  const statusNorm = normalize(input.status);
  if (statusNorm === "pedido" || statusNorm === "pedidos") {
    status = "pedido_lead";
    gateRemap = "pedido_alias";
  }

  // Pedidos: lead vs cliente
  const customerSignals = normalize(
    [
      input.reason,
      input.aiSummary,
      existing.ai_summary,
      existing.notes,
      input.lastMessage,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const looksLikeCustomer =
    /(somos\s+clientes|ya\s+(somos\s+)?clientes|ya\s+es\s+cliente|cliente\s+existente|ya\s+trabajamos(\s+la\s+marca)?|recompra|cuenta\s+existente|ya\s+compramos)/.test(
      customerSignals,
    );
  const wantsCustomer =
    input.isCustomer === true ||
    input.isCustomer === "true" ||
    input.isCustomer === 1 ||
    normalize(input.isCustomer) === "true" ||
    normalize(input.isCustomer) === "si" ||
    normalize(input.isCustomer) === "yes" ||
    existing.is_customer === true ||
    looksLikeCustomer;
  if (
    (status === "pedido_lead" || status === "pedido_cliente") &&
    wantsCustomer
  ) {
    status = "pedido_cliente";
  }

  // P1/P1b: pedir humano ≠ ser representante
  if (
    status === "quiere_ser_representante" &&
    looksLikeAskForHumanNotBeRep(input)
  ) {
    status = "atencion_representante";
    gateRemap = "ask_human_not_be_representative";
  }

  // Descartado / muestras / pedidos: no bloquean por checklist de contacto.
  // - pedido_cliente: alcanza el WA (no pedir nombre/negocio).
  // - pedido_lead: el agent pide datos en el mensaje, pero igual deriva.
  if (
    status !== "descartado" &&
    status !== "muestras" &&
    status !== "pedido_lead" &&
    status !== "pedido_cliente"
  ) {
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
            : status === "pedido_lead" || status === "pedido_cliente"
              ? "pedido"
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
    isPriceLoopEscape(input)
      ? "Anti-loop precios: handoff a operador sin completar checklist de contacto."
      : null,
    normalize(input.status) === "quiere_ser_distribuidor"
      ? "Handoff operador (no usar columna Quiere ser distribuidor para handoff): " +
        (input.reason || "faltan precios/volumen u otro dato comercial")
      : status === "descartado"
      ? (/proveedor|compras@coolmeals/i.test(String(input.reason || ""))
          ? "Descartado (proveedor → Compras): " + (input.reason || "Compras@coolmeals.com.ar")
          : "Descartado + IA cerrada (ended): " + (input.reason || "sin perfil comercial"))
      : status === "muestras"
        ? "Muestras agendadas + IA cerrada (ended); card queda hasta Resultado: " +
          (input.reason || "muestras")
        : status === "pedido_lead" || status === "pedido_cliente"
          ? "Pedido + handoff (asesor confirma stock/logística): " +
            (input.reason ||
              (status === "pedido_cliente" ? "pedido cliente" : "pedido lead"))
          : "Handoff: " + (input.reason || "atención humana"),
  ]
    .filter(Boolean)
    .join("\n");

  const tagsBase = (
    Array.isArray(existing.tags) ? existing.tags : []
  ).filter(function (t) {
    return t !== "#atendido_por_representante";
  });
  // Sin cobertura / descartado / muestras / pedidos: sin forzar hashtag de atención humana.
  const tags = Array.from(
    new Set(
      status === "sin_cobertura" ||
        status === "descartado" ||
        status === "muestras" ||
        status === "pedido_lead" ||
        status === "pedido_cliente"
        ? tagsBase
        : tagsBase.concat(["#atencion_humana"]),
    ),
  );

  const now = new Date();
  const esperandoHoursRaw = Number(env && env.ESPERANDO_TO_FINALIZE_HOURS);
  const sinCoberturaHoursRaw = Number(env && env.SIN_COBERTURA_TO_DESCARTADO_HOURS);
  const esperandoHours =
    Number.isFinite(esperandoHoursRaw) && esperandoHoursRaw > 0
      ? esperandoHoursRaw
      : 22;
  const sinCoberturaHours =
    Number.isFinite(sinCoberturaHoursRaw) && sinCoberturaHoursRaw > 0
      ? sinCoberturaHoursRaw
      : 120;
  // sin_cobertura → Descartado (~5 días); esperando_respuesta → Finalizado (~22h).
  const schedulesAutoFinalize =
    status === "sin_cobertura" || status === "esperando_respuesta";
  const autoFinalizeHours =
    status === "sin_cobertura" ? sinCoberturaHours : esperandoHours;
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
  if (status === "pedido_cliente") {
    patchBody.is_customer = true;
  } else if (status === "pedido_lead") {
    patchBody.is_customer = false;
  }

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
          : status === "pedido_lead" || status === "pedido_cliente"
            ? "Pedido: card en Pipeline Pedidos (sin Sheet). Usá handoff_to_human. Asesor sigue en el mismo WhatsApp."
            : "Usá handoff_to_human en el agent. Octavio responde en el mismo WhatsApp.",
  };
}

async function syncHandoffInterestSheets(env, row, status, reason) {
  // Pedidos: solo Pipeline (lead/cliente). Nunca Sheets.
  if (status === "pedido_lead" || status === "pedido_cliente") {
    return {
      attempted: false,
      success: true,
      spreadsheetId: null,
      skipped: "pedido_pipeline_only",
    };
  }
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
    const phoneRaw = String(input.phone || phoneFromCtx || "").trim();
    const phone = canonicalizeArPhone(phoneRaw) || phoneDigits(phoneRaw);
    const phoneVariants = phoneLookupVariants(phoneRaw || phone);
    const rows = await sb(
      supabaseUrl,
      supabaseKey,
      "conversations?phone=in.(" +
        phoneVariants.map(encodeURIComponent).join(",") +
        ")&order=updated_at.desc&limit=1",
      { method: "GET" },
    );
    conv = Array.isArray(rows) && rows[0];
  }
  if (!conv) throw new Error("Conversation not found");

  const volumeBlock = blockDerivationAtHighVolume(input, conv, 50);
  if (volumeBlock) return volumeBlock;

  const cordobaBlock = blockDerivationInCordoba(input, conv);
  if (cordobaBlock) return cordobaBlock;

  const deriveOrder = gateDeriveMessageFirst(input);
  if (deriveOrder) return deriveOrder;

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
  if (!distributorName) {
    const province = resolveProvince(input.province, conv.province);
    if (province) {
      const dists = await sb(
        supabaseUrl,
        supabaseKey,
        "distributors?active=eq.true&select=id,name,province,covered_provinces",
        { method: "GET" },
      );
      const list = Array.isArray(dists) ? dists : [];
      const hit =
        list.find(function (d) {
          return normalize(d.province) === normalize(province);
        }) ||
        list.find(function (d) {
          return (d.covered_provinces || []).some(function (p) {
            return normalize(p) === normalize(province);
          });
        });
      if (hit) {
        distributorName = hit.name || "";
        if (hit.id) input.distributorId = input.distributorId || hit.id;
      }
    }
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

  const sheetResolved = resolveDerivedDistributorSheetId(env, distributorName);
  const sheetId = sheetResolved ? sheetResolved.spreadsheetId : null;
  const today = new Date().toISOString().slice(0, 10);
  const sheet = sheetId
    ? await appendSheet(env, "derived_distributors", sheetId, [
        today,
        derivedName || conv.name || "",
        derivedPhone || conv.phone || "",
        derivedCompany || input.company || "",
        input.businessType || "",
        input.clientType || conv.client_type || "",
        input.province || conv.province || "",
        input.city || "",
        input.postalCode || "",
        distributorName,
        "",
      ])
    : {
        attempted: true,
        success: false,
        error: distributorName
          ? 'No hay sheet mapeado para distribuidor "' + distributorName + '"'
          : "Falta distributorName para sheet de derivados",
      };

  // NO forzar handoff Kapso acá: si lo hacemos, la IA muere antes del mensaje de cierre.
  // El agent debe: 1) send_notification  2) sync_derived  3) handoff_to_human.
  return {
    ok: true,
    conversationId: conv.id,
    distributorName: distributorName,
    sheet: sheet,
    finalizeAt: null,
    handoffHours: hours,
    kapsoHandoff: { ok: false, skipped: true, mode: "agent_must_handoff_to_human" },
    instruction:
      "sync_derived OK (Pipeline/sheet). NO corta la IA. ORDEN: " +
      "1) Si todavía NO mandaste mensaje humano de cierre → send_notification_to_user YA: " +
      "'Te va a contactar " +
      (distributorName || "el distribuidor de tu zona") +
      "…' + despedida corta. " +
      "2) Después handoff_to_human. NUNCA complete_task. NUNCA sync_derived otra vez.",
  };
}
