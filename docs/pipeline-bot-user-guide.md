# Guía de uso — Pipeline + bot WhatsApp (Cool Meals / Froodie)

Documento para el equipo comercial y operadores. Explica **cómo se usa** el Pipeline y qué hace el bot de WhatsApp, sin entrar en código.

Actualizado: **13 ago 2026** (contacto obligatorio, teléfonos canónicos, KPIs = 1ª card, sandbox wipe a pedido).

> **One-pager para operadores:** [`operator-cheat-sheet-bot.md`](./operator-cheat-sheet-bot.md)  
> **Planilla de lógica + casos:** [`planilla-flujo-ia-definitiva.csv`](./planilla-flujo-ia-definitiva.csv) + [`planilla-flujo-ia-anexo-prompt.md`](./planilla-flujo-ia-anexo-prompt.md)  
> **Pruebas E2E:** [`operator-flow-test-guide.md`](./operator-flow-test-guide.md).

## Qué es esto

Un lead escribe al WhatsApp de Cool Meals / Froodie. Un bot (Kapso) lo atiende, califica y, según el caso:

- **≥ 50 cajas** (cualquier provincia) → Cool Meals (menú **muestras / pedido**),
- **Córdoba + &lt; 50** → operador / atención humana Cool Meals (sin menú; **no** “asesor de la zona”),
- **fuera de Córdoba + &lt; 50** → **distribuidor** de zona o **sin cobertura**,
- volumen / precios **inciertos** → operador (no inventar bultos),
- interés: **quiere ser distribuidor** (4 SÍ → columna; luego ruteo por vol/zona), **representante** / **fasón** (handoff),
- **consumidor final** → **Descartado**.

Antes de cualquier cierre comercial el bot pide **nombre completo + negocio + teléfono confirmado** (aunque el WA ya tenga número).

En handoffs el bot se pausa. **Auto-cierre (~22 h):** **Sin cobertura** → **Descartado** + ended; **Esperando respuesta** → **Finalizado** + ended. El resto queda hasta el desplegable **Resultado** (`Finalizado con éxito` / `sin éxito` / `Descartado`).

Todo se ve en el **Pipeline** (`/pipeline`). Las métricas viven en el **Dashboard** (`/`).

Sheets: derivados, muestras, [atención comercial](https://docs.google.com/spreadsheets/d/1HPiXbvKb6IdRJWqpynHNheQ1bzP-Swqg5xVeiVVsRdQ), [sin cobertura](https://docs.google.com/spreadsheets/d/10jeiXNXEUlHiOgJKqbwazQBWhOurSJWQBWyTnY6nENY).

## Dónde mirar

| Lugar | Para qué |
|-------|----------|
| **Dashboard** (`/`) | Métricas del período; mix por tipo; **por provincia**; derivados por dist. |
| **Pipeline** (`/pipeline`) | Cards, columnas, hashtags, Resultado |
| **Distribuidores** | Red comercial por provincia |
| **Config comercial** | Umbral de bultos (default 50) |
| **Kapso → Executions** | `waiting` / `handoff` / `ended` |

> Menú web oculto por ahora: Muestras, Base de conocimiento, Prompt Manager (las rutas siguen existiendo).

Canvas sandbox:  
https://app.kapso.ai/workflows/454904ce-8fba-423f-bf08-32135f694b14/canvas

## Columnas del Pipeline (resumen)

| Columna | Significado | ¿Auto → Finalizado? |
|---------|-------------|---------------------|
| Nuevo / IA atendiendo | El bot conversa / califica | No (salvo abandono → Esperando respuesta) |
| Esperando respuesta | Abandono mid-flujo + nudge | Sí (~22 h) → Finalizado |
| Atención humana | Cool Meals comercial (p. ej. eligió **pedido**) | No — cierre manual |
| Quiere ser representante | Interés en representar Cool Meals | No — cierre manual |
| Quiere ser fasón | Interés en producción a fasón | No — cierre manual |
| Quiere ser distribuidor | Quiere sumarse a la red | No — cierre manual |
| Derivado a distribuidor | Pasado a un dist. de la red | No — cierre manual |
| Sin cobertura | Sin dist. activo en esa provincia | Sí (~22 h) → Descartado + ended |
| Muestras | Cool Meals agendó envío de muestras (logística) | No — cierre manual |
| Pedido lead / Pedido cliente | Pedidos (manual / flujos posteriores) | No — cierre manual |
| Finalizado | Cerrada (manual con resultado o auto ~22 h). **Visible 5 días** en Pipeline; después solo Dashboard/métricas | Terminal |
| Descartado | Sin perfil comercial viable | Terminal |
| Resultado (desplegable en card) | `Finalizado con éxito` / `Finalizado sin éxito` / `Descartado` | Cierra → Finalizado o Descartado + Kapso ended |

## Recontacto mismo teléfono (métricas)

`3513053755`, `543513053755` y `5493513053755` son **el mismo** teléfono (canon `54…`).

| Situación | Qué pasa |
|-----------|----------|
| Mismo WA, card **&lt; 1 año**, aún en Nuevo / IA atendiendo | Sigue calificando; misma card |
| Mismo WA, card **&lt; 1 año**, ya calificada (cualquier otra columna, incl. Finalizado/Descartado) | **No** lead nuevo en métricas; no se pisan tipo/zona/volumen/columna; bot solo mensaje corto de “ya estás en proceso” |
| Mismo WA, card en **Muestras** | Tipifica de cero → **2ª card** en Pipeline (sin merge). Dashboard **no** duplica: cuenta la 1ª |
| Mismo WA, última card **≥ 1 año** | **Nueva** conversación (`created_at` nuevo) → cuenta como lead nuevo y se recalifica |

Ventana: 365 días desde `created_at` de la card más reciente de ese teléfono.

## Cards duplicadas (mismo teléfono) — rojo + 1 / 2

Si hay **2+ cards** con el mismo número canónico:

- Ambas se ven **rojas** en el Pipeline.  
- Badge **1** = la que ingresó primero (`created_at` más vieja); **2** = la siguiente.  
- **Cerrá las dos** con Resultado cuando el caso esté resuelto (la vigente según corresponda; la otra Descartado / sin éxito).  
- El rojo **no** cambia el bot ni infla el Dashboard: los KPIs cuentan **solo la card más antigua**.

## Handoff vs cierre Kapso vs cierre ops

### Handoff (bot se pausa)

| Flujo | ¿Handoff? |
|-------|-----------|
| Quiere ser representante / fasón | Sí, al confirmar |
| Quiere ser distribuidor (solo 4 SÍ) | **No** — solo columna |
| Dist → ruteo posterior (≥50 / CBA / fuera) | Sí, al cerrar ese camino (después del contacto) |
| Volumen / precios inciertos | Sí → Atención humana |
| Atención humana / Derivado / Sin cobertura / pedido | Sí |
| Muestras (agendadas) | **No** — Kapso `ended`; card sigue hasta Resultado |
| Descartado consumidor | Ended directo (sin handoff humano) |

### Kapso `ended`

Resultado del operador; auto Sin cobertura / Esperando ~22 h; Descartado basura; **Muestras** al agendar; watchdog si `running` ≥3 min.  
Un handoff **solo** deja la execution en `handoff` hasta ese cierre (Atención / Derivado / etc.).

### Cierre para el equipo (Pipeline)

Card en **Finalizado** o **Descartado** (Resultado o auto). Mientras esté en Atención / Derivado / Muestras / Quiere ser… sigue **abierta** para ops.

## Umbral de 50 bultos / cajas (regla comercial)

**Unidades:** "bulto" = "caja". Umbral = **≥ 50 cajas/mes**.  
**Embalaje:** wraps 24 u/caja · platos 12 · postres 24 · palet **110 cajas** (todos).

| Tipo | ¿Umbral 50? | Qué pasa |
|------|-------------|----------|
| **Representante** / **Fasón** (SER) | No (ignoran vol.) | Su columna + handoff; **nunca** menú |
| **Quiere ser distribuidor** | Tras 4 SÍ, sí | 4 SÍ → columna **sin** handoff → luego mismo ruteo por vol/zona |
| **Retail / Mayorista / Dist 4 SÍ / quien da vol.** | Sí | **≥50 cualquier provincia** → menú Cool Meals. **&lt;50 Córdoba** → operador. **&lt;50 fuera** → dist / sin cobertura |
| **Minorista** (locales gastronómicos) | No se exige | Si da ≥50 → menú; si no → Córdoba operador / resto dist |

Cobertura = tabla **Distribuidores**. Sin dist. → **Sin cobertura** → auto **Descartado** ~22 h.

## Atención Cool Meals (≥50 — cualquier provincia)

Cuando el volumen es **≥ 50 cajas** (Córdoba u otra), el bot ofrece el menú:

1. **Pedir muestras**  
2. **Agendar / armar pedido**

### Si elige muestras

1. Datos de envío completos (nombre, tel, empresa, provincia, DNI, correo, CP, dirección).  
2. Sheet de logística + DB.  
3. Mensaje: se coordinan las muestras y un **representante** hace el seguimiento.  
4. Kapso **`ended`**; columna **Muestras** (card sigue hasta Resultado).  
5. Si reescribe: tipificación nueva → **2ª card** (sin merge con la de Muestras).

### Si elige pedido

- Contacto obligatorio (nombre + negocio + tel confirmado) → columna **Atención humana** + handoff (asesor contacta por otro canal).

## Contacto obligatorio (cierres comerciales)

Antes de derivar, handoff a operador, rep, fasón o sin cobertura, el bot pide:

- nombre completo,
- nombre del negocio/local,
- teléfono **confirmado** (aunque figure en WhatsApp).

Si se niega → **Atención humana** (`contactRefused`). No cierra solo con el perfil de WA.  
**Muestras** usan la ficha de envío. **Descartado** (consumidor) no pide esta ficha.

## Interés comercial: representante / fasón / distribuidor

### Representante / fasón (SER)

Intención clara de **ser** rep/fasón (no “hablar con un representante”):

1. Confirma interés → pide contacto → asesor te contacta → handoff a su columna + sheet Atención comercial.  
2. **Nunca** menú muestras aunque den volumen alto.

> Pedir hablar con un humano / representante → **Atención humana**, no “Quiere ser representante”.

### Quiere ser distribuidor

1. **4 preguntas** (congelados, depósito/cámara, logística, estructura).  
2. **4 SÍ** → columna **Quiere ser distribuidor** vía upsert — **sin handoff** (el bot sigue).  
3. Zona + volumen → mismo ruteo que cualquier lead (≥50 menú / Córdoba &lt;50 operador / fuera dist o sin cobertura) → contacto → **ahí sí** handoff.  
4. **Falta alguna** → no queda en esa columna; tipificar compra o Descartado.

> Los 4 SÍ solo marcan interés en la columna. El handoff no es en ese momento.

### Sin cobertura

Sheet Sin cobertura. Auto ~22 h → **Descartado**.

### Derivado a dist (fuera CBA + &lt;50)

Cool Meals **no** agenda muestras; el dist se hace cargo.

**Orden obligatorio** (si se invierte, el lead no recibe WhatsApp):

1. Mensaje: “Te va a contactar [nombre del dist]…” + despedida.  
2. Registro (`sync_derived`).  
3. Handoff (bot se pausa).

## Hashtags en la card

- **Naranja** `#Nombre_Del_Distribuidor` — una vez derivado, **persiste** aunque cambie de columna.  
- **Celeste** `#atencion_humana` — atención comercial Cool Meals (no se fuerza en Sin cobertura ni en Muestras).

## Cómo pasar a atención humana (manual)

Desplegable o drag a **Atención humana** / **Quiere ser distribuidor** / **Quiere ser representante** / **Quiere ser fasón** / **Sin cobertura** / **Muestras** según corresponda → handoff Kapso. **Sin cobertura** agenda auto-cierre (~22 h → Descartado); el resto queda hasta cierre manual con **Resultado**.

Si movés una card a **Muestras** (aunque venga de Quiere ser distribuidor / handoff ya cerrado):
- Se escribe en el **sheet de muestras** con fecha, nombre, teléfono, **tipo de cliente**, empresa, provincia, DNI, correo, CP y dirección completa (campos vacíos si el operador solo movió la card).
- También queda registro en **`/muestras`**.

## Derivar a un distribuidor

Bot (o drag manual + selector de dist.):

- fila en el **sheet único de derivados**,
- hashtag naranja,
- handoff del bot (queda en la columna; **no** auto-finaliza — cierre manual con Resultado).

## Tiempos automáticos

### Abandono mid-flujo (bot esperaba datos)

1. ~22 h inactivo → **Esperando respuesta** + mensaje WA  
2. Handoff  
3. ~22 h más → **Finalizado** + `ended`

### Post-handoff: solo Sin cobertura

- **Sin cobertura** → ~22 h → **Descartado** + `ended`
- Derivado, Atención humana, Quiere ser dist/rep/fasón, Muestras, Pedidos → **no** auto-finalizan

## Cómo ver que hubo handoff

1. Pipeline: columna correcta.  
2. Kapso Executions: `handoff`.  
3. Al cerrar (manual o auto en sin cobertura / esperando): `ended` + **Finalizado**.

## Tips para probar (sandbox)

La guía completa (mensajes, checklist, reset entre casos, planilla) está en  
[`operator-flow-test-guide.md`](./operator-flow-test-guide.md).

**Wipe sandbox:** el reset automático **está apagado**. Para reusar el mismo WhatsApp hay que pedir wipe (Kapso `ended` + borrar cards). Detalle: cheat sheet §7.

Resumen rápido:

| # | Caso | Mensaje | Esperado |
|---|------|---------|----------|
| 1 | Dist 4 SÍ + vol/zona | 4 sí → zona + volumen | Columna dist + luego menú / operador / derivado según vol |
| 1b | Dist sin requisitos | Algún NO | Sin columna dist; tipificar compra o Descartado |
| 2 | Sin cobertura | Rotisería Salta | **Sin cobertura** → auto **Descartado** ~22 h |
| 3 | Minorista Mendoza | Rotisería Mendoza poco | **Derivado** |
| 4 | ≥50 Córdoba | Mayorista CBA ~60 | Menú muestras/pedido |
| 5 | ≥50 Mendoza | Mayorista Mendoza ~80 | Menú Cool Meals (volumen gana) |
| 6 | &lt;50 Córdoba | Mayorista CBA ~20 | **Atención humana** sin menú |
| 7 | Representante SER | Quiero ser representante… | Columna rep |
| 8 | Hablar con humano | Quiero hablar con un representante | **Atención humana** (no columna rep) |
| 9 | Consumidor | 1 wrap a domicilio | **Descartado** |

Planilla completa: [`planilla-flujo-ia-definitiva.csv`](./planilla-flujo-ia-definitiva.csv).

## Dashboard (métricas)

- Fuente: conversaciones del **Pipeline** (mismo dato que las cards).  
- Filtro: Hoy · 7 días · Este mes · 30 días · Personalizado (Desde/Hasta).  
- Incluye KPIs de operación, mix por tipo de cliente / interés, **por provincia** y derivados por distribuidor.  
- **Dedupe:** 1 teléfono canónico = 1 lead (cuenta la card más antigua). Dos cards rojas no duplican KPIs.  
- No hay series temporales: el filtro de fechas alcanza.

## Qué no hace (aún)

- Número de **producción** Meta (hoy sandbox).  
- Reabrir un chat Finalizado automáticamente.  
- Seguimiento de despacho de muestras (enviado/entregado) en la app.  
- Auth real de operadores / cron prod verificado end-to-end.

Si algo no cuadra: hora aprox., teléfono del lead, captura Pipeline + status Kapso.
