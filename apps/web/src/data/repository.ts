/**
 * Data access layer.
 * - NEXT_PUBLIC_DEMO_MODE !== "false" → mocks in-memory (UI demo)
 * - DEMO_MODE=false → calls Hono API → Supabase
 */

import {
  buildCommercialDashboard,
  buildExecutiveDashboard,
  mockCommercialSettings,
  mockConversations,
  mockDistributors,
  mockKnowledge,
  mockLeads,
  mockPrompt,
} from "@/data/mock";
import { apiRequest } from "@/lib/http";
import type {
  CommercialDashboard,
  CommercialSettings,
  Conversation,
  ConversationStatus,
  Distributor,
  ExecutiveDashboard,
  KnowledgeArticle,
  Lead,
  PromptConfig,
  SampleRequest,
} from "@/domain/types";

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

type Store = {
  distributors: Distributor[];
  leads: Lead[];
  conversations: Conversation[];
  commercial: CommercialSettings;
  knowledge: KnowledgeArticle[];
  prompt: PromptConfig;
};

const store: Store = {
  distributors: structuredClone(mockDistributors),
  leads: structuredClone(mockLeads),
  conversations: structuredClone(mockConversations),
  commercial: structuredClone(mockCommercialSettings),
  knowledge: structuredClone(mockKnowledge),
  prompt: structuredClone(mockPrompt),
};

const delay = async () => {
  if (typeof window !== "undefined") {
    await new Promise((r) => setTimeout(r, 80));
  }
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const mockApi = {
  async getDashboard(params?: { from?: string; to?: string }): Promise<{
    executive: ExecutiveDashboard;
    commercial: CommercialDashboard;
    period?: { from: string; to: string };
  }> {
    await delay();
    const now = new Date();
    const to = params?.to ?? now.toISOString().slice(0, 10);
    const from =
      params?.from ??
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
        .toISOString()
        .slice(0, 10);
    const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
    const toMs = new Date(`${to}T23:59:59.999Z`).getTime();
    const conversations = store.conversations.filter((c) => {
      const t = new Date(c.createdAt).getTime();
      return t >= fromMs && t <= toMs;
    });
    return {
      period: { from, to },
      executive: buildExecutiveDashboard(conversations),
      commercial: buildCommercialDashboard(conversations, store.distributors),
    };
  },

  async listConversations(): Promise<Conversation[]> {
    await delay();
    return structuredClone(store.conversations).sort(
      (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt),
    );
  },

  async getConversation(id: string): Promise<Conversation | null> {
    await delay();
    return structuredClone(store.conversations.find((c) => c.id === id) ?? null);
  },

  async updateConversation(
    id: string,
    patch: Partial<
      Pick<
        Conversation,
        | "status"
        | "notes"
        | "assignedTo"
        | "aiSummary"
        | "tags"
        | "distributorId"
        | "isCustomer"
      >
    >,
  ): Promise<Conversation | null> {
    await delay();
    const idx = store.conversations.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    const current = store.conversations[idx]!;
    store.conversations[idx] = {
      ...current,
      ...patch,
      tags: patch.tags ?? current.tags ?? [],
      updatedAt: new Date().toISOString(),
    };
    return structuredClone(store.conversations[idx]!);
  },

  async handoffConversation(
    id: string,
    reason = "Atención humana desde Pipeline",
    status:
      | "atencion_representante"
      | "quiere_ser_distribuidor"
      | "quiere_ser_representante"
      | "quiere_ser_fason"
      | "sin_cobertura" = "atencion_representante",
  ): Promise<Conversation | null> {
    await delay();
    const idx = store.conversations.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    const current = store.conversations[idx]!;
    store.conversations[idx] = {
      ...current,
      status,
      tags: Array.from(
        new Set([
          ...(current.tags ?? []).filter(
            (tag) => tag !== "#atendido_por_representante",
          ),
          ...(status === "sin_cobertura" ? [] : ["#atencion_humana"]),
        ]),
      ),
      assignedTo: current.assignedTo ?? "admin@coolmeals.com",
      notes: [current.notes, `Handoff: ${reason}`].filter(Boolean).join("\n"),
      updatedAt: new Date().toISOString(),
    };
    return structuredClone(store.conversations[idx]!);
  },

  async listLeads(): Promise<Lead[]> {
    await delay();
    return structuredClone(store.leads).sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  },

  async upsertLead(
    input: Omit<Lead, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ) {
    await delay();
    const now = new Date().toISOString();
    if (input.id) {
      const idx = store.leads.findIndex((l) => l.id === input.id);
      if (idx >= 0) {
        store.leads[idx] = { ...store.leads[idx]!, ...input, updatedAt: now };
        return structuredClone(store.leads[idx]!);
      }
    }
    const lead: Lead = {
      ...input,
      id: input.id ?? uid("lead"),
      createdAt: now,
      updatedAt: now,
    };
    store.leads.unshift(lead);
    return structuredClone(lead);
  },

  async listDistributors(): Promise<Distributor[]> {
    await delay();
    return structuredClone(store.distributors);
  },

  async upsertDistributor(
    input: Omit<Distributor, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ) {
    await delay();
    const now = new Date().toISOString();
    if (input.id) {
      const idx = store.distributors.findIndex((d) => d.id === input.id);
      if (idx >= 0) {
        store.distributors[idx] = {
          ...store.distributors[idx]!,
          ...input,
          updatedAt: now,
        };
        return structuredClone(store.distributors[idx]!);
      }
    }
    const row: Distributor = {
      ...input,
      id: input.id ?? uid("dist"),
      createdAt: now,
      updatedAt: now,
    };
    store.distributors.unshift(row);
    return structuredClone(row);
  },

  async deleteDistributor(id: string) {
    await delay();
    store.distributors = store.distributors.filter((d) => d.id !== id);
  },

  async getCommercial(): Promise<CommercialSettings> {
    await delay();
    return structuredClone(store.commercial);
  },

  async saveCommercial(next: CommercialSettings) {
    await delay();
    store.commercial = {
      ...structuredClone(next),
      rules: next.rules.map((r) => ({
        ...r,
        updatedAt: new Date().toISOString(),
      })),
    };
    return structuredClone(store.commercial);
  },

  async listKnowledge(): Promise<KnowledgeArticle[]> {
    await delay();
    return structuredClone(store.knowledge);
  },

  async upsertKnowledge(
    input: Omit<KnowledgeArticle, "id" | "updatedAt"> & { id?: string },
  ) {
    await delay();
    const now = new Date().toISOString();
    if (input.id) {
      const idx = store.knowledge.findIndex((k) => k.id === input.id);
      if (idx >= 0) {
        store.knowledge[idx] = {
          ...store.knowledge[idx]!,
          ...input,
          updatedAt: now,
        };
        return structuredClone(store.knowledge[idx]!);
      }
    }
    const row: KnowledgeArticle = {
      ...input,
      id: input.id ?? uid("kb"),
      updatedAt: now,
    };
    store.knowledge.unshift(row);
    return structuredClone(row);
  },

  async deleteKnowledge(id: string) {
    await delay();
    store.knowledge = store.knowledge.filter((k) => k.id !== id);
  },

  async getPrompt(): Promise<PromptConfig> {
    await delay();
    return structuredClone(store.prompt);
  },

  async savePrompt(patch: Omit<PromptConfig, "id" | "updatedAt"> & { id?: string }) {
    await delay();
    store.prompt = {
      ...store.prompt,
      ...patch,
      id: store.prompt.id,
      updatedAt: new Date().toISOString(),
    };
    return structuredClone(store.prompt);
  },

  async listSamples(): Promise<SampleRequest[]> {
    await delay();
    return [];
  },

  async updateSample(
    id: string,
    patch: { status?: SampleRequest["status"]; notes?: string },
  ): Promise<SampleRequest | null> {
    await delay();
    void id;
    void patch;
    return null;
  },
};

const liveApi = {
  async getDashboard(params?: { from?: string; to?: string }) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiRequest<{
      executive: ExecutiveDashboard;
      commercial: CommercialDashboard;
      period?: { from: string; to: string };
    }>(`/dashboard${suffix}`);
  },

  async listConversations() {
    return apiRequest<Conversation[]>("/conversations");
  },

  async getConversation(id: string) {
    try {
      return await apiRequest<Conversation>(`/conversations/${id}`);
    } catch {
      return null;
    }
  },

  async updateConversation(
    id: string,
    patch: Parameters<typeof mockApi.updateConversation>[1],
  ) {
    return apiRequest<Conversation>(`/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  async handoffConversation(
    id: string,
    reason = "Atención humana desde Pipeline",
    status:
      | "atencion_representante"
      | "quiere_ser_distribuidor"
      | "quiere_ser_representante"
      | "quiere_ser_fason"
      | "sin_cobertura" = "atencion_representante",
  ) {
    const res = await apiRequest<{
      conversation: Conversation;
      handoff: { sameNumber: boolean; kapso?: { ok: boolean; error?: string } };
    }>("/bot/handoff", {
      method: "POST",
      body: JSON.stringify({ conversationId: id, reason, status }),
    });
    return res.conversation;
  },

  async listLeads() {
    const res = await apiRequest<{
      items: Lead[];
      total: number;
      limit: number;
      offset: number;
    }>("/leads?limit=100");
    return res.items;
  },

  async upsertLead(input: Parameters<typeof mockApi.upsertLead>[0]) {
    if (input.id) {
      return apiRequest<Lead>(`/leads/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    }
    return apiRequest<Lead>("/leads", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async listDistributors() {
    return apiRequest<Distributor[]>("/distributors");
  },

  async upsertDistributor(
    input: Parameters<typeof mockApi.upsertDistributor>[0],
  ) {
    if (input.id) {
      return apiRequest<Distributor>(`/distributors/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    }
    return apiRequest<Distributor>("/distributors", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async deleteDistributor(id: string) {
    await apiRequest<{ id: string }>(`/distributors/${id}`, {
      method: "DELETE",
    });
  },

  async getCommercial() {
    return apiRequest<CommercialSettings>("/commercial");
  },

  async saveCommercial(next: CommercialSettings) {
    return apiRequest<CommercialSettings>("/commercial", {
      method: "PUT",
      body: JSON.stringify(next),
    });
  },

  async listKnowledge() {
    return apiRequest<KnowledgeArticle[]>("/knowledge");
  },

  async upsertKnowledge(
    input: Parameters<typeof mockApi.upsertKnowledge>[0],
  ) {
    if (input.id) {
      return apiRequest<KnowledgeArticle>(`/knowledge/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    }
    return apiRequest<KnowledgeArticle>("/knowledge", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async deleteKnowledge(id: string) {
    await apiRequest<{ id: string }>(`/knowledge/${id}`, {
      method: "DELETE",
    });
  },

  async getPrompt() {
    return apiRequest<PromptConfig>("/prompts");
  },

  async savePrompt(patch: Parameters<typeof mockApi.savePrompt>[0]) {
    return apiRequest<PromptConfig>("/prompts", {
      method: "PUT",
      body: JSON.stringify(patch),
    });
  },

  async listSamples() {
    return apiRequest<SampleRequest[]>("/samples");
  },

  async updateSample(
    id: string,
    patch: { status?: SampleRequest["status"]; notes?: string },
  ) {
    return apiRequest<SampleRequest>(`/samples/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
};

export const dataApi = DEMO_MODE ? mockApi : liveApi;

export type ConversationStatusUpdate = ConversationStatus;
