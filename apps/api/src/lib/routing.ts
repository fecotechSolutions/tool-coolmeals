import type {
  CommercialSettings,
  DecideRouteInput,
  Distributor,
  RouteDecision,
} from "@coolmeals/shared";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function findDistributorForProvince(
  province: string,
  postalCode: string,
  distributors: Distributor[],
  settings: CommercialSettings,
): Distributor | null {
  const active = distributors.filter((d) => d.active);
  const pc = postalCode.trim();

  if (pc) {
    const byPostal = active.find((d) =>
      d.postalCodes.some((code) => code.trim() === pc),
    );
    if (byPostal) return byPostal;
  }

  const mappedId = settings.provinceDistributorMap.find(
    (row) => normalize(row.province) === normalize(province),
  )?.distributorId;
  if (mappedId) {
    const mapped = active.find((d) => d.id === mappedId);
    if (mapped) return mapped;
  }

  return (
    active.find((d) =>
      d.coveredProvinces.some((p) => normalize(p) === normalize(province)),
    ) ??
    active.find((d) => normalize(d.province) === normalize(province)) ??
    null
  );
}

const OWN_ATTENTION_MENU_INSTRUCTION =
  "Cool Meals (≥50, cualquier provincia). Menú corto: 1) Pedir muestras 2) Agendar pedido. Esperá. " +
  "Si muestras: pedí Nombre, Tel, Empresa, Provincia, DNI, Correo, CP y Dirección completa → request_samples → " +
  "mensaje: se acuerdan/envían las muestras y un REPRESENTANTE se comunica para el seguimiento → " +
  "handoff_human status=muestras + handoff_to_human. " +
  "Si pedido: un asesor te contacta; handoff_human + handoff_to_human. Sin narrar sistema.";

const COOLMEALS_OPERATOR_HANDOFF_INSTRUCTION =
  "Cool Meals operador/representante (Córdoba o handoff comercial). SIN menú muestras. " +
  "Mensaje: un asesor/representante te contacta (otro canal) + despedida. " +
  "Silencio: handoff_human status=atencion_representante + handoff_to_human.";

/**
 * Motor comercial — prioridad volumen ≥50, luego Córdoba vs resto.
 *
 * Orden:
 * 1. representante / fasón → handoff a su columna (sin mirar volumen).
 * 2. Volumen ≥ umbral (cualquier tipo/provincia, incl. lead dist. con 4 SÍ) → menú muestras/pedido.
 * 3. Volumen < umbral (o sin volumen en minorista/otro) + Córdoba → operador Cool Meals.
 * 4. Volumen < umbral + fuera de Córdoba → dist. de zona o sin_cobertura.
 *
 * Quiere ser distribuidor (4 SÍ): el agent marca la columna con upsert (sin handoff).
 * Después llama decide_route con volumen/zona como cualquier lead comercial.
 */
export function decideRoute(
  input: DecideRouteInput,
  distributors: Distributor[],
  settings: CommercialSettings,
): RouteDecision & { agentInstruction?: string; coolMealsMenu?: boolean } {
  const minBundles = settings.minBundlesDefault ?? 50;
  const volume = input.estimatedVolume ?? null;

  if (input.clientType === "representante") {
    return {
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

  if (input.clientType === "fason") {
    return {
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

  const distributor = findDistributorForProvince(
    input.province,
    input.postalCode ?? "",
    distributors,
    settings,
  );

  const isCordoba = normalize(input.province) === "cordoba";
  const highVolume = volume !== null && volume >= minBundles;
  const distNote =
    input.wantsToBeDistributor || input.clientType === "distribuidor"
      ? " (lead con interés/alta dist.; ya debió estar en columna Quiere ser distribuidor vía upsert, sin handoff)"
      : "";

  // Prioridad: ≥50 → muestras/pedido en cualquier provincia / tipo
  if (highVolume) {
    return {
      action: "own_attention",
      conversationStatus: "atencion_representante",
      outcome: "handoff_humano",
      distributorId: null,
      distributorName: null,
      reason: `Volumen ≥ ${minBundles} bultos (${input.clientType}, ${input.province}) — menú muestras/pedido Cool Meals.${distNote}`,
      syncDerivedSheet: false,
      coolMealsMenu: true,
      agentInstruction: OWN_ATTENTION_MENU_INSTRUCTION,
    };
  }

  // <50 (o sin volumen): Córdoba → operador
  if (isCordoba) {
    return {
      action: "own_attention",
      conversationStatus: "atencion_representante",
      outcome: "handoff_humano",
      distributorId: null,
      distributorName: null,
      reason: `${input.clientType} en Córdoba con volumen < ${minBundles} (o sin volumen) — operador/representante Cool Meals.${distNote}`,
      syncDerivedSheet: false,
      coolMealsMenu: false,
      agentInstruction: COOLMEALS_OPERATOR_HANDOFF_INSTRUCTION,
    };
  }

  // Fuera de Córdoba + <50 → red de dist.
  if (!distributor) {
    return {
      action: "no_coverage",
      conversationStatus: "sin_cobertura",
      outcome: "sin_cobertura",
      distributorId: null,
      distributorName: null,
      reason: `Sin distribuidor activo con cobertura en ${input.province}.${distNote}`,
      syncDerivedSheet: false,
      agentInstruction:
        "Avisá que aún no hay cobertura en la zona; te avisamos cuando lleguemos. handoff_human status=sin_cobertura + handoff_to_human.",
    };
  }

  return {
    action: "derive_to_distributor",
    conversationStatus: "derivado_distribuidor",
    outcome: "derivado_distribuidor",
    distributorId: distributor.id,
    distributorName: distributor.name,
    reason: `Derivado a ${distributor.name} por zona (${input.province}).${distNote}`,
    syncDerivedSheet: true,
    agentInstruction: `DERIVAR: 1) Si faltan nombre completo, teléfono (confirmá WhatsApp) o nombre del negocio → pedilos, NO sync_derived aún. 2) Mensaje humano nombrando a "${distributor.name}" como quien contacta + despedida. 3) Silencio: sync_derived + handoff_to_human. PROHIBIDO narrar registro/derivación. Si pidieron muestras con <50: NO request_samples — el dist. se hace cargo.`,
  };
}
