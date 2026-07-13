# Cool Meals Leads

Herramienta interna para gestionar leads. Monorepo TypeScript con **frontend** y **backend** separados, **Supabase** como base de datos, listo para desplegar en **Vercel**.

Roles preparados (`superadmin` / `admin`); autenticación se conecta en una etapa posterior.

## Estructura

```
apps/
  web/          → Next.js (UI)
  api/          → Hono (API REST)
packages/
  shared/       → tipos, Zod schemas, permisos por rol
supabase/
  migrations/   → schema SQL
```

## Requisitos

- Node.js 20+
- Proyecto en [Supabase](https://supabase.com)
- Cuenta en [Vercel](https://vercel.com) (para deploy)

## UI demo (MVP visual)

El front ya tiene los 7 módulos con datos mock interactivos:

1. Dashboard · 2. Conversaciones · 3. Leads · 4. Distribuidores  
5. Configuración comercial · 6. Base de conocimiento · 7. Prompt Manager

```bash
npm run dev:web
```

Abrí http://localhost:3000 — no hace falta API ni Supabase para la demo.

La capa `apps/web/src/data/repository.ts` (`dataApi`) es el punto de canje a backend real.

### 2. Variables de entorno

Copiá `.env.example` a:

- `apps/api/.env`
- `apps/web/.env.local`

Completá:

| Variable | Dónde | Notas |
|----------|--------|--------|
| `SUPABASE_URL` | API | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | API | Solo servidor — nunca en el browser |
| `CORS_ORIGINS` | API | `http://localhost:3000` en local |
| `NEXT_PUBLIC_API_URL` | Web | `http://localhost:3001` en local |
| `INTERNAL_API_SECRET` | API (+ opcional Web) | Opcional hasta tener Auth |

### 3. Schema en Supabase

En el SQL Editor de Supabase, ejecutá el contenido de:

`supabase/migrations/20260713000000_initial_schema.sql`

### 4. Correr

```bash
# terminal 1
npm run dev:api

# terminal 2
npm run dev:web
```

- Web: http://localhost:3000  
- API health: http://localhost:3001/api/health  

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/leads` | Listar (`status`, `search`, `limit`, `offset`) |
| GET | `/api/leads/:id` | Detalle |
| POST | `/api/leads` | Crear |
| PATCH | `/api/leads/:id` | Actualizar |
| DELETE | `/api/leads/:id` | Borrar (pensado para `superadmin`) |

Respuestas: `{ data: ... }` o `{ error: { code, message } }`.

## Roles (preparados)

| Rol | Intención |
|-----|-----------|
| `superadmin` | Usuarios, settings, delete leads, export |
| `admin` | Operar leads (sin gestión de usuarios / deletes duros) |

Definidos en `packages/shared/src/roles.ts` y columna `profiles.role`. El middleware `requireRole` está listo para enganchar JWT cuando actives Auth.

## Deploy en Vercel

Recomendado: **dos proyectos** en el mismo repo.

1. **Web** — Root Directory: `apps/web`  
   Env: `NEXT_PUBLIC_API_URL`, y si usás secret interno también `INTERNAL_API_SECRET`.

2. **API** — Root Directory: `apps/api`  
   Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS` (URL de la web en Vercel).

Tras el deploy, actualizá `NEXT_PUBLIC_API_URL` de la web con la URL de la API.

## Qué falta (vos / siguiente etapa)

1. **Proyecto Supabase** + keys reales  
2. **Correr la migración** SQL  
3. **Auth** (Supabase Auth + login UI + políticas RLS por rol)  
4. **Dos usuarios** reales (superadmin / admin)  
5. **Deploy Vercel** (web + api)  
6. Ajustar campos de leads si tu negocio necesita otros (ciudad, plan, etc.)

## Seguridad (app interna)

- El browser **no** usa la service role; solo la API.  
- RLS activado; sin policies públicas (solo service role por ahora).  
- Headers de seguridad + CORS restrictivo en la API.  
- Validación Zod compartida en API.  
- Secret interno opcional (`x-internal-secret`) hasta Auth.
