const SESSION_KEY = "coolmeals_session_token";
const USER_KEY = "coolmeals_session_user";

export type AuthUser = {
  id?: string;
  email: string;
  role: "superadmin" | "admin";
  mustChangePassword?: boolean;
};

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SESSION_KEY);
}

export function getSessionUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser): void {
  sessionStorage.setItem(SESSION_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(USER_KEY);
}
