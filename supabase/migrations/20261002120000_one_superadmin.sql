-- Solo puede existir un superadmin.
-- Si hay más de uno (datos de prueba), deja el más viejo y degrada el resto a admin.

with ranked as (
  select id,
         row_number() over (order by created_at asc, id asc) as rn
  from public.app_users
  where role = 'superadmin'
)
update public.app_users u
set role = 'admin'
from ranked r
where u.id = r.id
  and r.rn > 1;

create unique index if not exists app_users_one_superadmin_idx
  on public.app_users ((true))
  where role = 'superadmin';
