import {
  answeredEveryTurn,
  asksDisambiguation,
  asksUnitsVsBoxes,
  calledTool,
  decideRouteConfirmsUnitsWhenProductQty,
  didNotCallTool,
  doesNotMention,
  endsWithHumanHandoff,
  mentions,
  mentionsBeaconsLink,
  neverRouteClientType,
  routeClientType,
  syncDerivedHasMessageFlag,
  tellsUserAnAdvisorWillContact,
} from "./lib/assertions.mjs";

/**
 * Cada caso es una conversación scripteada + asserts.
 *
 * `noInternalNarration` y `noEmptyMessages` se agregan a todos los casos en el runner:
 * el criterio "nunca cuentes tu proceso interno" aplica siempre.
 *
 * Prefijos útiles:
 *   --case gate-   → gates nuevos (Frizzé-lite)
 *   --case tipos-  → tipologías
 *   --case vivo-   → aperturas “vivas”
 */
export const cases = [
  {
    id: "gastro-restaurante-minorista",
    title: "Restaurante = minorista y se deriva al distribuidor de zona",
    turns: [
      "Hola, tengo un restaurante en Mendoza y quiero comprar productos congelados",
      "Me interesan wraps y platos listos",
      "Se llama Resto Prueba, mi nombre es Ana Gómez",
      "Sí, este número está bien",
    ],
    asserts: [
      routeClientType("minorista"),
      calledTool("decide_route"),
      mentions(/cool logistica cuyo/, "nombra al distribuidor de la zona"),
    ],
  },
  {
    id: "gastro-rotiseria-minorista",
    title: "Rotisería = minorista aunque hable de volumen",
    turns: [
      "Hola! tengo una rotisería en Córdoba capital",
      "Compro bastante, unos 60 bultos por mes de platos listos",
      "Rotisería El Buen Sabor, Juan Pérez, este número sirve",
    ],
    asserts: [
      routeClientType("minorista"),
      neverRouteClientType("mayorista"),
      neverRouteClientType("retail"),
    ],
  },
  {
    id: "gastro-bar-minorista",
    title: "Bar / cafetería = minorista",
    turns: [
      "Buenas, tengo un bar con cafetería en Santa Fe y quiero sumar congelados",
      "Wraps sobre todo",
      "Bar La Esquina, Sofía Ruiz, este teléfono está bien",
    ],
    asserts: [routeClientType("minorista")],
  },
  {
    id: "no-sabe-deriva-humano",
    title: "Pregunta fuera de alcance → deriva a humano en vez de inventar",
    turns: [
      "Hola, necesito saber si pueden facturar en dólares a una sociedad de Uruguay y con qué régimen aduanero exportan",
      "Necesito la respuesta concreta para cerrar con mi contador",
    ],
    asserts: [
      endsWithHumanHandoff(),
      tellsUserAnAdvisorWillContact(),
      doesNotMention(/\b(si, podemos facturar|exportamos con|el regimen es)\b/, "no inventa condiciones"),
    ],
  },
  {
    id: "no-sabe-precios",
    title: "Pide precios y condiciones exactas → deriva a humano",
    turns: [
      "Hola, cuánto sale la caja de wraps y qué descuento me hacen por 200 cajas?",
      "Necesito el precio exacto por unidad y plazo de pago",
    ],
    asserts: [
      endsWithHumanHandoff(),
      doesNotMention(/\$\s?\d|\d+\s?(pesos|usd|dolares)/, "no inventa precios"),
    ],
  },
  {
    id: "pregunta-umbral-no-corta",
    title: "Sin cobertura pero sigue preguntando → responde, no corta",
    turns: [
      "Hola, tengo un mayorista en Jujuy y quiero info",
      "Calculo 15 o 20 bultos por mes",
      "Distribuidora Prueba, Octavio Enet",
      "Perfecto, cuántos bultos debería comprar para que puedan atenderme directamente?",
    ],
    asserts: [
      answeredEveryTurn(),
      mentions(
        /(50|cincuenta|cobertura|no llegamos|distribuidor en tu zona|tu zona)/,
        "responde la consulta del umbral en vez de ignorarla",
      ),
    ],
  },
  {
    id: "quiere-ser-distribuidor-califica",
    title: "Quiere ser distribuidor con los 4 requisitos → handoff comercial",
    turns: [
      "Hola, quiero sumarme como distribuidor de Cool Meals en Mendoza",
      "Sí a todo: trabajo con congelados, tengo cámara, tengo logística y tengo estructura de distribución",
      "Distribuidora Sur SA, Marcos Díaz",
    ],
    asserts: [
      routeClientType("distribuidor"),
      endsWithHumanHandoff(),
      tellsUserAnAdvisorWillContact(),
    ],
  },
  {
    id: "quiere-ser-distribuidor-no-califica",
    title: "Quiere ser distribuidor sin requisitos → explica y no lo rutea como distribuidor",
    turns: [
      "Hola, quiero ser distribuidor de ustedes en Salta",
      "No, no trabajo con congelados todavía y no tengo depósito ni logística",
      "No, por ahora no quiero comprar, solo me interesaba distribuir",
    ],
    asserts: [
      neverRouteClientType("distribuidor"),
      mentions(/(requisito|congelad|deposito|camara|logistica)/, "explica los requisitos"),
    ],
  },
  {
    id: "distribuidora-que-compra",
    title: "Tiene una distribuidora y quiere comprar → no es 'quiere ser distribuidor'",
    turns: [
      "Hola, tengo una distribuidora de alimentos y quiero sumar sus productos a mi cartera",
      "Estoy en Santa Fe, muevo unos 80 bultos por mes",
      "Distribuidora Pepe, José Prueba, este número está bien",
    ],
    asserts: [
      neverRouteClientType("distribuidor"),
      calledTool("decide_route"),
    ],
  },
  {
    id: "fason-cierre-rapido",
    title: "Fasón / marca propia → cierre rápido sin formulario",
    turns: [
      "Hola, quiero que me fabriquen comida congelada con mi marca propia",
    ],
    asserts: [
      routeClientType("fason"),
      endsWithHumanHandoff(),
      didNotCallTool("request_samples"),
    ],
  },
  {
    id: "cordoba-mayorista-menu",
    title: "Mayorista en Córdoba ≥50 → menú muestras / pedido",
    turns: [
      "Hola, soy mayorista en Córdoba capital y compro para revender",
      "Unas 80 cajas por mes de wraps",
      "Mayorista Prueba SA, Laura Ferrer, este número sirve",
    ],
    asserts: [
      routeClientType("mayorista"),
      mentions(/muestra/, "ofrece el menú de muestras"),
      mentions(/pedido/, "ofrece armar un pedido"),
    ],
  },

  // --- Smoke: 5 tipologías distintas (correr con --case tipos-) ---
  {
    id: "tipos-minorista-gastro",
    title: "Minorista gastronómico claro → derivado a dist. de zona",
    turns: [
      "Hola, tengo un restaurante en Mendoza y quiero comprar wraps congelados",
      "Unos 15 o 20 bultos al mes me alcanzan",
      "Me interesan wraps",
      "Resto Test Tipos, Ana Gómez, este número está bien",
    ],
    asserts: [
      routeClientType("minorista"),
      neverRouteClientType("mayorista"),
      neverRouteClientType("distribuidor"),
      calledTool("decide_route"),
      mentions(/cool logistica cuyo/, "nombra al distribuidor de la zona"),
    ],
  },
  {
    id: "tipos-mayorista-volumen",
    title: "Mayorista claro ≥50 en Córdoba → menú muestras/pedido",
    turns: [
      "Hola, soy mayorista en Córdoba y compro para revender a almacenes",
      "Calculo unos 90 bultos por mes",
      "Me interesan wraps y platos listos",
      "Mayorista Tipos SA, Laura Ferrer, este número sirve",
    ],
    asserts: [
      routeClientType("mayorista"),
      neverRouteClientType("minorista"),
      neverRouteClientType("distribuidor"),
      mentions(/muestra/, "ofrece muestras"),
      mentions(/pedido/, "ofrece armar pedido"),
    ],
  },
  {
    id: "tipos-retail-supermercado",
    title: "Retail ≥50 fuera de Córdoba → Cool Meals directo (no dist. de zona)",
    turns: [
      "Hola, tengo una cadena de supermercados en Santa Fe y quiero sumar Cool Meals a la góndola",
      "Somos 8 locales, compramos al por mayor unos 120 bultos al mes",
      "Me interesan wraps y platos listos",
      "Super Tipos, Martín López, este WhatsApp sirve",
    ],
    asserts: [
      routeClientType("retail"),
      neverRouteClientType("distribuidor"),
      calledTool("decide_route"),
      mentions(/muestra/, "ofrece menú de muestras (Cool Meals directo)"),
      mentions(/pedido/, "ofrece armar pedido"),
      doesNotMention(/litoral fresh/, "no deriva a dist. de zona con ≥50"),
    ],
  },
  {
    id: "tipos-dist-ambigua-desambigua",
    title: "Dist. ambigua → desambigua → compra ≥50 Mendoza = Cool Meals (no dist. asociado)",
    turns: [
      "Hola, tengo una distribuidora en Mendoza",
      "Quiero comprar productos de ustedes para revender en mi cartera, no sumarme como distribuidor oficial",
      "Unos 80 bultos por mes",
      "Wraps y platos listos",
      "Distribuidora Tipos Mendoza, Octavio Test, este número está bien",
    ],
    asserts: [
      asksDisambiguation("pregunta si compra/revende o quiere ser dist. oficial"),
      neverRouteClientType("distribuidor"),
      routeClientType("mayorista"),
      calledTool("decide_route"),
      mentions(/muestra/, "≥50 → menú Cool Meals"),
      doesNotMention(/cool logistica cuyo/, "no deriva a dist. asociado con ≥50"),
    ],
  },
  {
    id: "tipos-quiere-ser-distribuidor",
    title: "Quiere ser dist. oficial + ≥50 → columna dist. y menú Cool Meals (no handoff solo por 4 SÍ)",
    turns: [
      "Hola, quiero sumarme como distribuidor oficial de Cool Meals en Mendoza",
      "Sí: trabajo con congelados, tengo cámara, logística y estructura de distribución",
      "Distribuidora Red Sur, Marcos Díaz, este número",
      "Podría mover unos 100 bultos por mes",
      "Wraps y platos listos",
    ],
    asserts: [
      routeClientType("distribuidor"),
      mentions(/muestra/, "≥50 → menú muestras Cool Meals"),
      mentions(/pedido/, "≥50 → ofrece pedido"),
      doesNotMention(/cool logistica cuyo/, "no deriva a dist. asociado"),
    ],
  },

  // --- Chats “vivos”: aperturas distintas como leads reales (correr con --case vivo-) ---
  {
    id: "vivo-precio-hotel-cordoba",
    title: "Arranca pidiendo precio → hotel Córdoba bajo volumen → dist/sin_cobertura",
    turns: [
      "Hola, cuánto sale la caja de wraps?",
      "Es para el hotel, estamos en Córdoba capital",
      "Más o menos 25 cajas al mes",
      "Hotel Sol Norte, Carla Méndez, este WhatsApp está bien",
    ],
    asserts: [
      doesNotMention(/\$\s?\d|\d+\s?(pesos|usd)/, "no inventa precios"),
      calledTool("decide_route"),
      routeClientType("minorista"),
    ],
  },
  {
    id: "vivo-beacons-rotiseria-ba",
    title: "Vio Beacons → rotisería BA volumen bajo → dist. de zona",
    turns: [
      "Buenas, vi el catálogo en beacons y me interesan los platos listos",
      "Tengo una rotisería en Lanús, Buenos Aires",
      "Calculo 30 bultos por mes",
      "Rotisería Don Pepe, José Álvarez, sí este número",
    ],
    asserts: [
      routeClientType("minorista"),
      calledTool("decide_route"),
      mentions(/pampa fria|pampa fría/, "nombra dist. de BA"),
    ],
  },
  {
    id: "vivo-soy-distribuidor-rosario",
    title: "“Soy distribuidor” poco claro en Rosario → desambigua → compra ≥50 menú",
    turns: [
      "Hola buenas, soy distribuidor en Rosario",
      "Quiero sumar sus productos a lo que ya vendo, no ser distribuidor oficial de la marca",
      "Unas 60 cajas al mes fácil",
      "Wraps sobre todo",
      "Distribuidora Litoral Pepe, Pepe Ríos, este número sirve",
    ],
    asserts: [
      asksDisambiguation("desambigua compra vs ser dist. oficial"),
      neverRouteClientType("distribuidor"),
      mentions(/muestra|pedido/, "con ≥50 ofrece menú Cool Meals"),
    ],
  },
  {
    id: "vivo-fason-marca-propia",
    title: "Quiere marca propia / fasón → cierre comercial sin menú",
    turns: [
      "Hola, fabriqué comida con mi marca? Quiero que me hagan platos congelados con mi marca propia",
    ],
    asserts: [
      routeClientType("fason"),
      endsWithHumanHandoff(),
      didNotCallTool("request_samples"),
    ],
  },
  {
    id: "vivo-consumidor-casa",
    title: "Consumidor final (casa) → cierre / descartado, no tipifica comercial",
    turns: [
      "Hola, quiero comprar wraps para mi heladera de casa, viven cerca de Núñez?",
    ],
    asserts: [
      didNotCallTool("decide_route"),
      mentions(/(no (atendemos|trabajamos)|consumidor|hogar|persona particular|cliente final)/, "aclara que no es B2C"),
    ],
  },
  {
    id: "vivo-volumen-sin-tipo-sanjuan",
    title: "Pide 70 cajas sin decir tipo → San Juan ≥50 → Cool Meals directo",
    turns: [
      "Necesito 70 cajas mensuales de platos listos, estoy en San Juan",
      "Es para reventa, tengo un depósito chico",
      "Depósito Andino, Lucía Torres, este WhatsApp",
    ],
    asserts: [
      calledTool("decide_route"),
      mentions(/muestra|pedido/, "≥50 → menú Cool Meals"),
      doesNotMention(/cool logistica cuyo/, "no deriva a dist. con ≥50"),
    ],
  },

  // --- Gates Frizzé-lite (correr con --case gate-) ---
  {
    id: "gate-beacons-apertura",
    title: "Primer contacto útil → manda Beacons (sin decir que tiene precios)",
    turns: [
      "Hola, quiero info de productos congelados para mi local en Mendoza",
    ],
    asserts: [
      mentionsBeaconsLink(),
      doesNotMention(
        /(beacons|el link|catalogo).{0,40}precio|(precio).{0,40}(beacons|el link)/,
        "no dice que Beacons tiene precios",
      ),
    ],
  },
  {
    id: "gate-unidades-vs-cajas",
    title: "60 wraps / 90 viandas sin aclarar cajas → pregunta unidades vs cajas (no menú)",
    turns: [
      "Hola, tengo un delivery en Córdoba y quiero sumar Cool Meals",
      "Compro unos 60 wraps y 90 viandas por mes",
    ],
    asserts: [
      asksUnitsVsBoxes(),
      decideRouteConfirmsUnitsWhenProductQty(),
      didNotCallTool("request_samples"),
      doesNotMention(
        /(pedir|agendar)\s+muestras|1\)\s*.{0,30}muestra/,
        "no ofrece menú de muestras sin aclarar cajas",
      ),
    ],
  },
  {
    id: "gate-numero-suelto-no-asume-cajas",
    title: "“Justo con 50” sin decir cajas ni wraps → confirma literal antes del menú",
    turns: [
      "Hola, tengo minisúper en Buenos Aires y quiero vender wraps congelados",
      "No estoy segura del volumen",
      "Yo creo que puedo llegar justo con 50",
    ],
    asserts: [
      asksUnitsVsBoxes(),
      didNotCallTool("request_samples"),
      doesNotMention(
        /(pedir|agendar)\s+muestras|1\)\s*.{0,30}muestra/,
        "no ofrece menú sin confirmación literal de unidad",
      ),
    ],
  },
  {
    id: "gate-p3b-tengo-distribuidora",
    title: "“Tengo una distribuidora” sin aclarar → desambigua compra vs ser marca",
    turns: [
      "Hola, tengo una distribuidora en Santa Fe",
    ],
    asserts: [
      asksDisambiguation("pregunta comprar/revender vs dist. oficial de la marca"),
      didNotCallTool("decide_route"),
      didNotCallTool("request_samples"),
    ],
  },
  {
    id: "gate-sticky-dist-luego-compra",
    title: "Era camino dist. oficial y después solo quiere comprar → re-desambigua / tipifica compra",
    turns: [
      "Hola, quiero sumarme como distribuidor oficial de Cool Meals en Mendoza",
      "Sí: trabajo con congelados, tengo cámara, logística y estructura de distribución",
      "Pensándolo bien, solo quiero comprar wraps para revender, no ser distribuidor de la marca",
      "Unos 40 bultos por mes",
      "Almacén Cambio SA, Fer Test, este número está bien",
    ],
    asserts: [
      asksDisambiguation("reabre compra vs ser dist. cuando cambia la intención"),
      answeredEveryTurn(),
      didNotCallTool("request_samples"),
      doesNotMention(
        /(pedir|agendar)\s+muestras|1\)\s*.{0,30}muestra/,
        "40 bultos no debe disparar menú ≥50",
      ),
    ],
  },
  {
    id: "gate-derive-orden-mensaje",
    title: "Derive &lt;50 Mendoza → nombra dist. y sync_derived con deriveMessageSent",
    turns: [
      "Hola, tengo un almacén en Mendoza y quiero comprar productos Cool Meals",
      "Unos 20 bultos por mes de wraps",
      "Almacén Sur Test, Ana Derive, este WhatsApp sirve",
    ],
    asserts: [
      calledTool("decide_route"),
      mentions(/cool logistica cuyo/, "mensaje de cierre nombra al distribuidor"),
      syncDerivedHasMessageFlag(),
      endsWithHumanHandoff(),
    ],
  },
  {
    id: "gate-promesa-handoff-precios",
    title: "Insiste en precios exactos (tras volumen) → asesor + handoff",
    turns: [
      "Hola, soy mayorista en Córdoba, necesito la lista de precios y el mínimo de compra exacto",
      "No sé cuántas cajas, solo quiero el precio unitario ya",
      "Insisto: necesito el precio exacto escrito ahora. No me sirve orientarme con 50 o menos.",
    ],
    asserts: [
      doesNotMention(/\$\s?\d|\d+\s?(pesos|usd)/, "no inventa precios"),
      tellsUserAnAdvisorWillContact(),
      endsWithHumanHandoff(),
    ],
  },
];
