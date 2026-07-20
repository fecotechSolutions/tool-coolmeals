-- Phase 0 — bot foundation: status/types, Kapso ids, commercial, samples

-- ---------------------------------------------------------------------------
-- Enum extensions
-- ---------------------------------------------------------------------------
alter type public.client_type add value if not exists 'otro';
alter type public.conversation_status add value if not exists 'sin_cobertura';

-- ---------------------------------------------------------------------------
-- Conversations: Kapso + routing metadata
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists kapso_conversation_id text,
  add column if not exists kapso_execution_id text,
  add column if not exists estimated_volume integer,
  add column if not exists outcome text,
  add column if not exists human_handoff_at timestamptz;

create index if not exists conversations_phone_idx
  on public.conversations (phone);

create index if not exists conversations_kapso_conversation_id_idx
  on public.conversations (kapso_conversation_id);

-- ---------------------------------------------------------------------------
-- Commercial settings (single active row expected)
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_settings (
  id uuid primary key default gen_random_uuid(),
  min_bundles_default integer not null default 50
    check (min_bundles_default > 0),
  province_distributor_map jsonb not null default '[]'::jsonb,
  rules jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.commercial_settings enable row level security;

create trigger commercial_settings_set_updated_at
  before update on public.commercial_settings
  for each row execute function public.set_updated_at();

insert into public.commercial_settings (min_bundles_default, province_distributor_map, rules)
select 50, '[]'::jsonb, '[]'::jsonb
where not exists (select 1 from public.commercial_settings);

-- ---------------------------------------------------------------------------
-- Sample requests (logística de muestras)
-- Datos mínimos: Nombre y Apellido, Teléfono, Domicilio
-- ---------------------------------------------------------------------------
create type public.sample_request_status as enum (
  'pendiente',
  'enviado',
  'entregado',
  'cancelado'
);

create table if not exists public.sample_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  full_name text not null,
  phone text not null,
  address text not null,
  city text not null default '',
  province text not null default '',
  postal_code text not null default '',
  status public.sample_request_status not null default 'pendiente',
  sheet_synced_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sample_requests_status_idx
  on public.sample_requests (status);
create index if not exists sample_requests_created_at_idx
  on public.sample_requests (created_at desc);

alter table public.sample_requests enable row level security;

create trigger sample_requests_set_updated_at
  before update on public.sample_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sheet sync log (auditoría de append a Google Sheets)
-- ---------------------------------------------------------------------------
create type public.sheet_kind as enum (
  'derived_distributors',
  'sample_logistics'
);

create table if not exists public.sheet_sync_log (
  id uuid primary key default gen_random_uuid(),
  kind public.sheet_kind not null,
  spreadsheet_id text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  success boolean not null default false,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.sheet_sync_log enable row level security;
