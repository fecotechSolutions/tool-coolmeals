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
      return json(await requestSamples(input, phoneFromCtx, supabaseUrl, supabaseKey, env));
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
    "conversations?phone=eq." + encodeURIComponent(phone) + "&order=updated_at.desc&limit=1",
    { method: "GET", prefer: "return=representation" },
  );

  const patch = {
    phone: phone,
    origin: input.origin || "whatsapp",
  };
  if (input.name) patch.name = input.name;
  // No pisar estados terminales / post-derivación con ia_atendiendo
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
  };
  const existingStatus =
    Array.isArray(existing) && existing[0] ? existing[0].status : null;
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
  if (input.clientType) patch.client_type = input.clientType;
  if (input.province) patch.province = input.province;
  if (input.distributorId !== undefined) patch.distributor_id = input.distributorId;
  if (input.aiSummary !== undefined) patch.ai_summary = input.aiSummary;
  if (input.lastMessage !== undefined) patch.last_message = input.lastMessage;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.estimatedVolume !== undefined) patch.estimated_volume = input.estimatedVolume;
  if (input.outcome !== undefined) patch.outcome = input.outcome;
  if (kapsoConversationId) patch.kapso_conversation_id = kapsoConversationId;
  if (kapsoExecutionId) patch.kapso_execution_id = kapsoExecutionId;

  let row;
  if (Array.isArray(existing) && existing[0]) {
    const messages = Array.isArray(existing[0].messages) ? existing[0].messages.slice() : [];
    if (input.message) messages.push(input.message);
    patch.messages = messages;
    const updated = await sb(
      supabaseUrl,
      supabaseKey,
      "conversations?id=eq." + existing[0].id,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
    row = Array.isArray(updated) ? updated[0] : updated;
  } else {
    const insert = {
      name: input.name || (context.contact && context.contact.profile_name) || phone,
      phone: phone,
      origin: input.origin || "whatsapp",
      status: input.status || "ia_atendiendo",
      client_type: input.clientType || "minorista",
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

  return { ok: true, conversationId: row.id, status: row.status, phone: row.phone };
}

async function decideRoute(input, supabaseUrl, supabaseKey) {
  const clientType = input.clientType || "minorista";
  const province = input.province || "";
  const postalCode = input.postalCode || "";
  const estimatedVolume =
    input.estimatedVolume === null || input.estimatedVolume === undefined
      ? null
      : Number(input.estimatedVolume);
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
        "Avisá que un ASESOR COMERCIAL te va a CONTACTAR por teléfono o WhatsApp (otro canal; NO por este número). Despedite amablemente (ej. '¡Gracias! Cualquier cosa quedamos atentos. ¡Que andes bien!'). PROHIBIDO 'te paso con…' / 'ahora te atiende…'. Luego handoff_human status=quiere_ser_distribuidor + handoff_to_human. Card en Quiere ser distribuidor.",
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
        "REPRESENTANTE — columna Quiere ser representante. Con la intención clara: NO pidas más datos. En UN mensaje: (1) confirmá el interés; (2) un ASESOR COMERCIAL te CONTACTA a la brevedad por teléfono/WhatsApp — NO por este número; (3) DESPEDITE. Luego handoff_human status=quiere_ser_representante + handoff_to_human.",
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
        "FASÓN / marca propia — CIERRE INMEDIATO. PROHIBIDO preguntar más. UN solo mensaje: sí hacemos fasón/marca propia; un ASESOR COMERCIAL te CONTACTA por teléfono/WhatsApp (NO este número); despedida. Luego handoff_human status=quiere_ser_fason + handoff_to_human. Card Quiere ser fasón.",
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
  const usesVolumeThreshold =
    clientType === "mayorista" || clientType === "retail";
  const highVolume =
    estimatedVolume !== null && estimatedVolume >= minBundles;

  // Retail / mayorista: Cool Meals solo Córdoba + ≥ umbral
  if (usesVolumeThreshold && isCordoba && highVolume) {
    return {
      ok: true,
      action: "own_attention",
      conversationStatus: "atencion_representante",
      outcome: "handoff_humano",
      distributorId: null,
      distributorName: null,
      reason:
        clientType +
        " en Córdoba con volumen ≥ " +
        minBundles +
        " bultos — atención Cool Meals.",
      syncDerivedSheet: false,
      coolMealsMenu: true,
      agentInstruction:
        "Cool Meals. NO hagas handoff todavía. Ofrecé SIEMPRE: 1) Pedir muestras 2) Agendar pedido, y esperá. Si muestras: Nombre y Apellido + Teléfono + Domicilio → request_samples → avisá que LOGÍSTICA te va a CONTACTAR para el envío (no digas que un asesor arma las muestras ni 'te paso con alguien' por este chat) → handoff_human status=muestras + handoff_to_human. Si pedido: avisá que un asesor comercial te va a CONTACTAR; handoff_human + handoff_to_human. Nunca digas que te van a hablar por este mismo número.",
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
        "Avisá que aún no hay cobertura. Llamá handoff_human con status=sin_cobertura (NO atencion_representante) y reason claro; después handoff_to_human. La card queda en Sin cobertura; en ~24h pasa a Finalizado.",
    };
  }

  const volumeNote =
    usesVolumeThreshold && highVolume && !isCordoba
      ? " (volumen ≥ " +
        minBundles +
        " fuera de Córdoba → red de distribuidores)"
      : "";

  return {
    ok: true,
    action: "derive_to_distributor",
    conversationStatus: "derivado_distribuidor",
    outcome: "derivado_distribuidor",
    distributorId: distributor.id,
    distributorName: distributor.name,
    reason:
      "Derivado a " + distributor.name + " (" + province + ")" + volumeNote,
    syncDerivedSheet: true,
    agentInstruction:
      "Derivá al distribuidor (sync_derived + handoff_to_human). Si pidieron muestras: NO uses request_samples ni sheet Cool Meals — el distribuidor se hace cargo. Avisalo al lead.",
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

async function requestSamples(input, phoneFromCtx, supabaseUrl, supabaseKey, env) {
  const fullName = String(input.fullName || "").trim();
  const phone = String(input.phone || phoneFromCtx || "").trim();
  const address = String(input.address || "").trim();
  if (!fullName || !phone || !address) {
    throw new Error("fullName, phone and address required for samples");
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
      address: address,
      city: input.city || "",
      province: input.province || "",
      postal_code: input.postalCode || "",
      notes: input.notes || "",
      status: "pendiente",
    }),
  });
  const row = Array.isArray(created) ? created[0] : created;

  // Cool Meals se hace cargo: card en columna Muestras (logística ve sheet + Pipeline).
  if (conversationId) {
    const notesExtra = "Muestra agendada — logística contacta para envío.";
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
  const sheet = await appendSheet(env, "sample_logistics", sheetId, [
    today,
    fullName,
    phone,
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
      "Muestra agendada (Pipeline Muestras + sheet). Avisá que logística contacta para el envío. Después handoff_human con status=muestras + handoff_to_human. NO digas que un asesor comercial arma las muestras.",
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

  const notes = [existing.notes, "Handoff: " + (input.reason || "atención humana")]
    .filter(Boolean)
    .join("\n");
  const allowedStatus = {
    atencion_representante: true,
    quiere_ser_distribuidor: true,
    quiere_ser_representante: true,
    quiere_ser_fason: true,
    sin_cobertura: true,
    muestras: true,
    esperando_respuesta: true,
  };
  const status =
    input.status && allowedStatus[input.status]
      ? input.status
      : "atencion_representante";
  const outcome =
    input.outcome ||
    (status === "quiere_ser_distribuidor"
      ? "quiere_ser_distribuidor"
      : status === "quiere_ser_representante"
        ? "quiere_ser_representante"
        : status === "quiere_ser_fason"
          ? "quiere_ser_fason"
          : status === "sin_cobertura"
            ? "sin_cobertura"
            : status === "muestras"
              ? "muestras"
              : "handoff_humano");

  const tagsBase = (
    Array.isArray(existing.tags) ? existing.tags : []
  ).filter(function (t) {
    return t !== "#atendido_por_representante";
  });
  // Muestras / sin cobertura: handoff sin forzar hashtag de atención humana
  const tags = Array.from(
    new Set(
      status === "sin_cobertura" || status === "muestras"
        ? tagsBase
        : tagsBase.concat(["#atencion_humana"]),
    ),
  );

  const now = new Date();
  const hours = Number(env && env.DERIVE_HANDOFF_HOURS);
  const handoffHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
  const finalizeAt = new Date(
    now.getTime() + handoffHours * 60 * 60 * 1000,
  ).toISOString();

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

  return {
    ok: true,
    conversationId: row.id,
    status: row.status,
    sameNumber: true,
    finalizeAt: finalizeAt,
    sheet: sheet,
    instruction: "Usá handoff_to_human en el agent. Octavio responde en el mismo WhatsApp.",
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
      row.name || "",
      row.phone || "",
      "",
      tipoCliente,
      row.province || "",
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
    const sheet = await appendSheet(env, "no_coverage", sheetId, [
      date,
      row.name || "",
      row.phone || "",
      "",
      row.province || "",
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
  const finalizeAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();

  const patch = {
    status: "derivado_distribuidor",
    outcome: "derivado_distribuidor",
    derived_at: now.toISOString(),
    finalize_at: finalizeAt,
    kapso_execution_id: kapsoExecutionId || conv.kapso_execution_id || null,
    kapso_conversation_id: kapsoConversationId || conv.kapso_conversation_id || null,
  };
  if (input.distributorId) patch.distributor_id = input.distributorId;
  if (input.clientType) patch.client_type = input.clientType;
  if (input.province) patch.province = input.province;
  if (input.aiSummary) patch.ai_summary = input.aiSummary;

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
    finalizeAt: finalizeAt,
    handoffHours: hours,
    kapsoHandoff: handoff,
    instruction:
      "Después de sync_derived: llamá handoff_to_human. NUNCA complete_task al derivar. " +
      "El bot queda en handoff hasta finalize_at; luego un job pasa a ended y Finalizado.",
  };
}
