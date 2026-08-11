# Guía de prueba y operación — Flujos WhatsApp Cool Meals / Froodie

Documento para el **operador comercial** (o quien valide el bot).  
Objetivo: probar **cada flujo** de punta a punta y saber **dónde mirar** si algo no cuadra.

Actualizado: **11 ago 2026**.

Planilla lógica + casos: [`planilla-flujo-ia-definitiva.csv`](./planilla-flujo-ia-definitiva.csv).

---

## 1. Qué vas a usar

| Herramienta | Para qué |
|-------------|----------|
| **WhatsApp** (sandbox) | Actuar como lead |
| **Pipeline** | Cards / columnas / Resultado |
| **Distribuidores** | Cobertura |
| **Dashboard** | Métricas |
| **Google Sheets** | Derivados / muestras / atención / sin cobertura |
| **Kapso Executions** | `waiting` / `handoff` / `ended` |

### Reglas comerciales (resumen)

| Tipo | Resultado típico |
|------|------------------|
| Rep / fasón (SER) | Su columna + handoff; sin menú |
| Dist 4 SÍ | Columna sin handoff → ruteo por vol/zona |
| ≥50 cualquier provincia | Menú Cool Meals |
| Córdoba &lt;50 | Operador sin menú |
| Fuera CBA &lt;50 | Dist o sin cobertura → auto Descartado |
| Consumidor final | Descartado |

Detalle y casos C01–C21: ver CSV.

---

## 3. Cómo mirar que “salió bien”

Para **cada** caso, marcá estas 3–4 cosas:

1. **WhatsApp:** el bot dijo lo esperado (derivación / asesor contacta / logística / menú, etc.).  
2. **Pipeline:** la card está en la **columna correcta** (y el hashtag naranja del dist. si corresponde).  
3. **Sheet** (si aplica): apareció una **fila nueva** con datos coherentes.  
4. **Kapso** (si tenés acceso): en handoffs típicos → `handoff`; en **Muestras** / Descartado → `ended`.

Después del handoff el bot **se pausa** (Atención / Derivado / etc.). En **Muestras** Kapso ya está `ended` y la card **sigue** hasta **Resultado**. Auto: **Sin cobertura** → **Descartado** ~22 h; **Esperando respuesta** → **Finalizado** ~22 h.

---

## 4. Reset entre pruebas (importante)

**Semana de pruebas (hasta ~20 ago 2026):** cada ~**20 min** un job automático limpia Kapso + Pipeline  
(mismo teléfono puede tipificar de nuevo). Ver cheat sheet §7 / Actions → **Sandbox reset**.  
No hace falta pedir reset a mano salvo que necesites probar **ya** (entonces: Actions → Run workflow, o esperá el próximo ciclo).

Si reutilizás el **mismo** WhatsApp **fuera** de esa ventana automática:

1. Pedile a quien tenga acceso Kapso que ponga la execution en **`ended`** (si sigue en `waiting` / `handoff` / `running`).  
2. Pedile que en Supabase / Pipeline deje la conversación “limpia” (o que cree una conversación nueva).  
3. **No** dejes una conversation a medias y arranques otro caso encima: el bot “recuerda” el hilo.

Si no podés resetear: esperá el auto-reset, usá **otro número**, o pedí un Run workflow manual.

---

## 5. Orden sugerido de prueba (como lo armamos)

Hacé los casos **en este orden**. Cada uno es independiente; tachá al completar.

| Orden | Caso | Sección |
|-------|------|---------|
| 1 | Quiere ser distribuidor (4 sí) | §6.1 |
| 1b | Quiere ser dist. sin requisitos | §6.1b |
| 2 | Sin cobertura | §6.2 |
| 3 | Minorista → derivado a dist. | §6.3 |
| 4 | Cool Meals Córdoba ≥50 (menú) | §6.4 |
| 5a | Muestras en zona con dist. (Mendoza) | §6.5 |
| 5b | Muestras Cool Meals (tras el menú) | §6.6 |
| 6 | Quiere ser representante | §6.7 |
| 7 | Fasón / marca propia | §6.8 |
| Extra | Mayorista ≥50 **fuera** de Córdoba → menú Cool Meals | CSV C11 |
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

1. El bot reconoce el interés y **antes de cerrar** pregunta (pueden ir juntas):
   - ¿Trabajás actualmente con productos congelados?
   - ¿Tenés depósito / cámara de congelados?
   - ¿Contás con logística para productos congelados?
   - ¿Contás con una estructura de distribución?
2. Si respondés **sí a las 4**:
   - **Pipeline** → columna **Quiere ser distribuidor**.
   - El bot **sigue** (zona + volumen). **Todavía no** hay handoff Kapso.
   - Después del ruteo (≥50 / Córdoba &lt;50 / fuera) → ahí sí handoff según el caso.
3. Si **falta alguna** de las 4:
   - No va a la columna Quiere ser distribuidor.
   - Tipifica camino de compra o Descartado si rechaza.

**No debe:** hacer handoff solo por los 4 SÍ; ni ir a “Derivado” solo por decir “quiero ser distribuidor” sin zona/volumen.

---

### 6.1b — Quiere ser distribuidor pero no cumple requisitos

**Mensaje inicial:**

```text
Hola, quiero ser distribuidor de Cool Meals en Córdoba
```

Cuando el bot pregunte los 4 requisitos, respondé algo como:

```text
No trabajo congelados todavía, no tengo cámara ni logística propia
```

**Qué tiene que pasar**

1. Explica con buen tono que esos son **requisitos** para sumarse como distribuidor Cool Meals.  
2. Ofrece seguir si querés **hacer una compra** / conocer productos.  
3. Si **acepta** compra → flujo comercial normal (tipo / zona / volumen).  
4. Si **no** quiere compra ni calza otro tipo de cliente → **Descartado** (IA `ended`; no queda en columnas activas).  
5. **No** columna Quiere ser distribuidor ni fila Atención comercial por ese camino.  
6. **No** te clasifica solo como retail/mayorista por haber fallado la calificación.

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

También vale decir **cajas** (mismo significado). Ej. wraps: 60 cajas ≈ 1440 unidades (24 u/caja).

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

**Datos a dar cuando el bot los pida (todos):**

1. Nombre y apellido  
2. Teléfono  
3. Empresa  
4. Provincia  
5. DNI  
6. Correo  
7. Código postal  
8. Dirección completa (calle, número, piso/depto si hay)

Ejemplo:

```text
Fernanda Romay, +543513053755, Cool Meals Test SA, Córdoba, 30111222, fernanda@test.com, 5000, Dean Funes 2425, Córdoba
```

**Qué tiene que pasar**

1. Confirma que las muestras quedaron **agendadas**.  
2. Dice que un **representante** se comunica para el seguimiento (no “un asesor te arma las muestras” / no solo “logística”).  
3. **Pipeline** → columna **Muestras** (la card **queda** hasta Resultado).  
4. Pantalla **`/muestras`** → aparece el registro.  
5. **Sheet de muestras** → fila nueva.  
6. Kapso → **`ended`** (no queda en `handoff`).  
7. Si el lead escribe de nuevo: tipificación **de cero** → **2ª card** (Pipeline rojo 1/2); la de Muestras no se mergea.

**No debe:** quedar en Atención humana solo por las muestras; usar `handoff_to_human`; ni prometer que “el asesor te va a armar el kit” por ese chat.

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

1. **Menú Cool Meals** (muestras / pedido) — el volumen ≥50 **gana** sobre la zona.  
2. **No** derivado a dist solo por estar en Mendoza.  
3. Si elige muestras → columna Muestras + sheet + Kapso `ended`; si pedido → Atención humana + handoff.

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
| Lead en **Muestras** | Logística mira `/muestras` + sheet muestras. Si el operador arrastra la card a Muestras desde otra columna (ej. Quiere ser distribuidor), se registra fecha/nombre/teléfono/**tipo de cliente**/empresa/provincia/dni/correo/CP/dirección (vacíos si no hay). |
| Card en **Finalizado** | Caso cerrado (manual con éxito/sin éxito, o auto tras ventana); no reaparece en columnas activas. El `outcome` queda para métricas. |
| Desplegable **Resultado** en cualquier card | `Finalizado con éxito` / `Finalizado sin éxito` → status `finalizado` + outcome + Kapso `ended` si el bot estaba activo; la card desaparece. |
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
| 1 | Quiere ser distribuidor (4 sí) | ☐ | ☐ | Atención comercial ☐ | ☐ | |
| 1b | Dist. sin requisitos → ofrece compra | ☐ | no columna dist. ☐ | — | — | |
| 2 | Sin cobertura | ☐ | ☐ | Sin cobertura ☐ | ☐ | |
| 3 | Minorista → derivado | ☐ | ☐ | Derivados ☐ | ☐ | |
| 4 | Menú Cool Meals CBA ≥50 | ☐ | ☐ | — | (aún no) | |
| 5a | Muestras Mendoza (derive) | ☐ | ☐ | sin sheet CM ☐ | ☐ | |
| 5b | Muestras Cool Meals | ☐ | ☐ | Muestras + `/muestras` + Kapso `ended` ☐ | ☐ | |
| 6 | Representante | ☐ | ☐ | Atención comercial ☐ | ☐ | |
| 7 | Fasón | ☐ | ☐ | Atención comercial ☐ | ☐ | |
| E1 | ≥50 fuera CBA → dist. | ☐ | ☐ | Derivados ☐ | ☐ | |
| E2 | Pedido Cool Meals | ☐ | Atención humana ☐ | — | ☐ | |
| D | Dashboard filtro + provincia | ☐ | — | — | — | |

---

## 11. Docs relacionados

- Uso general del Pipeline: [`pipeline-bot-user-guide.md`](./pipeline-bot-user-guide.md)  
- Desarrollo / deploy / Kapso: [`phase0-bot-developer-guide.md`](./phase0-bot-developer-guide.md)
