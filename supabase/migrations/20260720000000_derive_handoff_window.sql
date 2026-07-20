-- Derive handoff window: keep Kapso in handoff for 24h, then finalize.

alter table public.conversations
  add column if not exists derived_at timestamptz,
  add column if not exists finalize_at timestamptz;

create index if not exists conversations_finalize_at_idx
  on public.conversations (finalize_at)
  where finalize_at is not null and status = 'derivado_distribuidor';
