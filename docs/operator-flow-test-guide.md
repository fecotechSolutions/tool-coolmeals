# Guía de prueba y operación — Flujos WhatsApp Cool Meals / Froodie

Documento para el **operador comercial** (o quien valide el bot).  
Objetivo: probar **cada flujo** de punta a punta y saber **dónde mirar** si algo no cuadra.

Actualizado: **13 ago 2026**.

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
| Dist 4 SÍ | Columna sin handoff → zona/volumen → contacto → ruteo |
| ≥50 cualquier provincia | Menú Cool Meals |
| Córdoba &lt;50 | Operador sin menú (no “asesor de la zona”) |
| Fuera CBA &lt;50 | Dist o sin cobertura → auto Descartado |
| Volumen / precios inciertos | Operador; no inventar bultos |
| Consumidor final | Descartado |

**Cierre comercial:** el bot debe pedir nombre + negocio + tel confirmado **antes** de pausarse (salvo Descartado consumidor / ficha de Muestras).

Detalle y casos C01–C24: ver CSV.

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

El wipe automático **está apagado**. El mismo WhatsApp **no** se limpia solo.

Para reutilizar el **mismo** número:

1. Pedí wipe a quien tenga acceso: Kapso `ended` en executions `waiting` / `handoff` / `running`.  
2. Borrar (o pedir que borren) las cards / muestras de ese teléfono en Supabase.  
3. **No** dejes una conversation a medias y arranques otro caso encima: el bot “recuerda” el hilo.

Si no podés resetear: usá **otro número**, o esperá el lock de 1 año (no sirve para pruebas).

El cron `/api/cron/sandbox-reset` existe para un wipe puntual si alguien lo prende a propósito; **no** dejar `SANDBOX_RESET_ENABLED=true` permanente. Ver cheat sheet §7.

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
| Extra | Contacto obligatorio + Córdoba copy | §6.11 |
| Extra | Volumen incerto → operador | §6.12 |
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
   - Después del ruteo (≥50 / Córdoba &lt;50 / fuera) → pide **contacto** (nombre + negocio + tel) → ahí sí handoff según el caso.
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
2. Pide **contacto** (nombre + negocio + tel confirmado) **antes** de pausarse.  
3. **Pipeline** → **Sin cobertura**.  
4. **Sheet Sin cobertura** → fila nueva (datos para recontactar).  
5. Handoff.

**No debe:** derivar a un dist. inventado ni pedir muestras Cool Meals.

---

### 6.3 — Minorista → derivado a distribuidor

**Mensaje de prueba:**

```text
Hola, soy minorista en Mendoza, compro poco volumen, quiero productos
```

**Qué tiene que pasar**

1. El bot califica (tipo + zona).  
2. Pide **contacto**.  
3. **Mensaje primero:** “te va a contactar [dist]…” + despedida. Recién después registra.  
4. **Pipeline** → **Derivado a distribuidor** + hashtag naranja `#Nombre_Del_Distribuidor`.  
5. **Sheet de derivados** → fila nueva.  
6. Handoff.

**No debe:** pedir umbral de 50 bultos ni menú Cool Meals; ni callar después del contacto (hang).

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

**No debe:** derivar a un distribuidor de Córdoba por volumen alto ni decir “asesor/distribuidor de la zona”.

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
2. Pide **contacto** (nombre + negocio + tel).  
3. Avisa que un **asesor comercial te CONTACTA** (teléfono / otro WhatsApp — **no** por el número del bot).  
4. Se **despide**.  
5. **Pipeline** → **Quiere ser representante**.  
6. **Sheet Atención comercial** → `tipo_cliente` representante.  
7. Handoff.

**No debe:** dar a entender que “ahora te habla el representante por este mismo número”.

---

### 6.8 — Fasón / marca propia

**Mensaje de prueba:**

```text
Hola! quiero tener mi marca de alimentos congelados. queria saber si brindaban el servicio de hacerme la comida pero ponerle mi marca? gracias
```

**Qué tiene que pasar**

1. Reconoce **fasón** / marca propia.  
2. Pide **contacto**.  
3. Cierre similar al representante: asesor contacta por otro canal + despedida (sin formulario eterno).  
4. **Pipeline** → **Quiere ser fasón**.  
5. **Sheet Atención comercial** → `tipo_cliente` fasón.  
6. Handoff.

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
2. Pide **contacto** antes de pausarse.  
3. Handoff (asesor comercial sigue por el canal humano / handoff Kapso).  
4. **No** fila en `/muestras` por este camino.

---

### 6.11 — Contacto obligatorio + copy Córdoba

**Mensaje de prueba:**

```text
Hola, soy mayorista en Córdoba, compro unos 20 bultos por mes
```

Cuando pida datos, respondé nombre + negocio. Si confirma el mismo WA, está bien.

**Qué tiene que pasar**

1. **Atención humana** (Córdoba &lt;50, sin menú).  
2. Pide nombre completo + negocio + “¿este teléfono te sirve?”.  
3. **No** dice “asesor/distribuidor de la zona”.  
4. Mensaje de cierre + handoff. **No** se queda mudo después del nombre.

**No debe:** cerrar solo con el nombre del perfil de WhatsApp.

---

### 6.12 — Volumen incerto → operador

**Mensaje de prueba:**

```text
Hola, soy mayorista en Mendoza, más o menos 20 pero no sé, quiero ver precios
```

**Qué tiene que pasar**

1. **Atención humana** (no inventa bultos bajos ni deriva/sin cobertura por eso).  
2. Contacto + “un asesor te contacta para precios/volumen”.  
3. **No** columna Quiere ser distribuidor por este camino.

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

**Fuente de verdad:** conversaciones del Pipeline, **dedupe por teléfono canónico**.  
Si ves 2 cards rojas del mismo número → Dashboard cuenta **1** (la más antigua).

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
| Card en **Finalizado** | Visible **5 días** en la columna Finalizado; después **desaparece del Pipeline** (sigue en DB / Dashboard). |
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
| E1 | ≥50 fuera CBA → menú Cool Meals | ☐ | ☐ | Atención ☐ | ☐ | |
| E2 | Pedido Cool Meals | ☐ | Atención humana ☐ | — | ☐ | |
| E3 | Contacto + copy CBA | ☐ | Atención humana ☐ | — | ☐ | |
| E4 | Volumen incerto | ☐ | Atención humana ☐ | — | ☐ | |
| D | Dashboard: 2 cards mismo tel = 1 KPI | ☐ | — | — | — | |

---

## 11. Docs relacionados

- Uso general del Pipeline: [`pipeline-bot-user-guide.md`](./pipeline-bot-user-guide.md)  
- Desarrollo / deploy / Kapso: [`phase0-bot-developer-guide.md`](./phase0-bot-developer-guide.md)
