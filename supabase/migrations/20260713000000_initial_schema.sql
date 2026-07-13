-- Cool Meals Leads — initial schema
-- Roles: superadmin | admin (Auth wiring comes later)
-- Run via Supabase SQL editor or: supabase db push

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('superadmin', 'admin');

create type public.lead_status as enum (
  'new',
  'contacted',
  'qualified',
  'won',
  'lost'
);

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users once Auth is enabled)
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
create index profiles_is_active_idx on public.profiles (is_active);

comment on table public.profiles is
  'Internal users. Link id to auth.users.id when Supabase Auth is enabled.';

comment on column public.profiles.role is
  'superadmin = full control; admin = operational access without user mgmt';

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  company text,
  source text,
  status public.lead_status not null default 'new',
  notes text,
  assigned_to uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_full_name_length check (char_length(full_name) between 1 and 200),
  constraint leads_email_format check (
    email is null or email ~* '^[^@]+@[^@]+\.[^@]+$'
  )
);

create index leads_status_idx on public.leads (status);
create index leads_assigned_to_idx on public.leads (assigned_to);
create index leads_created_at_idx on public.leads (created_at desc);
create index leads_full_name_trgm_idx on public.leads using gin (full_name gin_trgm_ops);

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

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — locked down for anon; service role (API) bypasses RLS.
-- When Auth is added: add policies per role (superadmin / admin).
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
