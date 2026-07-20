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
