import {
  answeredEveryTurn,
  asksDisambiguation,
  calledTool,
  didNotCallTool,
  doesNotMention,
  endsWithHumanHandoff,
  mentions,
  neverRouteClientType,
  noEmptyMessages,
  noInternalNarration,
  routeClientType,
  tellsUserAnAdvisorWillContact,
} from "./lib/assertions.mjs";

/**
 * Cada caso es una conversación scripteada + asserts.
 *
 * `noInternalNarration` y `noEmptyMessages` se agregan a todos los casos en el runner:
 * el criterio "nunca cuentes tu proceso interno" aplica siempre.
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
];
