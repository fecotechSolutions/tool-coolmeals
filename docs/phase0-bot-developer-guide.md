# Guía de desarrollo — Phase 0 bot WhatsApp + Pipeline

Para quien mantenga o extienda el monorepo. Complementa [`pipeline-bot-user-guide.md`](./pipeline-bot-user-guide.md).

Actualizado: **13 ago 2026**. One-pager ops: [`operator-cheat-sheet-bot.md`](./operator-cheat-sheet-bot.md).

Planilla: [`planilla-flujo-ia-definitiva.csv`](./planilla-flujo-ia-definitiva.csv) · Anexo: [`planilla-flujo-ia-anexo-prompt.md`](./planilla-flujo-ia-anexo-prompt.md).  
Operador E2E: [`operator-flow-test-guide.md`](./operator-flow-test-guide.md) · Uso: [`pipeline-bot-user-guide.md`](./pipeline-bot-user-guide.md).

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
| Cron timeouts | `apps/api/src/routes/cron.ts` → `/api/cron/pipeline-timeouts` |
| Sandbox reset (wipe a pedido) | `/api/cron/sandbox-reset` + `SANDBOX_RESET_*` → `lib/sandbox-reset.ts`. **Default OFF** |
| Cron GitHub (no usar en permanente) | `.github/workflows/sandbox-reset.yml` — no dejar schedule activo |
| Teléfonos AR | `packages/shared/src/phone.ts` (`canonicalizeArPhone`, `phoneLookupVariants`) |
| Dominio compartido | `packages/shared/src/domain.ts` |
| Pipeline UI | `apps/web/src/app/pipeline/page.tsx` |
| Dashboard | `apps/web/src/app/page.tsx` + `apps/api/src/routes/dashboard.ts` |
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
| Function mock (tests) | `coolmeals-bot-actions-mock` / `00bf0b57-5efb-4b90-b008-5aeafc8c4c23` |
| Workflow test | `Cool Meals — Leads WhatsApp [TEST]` / `306b341b-6bce-4507-8fd5-6a037efe6b10` |

### Entrega de mensajes: `tool_only`

El nodo agent usa `message_delivery_mode: "tool_only"`. El texto suelto del modelo queda
interno y al lead solo le llega lo que sale por `send_notification_to_user` (+ `enter_waiting`
después de cada pregunta). Con `auto_send_assistant_text` el bot filtraba narración de pasos
("Ahora voy a registrar tu derivación…") en la mayoría de las conversaciones.

### Tests del agente

```bash
npm run test:agent
```

Corren conversaciones reales contra el workflow **[TEST]** (clon del prompt de producción con
las tools apuntando a la function mock) y verifican con asserts lo que el lead vería.
Detalle en [`tests/agent/README.md`](../tests/agent/README.md). Consumen créditos de Kapso.

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
- `KAPSO_API_BASE_URL`, `KAPSO_API_KEY` (ended/handoff **desde tools de cierre**, no desde `sync_derived`)
- `DERIVE_HANDOFF_HOURS` (default 24; ya no auto-finaliza derivados)

## Migraciones Supabase

En SQL Editor, en orden:

1. `supabase/migrations/20260713000000_initial_schema.sql`
2. `supabase/migrations/20260719000000_phase0_bot_foundation.sql`
3. `supabase/migrations/20260720000000_derive_handoff_window.sql` ← `derived_at`, `finalize_at`
4. `supabase/migrations/20260720140000_quiere_ser_representante_fason.sql` ← columnas Pipeline
5. `supabase/migrations/20260724120000_sample_request_extra_fields.sql` (campos extra muestras)
6. Opcional: `supabase/seed.sql`

Sin (3), el código hace **fallback** a `updated_at` para timeouts; conviene aplicarla igual.

## Variables de entorno (API)

Ver `.env.example`. Críticas para este módulo:

| Variable | Uso |
|----------|-----|
| `KAPSO_*` | Handoff/ended, send text (nudge), list executions |
| `DERIVE_HANDOFF_HOURS` | Legacy (ya no auto-finaliza derivados/atención) |
| `ABANDONED_TO_WAITING_HOURS` | 22h mid-flujo → Esperando respuesta |
| `ESPERANDO_TO_FINALIZE_HOURS` | 22h: `sin_cobertura` → Descartado+ended; `esperando_respuesta` → Finalizado+ended |
| `STUCK_RUNNING_MINUTES` | Execution Kapso en `running` sin avanzar → `ended` (+ mensaje de recuperación). Default 3 |
| `ABANDONED_NUDGE_MESSAGE` | Texto del recordatorio WA |
| `CRON_SECRET` / `INTERNAL_API_SECRET` | Auth de `/api/cron/*` |
| `SANDBOX_RESET_ENABLED` | Debe quedar **`false`**. `true` solo para un wipe puntual |
| `SANDBOX_RESET_UNTIL` | ISO datetime; pasado ese momento el endpoint no borra |
| `SANDBOX_RESET_PHONES` | Opcional CSV; vacío = todas las conversations |
| `GOOGLE_SHEETS_WEBHOOK_*` | Append derivados / muestras / atención comercial / sin cobertura |
| `GOOGLE_SHEET_COMMERCIAL_ATTENTION_ID` | Sheet dist / rep / fasón |
| `GOOGLE_SHEET_NO_COVERAGE_ID` | Sheet sin cobertura |

Web: `NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_API_URL`.

## Sandbox reset (wipe a pedido)

Objetivo: mismo teléfono tipifica de nuevo sin esperar el lock de 1 año. **No** corre solo.

1. Default: `SANDBOX_RESET_ENABLED=false`. No habilitar el workflow de GitHub en permanente.
2. Wipe puntual: Kapso `ended` en `waiting|running|handoff` + delete `conversations` / `sample_requests` de ese tester. O prender el flag **un rato**, pegarle a `GET|POST /api/cron/sandbox-reset` (auth `CRON_SECRET`) y volver a `false`.
3. El workflow [`.github/workflows/sandbox-reset.yml`](../.github/workflows/sandbox-reset.yml) existe por si hace falta; no es el flujo diario.

Ops: [`operator-cheat-sheet-bot.md`](./operator-cheat-sheet-bot.md) §7.

## Dashboard (API)

`GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD` (default: mes corriente).

- Fuente única: tabla **`conversations`** (no `leads`).
- **Dedupe:** `canonicalizeArPhone` — 1 teléfono = 1 lead (card más antigua del período).
- Respuesta: `executive` + `commercial` (counts, percentages, `byDistributor`, `byProvince`, `interestKpis`).
- Sin `monthlyEvolution` / vs período anterior (el filtro de fechas alcanza).

## Teléfonos

`packages/shared/src/phone.ts` (y helpers duplicados en las functions Kapso):

- Store: `54` + nacional, sin `9` móvil (`3513053755` → `543513053755`).
- Lookup: `.in(phoneLookupVariants(...))` para no duplicar cards por formato.
- Pipeline badge y dashboard usan el mismo canon.

## Comportamiento acordado (producto)

### Agent (`workflows/coolmeals-leads/workflow.ts`)

1. Primer mensaje → `upsert_conversation` + Beacons + tipificación.
2. Fasón / representante (SER) → `decide_route` + **contacto** + handoff (sin menú).
3. Quiere ser distribuidor → 4 preguntas; **4 SÍ** → `upsert` columna **sin** handoff → zona/volumen → `decide_route`.
4. Gates en function: `certainty=high`, provincia/volumen si aplica, `gateContactBeforeClose` en handoff/`sync_derived`.
5. Según `decide_route` (seguir `agentInstruction` / `coolMealsMenu`):

| action | Comportamiento |
|--------|----------------|
| `own_attention` + menú | ≥50 cualquier provincia → muestras o pedido |
| `own_attention` sin menú | Córdoba &lt;50 → contacto + handoff `atencion_representante`. Copy: no “asesor de la zona” |
| `derive_to_distributor` | **mensaje** → `sync_derived` → `handoff_to_human` (sin `request_samples`). `sync_derived` **no** setea Kapso `handoff` |
| `no_coverage` | contacto → `sin_cobertura` → auto **Descartado** ~22h |
| `quiere_ser_representante` / `fason` | contacto + handoff a su columna |
| volumen incerto | handoff `atencion_representante` (remap si el modelo manda `quiere_ser_distribuidor`) |

**Muestras (≥50):** datos envío → `request_samples` → mensaje representante → `handoff_human` `muestras` (**Kapso ended**, sin `handoff_to_human`). Card queda hasta Resultado. Nuevo WA → 2ª card fresca.

### Timeouts

- `sin_cobertura` vencido → **Descartado** + ended  
- `esperando_respuesta` vencido → **Finalizado** + ended  
- resto: Resultado manual (`éxito` / `sin éxito` / `Descartado`)

## Ruteo comercial

Orden en `decide_route`:

1. `representante` / `fason`  
2. volumen ≥ `minBundlesDefault` (50) → `own_attention` + `coolMealsMenu`  
3. Córdoba → operador sin menú  
4. sin dist → `no_coverage`  
5. con dist → `derive_to_distributor`

Umbral en **cajas** (bulto = caja). Embalaje: wraps 24 / platos 12 / postres 24 / palet 110.

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
| Muestras | `GOOGLE_SHEET_SAMPLE_LOGISTICS_ID` | fecha, nombre, tel, **tipo_cliente**, empresa, provincia, dni, correo, CP, dirección completa |
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

Reset de un tester (ej. `543513053755` / `3513053755` = mismo número):

1. Kapso: `ended` en executions `waiting` / `handoff` / `running`.
2. Supabase: **delete** `conversations` (+ `sample_requests`) de ese teléfono, o PATCH a `ia_atendiendo` limpiando `outcome`, `tags`, `finalize_at`, `human_handoff_at`, `kapso_execution_id`, `distributor_id` (no poner `province` / `ai_summary` / `client_type` en `null` si la columna es NOT NULL).

## Pruebas sandbox validadas (ago 2026)

| # | Caso | Resultado |
|---|------|-----------|
| 1 | Quiere ser distribuidor (4 SÍ) | Columna **sin** handoff → zona/volumen → contacto → handoff al rutear |
| 1b | Quiere ser dist. sin requisitos | Sin columna dist.; tipificar compra o Descartado |
| 2 | Sin cobertura | Contacto + columna + handoff → auto Descartado ~22 h |
| 3 | Minorista Mendoza &lt;50 | Mensaje dist **antes** de `sync_derived` + handoff |
| 4 | ≥50 cualquier provincia | Menú muestras/pedido |
| 5 | Córdoba &lt;50 | Atención humana sin menú; **no** “asesor de la zona”; pide contacto |
| 6 | Representante SER | Contacto + columna + handoff |
| 7 | Fasón | Contacto + columna + handoff |
| 8 | Recontacto &lt;1 año ya calificado | Sin lead nuevo; mensaje corto |
| 9 | Cards mismo teléfono (351 vs 54351) | Pipeline rojo + badge 1/2; KPI = 1 |
| 10 | Volumen incerto | Operador; no inventar bultos |

## Gaps conocidos / siguiente polish

1. Cambiar `PHONE_NUMBER_ID` del workflow a producción (Meta) cuando toque.
2. Confirmar migrations `20260720*` aplicadas en **todos** los entornos (sandbox OK).
3. Unificar `decide_route` (function vs `routing.ts`) o llamar siempre a la API.
4. Confirmar secrets Kapso de los 4 sheets (`GOOGLE_SHEET_*` + webhook) en todos los entornos.
5. Auth real (hoy `optionalInternalAuth` / roles stub).
6. Tras cada `kapso build` + `update-graph`, **siempre** confirmar `function_id` en tools.
7. No cortar executions `waiting`/`handoff` mid-prueba al desplegar (rompe el hilo del lead).
8. Deploy Vercel: **siempre** `--project tool-coolmeals-web` o `tool-coolmeals-api` (nunca `vercel deploy` suelto).
9. Wipe sandbox solo a pedido; no reactivar el cron de 20 min.

## Convención de cambios

- Editar `workflow.ts` (source of truth); `kapso build` → `definition.json` → `update-graph` (o `kapso push` si el remoto no está stale).
- Si Kapso dice “remote changed”: `kapso pull workflow coolmeals-leads --overwrite`, reaplicar cambios locales, push / update-graph.
- Function: `update-function` + `deploy-function` (no alcanza solo editar el archivo local).
- No commitear `.env` ni secrets de Kapso.
