import { google } from "googleapis";
import { getEnv } from "../env";
import { getSupabase } from "./supabase";

export type SheetKind =
  | "derived_distributors"
  | "sample_logistics"
  | "commercial_attention"
  | "no_coverage";

type AppendResult = {
  attempted: boolean;
  success: boolean;
  spreadsheetId: string | null;
  mode?: "webhook" | "service_account" | "dry-run";
  error?: string;
};

type ServiceAccountCreds = {
  client_email: string;
  private_key: string;
};

function loadServiceAccount(): ServiceAccountCreds | null {
  const env = getEnv();

  if (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return {
      client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }

  const jsonRaw = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw) as {
        client_email?: string;
        private_key?: string;
      };
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
    } catch {
      console.warn("[sheets] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
  }

  return null;
}

async function getSheetsClient() {
  const creds = loadServiceAccount();
  if (!creds) return null;

  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  await auth.authorize();
  return google.sheets({ version: "v4", auth });
}

async function appendViaWebhook(
  kind: SheetKind,
  spreadsheetId: string,
  sheetName: string,
  row: string[],
): Promise<void> {
  const env = getEnv();
  const url = env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = env.GOOGLE_SHEETS_WEBHOOK_SECRET;

  if (!url || !secret) {
    throw new Error("Webhook URL/secret missing");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret,
      kind,
      spreadsheetId,
      sheetName,
      values: row,
    }),
  });

  const text = await res.text();
  let body: { ok?: boolean; error?: string } = {};
  try {
    body = JSON.parse(text) as { ok?: boolean; error?: string };
  } catch {
    // Apps Script sometimes returns plain text
  }

  if (!res.ok || body.ok === false) {
    throw new Error(
      body.error || `Webhook HTTP ${res.status}: ${text.slice(0, 300)}`,
    );
  }
}

async function appendViaServiceAccount(
  spreadsheetId: string,
  range: string,
  row: string[],
): Promise<void> {
  const sheets = await getSheetsClient();
  if (!sheets) throw new Error("Service account not configured");

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

/**
 * Append rows to Google Sheets.
 *
 * Preferido (sin service account keys — org policy safe):
 *   Google Apps Script Web App → GOOGLE_SHEETS_WEBHOOK_URL + SECRET
 *
 * Alternativa (si el admin habilita keys):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL + PRIVATE_KEY
 *
 * Columnas:
 * - derived: fecha | nombre | teléfono | empresa | tipo negocio | client_type | provincia | ciudad | CP | distribuidor | seguimiento
 * - samples: fecha | Nombre y Apellido | Teléfono | Domicilio
 * - commercial_attention: fecha | nombre | teléfono | empresa | tipo_cliente (distribuidor|representante|fason) | provincia | ciudad | motivo | seguimiento
 * - no_coverage: fecha | nombre | teléfono | empresa | provincia | ciudad | client_type | motivo | seguimiento
 */
export async function appendSheetRow(
  kind: SheetKind,
  entityType: string,
  entityId: string | null,
  values: (string | number | null | undefined)[],
  payload: Record<string, unknown>,
): Promise<AppendResult> {
  const env = getEnv();
  const spreadsheetId =
    kind === "derived_distributors"
      ? env.GOOGLE_SHEET_DERIVED_DISTRIBUTORS_ID
      : kind === "sample_logistics"
        ? env.GOOGLE_SHEET_SAMPLE_LOGISTICS_ID
        : kind === "commercial_attention"
          ? env.GOOGLE_SHEET_COMMERCIAL_ATTENTION_ID
          : kind === "no_coverage"
            ? env.GOOGLE_SHEET_NO_COVERAGE_ID
            : undefined;

  if (!spreadsheetId) {
    await logSync(kind, "", entityType, entityId, payload, false, "Missing spreadsheet id");
    return {
      attempted: false,
      success: false,
      spreadsheetId: null,
      error: "Missing spreadsheet id in env",
    };
  }

  const row = values.map((v) => (v === null || v === undefined ? "" : String(v)));
  const sheetName = env.GOOGLE_SHEETS_RANGE || "Sheet1";
  const hasWebhook = Boolean(
    env.GOOGLE_SHEETS_WEBHOOK_URL && env.GOOGLE_SHEETS_WEBHOOK_SECRET,
  );
  const hasSa = Boolean(loadServiceAccount());

  if (!hasWebhook && !hasSa) {
    console.info(`[sheets] dry-run ${kind}`, { spreadsheetId, row });
    await logSync(
      kind,
      spreadsheetId,
      entityType,
      entityId,
      { ...payload, values: row, mode: "dry-run" },
      false,
      "Dry-run: configure GOOGLE_SHEETS_WEBHOOK_URL or service account",
    );
    return {
      attempted: true,
      success: false,
      spreadsheetId,
      mode: "dry-run",
      error:
        "Dry-run: falta webhook Apps Script o service account. Ver scripts/google-sheets-append.gs",
    };
  }

  try {
    let mode: "webhook" | "service_account";

    if (hasWebhook) {
      await appendViaWebhook(kind, spreadsheetId, sheetName, row);
      mode = "webhook";
    } else {
      await appendViaServiceAccount(spreadsheetId, sheetName, row);
      mode = "service_account";
    }

    await logSync(
      kind,
      spreadsheetId,
      entityType,
      entityId,
      { ...payload, values: row, mode },
      true,
    );

    return {
      attempted: true,
      success: true,
      spreadsheetId,
      mode,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sheets error";
    console.warn(`[sheets] ${kind}`, message, row);
    await logSync(
      kind,
      spreadsheetId,
      entityType,
      entityId,
      { ...payload, values: row },
      false,
      message,
    );
    return {
      attempted: true,
      success: false,
      spreadsheetId,
      error: message,
    };
  }
}

async function logSync(
  kind: SheetKind,
  spreadsheetId: string,
  entityType: string,
  entityId: string | null,
  payload: Record<string, unknown>,
  success: boolean,
  errorMessage?: string,
) {
  try {
    const supabase = getSupabase();
    await supabase.from("sheet_sync_log").insert({
      kind,
      spreadsheet_id: spreadsheetId || "unset",
      entity_type: entityType,
      entity_id: entityId,
      payload,
      success,
      error_message: errorMessage ?? null,
    });
  } catch (err) {
    console.warn("[sheets] failed to write sheet_sync_log", err);
  }
}

export function derivedLeadSheetRow(input: {
  fullName: string;
  phone: string;
  company?: string | null;
  businessType?: string;
  clientType: string;
  province: string;
  city?: string;
  postalCode?: string;
  distributorName: string;
  date?: string;
}): (string | number)[] {
  return [
    input.date ?? new Date().toISOString().slice(0, 10),
    input.fullName,
    input.phone,
    input.company ?? "",
    input.businessType ?? "",
    input.clientType,
    input.province,
    input.city ?? "",
    input.postalCode ?? "",
    input.distributorName,
    "", // seguimiento interno
  ];
}

/** Exactamente los 3 datos pedidos para logística + fecha. */
export function sampleLogisticsSheetRow(input: {
  fullName: string;
  phone: string;
  address: string;
  date?: string;
}): (string | number)[] {
  return [
    input.date ?? new Date().toISOString().slice(0, 10),
    input.fullName,
    input.phone,
    input.address,
  ];
}

/**
 * Tercer feedback: un sheet para posibles dist / rep / fasón.
 * tipoCliente debe ser uno de: distribuidor | representante | fason
 */
export function commercialAttentionSheetRow(input: {
  fullName: string;
  phone: string;
  company?: string | null;
  tipoCliente: "distribuidor" | "representante" | "fason" | string;
  province: string;
  city?: string;
  reason?: string;
  date?: string;
}): (string | number)[] {
  return [
    input.date ?? new Date().toISOString().slice(0, 10),
    input.fullName,
    input.phone,
    input.company ?? "",
    input.tipoCliente,
    input.province,
    input.city ?? "",
    input.reason ?? "",
    "", // seguimiento
  ];
}

/** Tercer feedback: sin cobertura — datos para recontactar cuando haya zona. */
export function noCoverageSheetRow(input: {
  fullName: string;
  phone: string;
  company?: string | null;
  province: string;
  city?: string;
  clientType?: string;
  reason?: string;
  date?: string;
}): (string | number)[] {
  return [
    input.date ?? new Date().toISOString().slice(0, 10),
    input.fullName,
    input.phone,
    input.company ?? "",
    input.province,
    input.city ?? "",
    input.clientType ?? "",
    input.reason ?? "",
    "", // seguimiento
  ];
}
