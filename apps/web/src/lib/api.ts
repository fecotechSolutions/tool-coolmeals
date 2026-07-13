const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type ApiSuccess<T> = { data: T };
type ApiFailure = {
  error: { code: string; message: string; details?: unknown };
};

async function request<T>(
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
    throw new ApiClientError(
      err?.message ?? "Request failed",
      response.status,
      err?.code,
      err?.details,
    );
  }

  return payload.data;
}

export type LeadListResult = {
  items: import("@coolmeals/shared").Lead[];
  total: number;
  limit: number;
  offset: number;
};

export const api = {
  health: () =>
    request<{ status: string; service: string; timestamp: string }>("/health"),

  listLeads: (params?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.search) query.set("search", params.search);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return request<LeadListResult>(`/leads${qs ? `?${qs}` : ""}`);
  },

  getLead: (id: string) =>
    request<import("@coolmeals/shared").Lead>(`/leads/${id}`),

  createLead: (body: import("@coolmeals/shared").CreateLeadInput) =>
    request<import("@coolmeals/shared").Lead>("/leads", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateLead: (
    id: string,
    body: import("@coolmeals/shared").UpdateLeadInput,
  ) =>
    request<import("@coolmeals/shared").Lead>(`/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteLead: (id: string) =>
    request<{ id: string }>(`/leads/${id}`, { method: "DELETE" }),
};
