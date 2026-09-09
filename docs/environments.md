# Entornos DEV y PROD (gratis)

Actualizado: **3 sep 2026**.

Un solo repo GitHub. Dos **etapas**: primero probás en DEV, después desplegás a PROD.

```
cambios locales (DEV)  →  probar (sandbox Kapso)  →  deploy Vercel (PROD)
```

No hay un segundo deploy “dev” en Vercel: DEV = **localhost** + Supabase DEV.  
PROD = URLs Vercel de siempre.

## Mapa de recursos

| Pieza | DEV | PROD |
|-------|-----|------|
| Código | Este repo en tu máquina | Mismo repo, deploy CLI a Vercel |
| Supabase | `otbyuvbdajqrcrtwlwvy` (`coolmeals-dev`) | `jrsvfyujpuuhnwzjubow` (prod operativo) |
| App UI / API | http://localhost:3000 · http://localhost:3001 | [web](https://tool-coolmeals-web.vercel.app) · [api](https://tool-coolmeals-api-ten.vercel.app) |
| Kapso WhatsApp | **Sandbox** `597907523413541` | **Oficina Ventas Froodie** `+54 9 351 549-5440` (`729232923604156`) |
| Sheets | No escribe desde sandbox (skip en function) | Hojas oficiales vía webhook |
| Badge UI | **DEV** (amarillo) | **PROD** (verde) |
| `APP_ENV` | `development` | `production` |

Team Vercel: **FEcotech**. Proyectos: `tool-coolmeals-web`, `tool-coolmeals-api`.

## Kapso: sandbox → DEV, …5440 → PROD

Workflow: `coolmeals-leads` (`454904ce-8fba-423f-bf08-32135f694b14`).  
Function: `coolmeals-bot-actions` (`164dc11a-dc32-4b99-85c9-6d289e15f501`).

La function elige Supabase según `phone_number_id` del execution context:

| Trigger | Phone number id | Destino |
|---------|-----------------|---------|
| WhatsApp: Sandbox WhatsApp | `597907523413541` | `SUPABASE_URL_DEV` + `SUPABASE_SERVICE_ROLE_KEY_DEV` |
| WhatsApp: Oficina Ventas Froodie | `729232923604156` | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |

En sandbox además **no escribe** Google Sheets de prod (`__skipSheets`).

### Secrets Kapso (function → Secrets)

**PROD (mantener):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SHEETS_*`, `KAPSO_*`, etc.

**DEV (agregar):**
- `SUPABASE_URL_DEV=https://otbyuvbdajqrcrtwlwvy.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY_DEV=<sb_secret del proyecto DEV>`
- Opcional: `KAPSO_SANDBOX_PHONE_NUMBER_ID=597907523413541`

### Activar / apagar sandbox

**UI:** Kapso → workflow `coolmeals-leads` → trigger **Sandbox WhatsApp** → Active on/off.

**CLI:**

```bash
# Encender (pruebas → DEV)
node .agents/skills/automate-whatsapp/scripts/update-trigger.js \
  --trigger-id 803df1bb-8f2c-4a09-ac29-b5dae4ae7106 --active true

# Apagar (recomendado cuando no se prueba; ahorra créditos Free)
node .agents/skills/automate-whatsapp/scripts/update-trigger.js \
  --trigger-id 803df1bb-8f2c-4a09-ac29-b5dae4ae7106 --active false
```

Trigger prod (…5440): `8dc2fd73-1435-4d75-85a2-7e5cbd549883` — dejar **on** en operación.

### Cuidado con `kapso push` del workflow

En `workflows/coolmeals-leads/workflow.ts` el `phoneNumberId` del trigger en source sigue siendo el **sandbox**. En Kapso remoto hay **dos** triggers (sandbox + prod).  
Un `kapso push` / rebuild descuidado puede pisar el trigger de …5440. Preferí gestionar triggers por UI/CLI (`update-trigger`) y no sobrescribir remotos sin revisar.

## Variables

### Local (`.env` = DEV)

```bash
APP_ENV=development
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_DEMO_MODE=false
SUPABASE_URL=https://otbyuvbdajqrcrtwlwvy.supabase.co
SUPABASE_SERVICE_ROLE_KEY=…   # DEV
KAPSO_PHONE_NUMBER_ID=597907523413541   # sandbox
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Bootstrap schema DEV (una vez): `supabase/dev_bootstrap_otbyuvbdajqrcrtwlwvy.sql` en SQL Editor, o migrations en orden + `seed.sql`.

### Vercel Production

**Web** (`tool-coolmeals-web`):
- `NEXT_PUBLIC_APP_ENV=production`
- `NEXT_PUBLIC_DEMO_MODE=false`
- `NEXT_PUBLIC_API_URL=https://tool-coolmeals-api-ten.vercel.app`
- `NEXT_PUBLIC_SUPABASE_*` del proyecto **prod**

**API** (`tool-coolmeals-api`):
- `APP_ENV=production`
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` → proyecto **prod**
- `KAPSO_PHONE_NUMBER_ID=729232923604156` (…5440)
- `SANDBOX_RESET_ENABLED=false`

`GET /api/cron/sandbox-reset` con `APP_ENV=production` está **bloqueado en código**.

## Flujo diario

1. Desarrollás en local (badge **DEV**).
2. Probás WhatsApp con **sandbox** (trigger on) → cards en Supabase DEV / localhost Pipeline.
3. Cuando está OK → `npm run build:api:handler` + deploy CLI con `--project`.
4. Apagá el trigger sandbox si no seguís probando.

## Qué no hacer

- Pegar service_role de **prod** en `.env` local.
- Apuntar el bot …5440 a Supabase DEV.
- Dejar `SANDBOX_RESET_ENABLED=true` en Vercel.
- Duplicar el repo “para tener dos códigos”.
- `vercel deploy` sin `--project`.
