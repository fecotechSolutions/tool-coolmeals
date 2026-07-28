# Guía de uso — Pipeline + bot WhatsApp (Cool Meals / Froodie)

Documento para el equipo comercial y operadores. Explica **cómo se usa** el Pipeline y qué hace el bot de WhatsApp, sin entrar en código.

Actualizado: 24 julio 2026 (sandbox Kapso: calificación distribuidor con 4 requisitos + ruteos + sheets + dashboard).

> **Para probar todos los flujos mañana (paso a paso + planilla):**  
> [`operator-flow-test-guide.md`](./operator-flow-test-guide.md) — pensado para pasárselo al operador.

## Qué es esto

Un lead escribe al WhatsApp de Cool Meals / Froodie. Un bot (Kapso) lo atiende, califica y, según el caso:

- lo **deriva a un distribuidor** de la red,
- lo atiende **Cool Meals** (menú muestras / pedido),
- lo marca **sin cobertura**,
- o lo marca interés comercial: **quiere ser distribuidor** / **representante** / **fasón** (handoff; un asesor contacta por otro canal).

En handoffs el bot se pausa. **Auto-cierre (~22 h):** **Sin cobertura** → **Descartado** + ended; **Esperando respuesta** → **Finalizado** + ended. El resto queda hasta el desplegable **Resultado**.

Todo se ve en el **Pipeline** (`/pipeline`) y, si hay muestras Cool Meals, en **`/muestras`** + sheet de logística. Las métricas viven en el **Dashboard** (`/`).

Además, al cerrar interés comercial o sin cobertura, el bot escribe en Google Sheets:

- [Atención comercial](https://docs.google.com/spreadsheets/d/1HPiXbvKb6IdRJWqpynHNheQ1bzP-Swqg5xVeiVVsRdQ) — dist / rep / fasón (columna tipo de cliente)
- [Sin cobertura](https://docs.google.com/spreadsheets/d/10jeiXNXEUlHiOgJKqbwazQBWhOurSJWQBWyTnY6nENY) — para recontactar cuando haya zona

## Dónde mirar

| Lugar | Para qué |
|-------|----------|
| **Dashboard** (`/`) | Métricas del período: filtro Hoy / 7d / mes / personalizado; mix por tipo; **por provincia**; derivados por dist. |
| **Pipeline** (`/pipeline`) | Cards, columnas, hashtags, mover estados |
| **Distribuidores** | Red comercial por provincia (**no** es un Google Sheet) |
| **Config comercial** | Umbral de bultos (default 50) |
| **Muestras** (`/muestras`) | Agenda logística Cool Meals: nombre, teléfono, empresa, provincia, DNI, correo, CP, dirección completa + sync sheet |
| **Kapso → Executions** | `waiting` / `handoff` / `ended` |

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
| Finalizado | Cerrada (manual con resultado o auto ~22 h) | Terminal |
| Descartado | Sin perfil comercial viable | Terminal |
| Resultado (desplegable en card) | `Finalizado con éxito` / `Finalizado sin éxito` | Cierra ya → columna Finalizado |

## Umbral de 50 bultos / cajas (regla comercial)

**Unidades:** "bulto" y "caja" son lo mismo (1 bulto = 1 caja). Umbral = **≥ 50 bultos/cajas por mes**.

| Producto | Unidades por caja |
|----------|-------------------|
| Wraps | 24 |
| Platos listos | 12 |

Si el lead habla en unidades (ej. "1200 wraps"), el bot convierte a cajas (1200÷24 = 50) antes de aplicar el umbral.

| Tipo de cliente | ¿Aplica umbral 50? | Qué pasa |
|-----------------|--------------------|----------|
| **Distribuidor** (quiere serlo) | No | Primero 4 preguntas de requisitos. **4 sí** → **Quiere ser distribuidor** + handoff. Si falta alguna → explica requisitos + ofrece compra (no retail/mayorista auto). |
| **Representante** | No | Columna **Quiere ser representante** + handoff (sin menú muestras/pedido) |
| **Fasón** | No | Columna **Quiere ser fasón** + handoff (sin menú muestras/pedido) |
| **Retail** / **Mayorista** | Sí | **Córdoba + ≥50** → Cool Meals (menú muestras/pedido). **Fuera de Córdoba** (aunque ≥50) → distribuidores |
| **Minorista** | No | Siempre deriva si hay cobertura |
| **Otro** | No asumir umbral | Deriva o sin cobertura según zona |

Cobertura = tabla **Distribuidores**. Provincia sin dist. → **Sin cobertura**.

## Atención Cool Meals (Córdoba ≥50) — muestras / pedido

Cuando el lead califica para Cool Meals, el bot **ofrece siempre** (sin esperar a que lo pidan):

1. **Pedir muestras**  
2. **Agendar pedido**

### Si elige muestras

1. Pide Nombre y Apellido, Teléfono, Empresa, Provincia, DNI, Correo, Código postal y Dirección completa.  
2. Agenda en **`/muestras`** + **sheet de logística** (así logística ve qué enviar).  
3. Avisa que el **equipo de logística** se contacta para el envío (no “un asesor te arma las muestras”).  
4. Handoff; card en columna **Muestras**.  

En esta versión **no** hay seguimiento enviado/entregado/cancelado en la UI.

### Si elige pedido

- Card en **Atención humana** + handoff. El asesor comercial contacta (no es un transfer live por ese mismo chat).

## Interés comercial: representante / fasón / distribuidor

### Representante / fasón

Con la **intención clara** (sin formulario largo):

1. Bot confirma el interés.  
2. Avisa que un **asesor comercial te va a contactar** por teléfono/WhatsApp (**no** por ese número del bot).  
3. Se despide.  
4. Handoff; card en la columna correspondiente:
   - **Quiere ser representante**
   - **Quiere ser fasón** (incluye marca propia / maquila / “hacerme la comida con mi marca”)
5. Fila en el sheet [Atención comercial](https://docs.google.com/spreadsheets/d/1HPiXbvKb6IdRJWqpynHNheQ1bzP-Swqg5xVeiVVsRdQ) con **tipo_cliente**.

### Quiere ser distribuidor (calificación previa)

Si el lead quiere sumarse como distribuidor, el bot **pregunta antes** (no cierra ni hace handoff todavía):

1. ¿Trabajás actualmente con productos congelados?  
2. ¿Tenés depósito / cámara de congelados?  
3. ¿Contás con logística para productos congelados?  
4. ¿Contás con una estructura de distribución?

- **4 sí** → columna **Quiere ser distribuidor** + sheet Atención comercial + handoff (asesor contacta por otro canal + despedida).  
- **Falta alguna** → explica que son requisitos para ser distribuidor Cool Meals y ofrece seguir si quiere **hacer una compra**. No lo manda automático a retail/mayorista ni a la columna de distribuidor.

### Sin cobertura

Además del Pipeline, se anota en el sheet [Sin cobertura](https://docs.google.com/spreadsheets/d/10jeiXNXEUlHiOgJKqbwazQBWhOurSJWQBWyTnY6nENY) para recontactar cuando haya zona.

### Si el lead se deriva a un distribuidor (ej. Mendoza)

- Cool Meals **no** agenda la muestra ni escribe el sheet de logística.  
- El **distribuidor** se hace cargo → solo **Derivado** + handoff.

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

Resumen rápido:

| # | Caso | Mensaje | Esperado |
|---|------|---------|----------|
| 1 | Quiere ser distribuidor | `Hola, quiero ser distribuidor…` → 4 preguntas → 4 sí | **Quiere ser distribuidor** + sheet Atención comercial + handoff |
| 1b | Dist. sin requisitos | Misma intención + respuestas negativas a requisitos | Explica requisitos + ofrece compra; sin columna dist. |
| 2 | Sin cobertura | `Hola, rotisería en Salta, quiero productos` | **Sin cobertura** + sheet + handoff |
| 3 | Derivación | `Hola, minorista en Mendoza, compro poco` | **Derivado** `#Cool_Logistica_Cuyo` + handoff |
| 4 | Cool Meals CBA ≥50 | `Hola, mayorista en Córdoba Capital, ~60 bultos/mes` | Menú **muestras / pedido** |
| 5a | Muestras en zona con dist. | `Hola, rotisería en Mendoza, quiero muestras` | **Derivado** (sin fila Cool Meals en `/muestras`) |
| 5b | Muestras Cool Meals | Tras el menú de (4), elegir muestras → 3 datos | **Muestras** + `/muestras` + sheet + mensaje logística + handoff |
| 6 | Representante | `Hola, quiero ser representante comercial de Cool Meals en Buenos Aires` | **Quiere ser representante** + asesor contacta (no ese nº) + despedida + handoff |
| 7 | Fasón / marca propia | `quiero tener mi marca… hacerme la comida pero ponerle mi marca` | **Quiere ser fasón** + mismo cierre (sin formulario) |

Extra — volumen alto fuera de Córdoba:

- `Mayorista en Mendoza, ~80 bultos` → **Derivado** (no Cool Meals).

## Dashboard (métricas)

- Fuente: conversaciones del **Pipeline** (mismo dato que las cards).  
- Filtro: Hoy · 7 días · Este mes · 30 días · Personalizado (Desde/Hasta).  
- Incluye KPIs de operación, mix por tipo de cliente / interés, **por provincia** y derivados por distribuidor.  
- No hay series temporales: el filtro de fechas alcanza.

## Qué no hace (aún)

- Número de **producción** Meta (hoy sandbox).  
- Reabrir un chat Finalizado automáticamente.  
- Seguimiento de despacho de muestras (enviado/entregado) en la app.  
- Auth real de operadores / cron prod verificado end-to-end.

Si algo no cuadra: hora aprox., teléfono del lead, captura Pipeline + status Kapso.
