# Guía de uso — Pipeline + bot WhatsApp (Cool Meals / Froodie)

Documento para el equipo comercial y operadores. Explica **cómo se usa** el Pipeline y qué hace el bot de WhatsApp, sin entrar en código.

Actualizado: julio 2026 (sandbox Kapso: ruteos comerciales + muestras Cool Meals + representante/fasón validados).

## Qué es esto

Un lead escribe al WhatsApp de Cool Meals / Froodie. Un bot (Kapso) lo atiende, califica y, según el caso:

- lo **deriva a un distribuidor** de la red,
- lo atiende **Cool Meals** (menú muestras / pedido),
- lo marca **sin cobertura**,
- o lo marca interés comercial: **quiere ser distribuidor** / **representante** / **fasón** (handoff; un asesor contacta por otro canal).

En los cierres con handoff el bot se pausa (~24 h) y después la card pasa a **Finalizado** sola.

Todo se ve en el **Pipeline** (`/pipeline`) y, si hay muestras Cool Meals, en **`/muestras`** + sheet de logística.

Además, al cerrar interés comercial o sin cobertura, el bot escribe en Google Sheets:

- [Atención comercial](https://docs.google.com/spreadsheets/d/1HPiXbvKb6IdRJWqpynHNheQ1bzP-Swqg5xVeiVVsRdQ) — dist / rep / fasón (columna tipo de cliente)
- [Sin cobertura](https://docs.google.com/spreadsheets/d/10jeiXNXEUlHiOgJKqbwazQBWhOurSJWQBWyTnY6nENY) — para recontactar cuando haya zona

## Dónde mirar

| Lugar | Para qué |
|-------|----------|
| **Pipeline** (`/pipeline`) | Cards, columnas, hashtags, mover estados |
| **Distribuidores** | Red comercial por provincia (**no** es un Google Sheet) |
| **Config comercial** | Umbral de bultos (default 50) |
| **Muestras** (`/muestras`) | Agenda logística Cool Meals: nombre, teléfono, domicilio + sync sheet |
| **Kapso → Executions** | `waiting` / `handoff` / `ended` |

Canvas sandbox:  
https://app.kapso.ai/workflows/454904ce-8fba-423f-bf08-32135f694b14/canvas

## Columnas del Pipeline (resumen)

| Columna | Significado | ¿Handoff + 24h → Finalizado? |
|---------|-------------|------------------------------|
| Nuevo / IA atendiendo | El bot conversa / califica | No (salvo abandono mid-flujo) |
| Esperando respuesta | Abandono mid-flujo + nudge | Sí (~22 h post-nudge) |
| Atención humana | Cool Meals comercial (p. ej. eligió **pedido**) | Sí (~24 h) |
| Quiere ser representante | Interés en representar Cool Meals | Sí (~24 h) |
| Quiere ser fasón | Interés en producción a fasón | Sí (~24 h) |
| Quiere ser distribuidor | Quiere sumarse a la red | Sí (~24 h) |
| Derivado a distribuidor | Pasado a un dist. de la red | Sí (~24 h) |
| Sin cobertura | Sin dist. activo en esa provincia | Sí (~24 h) |
| Muestras | Cool Meals agendó envío de muestras (logística) | Sí (~24 h) |
| Pedido lead / Pedido cliente | Pedidos (manual / flujos posteriores) | Según flujo |
| Finalizado | Cerrada | Terminal |

## Umbral de 50 bultos (regla comercial)

| Tipo de cliente | ¿Aplica umbral 50? | Qué pasa |
|-----------------|--------------------|----------|
| **Distribuidor** (quiere serlo: depósito + logística de congelados) | No | **Quiere ser distribuidor** + handoff comercial |
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

1. Pide Nombre y Apellido + Teléfono + Domicilio.  
2. Agenda en **`/muestras`** + **sheet de logística** (así logística ve qué enviar).  
3. Avisa que el **equipo de logística** se contacta para el envío (no “un asesor te arma las muestras”).  
4. Handoff; card en columna **Muestras**.  

En esta versión **no** hay seguimiento enviado/entregado/cancelado en la UI.

### Si elige pedido

- Card en **Atención humana** + handoff. El asesor comercial contacta (no es un transfer live por ese mismo chat).

## Interés comercial: representante / fasón / distribuidor

Con la **intención clara** (sin formulario largo):

1. Bot confirma el interés.  
2. Avisa que un **asesor comercial te va a contactar** por teléfono/WhatsApp (**no** por ese número del bot).  
3. Se despide.  
4. Handoff; card en la columna correspondiente:
   - **Quiere ser representante**
   - **Quiere ser fasón** (incluye marca propia / maquila / “hacerme la comida con mi marca”)
   - **Quiere ser distribuidor**
5. Fila en el sheet [Atención comercial](https://docs.google.com/spreadsheets/d/1HPiXbvKb6IdRJWqpynHNheQ1bzP-Swqg5xVeiVVsRdQ) con **tipo_cliente**.

### Sin cobertura

Además del Pipeline, se anota en el sheet [Sin cobertura](https://docs.google.com/spreadsheets/d/10jeiXNXEUlHiOgJKqbwazQBWhOurSJWQBWyTnY6nENY) para recontactar cuando haya zona.

### Si el lead se deriva a un distribuidor (ej. Mendoza)

- Cool Meals **no** agenda la muestra ni escribe el sheet de logística.  
- El **distribuidor** se hace cargo → solo **Derivado** + handoff.

## Hashtags en la card

- **Naranja** `#Nombre_Del_Distribuidor` — una vez derivado, **persiste** aunque cambie de columna.  
- **Celeste** `#atencion_humana` — atención comercial Cool Meals (no se fuerza en Sin cobertura ni en Muestras).

## Cómo pasar a atención humana (manual)

Desplegable o drag a **Atención humana** / **Quiere ser distribuidor** / **Quiere ser representante** / **Quiere ser fasón** / **Sin cobertura** / **Muestras** según corresponda → handoff Kapso + ventana ~24 h.

## Derivar a un distribuidor

Bot (o drag manual + selector de dist.):

- fila en el **sheet único de derivados**,
- hashtag naranja,
- handoff ~24 h → Finalizado + `ended`.

## Tiempos automáticos

### Abandono mid-flujo (bot esperaba datos)

1. ~22 h inactivo → **Esperando respuesta** + mensaje WA  
2. Handoff  
3. ~22 h más → **Finalizado** + `ended`

### Post-handoff comercial / operativo

Aplica a: Derivado, Atención humana, Quiere ser distribuidor, Quiere ser representante, Quiere ser fasón, Sin cobertura, **Muestras**.

- ~24 h → **Finalizado** + `ended`

## Cómo ver que hubo handoff

1. Pipeline: columna correcta.  
2. Kapso Executions: `handoff`.  
3. Al cerrar: `ended` + **Finalizado**.

## Tips para probar (sandbox)

| # | Caso | Mensaje | Esperado |
|---|------|---------|----------|
| 1 | Quiere ser distribuidor | `Hola, quiero ser distribuidor en Mendoza, tengo depósito y logística de congelados` | **Quiere ser distribuidor** + handoff |
| 2 | Sin cobertura | `Hola, rotisería en Salta, quiero productos` | **Sin cobertura** + handoff |
| 3 | Derivación | `Hola, minorista en Mendoza, compro poco` | **Derivado** `#Cool_Logistica_Cuyo` + handoff |
| 4 | Cool Meals CBA ≥50 | `Hola, mayorista en Córdoba Capital, ~60 bultos/mes` | Menú **muestras / pedido** |
| 5a | Muestras en zona con dist. | `Hola, rotisería en Mendoza, quiero muestras` | **Derivado** (sin fila Cool Meals en `/muestras`) |
| 5b | Muestras Cool Meals | Tras el menú de (4), elegir muestras → 3 datos | **Muestras** + `/muestras` + sheet + mensaje logística + handoff |
| 6 | Representante | `Hola, quiero ser representante comercial de Cool Meals en Buenos Aires` | **Quiere ser representante** + asesor contacta (no ese nº) + despedida + handoff |
| 7 | Fasón / marca propia | `quiero tener mi marca… hacerme la comida pero ponerle mi marca` | **Quiere ser fasón** + mismo cierre (sin formulario) |

Extra — volumen alto fuera de Córdoba:

- `Mayorista en Mendoza, ~80 bultos` → **Derivado** (no Cool Meals).

## Qué no hace (aún)

- Número de **producción** Meta (hoy sandbox).  
- Reabrir un chat Finalizado automáticamente.  
- Seguimiento de despacho de muestras (enviado/entregado) en la app.  
- Auth real de operadores / cron prod verificado end-to-end.

Si algo no cuadra: hora aprox., teléfono del lead, captura Pipeline + status Kapso.
