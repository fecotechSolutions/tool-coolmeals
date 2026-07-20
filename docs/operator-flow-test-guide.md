# Guía de prueba y operación — Flujos WhatsApp Cool Meals / Froodie

Documento para el **operador comercial** (o quien valide el bot).  
Objetivo: probar **cada flujo** de punta a punta y saber **dónde mirar** si algo no cuadra.

Actualizado: 20 julio 2026 (sandbox Kapso).

---

## 1. Qué vas a usar

| Herramienta | Para qué |
|-------------|----------|
| **WhatsApp** (número sandbox Cool Meals) | Escribís como si fueras el lead |
| **Pipeline** (`/pipeline` en la app) | Cards, columnas, hashtags |
| **Muestras** (`/muestras`) | Solo cuando Cool Meals agenda envío de muestras |
| **Distribuidores** | Cobertura por provincia (si falta un dist., aparece Sin cobertura) |
| **Dashboard** (`/` o inicio) | Métricas del período (filtro de fechas + por provincia) |
| **Google Sheets** | Filas nuevas al cerrar ciertos flujos (ver abajo) |
| **Kapso → Executions** (opcional) | Estado técnico: `waiting` / `handoff` / `ended` |

Canvas Kapso (sandbox):  
https://app.kapso.ai/workflows/454904ce-8fba-423f-bf08-32135f694b14/canvas

### Sheets que se llenan solos

| Sheet | Cuándo se escribe |
|-------|-------------------|
| [Atención comercial](https://docs.google.com/spreadsheets/d/1HPiXbvKb6IdRJWqpynHNheQ1bzP-Swqg5xVeiVVsRdQ) | Quiere ser **distribuidor**, **representante** o **fasón** (columna `tipo_cliente`) |
| [Sin cobertura](https://docs.google.com/spreadsheets/d/10jeiXNXEUlHiOgJKqbwazQBWhOurSJWQBWyTnY6nENY) | Provincia sin distribuidor activo |
| Sheet **derivados** (logística / red) | Lead derivado a un distribuidor de la red |
| Sheet **muestras** (logística Cool Meals) | Solo muestras agendadas por Cool Meals (Córdoba ≥50 + eligió muestras) |

---

## 2. Antes de empezar (checklist)

1. Abrí el **Pipeline** y el WhatsApp del **mismo** número de prueba.  
2. Confirmá en **Distribuidores** que haya cobertura al menos en **Mendoza** y **Córdoba** (y que **Salta** u otra provincia sin dist. sirva para “sin cobertura”).  
3. Tené a mano los 4 sheets (o pedile a Fer / tech el acceso Editor / Viewer).  
4. **Un flujo por conversación.** Si mezclás intenciones en el mismo chat, el bot puede confundirse.  
5. Entre un caso y el siguiente, pedí **reset del tester** (ver sección 4) o usá otro teléfono / contactá a quien administre Kapso + Supabase.

### Reglas comerciales (para no dudar al probar)

| Tipo de lead | Umbral 50 bultos | Resultado típico |
|--------------|------------------|------------------|
| Quiere ser **distribuidor** | No aplica | Columna Quiere ser distribuidor + sheet Atención comercial |
| Quiere ser **representante** | No aplica | Columna Quiere ser representante + sheet Atención comercial |
| **Fasón** / marca propia | No aplica | Columna Quiere ser fasón + sheet Atención comercial |
| **Minorista** | No aplica | Deriva a dist. si hay zona |
| **Retail / mayorista** | Sí | **Córdoba + ≥50** → Cool Meals (menú muestras/pedido). **Fuera de Córdoba** aunque ≥50 → dist. |
| Provincia **sin** dist. | — | Sin cobertura + sheet Sin cobertura |

---

## 3. Cómo mirar que “salió bien”

Para **cada** caso, marcá estas 3–4 cosas:

1. **WhatsApp:** el bot dijo lo esperado (derivación / asesor contacta / logística / menú, etc.).  
2. **Pipeline:** la card está en la **columna correcta** (y el hashtag naranja del dist. si corresponde).  
3. **Sheet** (si aplica): apareció una **fila nueva** con datos coherentes.  
4. **Kapso** (si tenés acceso): execution en `handoff` (y más tarde `ended` cuando pasan ~24 h).

Después del handoff el bot **se pausa**. No hace falta seguir chateando: el caso ya cerró en sistema. A ~24 h la card debería pasar a **Finalizado** sola (cron).

---

## 4. Reset entre pruebas (importante)

Si reutilizás el **mismo** WhatsApp:

1. Pedile a quien tenga acceso Kapso que ponga la execution en **`ended`** (si sigue en `waiting` / `handoff` / `running`).  
2. Pedile que en Supabase / Pipeline deje la conversación “limpia” (o que cree una conversación nueva).  
3. **No** dejes una conversation a medias y arranques otro caso encima: el bot “recuerda” el hilo.

Si no podés resetear: esperá o usá **otro número** de tester.

---

## 5. Orden sugerido de prueba (como lo armamos)

Hacé los casos **en este orden**. Cada uno es independiente; tachá al completar.

| Orden | Caso | Sección |
|-------|------|---------|
| 1 | Quiere ser distribuidor | §6.1 |
| 2 | Sin cobertura | §6.2 |
| 3 | Minorista → derivado a dist. | §6.3 |
| 4 | Cool Meals Córdoba ≥50 (menú) | §6.4 |
| 5a | Muestras en zona con dist. (Mendoza) | §6.5 |
| 5b | Muestras Cool Meals (tras el menú) | §6.6 |
| 6 | Quiere ser representante | §6.7 |
| 7 | Fasón / marca propia | §6.8 |
| Extra | Mayorista ≥50 **fuera** de Córdoba | §6.9 |
| Extra | Pedido (opción del menú Cool Meals) | §6.10 |
| Cierre | Dashboard / métricas | §7 |

---

## 6. Casos paso a paso

### 6.1 — Quiere ser distribuidor

**Mensaje de prueba (copiar/pegar):**

```text
Hola, quiero ser distribuidor en Mendoza, tengo depósito y logística de congelados
```

**Qué tiene que pasar**

1. El bot reconoce el interés (puede pedir 1–2 datos cortos, no un formulario eterno).  
2. Dice que un **asesor comercial te va a contactar** (por otro canal / no “te atiendo yo por este número”).  
3. Se **despide**.  
4. **Pipeline** → columna **Quiere ser distribuidor**.  
5. **Sheet Atención comercial** → fila nueva con `tipo_cliente` = distribuidor (o similar).  
6. Kapso → `handoff`.

**No debe:** ir a “Derivado a distribuidor” ni a “Atención humana” genérica.

---

### 6.2 — Sin cobertura

**Mensaje de prueba:**

```text
Hola, tengo una rotisería en Salta y quiero productos Cool Meals / Froodie
```

*(Usá una provincia que **no** tenga distribuidor activo en la tabla Distribuidores.)*

**Qué tiene que pasar**

1. Avisa que por ahora no hay cobertura en esa zona.  
2. **Pipeline** → **Sin cobertura**.  
3. **Sheet Sin cobertura** → fila nueva (datos para recontactar).  
4. Handoff.

**No debe:** derivar a un dist. inventado ni pedir muestras Cool Meals.

---

### 6.3 — Minorista → derivado a distribuidor

**Mensaje de prueba:**

```text
Hola, soy minorista en Mendoza, compro poco volumen, quiero productos
```

**Qué tiene que pasar**

1. El bot califica (tipo + zona).  
2. Deriva al dist. de la zona (ej. Cool Logística Cuyo).  
3. **Pipeline** → **Derivado a distribuidor** + hashtag naranja `#Nombre_Del_Distribuidor`.  
4. **Sheet de derivados** → fila nueva.  
5. Handoff.

**No debe:** pedir umbral de 50 bultos ni menú Cool Meals.

---

### 6.4 — Cool Meals (Córdoba + volumen alto) — menú muestras / pedido

**Mensaje de prueba:**

```text
Hola, soy mayorista en Córdoba Capital, compro alrededor de 60 bultos por mes
```

**Qué tiene que pasar**

1. Califica para **atención directa Cool Meals**.  
2. **Ofrece siempre** (sin que vos lo pidas primero):  
   - pedir **muestras**, o  
   - **agendar pedido**.  
3. Todavía **no** hace handoff hasta que elijas una opción.

**Pará acá** si solo querés validar el menú; seguí con 6.6 (muestras) o 6.10 (pedido).

**No debe:** derivar a un distribuidor de Córdoba por volumen alto.

---

### 6.5 — Pide muestras pero está en zona con dist. (ej. Mendoza)

**Mensaje de prueba:**

```text
Hola, tengo una rotisería en Mendoza y quiero muestras de wraps
```

**Qué tiene que pasar**

1. **Derivado a distribuidor** (el dist. se hace cargo de las muestras).  
2. Hashtag naranja del dist.  
3. **No** aparece fila nueva en `/muestras` ni en el sheet de logística Cool Meals.  
4. Handoff.

---

### 6.6 — Muestras Cool Meals (continuación de 6.4)

Partí del menú de **6.4** y elegí **pedir muestras**.

**Datos a dar cuando el bot los pida (los 3):**

1. Nombre y apellido  
2. Teléfono  
3. Domicilio completo (calle, número, CP / ciudad)

Ejemplo:

```text
Fernanda Romay, +543513053755, Dean Funes 2425, Córdoba, CP 5000, horario 8 a 18
```

**Qué tiene que pasar**

1. Confirma que las muestras quedaron **agendadas**.  
2. Dice que el **equipo de logística** se contacta para el envío (no “un asesor te arma las muestras”).  
3. **Pipeline** → columna **Muestras**.  
4. Pantalla **`/muestras`** → aparece el registro.  
5. **Sheet de muestras** → fila nueva.  
6. Handoff.

**No debe:** quedar en Atención humana solo por las muestras, ni prometer que “el asesor te va a armar el kit” por ese chat.

---

### 6.7 — Quiere ser representante

**Mensaje de prueba:**

```text
Hola, quiero ser representante comercial de Cool Meals en Buenos Aires
```

**Qué tiene que pasar**

1. Confirma el interés (sin formulario largo).  
2. Avisa que un **asesor comercial te CONTACTA** (teléfono / otro WhatsApp — **no** por el número del bot).  
3. Se **despide**.  
4. **Pipeline** → **Quiere ser representante**.  
5. **Sheet Atención comercial** → `tipo_cliente` representante.  
6. Handoff.

**No debe:** dar a entender que “ahora te habla el representante por este mismo número”.

---

### 6.8 — Fasón / marca propia

**Mensaje de prueba:**

```text
Hola! quiero tener mi marca de alimentos congelados. queria saber si brindaban el servicio de hacerme la comida pero ponerle mi marca? gracias
```

**Qué tiene que pasar**

1. Reconoce **fasón** / marca propia.  
2. Cierre similar al representante: asesor contacta por otro canal + despedida (sin formulario eterno).  
3. **Pipeline** → **Quiere ser fasón**.  
4. **Sheet Atención comercial** → `tipo_cliente` fasón.  
5. Handoff.

**No debe:** reiniciar la charla preguntando de cero “qué tipo de negocio es…” si ya se entendió fasón.

---

### 6.9 — Extra: volumen alto fuera de Córdoba

**Mensaje de prueba:**

```text
Hola, soy mayorista en Mendoza, compro unos 80 bultos por mes
```

**Qué tiene que pasar**

1. **Derivado a distribuidor** (aunque el volumen sea alto).  
2. **No** menú Cool Meals.  
3. Sheet derivados + handoff.

---

### 6.10 — Extra: pedido (menú Cool Meals)

Partí de **6.4** y elegí **agendar pedido** (no muestras).

**Qué tiene que pasar**

1. **Pipeline** → **Atención humana**.  
2. Handoff (asesor comercial sigue por el canal humano / handoff Kapso).  
3. **No** fila en `/muestras` por este camino.

---

## 7. Dashboard (métricas)

Cuando hayas corrido varios casos:

1. Entrá al **Dashboard** (inicio de la app).  
2. Filtrá por fecha: **Hoy** / **7 días** / **Este mes** / **Personalizado**.  
3. Verificá que los números se muevan con el filtro (no mirés series temporales: ya no están).  
4. Revisá:  
   - leads / conversaciones del período  
   - mix por tipo (mayorista, retail, minorista, intereses)  
   - **por provincia**  
   - derivados por distribuidor  

**Fuente de verdad:** lo mismo que ves en el **Pipeline** (conversaciones), no una tabla aparte de “leads viejos”.

Si el filtro dice “Hoy” y no ves un caso de ayer: es correcto.

---

## 8. Operación día a día (después de las pruebas)

| Situación | Qué hacer |
|-----------|-----------|
| Lead en **Derivado** | El dist. (sheet + hashtag) contacta; vos podés seguir en sheet derivados |
| Lead en **Atención humana** / **pedido** | Asesor Cool Meals contacta |
| Lead en **Quiere ser dist. / rep. / fasón** | Revisá sheet **Atención comercial** y contactá por otro canal |
| Lead en **Sin cobertura** | Sheet **Sin cobertura** → lista de recontacto cuando haya zona |
| Lead en **Muestras** | Logística mira `/muestras` + sheet muestras |
| Card en **Finalizado** | Caso cerrado; no reabrir por el mismo hilo del bot (por ahora) |
| Querés tomar el caso a mano | Arrastrá / cambiá estado a la columna que corresponda (handoff manual) |

### Qué no hace el sistema (aún)

- Número de **producción** Meta (hoy es sandbox).  
- Reabrir automáticamente un chat ya Finalizado.  
- Estados de envío de muestras (enviado / entregado) en la UI.  
- Login de operadores con roles reales (auth stub).

---

## 9. Si algo falla — qué anotar

Mandale a soporte / tech:

1. **Hora aproximada** del mensaje.  
2. **Teléfono** del lead / tester.  
3. **Captura** del chat de WhatsApp.  
4. **Captura** de la card en Pipeline (columna + hashtags).  
5. Si podés: status en Kapso (`waiting` / `handoff` / error).  
6. Si faltó la fila: qué sheet miraste.

---

## 10. Planilla rápida (imprimí o copiá)

| # | Caso | WA OK | Pipeline OK | Sheet OK | Handoff OK | Notas |
|---|------|-------|-------------|----------|------------|-------|
| 1 | Quiere ser distribuidor | ☐ | ☐ | Atención comercial ☐ | ☐ | |
| 2 | Sin cobertura | ☐ | ☐ | Sin cobertura ☐ | ☐ | |
| 3 | Minorista → derivado | ☐ | ☐ | Derivados ☐ | ☐ | |
| 4 | Menú Cool Meals CBA ≥50 | ☐ | ☐ | — | (aún no) | |
| 5a | Muestras Mendoza (derive) | ☐ | ☐ | sin sheet CM ☐ | ☐ | |
| 5b | Muestras Cool Meals | ☐ | ☐ | Muestras + `/muestras` ☐ | ☐ | |
| 6 | Representante | ☐ | ☐ | Atención comercial ☐ | ☐ | |
| 7 | Fasón | ☐ | ☐ | Atención comercial ☐ | ☐ | |
| E1 | ≥50 fuera CBA → dist. | ☐ | ☐ | Derivados ☐ | ☐ | |
| E2 | Pedido Cool Meals | ☐ | Atención humana ☐ | — | ☐ | |
| D | Dashboard filtro + provincia | ☐ | — | — | — | |

---

## 11. Docs relacionados

- Uso general del Pipeline: [`pipeline-bot-user-guide.md`](./pipeline-bot-user-guide.md)  
- Desarrollo / deploy / Kapso: [`phase0-bot-developer-guide.md`](./phase0-bot-developer-guide.md)
