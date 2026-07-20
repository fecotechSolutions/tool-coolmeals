import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  /** Optional gate until Supabase Auth is wired. */
  INTERNAL_API_SECRET: z.string().min(8).optional(),

  /** Kapso (WhatsApp automation) */
  KAPSO_API_BASE_URL: z.string().url().optional(),
  KAPSO_API_KEY: z.string().min(1).optional(),
  KAPSO_PHONE_NUMBER_ID: z.string().min(1).optional(),
  /** Workflow coolmeals-leads — usado para localizar ejecuciones y hacer handoff */
  KAPSO_WORKFLOW_ID: z.string().uuid().optional(),
  /**
   * Horas en handoff tras derivar / atención humana, antes de ended + Finalizado.
   * Default 24.
   */
  DERIVE_HANDOFF_HOURS: z.coerce.number().positive().default(24),
  /**
   * Inactividad mid-flujo (IA esperando al lead) → columna Esperando respuesta + mensaje + handoff.
   * Default 22.
   */
  ABANDONED_TO_WAITING_HOURS: z.coerce.number().positive().default(22),
  /**
   * Tras ese handoff en Esperando respuesta → Finalizado + ended.
   * Default 22.
   */
  ESPERANDO_TO_FINALIZE_HOURS: z.coerce.number().positive().default(22),
  /** Bearer/token para /api/cron/* (Vercel Cron o curl local). */
  CRON_SECRET: z.string().min(8).optional(),

  /**
   * Google Sheets — set in `.env`. No production IDs hardcoded in source.
   */
  GOOGLE_SHEET_DERIVED_DISTRIBUTORS_ID: z.string().min(1).optional(),
  GOOGLE_SHEET_SAMPLE_LOGISTICS_ID: z.string().min(1).optional(),
  /** Interés comercial: quiere ser dist / rep / fasón (columna tipo_cliente). */
  GOOGLE_SHEET_COMMERCIAL_ATTENTION_ID: z.string().min(1).optional(),
  /** Leads sin cobertura (para recontactar cuando haya zona). */
  GOOGLE_SHEET_NO_COVERAGE_ID: z.string().min(1).optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  /** Alternativa: pegar el JSON completo de la key en una sola línea. */
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  /** Pestaña/rango, ej. Sheet1 o "Hoja 1" */
  GOOGLE_SHEETS_RANGE: z.string().default("Sheet1"),

  /**
   * Preferido si la org bloquea SA keys (iam.managed.disableServiceAccountKeyCreation):
   * Web App de Apps Script — ver scripts/google-sheets-append.gs
   */
  GOOGLE_SHEETS_WEBHOOK_URL: z.string().url().optional(),
  GOOGLE_SHEETS_WEBHOOK_SECRET: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid API environment: ${message}`);
  }

  cached = parsed.data;
  return cached;
}
