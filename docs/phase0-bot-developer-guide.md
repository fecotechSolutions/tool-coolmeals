# Guía de desarrollo — Phase 0 bot WhatsApp + Pipeline

Para quien mantenga o extienda el monorepo. Complementa [`pipeline-bot-user-guide.md`](./pipeline-bot-user-guide.md).

Actualizado: julio 2026 (ruteo + Cool Meals menú muestras/pedido + handoffs 24h validados).

## Arquitectura (flujo feliz)

```
WhatsApp (Meta) 
  → Kapso inbound trigger
  → workflow coolmeals-leads (agent)
  → function coolmeals-bot-actions  (Supabase REST + Sheets webhook + Kapso PATCH)
  → tabla conversations / sample_requests / sheet_sync_log
  → apps/web Pipeline (+ API Hono para UI y crons)
```

| Pieza | Ubicación |
|-------|-----------|
| Workflow (source of truth) | `workflows/coolmeals-leads/workflow.ts` |
| Definition compilada | `workflows/coolmeals-leads/definition.json` |
| Function Kapso | `functions/coolmeals-bot-actions/index.js` |
| Reglas de ruteo (API) | `apps/api/src/lib/routing.ts` |
| Timeouts / finalize | `apps/api/src/lib/finalize-derived.ts` |
| Kapso client (API) | `apps/api/src/lib/kapso.ts` |
| Bot HTTP (UI/ops) | `apps/api/src/routes/bot.ts` |
| Cron | `apps/api/src/routes/cron.ts` → `/api/cron/pipeline-timeouts` |
| Dominio compartido | `packages/shared/src/domain.ts` |
| Pipeline UI | `apps/web/src/app/pipeline/page.tsx` |
| Sheets Apps Script | `apps/api/scripts/google-sheets-append.gs` |

**Nota:** el path en vivo del bot usa la **function Kapso → Supabase** (no siempre pasa por la API Hono). Las reglas de `decide_route` están **duplicadas** en la function y en `routing.ts`; si cambiás una, actualizá la otra.

## IDs Kapso (proyecto COOLMEALS / sandbox)

| Recurso | Valor |
|---------|--------|
| Workflow slug | `coolmeals-leads` |
| Workflow id | `454904ce-8fba-423f-bf08-32135f694b14` |
| Function slug | `coolmeals-bot-actions` |
| Function id | `164dc11a-dc32-4b99-85c9-6d289e15f501` |
| Phone number id (sandbox) | `597907523413541` (hardcoded en `workflow.ts`) |
| Modelo agent | `claude-haiku-4-5` (`provider_model_id` + name en nodo `raw`) |

### Deploy seguro del workflow (importante)

`kapso build` emite `function_slug`, pero **`update-graph` exige `function_id`**. Sin él, las tools fallan con:

`Function is no longer available. Select a replacement function before running this workflow.`

En `workflow.ts` cada tool incluye `function_id` + `function_slug` + `function_name` apuntando a `coolmeals-bot-actions`.

Flujo recomendado:

```bash
# 1) Código de la function
node .agents/skills/automate-whatsapp/scripts/update-function.js \
  --function-id 164dc11a-dc32-4b99-85c9-6d289e15f501 \
  --name coolmeals-bot-actions \
  --code-file functions/coolmeals-bot-actions/index.js
node .agents/skills/automate-whatsapp/scripts/deploy-function.js \
  --function-id 164dc11a-dc32-4b99-85c9-6d289e15f501

# 2) Graph del agent
kapso build
# Verificar que definition.json tenga function_id en cada tool
node .agents/skills/automate-whatsapp/scripts/get-workflow.js \
  454904ce-8fba-423f-bf08-32135f694b14   # leer lock_version
node .agents/skills/automate-whatsapp/scripts/update-graph.js \
  454904ce-8fba-423f-bf08-32135f694b14 \
  --expected-lock-version <n> \
  --definition-file workflows/coolmeals-leads/definition.json

# Alternativa Kapso CLI (puede pedir pull si el remoto cambió):
# kapso push workflow coolmeals-leads
# kapso push function coolmeals-bot-actions
```

Tras cada `update-graph`, verificar en el graph remoto que **ninguna** tool tenga `function_id: null`.

Secrets de la function (Platform API; valores en Kapso, no en git):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SHEETS_WEBHOOK_URL`, `GOOGLE_SHEETS_WEBHOOK_SECRET` (y sheet ids si aplica)
- `KAPSO_API_BASE_URL`, `KAPSO_API_KEY` (handoff desde `sync_derived` / tools)
- `DERIVE_HANDOFF_HOURS` (default 24)

## Migraciones Supabase

En SQL Editor, en orden:

1. `supabase/migrations/20260713000000_initial_schema.sql`
2. `supabase/migrations/20260719000000_phase0_bot_foundation.sql`
3. `supabase/migrations/20260720000000_derive_handoff_window.sql` ← `derived_at`, `finalize_at`
4. `supabase/migrations/20260720140000_quiere_ser_representante_fason.sql` ← columnas Pipeline
5. Opcional: `supabase/seed.sql`

Sin (3), el código hace **fallback** a `updated_at` para timeouts; conviene aplicarla igual.

## Variables de entorno (API)

Ver `.env.example`. Críticas para este módulo:

| Variable | Uso |
|----------|-----|
| `KAPSO_*` | Handoff/ended, send text (nudge), list executions |
| `DERIVE_HANDOFF_HOURS` | 24h post-handoff → Finalizado (derivado, atención humana, quiere ser dist., sin cobertura, **muestras**) |
| `ABANDONED_TO_WAITING_HOURS` | 22h mid-flujo → Esperando respuesta |
| `ESPERANDO_TO_FINALIZE_HOURS` | 22h post-nudge → Finalizado |
| `ABANDONED_NUDGE_MESSAGE` | Texto del recordatorio WA |
| `CRON_SECRET` / `INTERNAL_API_SECRET` | Auth de `/api/cron/*` |
| `GOOGLE_SHEETS_WEBHOOK_*` | Append derivados / muestras |

Web: `NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_API_URL`.

## Comportamiento acordado (producto)

### Agent (`workflows/coolmeals-leads/workflow.ts`)

1. Primer mensaje → `upsert_conversation` (guardar `conversationId`).
2. Calificación (taxonomy Meta / Froodie) → `decide_route`.
3. Según `decide_route.action` (seguir `agentInstruction` si viene):

| action | Comportamiento |
|--------|----------------|
| `derive_to_distributor` | `sync_derived` → `handoff_to_human`. Si pidieron muestras: **no** `request_samples` (el dist. se encarga). |
| `no_coverage` | `handoff_human` `status=sin_cobertura` → `handoff_to_human` |
| `quiere_ser_distribuidor` | `handoff_human` `status=quiere_ser_distribuidor` → `handoff_to_human` (sin menú muestras/pedido) |
| `own_attention` | **Menú obligatorio** antes del handoff: 1) muestras 2) pedido. |

**`own_attention` (Cool Meals, p.ej. retail/mayorista Córdoba ≥50):**

- **Muestras:** Nombre y Apellido + Teléfono + Domicilio → `request_samples` (DB + sheet + status Pipeline `muestras`) → mensaje de que **logística** contacta para el envío → `handoff_human` `status=muestras` → `handoff_to_human`. No decir que un asesor “arma las muestras”.
- **Pedido:** `handoff_human` (default `atencion_representante`) → `handoff_to_human`.

4. `handoff_human` acepta `status`: `atencion_representante` \| `quiere_ser_distribuidor` \| `quiere_ser_representante` \| `quiere_ser_fason` \| `sin_cobertura` \| `muestras` \| `esperando_respuesta`. Agenda `human_handoff_at` + `finalize_at` (~24h).

Sin seguimiento de despacho de muestras en UI (solo agenda logística).

### Pipeline UI

- Hashtag dist. naranja; persiste una vez derivado.
- Drag / handoff a **Atención humana**, **Quiere ser distribuidor**, **Sin cobertura** o **Muestras** → `POST /api/bot/handoff` con ese `status`.
- `/muestras`: lista de agendas (nombre, teléfono, domicilio, sync sheet). Sin estados enviado/entregado en esta versión.
- Ya no existe el botón `#atendido_por_representante`.

### Timeouts (`runPipelineTimeouts`)

Statuses con ventana de handoff → Finalizado cuando `finalize_at` venció:

- `derivado_distribuidor`
- `atencion_representante`
- `quiere_ser_distribuidor`
- `sin_cobertura`
- `muestras`
- `esperando_respuesta`

Abandono mid-flujo:

1. `nuevo` / `ia_atendiendo` inactivo ≥ 22h → WA nudge + handoff + `esperando_respuesta` + `finalize_at` (+22h).
2. Ventana vencida → `finalizado` + Kapso `ended`.

Cron Vercel (`vercel.api.json`): hourly `GET/POST /api/cron/pipeline-timeouts`.  
Local: `npm run cron:finalize-derived -w @coolmeals/api`.

## Ruteo comercial (MVP)

Fuente de cobertura: tabla **distributors** (UI), no sheet.  
Implementación: `apps/api/src/lib/routing.ts` **y** `decideRoute` en `functions/coolmeals-bot-actions/index.js`.

Umbral 50 bultos (`minBundlesDefault` / `commercial_settings`):

| Tipo | ¿Aplica umbral? | Lógica |
| --- | --- | --- |
| Distribuidor | No | `quiere_ser_distribuidor` + handoff comercial |
| Representante | No | `quiere_ser_representante` → columna Quiere ser representante + handoff |
| Fasón | No | `quiere_ser_fason` → columna Quiere ser fasón + handoff |
| Retail / Mayorista | Sí | Córdoba + ≥50 → `own_attention` (menú muestras/pedido); fuera de Córdoba (aunque ≥50) → red de dist. |
| Minorista | No | Siempre deriva si hay cobertura |
| Otro | No asumir | Deriva / sin_cobertura según cobertura |

Orden de evaluación:

1. `distribuidor` o `wantsToBeDistributor` → `quiere_ser_distribuidor`
2. `representante` → `quiere_ser_representante`
3. `fason` → `quiere_ser_fason`
4. `retail` o `mayorista` en Córdoba con volumen ≥ umbral → `own_attention`
5. sin dist. en provincia → `no_coverage` / `sin_cobertura`
6. resto con cobertura → `derive_to_distributor`

## Sheets

- Un sheet de **derivados**, un sheet de **muestras** (logística).
- Un sheet de **atención comercial** (tercer feedback): quiere ser **distribuidor / representante / fasón** — mismos sheet, columna `tipo_cliente`.
- Un sheet de **sin cobertura**: datos mínimos para recontactar cuando haya zona.
- Preferido: Apps Script webhook (`GOOGLE_SHEETS_WEBHOOK_URL` + secret). La cuenta del script debe ser **Editor** en los 4 sheets.
- Script: `apps/api/scripts/google-sheets-append.gs`
- Test: `npm run test:sheets -w @coolmeals/api`

| Sheet | Env | Columnas |
|-------|-----|----------|
| Derivados | `GOOGLE_SHEET_DERIVED_DISTRIBUTORS_ID` | fecha, nombre, tel, empresa, tipo negocio, client_type, provincia, ciudad, CP, dist, seguimiento |
| Muestras | `GOOGLE_SHEET_SAMPLE_LOGISTICS_ID` | fecha, nombre, tel, domicilio |
| Atención comercial | `GOOGLE_SHEET_COMMERCIAL_ATTENTION_ID` | fecha, nombre, tel, empresa, **tipo_cliente**, provincia, ciudad, motivo, seguimiento |
| Sin cobertura | `GOOGLE_SHEET_NO_COVERAGE_ID` | fecha, nombre, tel, empresa, provincia, ciudad, client_type, motivo, seguimiento |
- Test: `npm run test:sheets -w @coolmeals/api`

## Cómo depurar

```bash
# Últimas executions
node .agents/skills/automate-whatsapp/scripts/list-executions.js \
  454904ce-8fba-423f-bf08-32135f694b14 --limit 5

# Eventos de una execution (mirar agent_tool_response por errores de function)
node .agents/skills/automate-whatsapp/scripts/list-execution-events.js \
  --execution-id <uuid> --limit 40

# Forzar ended (reset de prueba)
node .agents/skills/automate-whatsapp/scripts/update-execution-status.js \
  <execution-id> --status ended
```

Reset de un tester (ej. `543513053755`):

1. Kapso: `ended` en executions `waiting` / `handoff` / `running`.
2. Supabase: PATCH conversation → `ia_atendiendo`, limpiar `outcome`, `tags`, `finalize_at`, `human_handoff_at`, `kapso_execution_id`, `distributor_id` (no poner `province` / `ai_summary` / `client_type` en `null` si la columna es NOT NULL).

## Pruebas sandbox validadas (julio 2026)

| # | Caso | Resultado |
|---|------|-----------|
| 1 | Quiere ser distribuidor (Mendoza) | Columna + handoff OK |
| 2 | Sin cobertura (Salta) | Columna + handoff 24h OK |
| 3 | Minorista Mendoza | Derivado `#Cool_Logistica_Cuyo` + handoff OK |
| 4 | Mayorista Córdoba ≥50 | Menú muestras/pedido OK |
| 5a | Muestras en Mendoza (derive) | Derivado + handoff, sin sheet Cool Meals |
| 5b | Muestras Cool Meals (CBA ≥50) | Menú → 3 datos → columna Muestras + `/muestras` + sheet + mensaje logística + handoff OK |
| 6 | Representante | Columna **Quiere ser representante** + copy “asesor contacta (no este nº)” + despedida + handoff OK |
| 7 | Fasón / marca propia | Cierre en 1 turno → **Quiere ser fasón** + mismo copy + handoff OK |

## Gaps conocidos / siguiente polish

1. Cambiar `PHONE_NUMBER_ID` del workflow a producción (Meta) cuando toque.
2. Confirmar migrations `20260720*` aplicadas en **todos** los entornos (sandbox OK).
3. Guard de status en **API** `/bot/upsert-conversation` (la function ya protege terminales + `muestras` + interés comercial).
4. Unificar `decide_route` (function vs `routing.ts`) o llamar siempre a la API.
5. Confirmar secrets Kapso de los 4 sheets (`GOOGLE_SHEET_*` + webhook) en todos los entornos.
6. Verificar cron + `CRON_SECRET` en Vercel API en producción.
7. Auth real (hoy `optionalInternalAuth` / roles stub).
8. Tras cada `kapso build` + `update-graph`, **siempre** confirmar `function_id` en tools.
9. No cortar executions `waiting`/`handoff` mid-prueba al desplegar (rompe el hilo del lead).

## Convención de cambios

- Editar `workflow.ts` (source of truth); `kapso build` → `definition.json` → `update-graph` (o `kapso push` si el remoto no está stale).
- Si Kapso dice “remote changed”: `kapso pull workflow coolmeals-leads --overwrite`, reaplicar cambios locales, push / update-graph.
- Function: `update-function` + `deploy-function` (no alcanza solo editar el archivo local).
- No commitear `.env` ni secrets de Kapso.
