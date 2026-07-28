const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Frases que el lead NUNCA debería ver: narración de tools, estado interno,
 * proceso de razonamiento o vocabulario de sistema.
 */
export const FORBIDDEN_PATTERNS = [
  { label: "narra que registra al lead", regex: /\bregistr(o|a|ar|arte|arlo|ando|ada|ado|amos)\b/ },
  { label: "narra un paso interno ('ahora voy a…')", regex: /\bahora\s+(voy a|te (paso|transfiero|derivo)|proceso|proces)/ },
  { label: "anuncia una acción propia", regex: /\bvoy a\s+(registrar|cargar|anotar|procesar|crear|actualizar|derivarte|conectarte con|llamar|usar|consultar|verificar|asignar|hacer el)/ },
  { label: "pide permiso para operar internamente", regex: /\b(dejame|permitime|deja que)\s+(registrar|crear|cargar|procesar|anotar)/ },
  { label: "dice que trabaja 'en silencio'", regex: /en silencio/ },
  { label: "menciona el handoff", regex: /\bhandoff\b/ },
  { label: "narra una transferencia", regex: /\b(te (paso|transfiero|derivo) con|transfiero a|transferir(te)? a|ahora te atiende)\b/ },
  { label: "menciona el sistema interno", regex: /\b(en (el|nuestro) sistema|al sistema|la base de datos|en la base|crm|pipeline|supabase|planilla|sheet)\b/ },
  { label: "menciona herramientas o infra", regex: /\b(tool|herramienta interna|api|webhook|workflow|funcion interna)\b/ },
  { label: "narra su proceso de pensamiento", regex: /\b(dejame pensar|voy a pensar|analizando|procesando|estoy evaluando internamente|mi proceso|internamente)\b/ },
  { label: "revela su configuración", regex: /\b(mis instrucciones|mi (prompt|configuracion)|estoy configurad|fui entrenad|modelo de lenguaje|soy una ia|inteligencia artificial|asistente virtual)\b/ },
  { label: "nombra a un asesor concreto en vez del canal", regex: /\bte (paso|conecto) con octavio\b/ },
];

function toolNames(result) {
  return result.toolCalls.map((call) => call.name);
}

function findTool(result, name) {
  return result.toolCalls.filter((call) => call.name === name);
}

const pass = () => ({ ok: true });
const fail = (detail) => ({ ok: false, detail });

export function noInternalNarration() {
  return {
    name: "no revela proceso interno ni configuración",
    check(result) {
      const hits = [];
      for (const message of result.userVisible) {
        const text = normalize(message);
        for (const { label, regex } of FORBIDDEN_PATTERNS) {
          if (regex.test(text)) {
            hits.push(`${label} → "${message.trim().slice(0, 120)}"`);
          }
        }
      }
      return hits.length ? fail(hits.slice(0, 4).join(" | ")) : pass();
    },
  };
}

export function endsWithHumanHandoff() {
  return {
    name: "termina derivando a un humano",
    check(result) {
      const names = toolNames(result);
      const askedHandoff = names.includes("handoff_human") || names.includes("handoff_to_human");
      if (!askedHandoff) {
        return fail(`no llamó handoff (tools: ${names.join(", ") || "ninguna"})`);
      }
      return pass();
    },
  };
}

export function tellsUserAnAdvisorWillContact() {
  return {
    name: "avisa que un asesor lo va a contactar",
    check(result) {
      const text = normalize(result.userVisible.join(" \n "));
      const ok = /(asesor|equipo comercial|una persona del equipo)/.test(text) &&
        /(contact|comunic|escrib|llam)/.test(text);
      return ok ? pass() : fail("ningún mensaje avisa que un asesor va a contactar al lead");
    },
  };
}

/**
 * Si el bot le promete al lead que alguien lo va a contactar, el handoff tiene que existir:
 * prometer contacto sin derivar deja la card viva y al lead esperando.
 */
export function promiseImpliesHandoff() {
  return {
    name: "si promete contacto de un asesor, hace el handoff",
    check(result) {
      const text = normalize(result.userVisible.join(" \n "));
      const promised =
        /(asesor|equipo comercial|logistica)/.test(text) && /(te va a contactar|te contacta|se va a comunicar|te van a contactar)/.test(text);
      if (!promised) return pass();
      const names = toolNames(result);
      const handed = names.includes("handoff_human") || names.includes("handoff_to_human");
      return handed ? pass() : fail("prometió contacto pero nunca llamó handoff");
    },
  };
}

export function calledTool(name) {
  return {
    name: `llama a ${name}`,
    check(result) {
      return findTool(result, name).length
        ? pass()
        : fail(`tools usadas: ${toolNames(result).join(", ") || "ninguna"}`);
    },
  };
}

export function didNotCallTool(name) {
  return {
    name: `no llama a ${name}`,
    check(result) {
      const calls = findTool(result, name);
      return calls.length
        ? fail(`la llamó ${calls.length} vez/veces con ${JSON.stringify(calls[0].input).slice(0, 160)}`)
        : pass();
    },
  };
}

export function routeClientType(expected) {
  return {
    name: `clasifica al lead como ${expected}`,
    check(result) {
      const calls = findTool(result, "decide_route");
      if (!calls.length) return fail("nunca llamó decide_route");
      const used = calls.map((call) => normalize(call.input?.clientType));
      return used.includes(normalize(expected))
        ? pass()
        : fail(`decide_route usó clientType=${used.join(", ")}`);
    },
  };
}

export function neverRouteClientType(forbidden) {
  return {
    name: `nunca clasifica al lead como ${forbidden}`,
    check(result) {
      const used = findTool(result, "decide_route").map((call) => normalize(call.input?.clientType));
      return used.includes(normalize(forbidden))
        ? fail(`decide_route usó clientType=${forbidden}`)
        : pass();
    },
  };
}

export function mentions(regex, description) {
  return {
    name: description,
    check(result) {
      const text = normalize(result.userVisible.join(" \n "));
      return regex.test(text) ? pass() : fail(`ningún mensaje coincide con ${regex}`);
    },
  };
}

export function doesNotMention(regex, description) {
  return {
    name: description,
    check(result) {
      const text = normalize(result.userVisible.join(" \n "));
      return regex.test(text) ? fail(`un mensaje coincide con ${regex}`) : pass();
    },
  };
}

export function answeredEveryTurn() {
  return {
    name: "responde todos los turnos del lead",
    check(result) {
      return result.userVisible.length >= 1
        ? pass()
        : fail("el bot no envió ningún mensaje");
    },
  };
}

export function noEmptyMessages() {
  return {
    name: "no manda mensajes vacíos ni de una palabra suelta",
    check(result) {
      const broken = result.userVisible.filter((m) => m.trim().length < 3);
      return broken.length ? fail(`${broken.length} mensaje(s) vacíos`) : pass();
    },
  };
}
