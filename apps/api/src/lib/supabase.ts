import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../env";

let client: SupabaseClient | null = null;

/** Service-role client. Bypasses RLS — keep server-only. */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const env = getEnv();
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}
