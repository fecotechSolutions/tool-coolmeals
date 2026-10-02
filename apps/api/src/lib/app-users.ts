import { getEnv } from "../env";
import { hashPassword, normalizeEmail } from "./password";
import { getSupabase } from "./supabase";

export type AppUserRole = "superadmin" | "admin";

export type AppUserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: AppUserRole;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
};

export async function findUserByEmail(
  email: string,
): Promise<AppUserRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("email", normalizeEmail(email))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AppUserRow | null) ?? null;
}

export async function findUserById(id: string): Promise<AppUserRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AppUserRow | null) ?? null;
}

export async function countUsers(): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("app_users")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countSuperadmins(): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "superadmin");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Si no hay usuarios, crea el primer superadmin desde SUPERADMIN_* del env.
 */
export async function ensureBootstrapSuperadmin(): Promise<void> {
  const n = await countUsers();
  if (n > 0) return;

  const env = getEnv();
  const passwordHash = await hashPassword(env.SUPERADMIN_PASSWORD);
  const supabase = getSupabase();
  const { error } = await supabase.from("app_users").insert({
    email: normalizeEmail(env.SUPERADMIN_EMAIL),
    password_hash: passwordHash,
    role: "superadmin",
    active: true,
    must_change_password: false,
  });
  if (error) throw new Error(`Bootstrap superadmin: ${error.message}`);
  console.warn(
    `[auth] Bootstrap: creado superadmin ${env.SUPERADMIN_EMAIL} (tabla vacía)`,
  );
}

export async function listAppUsers(): Promise<AppUserRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as AppUserRow[]) ?? [];
}

export async function createAppUser(input: {
  email: string;
  password: string;
  role?: AppUserRole;
  mustChangePassword?: boolean;
}): Promise<AppUserRow> {
  const role = input.role ?? "admin";
  if (role === "superadmin") {
    const n = await countSuperadmins();
    if (n >= 1) {
      throw new Error("Solo puede existir un superadmin");
    }
  }

  const passwordHash = await hashPassword(input.password);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("app_users")
    .insert({
      email: normalizeEmail(input.email),
      password_hash: passwordHash,
      role,
      active: true,
      must_change_password: input.mustChangePassword ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as AppUserRow;
}

export async function deleteAppUser(userId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("app_users").delete().eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function updateUserPassword(
  userId: string,
  passwordHash: string,
  clearMustChange: boolean,
): Promise<void> {
  const supabase = getSupabase();
  const patch: Record<string, unknown> = { password_hash: passwordHash };
  if (clearMustChange) patch.must_change_password = false;
  const { error } = await supabase
    .from("app_users")
    .update(patch)
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function saveResetToken(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  const supabase = getSupabase();
  // Invalida tokens previos sin usar
  await supabase
    .from("password_reset_tokens")
    .delete()
    .eq("user_id", input.userId)
    .is("used_at", null);

  const { error } = await supabase.from("password_reset_tokens").insert({
    user_id: input.userId,
    token_hash: input.tokenHash,
    expires_at: input.expiresAt.toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function consumeResetToken(
  tokenHash: string,
): Promise<{ userId: string } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.used_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  const { error: updErr } = await supabase
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id);
  if (updErr) throw new Error(updErr.message);

  return { userId: data.user_id as string };
}

export function publicUser(row: AppUserRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    mustChangePassword: row.must_change_password,
  };
}
