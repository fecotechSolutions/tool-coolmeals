-- App users (auth propio, sin Supabase Auth)
-- Pegá TODO este bloque en SQL Editor → Run

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  role text not null default 'admin'
    check (role in ('superadmin', 'admin')),
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_email_unique unique (email)
);

create index if not exists app_users_email_idx on public.app_users (email);

-- Solo un superadmin a la vez
create unique index if not exists app_users_one_superadmin_idx
  on public.app_users ((true))
  where role = 'superadmin';

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_idx
  on public.password_reset_tokens (user_id);

alter table public.app_users enable row level security;
alter table public.password_reset_tokens enable row level security;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
  before update on public.app_users
  for each row execute function public.set_updated_at();
