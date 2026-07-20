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

/**
 * Motor comercial MVP — umbral 50 + ubicación (FLUJO).
 *
 * Umbral 50 bultos:
 * - Aplica SOLO a retail y mayorista.
 * - Cool Meals (own_attention) solo si provincia = Córdoba Y volumen ≥ umbral.
 * - Fuera de Córdoba, aunque volumen ≥ umbral → red de distribuidores.
 * - Minorista: siempre deriva (sin umbral).
 * - Distribuidor / representante / fason: sin umbral; van a su columna.
 * - Otro: no asumir umbral; cubrir como deriva / sin_cobertura.
 *
 * Fuente de cobertura: tabla Distribuidores (no sheet).
 */
export function decideRoute(
  input: DecideRouteInput,
  distributors: Distributor[],
  settings: CommercialSettings,
): RouteDecision {
  const minBundles = settings.minBundlesDefault ?? 50;
  const volume = input.estimatedVolume ?? null;

  if (input.wantsToBeDistributor || input.clientType === "distribuidor") {
    return {
      action: "quiere_ser_distribuidor",
      conversationStatus: "quiere_ser_distribuidor",
      outcome: "quiere_ser_distribuidor",
      distributorId: null,
      distributorName: null,
      reason:
        "Quiere ser distribuidor — columna Quiere ser distribuidor + handoff al agente comercial (sin umbral 50).",
      syncDerivedSheet: false,
    };
  }

  if (input.clientType === "representante") {
    return {
      action: "quiere_ser_representante",
      conversationStatus: "quiere_ser_representante",
      outcome: "quiere_ser_representante",
      distributorId: null,
      distributorName: null,
      reason:
        "Quiere ser representante — columna Quiere ser representante + handoff comercial (sin umbral 50, sin menú muestras).",
      syncDerivedSheet: false,
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
        "Quiere ser fasón — columna Quiere ser fasón + handoff comercial (sin umbral 50, sin menú muestras).",
      syncDerivedSheet: false,
    };
  }

  const distributor = findDistributorForProvince(
    input.province,
    input.postalCode ?? "",
    distributors,
    settings,
  );

  const isCordoba = normalize(input.province) === "cordoba";
  const usesVolumeThreshold =
    input.clientType === "mayorista" || input.clientType === "retail";
  const highVolume = volume !== null && volume >= minBundles;

  // Retail / mayorista: Cool Meals solo Córdoba + ≥ umbral
  if (usesVolumeThreshold && isCordoba && highVolume) {
    return {
      action: "own_attention",
      conversationStatus: "atencion_representante",
      outcome: "handoff_humano",
      distributorId: null,
      distributorName: null,
      reason: `${input.clientType} en Córdoba con volumen ≥ ${minBundles} bultos — atención Cool Meals.`,
      syncDerivedSheet: false,
    };
  }

  if (!distributor) {
    return {
      action: "no_coverage",
      conversationStatus: "sin_cobertura",
      outcome: "sin_cobertura",
      distributorId: null,
      distributorName: null,
      reason: `Sin distribuidor activo con cobertura en ${input.province}.`,
      syncDerivedSheet: false,
    };
  }

  // minorista siempre; retail/mayorista fuera de CBA o < umbral; otro → derivar
  const volumeNote =
    usesVolumeThreshold && highVolume && !isCordoba
      ? ` (volumen ≥ ${minBundles} fuera de Córdoba → red de distribuidores)`
      : "";

  return {
    action: "derive_to_distributor",
    conversationStatus: "derivado_distribuidor",
    outcome: "derivado_distribuidor",
    distributorId: distributor.id,
    distributorName: distributor.name,
    reason: `Derivado a ${distributor.name} por zona (${input.province}).${volumeNote}`,
    syncDerivedSheet: true,
  };
}
