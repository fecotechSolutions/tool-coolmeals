const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

export class ApiHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

type ApiSuccess<T> = { data: T };
type ApiFailure = { error: { code: string; message: string } };

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem("coolmeals_session_token");
  } catch {
    return null;
  }
}

function clearToken(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("coolmeals_session_token");
    sessionStorage.removeItem("coolmeals_session_user");
  } catch {
    /* ignore */
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (INTERNAL_SECRET) {
    headers.set("x-internal-secret", INTERNAL_SECRET);
  }
  const token = readToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;

  if (!response.ok || "error" in payload) {
    if (response.status === 401 && typeof window !== "undefined") {
      const onLogin = window.location.pathname.startsWith("/login");
      clearToken();
      if (!onLogin) {
        const next = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        window.location.href = `/login?next=${next}`;
      }
    }
    const err = "error" in payload ? payload.error : null;
    throw new ApiHttpError(
      err?.message ?? "Request failed",
      response.status,
      err?.code,
    );
  }

  return payload.data;
}
