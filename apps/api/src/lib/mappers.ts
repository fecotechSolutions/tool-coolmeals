import type { SupabaseClient } from "@supabase/supabase-js";

export type DbDistributor = {
  id: string;
  name: string;
  province: string;
  zones: string[];
  contact_name: string;
  whatsapp: string;
  email: string;
  active: boolean;
  covered_provinces: string[];
  postal_codes: string[];
  created_at: string;
  updated_at: string;
};

export type DbLead = {
  id: string;
  full_name: string;
  company: string | null;
  phone: string;
  email: string | null;
  province: string;
  city: string;
  postal_code: string;
  business_type: string;
  client_type: string;
  distributor_id: string | null;
  origin: string;
  status: string;
  is_customer: boolean;
  created_at: string;
  updated_at: string;
};

export type DbConversation = {
  id: string;
  lead_id: string | null;
  name: string;
  phone: string;
  origin: string;
  status: string;
  client_type: string;
  province: string;
  distributor_id: string | null;
  ai_summary: string;
  last_message: string;
  notes: string;
  tags: string[];
  assigned_to: string | null;
  is_customer: boolean;
  messages: unknown;
  kapso_conversation_id?: string | null;
  kapso_execution_id?: string | null;
  estimated_volume?: number | null;
  outcome?: string | null;
  human_handoff_at?: string | null;
  derived_at?: string | null;
  finalize_at?: string | null;
  created_at: string;
  updated_at: string;
};

export function mapDistributor(row: DbDistributor) {
  return {
    id: row.id,
    name: row.name,
    province: row.province,
    zones: row.zones ?? [],
    contactName: row.contact_name,
    whatsapp: row.whatsapp,
    email: row.email,
    active: row.active,
    coveredProvinces: row.covered_provinces ?? [],
    postalCodes: row.postal_codes ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapLead(row: DbLead) {
  return {
    id: row.id,
    fullName: row.full_name,
    company: row.company,
    phone: row.phone,
    email: row.email,
    province: row.province,
    city: row.city,
    postalCode: row.postal_code,
    businessType: row.business_type,
    clientType: row.client_type,
    distributorId: row.distributor_id,
    origin: row.origin,
    status: row.status,
    isCustomer: row.is_customer,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapConversation(row: DbConversation) {
  return {
    id: row.id,
    leadId: row.lead_id ?? "",
    name: row.name,
    phone: row.phone,
    origin: row.origin,
    status: row.status,
    clientType: row.client_type,
    province: row.province,
    distributorId: row.distributor_id,
    aiSummary: row.ai_summary,
    lastMessage: row.last_message,
    notes: row.notes,
    tags: row.tags ?? [],
    assignedTo: row.assigned_to,
    isCustomer: row.is_customer,
    messages: Array.isArray(row.messages) ? row.messages : [],
    kapsoConversationId: row.kapso_conversation_id ?? null,
    kapsoExecutionId: row.kapso_execution_id ?? null,
    estimatedVolume: row.estimated_volume ?? null,
    outcome: row.outcome ?? null,
    humanHandoffAt: row.human_handoff_at ?? null,
    derivedAt: row.derived_at ?? null,
    finalizeAt: row.finalize_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type AppSupabase = SupabaseClient;
