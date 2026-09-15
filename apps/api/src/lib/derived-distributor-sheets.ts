/**
 * Sheet de derivados por distribuidor (misma estructura de columnas).
 * Los IDs no son secretos; el acceso lo controla el sharing Editor del Apps Script.
 *
 * Override / altas: env GOOGLE_SHEET_DERIVED_BY_DISTRIBUTOR =
 *   {"Nombre Dist":"spreadsheetId",...}
 */

/** Mapa canónico nombre → spreadsheetId (como en Pipeline / tabla distributors). */
export const DEFAULT_DERIVED_DISTRIBUTOR_SHEETS: Record<string, string> = {
  "FELIPE AVINCETA": "19kty71fNjLCJVSUx8ZaQ67YGqHa5ZAlbCqnM-7qobYI",
  "GABASTOU JORGE ALBERTO": "1-iaH3jwslDUSl65SsNv6qB_dtD5Mt-D6ISoeUOD4Mgs",
  "NOVA ERA SA": "18MCF06P4rQyst8Nm7W3aR-IhPq3G_25JyKvruqZMfX0",
  "GudFud Distribuidora": "1wBk4t9JuXX64zaCUCMm7YX1MFVtRoyj94YJr3kt9W9E",
  "La Corona Alimentos": "1Q0KDRW2um-Ukl7ex6uXIjx_c8cY1Z-DD-DoE3y1ZRMU",
  Diprom: "1ESCf5fcXjf0CqHfv2vcgtlktuOL4DXDEvgQT0NWc50Q",
};

export function normalizeDistributorKey(name: string): string {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(distribuidora|distribuidor|alimentos|sa|s\.?a\.?|srl|sas)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseEnvMap(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    console.warn(
      "[sheets] GOOGLE_SHEET_DERIVED_BY_DISTRIBUTOR is not valid JSON",
    );
    return {};
  }
}

/**
 * Resuelve el spreadsheetId del sheet de ese distribuidor.
 * Sin match → null (no hay sheet “general” de fallback).
 */
export function resolveDerivedDistributorSheetId(
  distributorName: string,
  envJsonOverride?: string,
): { spreadsheetId: string; matchedAs: string } | null {
  const merged: Record<string, string> = {
    ...DEFAULT_DERIVED_DISTRIBUTOR_SHEETS,
    ...parseEnvMap(envJsonOverride),
  };

  const want = normalizeDistributorKey(distributorName);
  if (!want) return null;

  const entries = Object.entries(merged).map(([name, id]) => ({
    name,
    id,
    key: normalizeDistributorKey(name),
  }));

  const exact = entries.find((e) => e.key === want);
  if (exact) return { spreadsheetId: exact.id, matchedAs: exact.name };

  const fuzzy = entries.filter(
    (e) =>
      e.key.length >= 4 &&
      want.length >= 4 &&
      (e.key.includes(want) || want.includes(e.key)),
  );
  if (fuzzy.length === 1) {
    return { spreadsheetId: fuzzy[0]!.id, matchedAs: fuzzy[0]!.name };
  }

  return null;
}
