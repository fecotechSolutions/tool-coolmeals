/**
 * Entorno de producto (visible en UI).
 * Independiente de NEXT_PUBLIC_DEMO_MODE (mocks) y de NODE_ENV.
 */
export type AppEnv = "development" | "staging" | "production";

const raw = (process.env.NEXT_PUBLIC_APP_ENV ?? "development").toLowerCase();

export const APP_ENV: AppEnv =
  raw === "production" || raw === "prod"
    ? "production"
    : raw === "staging" || raw === "preview"
      ? "staging"
      : "development";

export const APP_ENV_LABEL: Record<AppEnv, string> = {
  development: "DEV",
  staging: "STAGING",
  production: "PROD",
};
