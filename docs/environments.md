# Entornos, cuentas y accesos (DEV / PROD)

Actualizado: **2 oct 2026**.

Guía para no perderse: **dónde vive cada pieza**, con qué cuenta se entra, y cómo está el login del panel.

```
cambios locales (DEV)  →  probar (sandbox Kapso)  →  deploy Vercel (PROD)
```

No hay deploy “dev” en Vercel: **DEV = localhost + Supabase DEV**.  
**PROD = URLs Vercel** + Supabase prod + WhatsApp …5440.

---

## 1. Cuentas (dónde loguearte)

| Servicio | Cuenta / team | Para qué |
|----------|---------------|----------|
| **Supabase DEV** | `fecotech@gmail.com` | Proyecto `coolmeals-dev` (`otbyuvbdajqrcrtwlwvy`) — local + sandbox |
| **Supabase PROD** | Misma org / login que tenga el proyecto `jrsvfyujpuuhnwzjubow` (suele ser la org FEcotech; si no lo ves en `fecotech@gmail.com`, probá `fecotechsolutions@gmail.com` u otra org del team) | Pipeline / bot de clientes |
| **Vercel** | Team **FEcotech** (`fecotech`) | `tool-coolmeals-web` + `tool-coolmeals-api` |
| **Kapso** | User CLI histórico: `fecotechsolutions@gmail.com` · Project **COOLMEALS** | WhatsApp sandbox + …5440, workflow, function |
| **GitHub** | Repo de este monorepo | Código + Actions (cron backup) |
| **Google Sheets** | Cuenta del Apps Script (Editor en cada sheet) | Sync prod (no sandbox) |

### Deep links útiles

| Qué | URL |
|-----|-----|
| Supabase DEV | https://supabase.com/dashboard/project/otbyuvbdajqrcrtwlwvy |
| Supabase PROD | https://supabase.com/dashboard/project/jrsvfyujpuuhnwzjubow |
| Web prod | https://tool-coolmeals-web.vercel.app |
| API prod | https://tool-coolmeals-api-ten.vercel.app |
| Login panel | local http://localhost:3000/login · prod https://tool-coolmeals-web.vercel.app/login |

Si el deep link de Supabase te manda a sign-in: **cambiá de organización** en el menú superior hasta que aparezca el project ref.

---

## 2. Mapa de recursos

| Pieza | DEV | PROD |
|-------|-----|------|
| Código | Este repo en tu máquina | Mismo repo, deploy CLI a Vercel |
| Supabase | `otbyuvbdajqrcrtwlwvy` (`coolmeals-dev`) | `jrsvfyujpuuhnwzjubow` |
| App UI / API | http://localhost:3000 · http://localhost:3001 | [web](https://tool-coolmeals-web.vercel.app) · [api](https://tool-coolmeals-api-ten.vercel.app) |
| Kapso WhatsApp | **Sandbox** `597907523413541` | **Oficina Ventas Froodie** `+54 9 351 549-5440` (`729232923604156`) |
| Sheets | No escribe (`__skipSheets`) | Sheets por dist. + muestras + atención + sin cobertura |
| Badge UI | **DEV** (amarillo) | **PROD** (verde) |
| `APP_ENV` | `development` | `production` |
| Auth panel (`app_users`) | **Activo** (probar en local) | Pendiente migrar + SMTP + deploy (mismo código) |

---

## 3. Login del panel (usuarios en DB)

Auth **propio** (tabla `app_users` en Postgres). **No** usa Supabase Auth.

**Estado (oct 2026):** habilitado y probado en **DEV**. En PROD aún no se migró ni se configuró SMTP; cuando toque, mismos SQL + env en Vercel.

### Qué hace cada rol

| Rol | Quién | Puede |
|-----|-------|--------|
| **superadmin** | **Uno solo** (bootstrap o transferido por SQL) | Todo el panel + pantalla **Usuarios** (`/usuarios`): crear y eliminar **admins** |
| **admin** | El resto (Cool Meals, etc.) | Operar el panel; **no** gestiona usuarios |

No se puede crear un segundo superadmin desde la UI. Crear usuario siempre sale como `admin`.

### Pantallas y endpoints

| Pieza | Detalle |
|-------|---------|
| Login | `/login` — email + password |
| Olvidé contraseña | `/forgot-password` → mail vía **SMTP Symbionet** (`SMTP_*`) |
| Reset | `/reset-password?token=…` |
| Cambiar | `/change-password` (también obligatorio si `must_change_password`) |
| Usuarios (UI) | `/usuarios` — solo superadmin: alta de admin + **Eliminar** en filas `admin` |
| Crear admin | `POST /api/auth/users` (siempre rol `admin`, pass temporal) |
| Eliminar admin | `DELETE /api/auth/users/:id` (no borra al superadmin ni a uno mismo) |
| Sesión | Bearer firmado con `SESSION_SECRET` (7 días) |

### Flujo típico (DEV)

1. Correr migraciones de auth en Supabase **DEV** (SQL Editor).
2. Primera vez con tabla vacía: login con `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` del `.env` → crea el único superadmin (bootstrap).
3. En **Usuarios**, crear admins (email Cool Meals + pass temporal).
4. El admin entra y cambia la pass (o usa “Olvidé contraseña” si SMTP está configurado).
5. Para **transferir** el rol superadmin a otra cuenta ya existente: SQL (no hay botón en UI).

```sql
-- Transferir superadmin (DEV o PROD). Reemplazá los emails.
begin;
update public.app_users set role = 'admin'
where role = 'superadmin' and email = 'viejo@…';
update public.app_users set role = 'superadmin'
where email = 'nuevo@…';
commit;
-- Ambos deben cerrar sesión y volver a entrar.
```

### Variables

| Variable | Dónde | Notas |
|----------|--------|--------|
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | `.env` (+ Vercel API cuando pases a prod) | Solo **bootstrap** si `app_users` está vacío. Cambiar el `.env` **no** cambia al superadmin ya creado. |
| `SESSION_SECRET` | idem | Firma del Bearer |
| `APP_PUBLIC_URL` | idem | Base de links de reset (`http://localhost:3000` / URL web prod) |
| `SMTP_HOST` / `PORT` / `USER` / `PASS` / `FROM` | idem | Gmail Workspace Symbionet (`smtp.gmail.com:587`). Sin esto, “Olvidé contraseña” no manda mail. |

### Migraciones auth

Correr en SQL Editor del proyecto correspondiente:

1. `supabase/migrations/20260930120000_app_users_auth.sql` — tablas `app_users` + `password_reset_tokens`
2. `supabase/migrations/20261002120000_one_superadmin.sql` — deja un solo superadmin + índice único

| Entorno | Estado |
|---------|--------|
| **DEV** (`otbyuvbd…`) | Aplicar / mantener al día (auth en uso) |
| **PROD** (`jrsvfyuj…`) | **Pendiente** — no activar login nuevo en Vercel hasta migrar + SMTP + `SUPERADMIN_*` / `SESSION_SECRET` |

### Credenciales bootstrap (primera vez)

| Entorno | Email | Password |
|---------|-------|----------|
| Local / DEV | `SUPERADMIN_EMAIL` en `.env` | `SUPERADMIN_PASSWORD` en `.env` |
| Prod (cuando toque) | `SUPERADMIN_*` en Vercel API | Solo bootstrap; después transferí a un email Cool Meals real |

Cron y webhooks Kapso **no** usan este login.

---

## 4. Kapso: sandbox → DEV, …5440 → PROD

| | ID |
|--|-----|
| Project | `3a5b4f92-49e0-43aa-8ce4-991ccac4c6fe` (COOLMEALS) |
| Workflow | `coolmeals-leads` · `454904ce-8fba-423f-bf08-32135f694b14` |
| Function | `coolmeals-bot-actions` · `164dc11a-dc32-4b99-85c9-6d289e15f501` |
| Trigger sandbox | `803df1bb-8f2c-4a09-ac29-b5dae4ae7106` |
| Trigger prod (…5440) | `8dc2fd73-1435-4d75-85a2-7e5cbd549883` |

La function elige Supabase según `phone_number_id`:

| Trigger | Phone number id | Destino |
|---------|-----------------|---------|
| Sandbox WhatsApp | `597907523413541` | `SUPABASE_URL_DEV` + `SUPABASE_SERVICE_ROLE_KEY_DEV` |
| Oficina Ventas Froodie | `729232923604156` | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |

Sandbox **no escribe** Google Sheets de prod (`__skipSheets`).

### Secrets Kapso (function → Secrets)

**PROD:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Sheets webhook + IDs, `KAPSO_*`, etc.  
**DEV:** `SUPABASE_URL_DEV`, `SUPABASE_SERVICE_ROLE_KEY_DEV` (proyecto `otbyuvbd…`).

### Activar / apagar sandbox

```bash
# Encender (pruebas → DEV)
node .agents/skills/automate-whatsapp/scripts/update-trigger.js \
  --trigger-id 803df1bb-8f2c-4a09-ac29-b5dae4ae7106 --active true

# Apagar (recomendado cuando no se prueba)
node .agents/skills/automate-whatsapp/scripts/update-trigger.js \
  --trigger-id 803df1bb-8f2c-4a09-ac29-b5dae4ae7106 --active false
```

Trigger prod (…5440): dejar **on** en operación.

### Cuidado con `kapso push`

En source el trigger suele ser sandbox; en Kapso remoto hay **dos** triggers. Un push descuidado puede pisar el de …5440. Preferí UI/CLI (`update-trigger`).

---

## 5. Variables

### Local (`.env` = DEV)

```bash
APP_ENV=development
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_DEMO_MODE=false
SUPABASE_URL=https://otbyuvbdajqrcrtwlwvy.supabase.co
SUPABASE_SERVICE_ROLE_KEY=…   # DEV (fecotech@gmail.com)
KAPSO_PHONE_NUMBER_ID=597907523413541
NEXT_PUBLIC_API_URL=http://localhost:3001
SUPERADMIN_EMAIL=superadmin@coolmeals.local
SUPERADMIN_PASSWORD=…         # local only
SESSION_SECRET=…              # local only
APP_PUBLIC_URL=http://localhost:3000
# SMTP_*  → reset por mail (Symbionet)
```

Bootstrap schema DEV: `supabase/dev_bootstrap_otbyuvbdajqrcrtwlwvy.sql` (o migrations + `seed.sql`).  
Auth: además las migraciones de la §3.  
Si el schema ya existe (`type "user_role" already exists`), no re-correr el bootstrap completo.

### Vercel Production

**Web** (`tool-coolmeals-web`):
- `NEXT_PUBLIC_APP_ENV=production`
- `NEXT_PUBLIC_DEMO_MODE=false`
- `NEXT_PUBLIC_API_URL=https://tool-coolmeals-api-ten.vercel.app`
- `NEXT_PUBLIC_SUPABASE_*` del proyecto **prod**

**API** (`tool-coolmeals-api`) — cuando actives auth en prod:
- `APP_ENV=production`
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` → **prod**
- `KAPSO_PHONE_NUMBER_ID=729232923604156`
- `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` / `SESSION_SECRET`
- `APP_PUBLIC_URL=https://tool-coolmeals-web.vercel.app`
- `SMTP_*` (Symbionet)
- `SANDBOX_RESET_ENABLED=false`

`GET /api/cron/sandbox-reset` con `APP_ENV=production` está **bloqueado en código**.

---

## 6. Deploy Vercel (recordatorio)

Team: **fecotech**. Siempre `--scope fecotech` y `--project`.

| Proyecto | Config local | Notas |
|----------|--------------|--------|
| `tool-coolmeals-api` | `vercel.json` | Antes: `npm run build:api:handler` |
| `tool-coolmeals-web` | `vercel.web.json` | Si el CLI ignora `-A`, temporalmente copiá `vercel.web.json` → `vercel.json`, deploy, restaurá el de API |

Root Directory = **raíz del repo** (no `apps/api` / `apps/web`).

```bash
# API
npm run build:api:handler
vercel deploy --prod --yes --scope fecotech --project tool-coolmeals-api

# Web (usar config web; ver nota arriba)
vercel deploy --prod --yes --scope fecotech --project tool-coolmeals-web -A vercel.web.json
```

---

## 7. Guardia: local ≠ Supabase PROD

Con `APP_ENV=development|staging`, si `SUPABASE_URL` es `jrsvfyujpuuhnwzjubow`, la API **no arranca**.

Escape hatch temporal:

```bash
ALLOW_PROD_SUPABASE_LOCALLY=true
```

Sacá el flag cuando DEV vuelva. No dejarlo “para siempre”.

---

## 8. Flujo diario

1. Local (badge **DEV**) + `.env` → Supabase DEV.
2. Login panel con superadmin / admins de `app_users` (DEV).
3. WhatsApp **sandbox** (trigger on) → cards en DEV / localhost.
4. OK → build handler + deploy CLI (`--project` web y api).
5. Apagá sandbox si no seguís probando.
6. Clientes reales solo por …5440 + panel Vercel (login prod cuando auth esté migrado).

---

## 9. Qué no hacer

- Pegar service_role / URL de **prod** en `.env` local (bloqueado).
- Apuntar el bot …5440 a Supabase DEV.
- Dejar `SANDBOX_RESET_ENABLED=true` en Vercel.
- Dejar `ALLOW_PROD_SUPABASE_LOCALLY=true` permanente.
- Commitear passwords / `SESSION_SECRET` / service_role.
- Crear un segundo superadmin a mano sin demotar el anterior (rompe el índice único).
- `vercel deploy` sin `--project` / sin scope **fecotech**.
- Documentar passwords de prod en markdown (viven solo en Vercel Env).

---

## 10. Docs relacionadas

| Doc | Contenido |
|-----|-----------|
| [`README.md`](../README.md) | Setup + scripts + deploy corto |
| [`operator-cheat-sheet-bot.md`](./operator-cheat-sheet-bot.md) | Operación bot / Pipeline |
| [`phase0-bot-developer-guide.md`](./phase0-bot-developer-guide.md) | Detalle técnico bot |
| [`.env.example`](../.env.example) | Plantilla de variables |
