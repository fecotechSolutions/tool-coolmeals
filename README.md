# Cool Meals Leads

Herramienta interna para gestionar leads. Monorepo TypeScript con **frontend** y **backend** separados, **Supabase** como DB, deploy en **Vercel** (2 proyectos).

## Estructura

```
apps/web          → Next.js (UI)
apps/api          → Hono (API REST)
packages/shared   → tipos, Zod, roles
supabase/         → migrations + seed
api/              → entry serverless para Vercel (API)
```

## Setup local

Requisitos: **Node 20+**.

```bash
cp .env.example .env   # una sola vez; completá keys reales
npm install
npm run dev            # API (:3001) + web (:3000) juntos
```

- Web: http://localhost:3000  
- API: http://localhost:3001/api/health  

### Variables de entorno

Solo existen:

| Archivo | Rol |
|---------|-----|
| `.env.example` | plantilla (commiteada) |
| `.env` | valores reales **locales = DEV** (gitignored) |

Web y API leen el **mismo** `.env` de la raíz. En Vercel, las mismas keys se configuran en el dashboard de cada proyecto (entorno **Production** = PROD).

| Variable | Quién la usa |
|----------|----------------|
| `APP_ENV` / `NEXT_PUBLIC_APP_ENV` | API + Web (`development` \| `staging` \| `production`) — badge DEV/PROD |
| `NEXT_PUBLIC_DEMO_MODE` | Web (`false` = datos reales vía API) |
| `NEXT_PUBLIC_API_URL` | Web |
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | Web (cliente) |
| `SUPABASE_URL` / `SERVICE_ROLE_KEY` | API (servidor) |
| `CORS_ORIGINS` | API |
| Kapso / Sheets | API (opcionales según features) |

**DEV vs PROD (gratis):** un solo repo; primero probás en local, después deploy a Vercel. Guía paso a paso: [`docs/environments.md`](docs/environments.md).

### Schema Supabase

En SQL Editor, en orden:

1. `supabase/migrations/20260713000000_initial_schema.sql`
2. `supabase/migrations/20260719000000_phase0_bot_foundation.sql`
3. `supabase/migrations/20260720000000_derive_handoff_window.sql` (`derived_at` / `finalize_at`)
4. `supabase/migrations/20260720140000_quiere_ser_representante_fason.sql`
5. `supabase/migrations/20260724120000_sample_request_extra_fields.sql`
6. Opcional: `supabase/seed.sql`

## Documentación (bot WhatsApp + Pipeline)

| Audiencia | Doc |
|-----------|-----|
| **DEV vs PROD (entornos)** | [`docs/environments.md`](docs/environments.md) |
| **Operador — one-pager** | [`docs/operator-cheat-sheet-bot.md`](docs/operator-cheat-sheet-bot.md) |
| **Planilla lógica + casos + prioridades** | [`docs/planilla-flujo-ia-definitiva.csv`](docs/planilla-flujo-ia-definitiva.csv) |
| Anexo prompt / diagrama | [`docs/planilla-flujo-ia-anexo-prompt.md`](docs/planilla-flujo-ia-anexo-prompt.md) |
| **Operador — probar flujos** | [`docs/operator-flow-test-guide.md`](docs/operator-flow-test-guide.md) |
| Uso diario Pipeline | [`docs/pipeline-bot-user-guide.md`](docs/pipeline-bot-user-guide.md) |
| Desarrolladores | [`docs/phase0-bot-developer-guide.md`](docs/phase0-bot-developer-guide.md) |

**Ruteo vigente (sep 2026):** ≥50 cualquier provincia → menú Cool Meals; Córdoba &lt;50 → operador; fuera CBA &lt;50 → dist (**sheet por dist.**) / sin cobertura (→ oculto ~5 días, no Descartado). Abandono mid-flujo: ~20 h recontacto → ~24 h Esperando → +24 h **Descartado**. Contacto (nombre+negocio+tel) antes de cerrar. Teléfonos AR canónicos; KPIs = 1ª card.  
**WhatsApp:** prod `+54 9 351 549-5440` (…5440); pruebas = Kapso **sandbox** → Supabase DEV.  
**Prod:** [web](https://tool-coolmeals-web.vercel.app) · [api](https://tool-coolmeals-api-ten.vercel.app) (Vercel team **FEcotech**; deploy CLI con `--project`). Detalle entornos: [`docs/environments.md`](docs/environments.md).

## Scripts

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Shared build + API + web en paralelo |
| `npm run build` | Build de todos los workspaces |
| `npm run build:api:handler` | Bundle serverless para deploy API en Vercel |

`dev:api` / `dev:web` existen por si necesitás uno solo; el flujo normal es `npm run dev`.

## Deploy Vercel (team fecotech)

Dos proyectos del mismo repo:

1. **tool-coolmeals-web** — `vercel.web.json` desde la raíz  
   Env: `NEXT_PUBLIC_*` (+ `NEXT_PUBLIC_API_URL` = URL de la API)

2. **tool-coolmeals-api** — `vercel.api.json` desde la **raíz del repo** (`api/index.ts` → `api/handler.js`)  
   Env: `SUPABASE_*`, `CORS_ORIGINS` (incluye la URL de la web)  
   **Root Directory** en Vercel = `.` (vacío / repo root), **no** `apps/api`  
   Build: `npm run build -w @coolmeals/shared && npm run build:api:handler`  
   Antes de deploy CLI: `npm run build:api:handler`

**Cron / Hobby:** Vercel Hobby solo permite crons **1×/día**. Timeouts de Pipeline van por el cron diario de Vercel. El wipe de sandbox **no** debe quedar en schedule: ver [`docs/operator-cheat-sheet-bot.md`](docs/operator-cheat-sheet-bot.md) §7.

## Seguridad

- Service role **solo** en la API / env de Vercel API.  
- RLS en Supabase; el browser usa anon/publishable.  
- CORS restrictivo + validación Zod.
