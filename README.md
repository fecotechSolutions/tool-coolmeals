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
| `.env` | valores reales locales (gitignored) |

Web y API leen el **mismo** `.env` de la raíz. En Vercel, las mismas keys se configuran en el dashboard de cada proyecto (no hace falta duplicar archivos en el repo).

| Variable | Quién la usa |
|----------|----------------|
| `NEXT_PUBLIC_DEMO_MODE` | Web (`false` = datos reales vía API) |
| `NEXT_PUBLIC_API_URL` | Web |
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | Web (cliente) |
| `SUPABASE_URL` / `SERVICE_ROLE_KEY` | API (servidor) |
| `CORS_ORIGINS` | API |
| Kapso / Sheets | API (opcionales según features) |

### Schema Supabase

En SQL Editor, en orden:

1. `supabase/migrations/20260713000000_initial_schema.sql`
2. `supabase/migrations/20260719000000_phase0_bot_foundation.sql`
3. `supabase/migrations/20260720000000_derive_handoff_window.sql` (`derived_at` / `finalize_at`)
4. `supabase/migrations/20260720140000_quiere_ser_representante_fason.sql`
5. Opcional: `supabase/seed.sql`

## Documentación (bot WhatsApp + Pipeline)

| Audiencia | Doc |
|-----------|-----|
| **Operador — probar todos los flujos** | [`docs/operator-flow-test-guide.md`](docs/operator-flow-test-guide.md) |
| Operadores / comercial (uso diario) | [`docs/pipeline-bot-user-guide.md`](docs/pipeline-bot-user-guide.md) |
| Desarrolladores | [`docs/phase0-bot-developer-guide.md`](docs/phase0-bot-developer-guide.md) |

Estado actual (sandbox, jul 2026): ruteo comercial + handoff ~24h → Finalizado validado para  
**quiere ser distribuidor**, **representante**, **fasón**, **sin cobertura**, **derivado a dist.**,  
**Cool Meals (menú muestras/pedido)** y **muestras Cool Meals → logística**.  
Dashboard: filtro por fecha + métricas desde Pipeline (incl. **por provincia**).  
Sheets: derivados, muestras, [atención comercial](https://docs.google.com/spreadsheets/d/1HPiXbvKb6IdRJWqpynHNheQ1bzP-Swqg5xVeiVVsRdQ), [sin cobertura](https://docs.google.com/spreadsheets/d/10jeiXNXEUlHiOgJKqbwazQBWhOurSJWQBWyTnY6nENY).

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

2. **tool-coolmeals-api** — `vercel.api.json` desde la raíz (`api/index.ts` → `api/handler.js`)  
   Env: `SUPABASE_*`, `CORS_ORIGINS` (incluye la URL de la web)  
   Antes de deploy CLI: `npm run build:api:handler`

## Seguridad

- Service role **solo** en la API / env de Vercel API.  
- RLS en Supabase; el browser usa anon/publishable.  
- CORS restrictivo + validación Zod.
