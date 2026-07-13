/**
 * Data access layer.
 * Today: in-memory mock (DEMO_MODE).
 * Later: swap implementations to call the Hono API without changing pages.
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
    await new Promise((r) => setTimeout(r, 120));
  }
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export const dataApi = {
  async getDashboard(): Promise<{
    executive: ExecutiveDashboard;
    commercial: CommercialDashboard;
  }> {
    await delay();
    return {
      executive: buildExecutiveDashboard(store.leads, store.conversations),
      commercial: buildCommercialDashboard(
        store.leads,
        store.conversations,
        store.distributors,
      ),
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

  async listLeads(): Promise<Lead[]> {
    await delay();
    return structuredClone(store.leads).sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  },

  async upsertLead(input: Omit<Lead, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
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
        store.knowledge[idx] = { ...store.knowledge[idx]!, ...input, updatedAt: now };
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
};

export type ConversationStatusUpdate = ConversationStatus;
