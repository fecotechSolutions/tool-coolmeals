-- Sample requests: campos extra para logística de envío
alter table public.sample_requests
  add column if not exists company text not null default '',
  add column if not exists dni text not null default '',
  add column if not exists email text not null default '';

comment on column public.sample_requests.address is 'Dirección completa de envío';
comment on column public.sample_requests.company is 'Empresa / razón social';
comment on column public.sample_requests.dni is 'DNI / documento';
comment on column public.sample_requests.email is 'Correo electrónico';
