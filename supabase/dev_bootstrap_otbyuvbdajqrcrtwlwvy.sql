-- Cool Meals DEV bootstrap — project otbyuvbdajqrcrtwlwvy
-- Paste entire file in Supabase SQL Editor → Run
-- Generated 2026-09-03T11:46Z


-- ========== 20260713000000_initial_schema.sql ==========

-- Cool Meals Leads — schema MVP (pipeline + comercial)
-- Fresh project: run this in Supabase SQL Editor or supabase db push

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('superadmin', 'admin');

create type public.client_type as enum (
  'mayorista',
  'minorista',
  'retail',
  'representante',
  'distribuidor',
  'fason',
  'otro'
);

create type public.lead_origin as enum (
  'whatsapp',
  'web',
  'instagram',
  'referido',
  'llamada',
  'otro'
);

create type public.lead_estado as enum (
  'nuevo',
  'en_curso',
  'calificado',
  'derivado',
  'pedido',
  'muestras',
  'ganado',
  'perdido'
);

create type public.conversation_status as enum (
  'nuevo',
  'ia_atendiendo',
  'esperando_respuesta',
  'atencion_representante',
  'quiere_ser_distribuidor',
  'derivado',
  'derivado_distribuidor',
  'sin_cobertura',
  'muestras',
  'pedido_lead',
  'pedido_cliente',
  'finalizado',
  'descartado'
);

-- ---------------------------------------------------------------------------
-- Profiles (Auth TBD)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  role public.user_role not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_format check (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- Distributors (red comercial)
-- ---------------------------------------------------------------------------
create table public.distributors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  province text not null,
  zones text[] not null default '{}',
  contact_name text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  active boolean not null default true,
  covered_provinces text[] not null default '{}',
  postal_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index distributors_active_idx on public.distributors (active);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  company text,
  phone text not null default '',
  email text,
  province text not null,
  city text not null default '',
  postal_code text not null default '',
  business_type text not null default '',
  client_type public.client_type not null default 'minorista',
  distributor_id uuid references public.distributors (id) on delete set null,
  origin public.lead_origin not null default 'otro',
  status public.lead_estado not null default 'nuevo',
  is_customer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_client_type_idx on public.leads (client_type);
create index leads_status_idx on public.leads (status);
create index leads_created_at_idx on public.leads (created_at desc);

-- ---------------------------------------------------------------------------
-- Conversations (pipeline cards)
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id) on delete set null,
  name text not null,
  phone text not null default '',
  origin public.lead_origin not null default 'otro',
  status public.conversation_status not null default 'nuevo',
  client_type public.client_type not null default 'minorista',
  province text not null,
  distributor_id uuid references public.distributors (id) on delete set null,
  ai_summary text not null default '',
  last_message text not null default '',
  notes text not null default '',
  tags text[] not null default '{}',
  assigned_to text,
  is_customer boolean not null default false,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_status_idx on public.conversations (status);
create index conversations_distributor_id_idx on public.conversations (distributor_id);
create index conversations_updated_at_idx on public.conversations (updated_at desc);

-- ---------------------------------------------------------------------------
-- Knowledge + Prompt (config)
-- ---------------------------------------------------------------------------
create table public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  content text not null default '',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.prompt_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  personality text not null default '',
  tone text not null default '',
  objectives text not null default '',
  restrictions text not null default '',
  flows text not null default '',
  rules text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger distributors_set_updated_at
  before update on public.distributors
  for each row execute function public.set_updated_at();

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — service role (API) bypasses; no public access
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.distributors enable row level security;
alter table public.leads enable row level security;
alter table public.conversations enable row level security;
alter table public.knowledge_articles enable row level security;
alter table public.prompt_configs enable row level security;


-- ========== 20260719000000_phase0_bot_foundation.sql ==========

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


-- ========== 20260720000000_derive_handoff_window.sql ==========

-- Derive handoff window: keep Kapso in handoff for 24h, then finalize.

alter table public.conversations
  add column if not exists derived_at timestamptz,
  add column if not exists finalize_at timestamptz;

create index if not exists conversations_finalize_at_idx
  on public.conversations (finalize_at)
  where finalize_at is not null and status = 'derivado_distribuidor';


-- ========== 20260720140000_quiere_ser_representante_fason.sql ==========

-- Columnas Pipeline: interés representante / fasón (handoff comercial)
alter type public.conversation_status add value if not exists 'quiere_ser_representante';
alter type public.conversation_status add value if not exists 'quiere_ser_fason';


-- ========== 20260724120000_sample_request_extra_fields.sql ==========

-- Sample requests: campos extra para logística de envío
alter table public.sample_requests
  add column if not exists company text not null default '',
  add column if not exists dni text not null default '',
  add column if not exists email text not null default '';

comment on column public.sample_requests.address is 'Dirección completa de envío';
comment on column public.sample_requests.company is 'Empresa / razón social';
comment on column public.sample_requests.dni is 'DNI / documento';
comment on column public.sample_requests.email is 'Correo electrónico';


-- ========== seed (optional demo data) ==========

-- Optional seed for demo data after running the schema migration.
-- Paste in Supabase SQL Editor.

insert into public.distributors (id, name, province, zones, contact_name, whatsapp, email, active, covered_provinces, postal_codes)
values
  ('11111111-1111-1111-1111-111111111111', 'Distribuidora Norte SA', 'Córdoba', array['Capital','Interior norte'], 'Laura Méndez', '+54 351 555-0101', 'laura@norte.com.ar', true, array['Córdoba','Tucumán'], array['5000','5001']),
  ('22222222-2222-2222-2222-222222222222', 'Cool Logística Cuyo', 'Mendoza', array['Gran Mendoza'], 'Martín Ríos', '+54 261 555-0202', 'martin@cuyo.cool', true, array['Mendoza','Neuquén'], array['5500','5515']),
  ('33333333-3333-3333-3333-333333333333', 'Litoral Fresh', 'Santa Fe', array['Rosario'], 'Ana Belucci', '+54 341 555-0303', 'ana@litoralfresh.com', true, array['Santa Fe','Entre Ríos'], array['2000','3000'])
on conflict (id) do nothing;

insert into public.leads (full_name, company, phone, email, province, city, postal_code, business_type, client_type, distributor_id, origin, status, is_customer)
values
  ('Carolina Suárez', 'Almacén El Sol', '+54 351 411-2200', 'carolina@elsol.com', 'Córdoba', 'Córdoba', '5000', 'Almacén', 'minorista', '11111111-1111-1111-1111-111111111111', 'whatsapp', 'en_curso', false),
  ('Logística Sur SA', 'Logística Sur SA', '+54 291 455-9090', 'comercial@logisticasur.com', 'Buenos Aires', 'Bahía Blanca', '8000', 'Distribución', 'distribuidor', null, 'llamada', 'en_curso', false),
  ('Marca Andina Foods', 'Marca Andina Foods', '+54 261 500-1212', 'ops@andinafoods.com', 'Mendoza', 'Mendoza', '5500', 'Marca propia', 'fason', null, 'web', 'nuevo', false);

insert into public.conversations (name, phone, origin, status, client_type, province, distributor_id, ai_summary, last_message, notes, tags, is_customer, messages)
values
  ('Carolina Suárez', '+54 351 411-2200', 'whatsapp', 'ia_atendiendo', 'minorista', 'Córdoba', '11111111-1111-1111-1111-111111111111', 'Consulta precios', '¿Lista actualizada?', '', '{}', false, '[]'::jsonb),
  ('Lucía Fernández', '+54 341 455-6677', 'instagram', 'derivado_distribuidor', 'retail', 'Santa Fe', '33333333-3333-3333-3333-333333333333', 'Derivada a Litoral Fresh', 'El dist. se contacta hoy', '', array['#derivado_Litoral_Fresh'], false, '[]'::jsonb),
  ('Logística Sur SA', '+54 291 455-9090', 'llamada', 'quiere_ser_distribuidor', 'distribuidor', 'Buenos Aires', null, 'Quiere ser distribuidor', '¿Requisitos?', '', '{}', false, '[]'::jsonb);
