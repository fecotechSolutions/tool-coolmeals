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

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (INTERNAL_SECRET) {
    headers.set("x-internal-secret", INTERNAL_SECRET);
  }

  const response = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;

  if (!response.ok || "error" in payload) {
    const err = "error" in payload ? payload.error : null;
    throw new ApiHttpError(
      err?.message ?? "Request failed",
      response.status,
      err?.code,
    );
  }

  return payload.data;
}
