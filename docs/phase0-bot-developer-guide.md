# Guía de desarrollo — Phase 0 bot WhatsApp + Pipeline

Para quien mantenga o extienda el monorepo. Complementa [`pipeline-bot-user-guide.md`](./pipeline-bot-user-guide.md).

Actualizado: **15 sep 2026**. One-pager ops: [`operator-cheat-sheet-bot.md`](./operator-cheat-sheet-bot.md).

**Entornos DEV/PROD:** [`environments.md`](./environments.md).

Planilla: [`planilla-flujo-ia-definitiva.csv`](./planilla-flujo-ia-definitiva.csv) · Anexo: [`planilla-flujo-ia-anexo-prompt.md`](./planilla-flujo-ia-anexo-prompt.md).  
Operador E2E: [`operator-flow-test-guide.md`](./operator-flow-test-guide.md) · Uso: [`pipeline-bot-user-guide.md`](./pipeline-bot-user-guide.md).

## Arquitectura (flujo feliz)

```
WhatsApp (Meta / Kapso)
  → inbound trigger (sandbox O …5440)
  → workflow coolmeals-leads (agent)
  → function coolmeals-bot-actions
       · sandbox  → Supabase DEV  (+ skip Sheets)
       · …5440    → Supabase PROD (+ Sheets por dist / muestras / …)
  → tabla conversations / sample_requests / sheet_sync_log
  → apps/web Pipeline
       · localhost = DEV
       · Vercel    = PROD
```

| Pieza | Ubicación |
|-------|-----------|
| Entornos DEV/PROD | [`environments.md`](./environments.md) |
| Workflow (source of truth) | `workflows/coolmeals-leads/workflow.ts` |
| Definition compilada | `workflows/coolmeals-leads/definition.json` |
| Function Kapso | `functions/coolmeals-bot-actions/index.js` (`resolveRuntime`) |
| Reglas de ruteo (API) | `apps/api/src/lib/routing.ts` |
| Timeouts / finalize / nudge | `apps/api/src/lib/finalize-derived.ts` |
| Mapa sheet por dist. | `apps/api/src/lib/derived-distributor-sheets.ts` (+ mismo mapa en la function) |
| Kapso client (API) | `apps/api/src/lib/kapso.ts` |
| Bot HTTP (UI/ops) | `apps/api/src/routes/bot.ts` |
| Cron timeouts | `apps/api/src/routes/cron.ts` → `/api/cron/pipeline-timeouts` |
| Sandbox reset (wipe a pedido) | `/api/cron/sandbox-reset` + `SANDBOX_RESET_*` → `lib/sandbox-reset.ts`. **Default OFF**; **bloqueado** si `APP_ENV=production` |
| Cron GitHub (no usar en permanente) | `.github/workflows/sandbox-reset.yml` — no dejar schedule activo |
| Teléfonos AR | `packages/shared/src/phone.ts` (`canonicalizeArPhone`, `phoneLookupVariants`) |
| Dominio compartido | `packages/shared/src/domain.ts` |
| Pipeline UI | `apps/web/src/app/pipeline/page.tsx` |
| Badge DEV/PROD | `apps/web/src/lib/app-env.ts` + `AppShell` |
| Dashboard | `apps/web/src/app/page.tsx` + `apps/api/src/routes/dashboard.ts` |
| Sheets Apps Script | `apps/api/scripts/google-sheets-append.gs` |

**Nota:** el path en vivo del bot usa la **function Kapso → Supabase** (no siempre pasa por la API Hono). Las reglas de `decide_route` están **duplicadas** en la function y en `routing.ts`; si cambiás una, actualizá la otra.

## IDs Kapso (proyecto COOLMEALS)

| Recurso | Valor |
|---------|--------|
| Workflow slug | `coolmeals-leads` |
| Workflow id | `454904ce-8fba-423f-bf08-32135f694b14` |
| Function slug | `coolmeals-bot-actions` |
| Function id | `164dc11a-dc32-4b99-85c9-6d289e15f501` |
| Phone sandbox | `597907523413541` → Supabase **DEV** |
| Phone prod | `729232923604156` (…5440 Oficina Ventas Froodie) → Supabase **PROD** |
| Trigger sandbox id | `803df1bb-8f2c-4a09-ac29-b5dae4ae7106` |
| Trigger prod id | `8dc2fd73-1435-4d75-85a2-7e5cbd549883` |
| Modelo agent | `claude-haiku-4-5` |
| Function mock (tests) | `coolmeals-bot-actions-mock` / `00bf0b57-5efb-4b90-b008-5aeafc8c4c23` |
| Workflow test | `Cool Meals — Leads WhatsApp [TEST]` / `306b341b-6bce-4507-8fd5-6a037efe6b10` |

**Nota:** en `workflow.ts` el trigger de source sigue con el phone id del sandbox. En Kapso remoto hay **dos** triggers. No hagas `kapso push` del workflow sin revisar que el de …5440 no se pierda. Ver [`environments.md`](./environments.md).

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

Secrets de la function (valores en Kapso, no en git):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` → **PROD** (número …5440)
- `SUPABASE_URL_DEV`, `SUPABASE_SERVICE_ROLE_KEY_DEV` → **DEV** (sandbox)
- `GOOGLE_SHEETS_WEBHOOK_URL`, `GOOGLE_SHEETS_WEBHOOK_SECRET` (y sheet ids) — solo aplica en ruta prod
- `KAPSO_API_BASE_URL`, `KAPSO_API_KEY` (ended/handoff **desde tools de cierre**, no desde `sync_derived`)
- `DERIVE_HANDOFF_HOURS` (default 24; ya no auto-finaliza derivados)

## Migraciones Supabase

Aplicar en **cada** proyecto (DEV y PROD), en SQL Editor, en orden:

1. `supabase/migrations/20260713000000_initial_schema.sql`
2. `supabase/migrations/20260719000000_phase0_bot_foundation.sql`
3. `supabase/migrations/20260720000000_derive_handoff_window.sql` ← `derived_at`, `finalize_at`
4. `supabase/migrations/20260720140000_quiere_ser_representante_fason.sql` ← columnas Pipeline
5. `supabase/migrations/20260724120000_sample_request_extra_fields.sql` (campos extra muestras)
6. Opcional solo **DEV**: `supabase/seed.sql`  
   Atajo DEV: `supabase/dev_bootstrap_otbyuvbdajqrcrtwlwvy.sql` (migrations + seed).

Sin (3), el código hace **fallback** a `updated_at` para timeouts; conviene aplicarla igual.

## Variables de entorno (API)

Ver `.env.example` y [`environments.md`](./environments.md). Críticas:

| Variable | Uso |
|----------|-----|
| `APP_ENV` | `development` \| `staging` \| `production` — bloquea sandbox-reset en prod |
| `KAPSO_*` | Handoff/ended, send text (nudge), list executions |
| `DERIVE_HANDOFF_HOURS` | Legacy (ya no auto-finaliza derivados/atención) |
| `ABANDONED_NUDGE_HOURS` | 20h mid-flujo (`nuevo`/`ia_atendiendo`) → 1 recontacto WA (sin cambiar columna) |
| `ABANDONED_TO_WAITING_HOURS` | 24h mid-flujo → Esperando respuesta + handoff |
| `ESPERANDO_TO_FINALIZE_HOURS` | 24h: `esperando_respuesta` → **Descartado** + ended |
| `SIN_COBERTURA_TO_DESCARTADO_HOURS` | 120h (5 días): `sin_cobertura` → cerrado oculto (ended; **no** Descartado; status `finalizado` + outcome `sin_cobertura`) |
| `STUCK_RUNNING_MINUTES` | Execution Kapso en `running` sin avanzar → `ended`. Default 3 |
| `ABANDONED_NUDGE_MESSAGE` | Texto del recordatorio WA |
| `CRON_SECRET` / `INTERNAL_API_SECRET` | Auth de `/api/cron/*` |
| `SANDBOX_RESET_ENABLED` | **`false`** en prod. `true` solo wipe puntual en DEV |
| `SANDBOX_RESET_UNTIL` | ISO datetime; pasado ese momento el endpoint no borra |
| `SANDBOX_RESET_PHONES` | Opcional CSV; vacío = todas las conversations |
| `GOOGLE_SHEETS_WEBHOOK_*` | Append muestras / atención / sin cobertura / **sheet del dist.** |
| `GOOGLE_SHEET_DERIVED_BY_DISTRIBUTOR` | JSON opcional `{"Nombre Dist":"spreadsheetId"}` merge sobre el mapa default |
| `GOOGLE_SHEET_DERIVED_DISTRIBUTORS_ID` | **Legacy** — ya no se usa si hay match por nombre de dist. |
| `GOOGLE_SHEET_COMMERCIAL_ATTENTION_ID` | Sheet dist / rep / fasón |
| `GOOGLE_SHEET_NO_COVERAGE_ID` | Sheet sin cobertura |
| `GOOGLE_SHEET_SAMPLE_LOGISTICS_ID` | Sheet muestras |

Web: `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_API_URL`.

## Sandbox reset (wipe a pedido)

Objetivo: mismo teléfono tipifica de nuevo sin esperar el lock de 1 año. **No** corre solo.

1. Default: `SANDBOX_RESET_ENABLED=false`. Con `APP_ENV=production` el endpoint **no borra** aunque el flag esté true.
2. Wipe puntual (solo DEV / API local o flag controlado): Kapso `ended` + delete cards, o cron con auth `CRON_SECRET`.
3. El workflow [`.github/workflows/sandbox-reset.yml`](../.github/workflows/sandbox-reset.yml) no es el flujo diario.

Ops: [`operator-cheat-sheet-bot.md`](./operator-cheat-sheet-bot.md) §7 · entornos: [`environments.md`](./environments.md).

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
4. Gates en function: `certainty=high`, provincia/volumen si aplica, `gateContactBeforeClose` en handoff/`sync_derived` (**excepto** `pedido_lead` / `pedido_cliente` y muestras/descartado).
5. Según `decide_route` (seguir `agentInstruction` / `coolMealsMenu`):

| action | Comportamiento |
|--------|----------------|
| `own_attention` + menú | ≥50: menú **solo** si aún no eligió. Si ya quiere **pedir** → Pedidos directo (sin menú) |
| `own_attention` sin menú | Córdoba &lt;50 → contacto + handoff `atencion_representante`. Copy: no “asesor de la zona” |
| `derive_to_distributor` | **mensaje** → `sync_derived` → `handoff_to_human` (sin `request_samples`). `sync_derived` **no** setea Kapso `handoff` |
| `no_coverage` | contacto → `sin_cobertura` → ~**5 días** oculto + ended (**no** Descartado) |
| `quiere_ser_representante` / `fason` | contacto + handoff a su columna |
| volumen incerto | handoff `atencion_representante` (remap si el modelo manda `quiere_ser_distribuidor`) |

**Pedidos (Pipeline only, sin Sheet):**
- Intención clara de pedir → `handoff_human` `pedido_lead` o `pedido_cliente` + `handoff_to_human` (Kapso `handoff`).
- **Cliente** (`isCustomer` / “somos clientes” / “ya trabajamos”): **skip** gate de contacto; alcanza phone WA.
- **Lead:** el agent puede pedir contacto en el mensaje de cierre, pero el gate **no bloquea** el handoff.
- Outcome `pedido`. Copy: asesor confirma stock/logística + lista opcional.
- `syncHandoffInterestSheets` / API sheets: **no** escriben fila por pedidos.

**Muestras (≥50):** datos envío → `request_samples` → mensaje representante → `handoff_human` `muestras` (**Kapso ended**, sin `handoff_to_human`). Card queda hasta Resultado. Nuevo WA → 2ª card fresca.

## Ruteo comercial

Orden en `decide_route`:

1. `representante` / `fason`  
2. volumen ≥ `minBundlesDefault` (50) → `own_attention` + `coolMealsMenu`  
3. Córdoba → operador sin menú  
4. sin dist → `no_coverage`  
5. con dist → `derive_to_distributor`

Umbral en **cajas** (bulto = caja). Embalaje: wraps 24 / platos 12 / postres 24 / palet 110.

## Timeouts de Pipeline (`/api/cron/pipeline-timeouts`)

Implementación: `apps/api/src/lib/finalize-derived.ts`. Cron diario (Hobby = 1×/día).

| Paso | Condición | Efecto |
|------|-----------|--------|
| 0 | Kapso `running` ≥ `STUCK_RUNNING_MINUTES` | `ended` (+ mensaje de recovery si mid-flujo) |
| 1 | `nuevo` / `ia_atendiendo` inactivo ≥ **20 h** | 1 WA recontacto; marker en `notes` (no cambia columna) |
| 2 | mismos statuses, ancla de inactividad ≥ **24 h** | → `esperando_respuesta` + handoff + `finalize_at` |
| 3a | `esperando_respuesta` ventana vencida | → `descartado` + ended |
| 3b | `sin_cobertura` ventana (~5 días) | → `finalizado` + outcome `sin_cobertura` + ended (card oculta; **no** Descartado) |

El recontacto bumpea `updated_at` (trigger Supabase); por eso el escalate usa ancla `notes` (`Auto: recontacto 20h enviado|anchor=…|at=…`).

## Sheets

- **Derivados:** **1 Google Sheet por distribuidor**. Mapa canónico en `derived-distributor-sheets.ts` y duplicado en `coolmeals-bot-actions` (`DEFAULT_DERIVED_DISTRIBUTOR_SHEETS`). Match por nombre (normalizado; fuzzy suave). Sin match → error de sheet (no escribe al master).
- Dist. actuales mapeados: FELIPE AVINCETA, GABASTOU JORGE ALBERTO, NOVA ERA SA, GudFud Distribuidora, La Corona Alimentos, Diprom.
- Alta de un dist nuevo: agregar ID al mapa (API + function) **o** `GOOGLE_SHEET_DERIVED_BY_DISTRIBUTOR` JSON; el nombre en tabla `distributors` debe matchear.
- Sheet master viejo “Distribuidores”: **no** recibe leads nuevos; puede quedar como **casa del Apps Script** webhook.
- Un sheet de **muestras** (logística).
- Un sheet de **atención comercial**: quiere ser **distribuidor / representante / fasón** — columna `tipo_cliente`.
- Un sheet de **sin cobertura**: datos para recontactar cuando haya zona.
- Preferido: Apps Script webhook (`GOOGLE_SHEETS_WEBHOOK_URL` + secret). La cuenta del script debe ser **Editor** en muestras / atención / sin cobertura **y en cada sheet por distribuidor**.
- El webhook **no** cambia por dist.: recibe `spreadsheetId` en el body y hace `appendRow`.
- Script: `apps/api/scripts/google-sheets-append.gs`
- Test: `npm run test:sheets -w @coolmeals/api` (prueba derivados con nombre real, ej. Diprom)

| Sheet | Cómo se elige el ID | Columnas |
|-------|---------------------|----------|
| Derivados (por dist.) | `resolveDerivedDistributorSheetId(distributorName)` | fecha, nombre, tel, empresa, tipo negocio, client_type, provincia, ciudad, CP, dist, seguimiento |
| Muestras | `GOOGLE_SHEET_SAMPLE_LOGISTICS_ID` | fecha, nombre, tel, **tipo_cliente**, empresa, provincia, dni, correo, CP, dirección completa |
| Atención comercial | `GOOGLE_SHEET_COMMERCIAL_ATTENTION_ID` | fecha, nombre, tel, empresa, **tipo_cliente**, provincia, ciudad, motivo, seguimiento |
| Sin cobertura | `GOOGLE_SHEET_NO_COVERAGE_ID` | fecha, nombre, tel, empresa, provincia, ciudad, client_type, motivo, seguimiento |

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
| 2 | Sin cobertura | Contacto + columna + handoff → ~**5 días** card oculta + ended (**no** Descartado) |
| 3 | Minorista Mendoza &lt;50 | Mensaje dist **antes** de `sync_derived` + fila en **sheet de ese dist.** + handoff |
| 4 | ≥50 cualquier provincia | Menú si no eligió; si ya quiere pedir → `pedido_lead`/`pedido_cliente` (sin Sheet) |
| 4b | Cliente + pedido | `pedido_cliente` sin pedir nombre/negocio |
| 5 | Córdoba &lt;50 | Atención humana sin menú; **no** “asesor de la zona”; pide contacto |
| 6 | Representante SER | Contacto + columna + handoff |
| 7 | Fasón | Contacto + columna + handoff |
| 8 | Recontacto &lt;1 año ya calificado | Sin lead nuevo; mensaje corto |
| 9 | Cards mismo teléfono (351 vs 54351) | Pipeline rojo + badge 1/2; KPI = 1 |
| 10 | Volumen incerto | Operador; no inventar bultos |

## Gaps conocidos / siguiente polish

1. ~~Número Meta prod~~ → **hecho:** …5440 conectado; sandbox → DEV vía `resolveRuntime`.
2. Confirmar migrations aplicadas en DEV y PROD (DEV bootstrap OK sep 2026).
3. Unificar `decide_route` (function vs `routing.ts`) o llamar siempre a la API.
4. Confirmar webhook Apps Script + Editor en **cada** sheet por dist. + muestras/atención/sin cobertura.
5. Auth real (hoy `optionalInternalAuth` / roles stub).
6. Tras cada `kapso build` + `update-graph`, **siempre** confirmar `function_id` en tools.
7. No cortar executions `waiting`/`handoff` mid-prueba al desplegar.
8. Deploy Vercel: **siempre** `--project tool-coolmeals-web` o `tool-coolmeals-api`.
9. Wipe sandbox solo a pedido; no reactivar cron 20 min; apagar trigger sandbox cuando no se pruebe.
10. Cuidado: `workflow.ts` source trigger = sandbox; no pisar trigger prod con `kapso push` ciego.

## Convención de cambios

- Editar `workflow.ts` (source of truth); `kapso build` → `definition.json` → `update-graph` (o `kapso push` si el remoto no está stale).
- Si Kapso dice “remote changed”: `kapso pull workflow coolmeals-leads --overwrite`, reaplicar cambios locales, push / update-graph.
- Function: `update-function` + `deploy-function` (no alcanza solo editar el archivo local). Incluye lógica DEV/PROD en `resolveRuntime`.
- No commitear `.env` ni secrets de Kapso.
- Separación de entornos: [`environments.md`](./environments.md).
