# Cool Meals — Cómo trabaja el bot (para operadores)

Una hoja para mostrar / imprimir. Actualizado: **13 ago 2026**.

> Guía larga: [`pipeline-bot-user-guide.md`](./pipeline-bot-user-guide.md)

---

## 1. Qué hace la IA (en orden)

```
Lead escribe por WhatsApp
        ↓
Saludo + link Beacons (catálogo, SIN precios)
        ↓
Califica: tipo de negocio + zona (+ volumen si aplica)
  (si algo no está claro → pregunta de desambiguación)
        ↓
Antes de cerrar: nombre + negocio + teléfono confirmado
        ↓
¿Qué decide el sistema?
```

| Situación | Qué pasa | Qué ves en Pipeline |
|-----------|----------|---------------------|
| Volumen **≥ 50 cajas** (cualquier provincia) | Menú: muestras o pedido | Atención humana → luego **Muestras** o se queda en atención |
| **Córdoba** y **&lt; 50** (o sin volumen) | Asesor Cool Meals (sin menú). **No** dice “asesor/distribuidor de la zona” | **Atención humana** |
| **Otra provincia** y **&lt; 50** | Distribuidor de zona | **Derivado** (+ hashtag naranja) |
| Sin distribuidor en la zona | Aviso sin cobertura | **Sin cobertura** → auto **Descartado** ~22 h |
| Volumen / precios inciertos | Operador; **no** inventa bultos bajos | **Atención humana** |
| Quiere **ser** rep / fasón | Cierre rápido + **handoff** | Columna correspondiente |
| Quiere **ser** distribuidor | Ver §1b | Columna + luego cierre por vol/zona |
| Consumidor final (casa / 1 unidad) | Cierre amable | **Descartado** |

### 1b. Quiere ser distribuidor (importante)

1. El bot hace las **4 preguntas** (congelados, depósito, logística, estructura).  
2. **4 SÍ** → la card va a **Quiere ser distribuidor**, pero el bot **NO se pausa** (no hay handoff todavía).  
3. Sigue: zona + volumen → ruteo → **ahí sí** handoff según el caso (≥50 menú, Córdoba &lt;50 asesor, fuera dist/sin cobertura).  
4. Si falta alguna de las 4 → no queda en esa columna; tipifica compra o Descartado.

**En una frase:** los 4 SÍ solo marcan la columna; el handoff viene después, con el ruteo comercial.

### 1c. Contacto obligatorio (antes de cualquier cierre comercial)

Toda derivación / handoff comercial pide:

1. **Nombre completo**  
2. **Nombre del negocio / local**  
3. **Teléfono confirmado** (aunque ya esté en WhatsApp: “¿este mismo número te sirve?”)

Si el lead **se niega** → va a **Atención humana** igual (sin inventar datos).  
No alcanza el nombre del perfil de WhatsApp.

**Excepciones:** consumidor **Descartado** y **Muestras** (esas ya piden ficha de envío).

### 1d. Derivado a dist. (orden)

1. Mensaje al lead: “te va a contactar [dist]…” + despedida.  
2. Recién ahí se registra la derivación.  
3. El bot se pausa.

Si se invierte el orden, el lead **no recibe** el mensaje.

---

## 2. Tres momentos: handoff · Kapso · cierre ops

### A) Cuándo la card hace **handoff** (bot se pausa)

| Flujo | ¿Handoff? | Momento |
|-------|-----------|---------|
| Quiere ser **representante** | Sí | Al confirmar *ser* rep (después del contacto) |
| Quiere ser **fasón** | Sí | Al confirmar fasón (después del contacto) |
| Quiere ser **distribuidor** (solo 4 SÍ) | **No** | Solo marca columna |
| Dist 4 SÍ → luego ≥50 / CBA &lt;50 / fuera | Sí | Al cerrar ese ruteo |
| Volumen / dato clave inseguro | Sí → **Atención humana** | Lead no sabe cuánto / necesita más data; no inventar &lt;50 ni sin_cobertura |
| **Atención humana** | Sí | Córdoba &lt;50, pedido del menú, “hablar con alguien”, 2ª vez precio/dato desconocido |
| **Derivado** | Sí | Tras el **mensaje** de cierre + registro |
| **Sin cobertura** | Sí | Al avisar sin zona |
| **Muestras** | **No** (`ended`) | Tras agendar muestras — card sigue hasta Resultado |
| **Descartado** (consumidor) | No `handoff_to_human` | IA a **ended** directo |
| Nuevo / IA atendiendo | No | Bot sigue |

### B) Cuándo se **cierra en Kapso** (execution → `ended`)

| Situación | ¿Kapso `ended`? |
|-----------|-----------------|
| Operador elige **Resultado** | Sí |
| Auto Sin cobertura ~22 h | Sí (+ Descartado) |
| Auto Esperando respuesta ~22 h | Sí (+ Finalizado) |
| Bot Descartado (consumidor) | Sí |
| Bot **Muestras** (agendadas) | Sí — card sigue en **Muestras** hasta Resultado |
| Solo handoff (Atención, Derivado, Quiere ser rep/fasón…) | **No** — queda en `handoff` hasta Resultado (o auto si aplica) |
| Execution trabada en `running` ≥3 min | Sí (watchdog) |

### C) Cuándo se **cierra para ustedes** (Pipeline limpio)

| Situación | Columna final | Quién |
|-----------|---------------|-------|
| Resultado éxito / sin éxito | **Finalizado** | Operador |
| Resultado Descartado | **Descartado** | Operador |
| Auto Sin cobertura | **Descartado** | Sistema ~22 h |
| Auto Esperando respuesta | **Finalizado** | Sistema ~22 h |
| Bot consumidor | **Descartado** | Bot |
| Card en Atención / Derivado / Muestras / Quiere ser… | Sigue **abierta** | Ustedes con Resultado |

**Resumen:** handoff = bot pausado · Kapso `ended` = hilo técnico muerto · cierre ops = Finalizado o Descartado.

---

## 3. Mismo teléfono = mismo lead (métricas)

El sistema trata como **el mismo número** `3513053755`, `543513053755` y `5493513053755` (formato canónico `54…`).

| Caso | ¿Lead nuevo en Dashboard? | ¿Tipifica de nuevo? |
|------|---------------------------|---------------------|
| &lt; 1 año, Nuevo / IA atendiendo | No (misma card) | Sí |
| &lt; 1 año, **Muestras** (IA ya ended) | **No** (Pipeline sí muestra 2ª card; KPI = la 1ª) | **Sí**, de cero — la 1ª queda en Muestras |
| &lt; 1 año, **ya calificado** (otras columnas) | **No** | **No** — “ya estás en proceso” |
| Última card **≥ 1 año** | **Sí** | **Sí**, de cero |

---

## 4. Dos cards del mismo teléfono (rojo + 1 / 2)

| Señal | Significado |
|-------|------------|
| Card **roja** | Hay otra con el **mismo teléfono** (aunque una esté escrita `351…` y la otra `54351…`) |
| Badge **1** | Ingresó **primero** |
| Badge **2** | La **segunda** |

**Qué hacer:** cerrá **las dos** con Resultado (la vigente según el caso; la otra Descartado o sin éxito). El rojo es solo aviso visual.

---

## 5. Métricas (para quedarte tranquilo)

Dashboard cuenta **personas** (teléfono canónico), no cada card.  
Si hay 2 cards rojas del mismo número en el período → **1 lead** (la más antigua).  
Pipeline igual muestra las dos: el rojo es para ops, no infla KPIs.

---

## 6. Checklist diario

- [ ] Revisar columnas de handoff  
- [ ] Cards **rojas**: cerrar 1 y 2  
- [ ] Sin cobertura / Esperando: auto ~22 h  
- [ ] Dashboard con filtro de fecha  

---

## 7. Sandbox — wipe **solo a pedido**

El reset automático **está apagado**. El mismo WhatsApp de prueba **no** se limpia solo cada 20 min.

Para retestear el mismo número hay que pedir wipe (Kapso `ended` en `waiting|running|handoff` + borrar cards / muestras en Supabase).

El endpoint `/api/cron/sandbox-reset` existe, pero **no** hay que dejar `SANDBOX_RESET_ENABLED=true` ni el workflow de GitHub activo en permanente.

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://tool-coolmeals-api-ten.vercel.app/api/cron/sandbox-reset"
```

Si `"enabled": false` / `"skippedReason"` → flag off (es lo esperado).

---

*Planilla técnica:* [`planilla-flujo-ia-definitiva.csv`](./planilla-flujo-ia-definitiva.csv)
