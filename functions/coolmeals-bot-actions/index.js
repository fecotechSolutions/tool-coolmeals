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
  const patchClientType = sanitizeClientType(input.clientType);
  if (patchClientType) patch.client_type = patchClientType;
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
        "REPRESENTANTE — mensaje: asesor te contacta (NO este número) + despedida. Silencio: handoff_human status=quiere_ser_representante + handoff_to_human. Sin menú muestras aunque diga volumen alto.",
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
        "FASÓN — mensaje: sí hacemos fasón/marca propia; asesor te contacta + despedida. Silencio: handoff_human status=quiere_ser_fason + handoff_to_human. Sin menú muestras aunque diga volumen alto.",
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
        "Cool Meals (≥50, cualquier provincia). Menú: 1) Pedir muestras 2) Agendar pedido. Esperá. Si muestras: pedí Nombre, Tel, Empresa, Provincia, DNI, Correo, CP y Dirección completa → request_samples → mensaje: se acuerdan/envían las muestras y un REPRESENTANTE se comunica para el seguimiento → handoff_human status=muestras + handoff_to_human. Si pedido: asesor te contacta; handoff_human + handoff_to_human.",
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
        "Cool Meals operador/representante. SIN menú muestras. Mensaje: un asesor/representante te contacta + despedida. Silencio: handoff_human status=atencion_representante + handoff_to_human.",
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
        "Avisá que aún no hay cobertura; te avisamos cuando lleguemos. handoff_human status=sin_cobertura + handoff_to_human. Queda ~22h en handoff y después pasa a Descartado (IA ended).",
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
      "DERIVAR: 1) Si faltan nombre completo, teléfono (confirmá WhatsApp) o nombre del negocio → pedilos, NO sync_derived aún. 2) Mensaje: 'Te va a contactar " +
      distributor.name +
      "…' + despedida. 3) Silencio: sync_derived + handoff_to_human. Si pidieron muestras con <50: NO request_samples.",
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
      "Muestra agendada (Pipeline Muestras + sheet logística). Mensaje al lead: se acuerdan/envían las muestras y un REPRESENTANTE se va a comunicar para el seguimiento. Luego handoff_human status=muestras + handoff_to_human (IA queda en handoff/cerrada). NO digas solo 'logística'; priorizá representante/seguimiento.",
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
    quiere_ser_distribuidor: true,
    quiere_ser_representante: true,
    quiere_ser_fason: true,
    sin_cobertura: true,
    muestras: true,
    esperando_respuesta: true,
    descartado: true,
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
              : status === "descartado"
                ? "descartado"
                : "handoff_humano");

  const notes = [
    existing.notes,
    status === "descartado"
      ? "Descartado + IA cerrada (ended): " + (input.reason || "sin perfil comercial")
      : status === "muestras"
        ? "Handoff muestras (seguimiento representante): " + (input.reason || "muestras")
        : "Handoff: " + (input.reason || "atención humana"),
  ]
    .filter(Boolean)
    .join("\n");

  const tagsBase = (
    Array.isArray(existing.tags) ? existing.tags : []
  ).filter(function (t) {
    return t !== "#atendido_por_representante";
  });
  // Sin cobertura / descartado: sin forzar hashtag. Muestras sí marca atención humana (handoff).
  const tags = Array.from(
    new Set(
      status === "sin_cobertura" || status === "descartado"
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

  // Descartado: cerrar IA (ended). Muestras y resto: el agent usa handoff_to_human.
  let kapsoClose = { ok: false, skipped: true, mode: null };
  if (status === "descartado" && kapsoExecutionId) {
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
    instruction:
      status === "muestras"
        ? "Muestras: sheet/Pipeline listos. Usá handoff_to_human. Avisá que un representante hace el seguimiento."
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
