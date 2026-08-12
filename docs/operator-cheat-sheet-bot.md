# Cool Meals — Cómo trabaja el bot (para operadores)

Una hoja para mostrar / imprimir. Actualizado: **11 ago 2026**.

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
¿Qué decide el sistema?
```

| Situación | Qué pasa | Qué ves en Pipeline |
|-----------|----------|---------------------|
| Volumen **≥ 50 cajas** (cualquier provincia) | Menú: muestras o pedido | Atención humana → luego **Muestras** o se queda en atención |
| **Córdoba** y **&lt; 50** (o sin volumen) | Asesor Cool Meals (sin menú) | **Atención humana** |
| **Otra provincia** y **&lt; 50** | Distribuidor de zona | **Derivado** (+ hashtag naranja) |
| Sin distribuidor en la zona | Aviso sin cobertura | **Sin cobertura** → auto **Descartado** ~22 h |
| Quiere **ser** rep / fasón | Cierre rápido + **handoff** | Columna correspondiente |
| Quiere **ser** distribuidor | Ver §1b | Columna + luego cierre por vol/zona |
| Consumidor final (casa / 1 unidad) | Cierre amable | **Descartado** |

### 1b. Quiere ser distribuidor (importante)

1. El bot hace las **4 preguntas** (congelados, depósito, logística, estructura).  
2. **4 SÍ** → la card va a **Quiere ser distribuidor**, pero el bot **NO se pausa** (no hay handoff todavía).  
3. Sigue: zona + volumen → ruteo → **ahí sí** handoff según el caso (≥50 menú, Córdoba &lt;50 asesor, fuera dist/sin cobertura).  
4. Si falta alguna de las 4 → no queda en esa columna; tipifica compra o Descartado.

**En una frase:** los 4 SÍ solo marcan la columna; el handoff viene después, con el ruteo comercial.

---

## 2. Tres momentos: handoff · Kapso · cierre ops

### A) Cuándo la card hace **handoff** (bot se pausa)

| Flujo | ¿Handoff? | Momento |
|-------|-----------|---------|
| Quiere ser **representante** | Sí | Al confirmar *ser* rep |
| Quiere ser **fasón** | Sí | Al confirmar fasón |
| Quiere ser **distribuidor** (solo 4 SÍ) | **No** | Solo marca columna |
| Dist 4 SÍ → luego ≥50 / CBA &lt;50 / fuera | Sí | Al cerrar ese ruteo |
| Volumen / dato clave inseguro | Sí → **Atención humana** | Lead no sabe cuánto / necesita más data; no inventar &lt;50 ni sin_cobertura |
| **Atención humana** | Sí | Córdoba &lt;50, pedido del menú, “hablar con alguien”, 2ª vez precio/dato desconocido |
| **Derivado** | Sí | Tras derivar al dist |
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

| Caso | ¿Lead nuevo en Dashboard? | ¿Tipifica de nuevo? |
|------|---------------------------|---------------------|
| &lt; 1 año, Nuevo / IA atendiendo | No (misma card) | Sí |
| &lt; 1 año, **Muestras** (IA ya ended) | **Sí** (2ª card) | **Sí**, de cero — la 1ª queda en Muestras |
| &lt; 1 año, **ya calificado** (otras columnas) | **No** | **No** — “ya estás en proceso” |
| Última card **≥ 1 año** | **Sí** | **Sí**, de cero |

---

## 4. Dos cards del mismo teléfono (rojo + 1 / 2)

| Señal | Significado |
|-------|------------|
| Card **roja** | Hay otra con el **mismo teléfono** |
| Badge **1** | Ingresó **primero** |
| Badge **2** | La **segunda** |

**Qué hacer:** cerrá **las dos** con Resultado (la vigente según el caso; la otra Descartado o sin éxito). El rojo es solo aviso visual.

---

## 5. Métricas (para quedarte tranquilo)

Dashboard cuenta **cards** (`created_at`), no cada mensaje de WhatsApp.  
Mismo número muchas veces en el año → **1 lead**. Dos cards rojas en el período → pueden contar **2** (por eso cerrás ambas).

---

## 6. Checklist diario

- [ ] Revisar columnas de handoff  
- [ ] Cards **rojas**: cerrar 1 y 2  
- [ ] Sin cobertura / Esperando: auto ~22 h  
- [ ] Dashboard con filtro de fecha  

---

## 7. Semana de pruebas (sandbox) — reset cada 20 min

Para que el mismo teléfono (Kapso sandbox) pueda tipificar otra vez **sin hacer nada a mano**.

| Qué | Dónde |
|-----|--------|
| Flag + hasta | Vercel API: `SANDBOX_RESET_ENABLED=true`, `UNTIL=2026-08-20T00:00:00-03:00` |
| Teléfonos | Sin lista (= limpia **todas** las cards) |
| Scheduler | GitHub Actions cada 20 min → [runs](https://github.com/fecotechSolutions/tool-coolmeals/actions) |
| Código | [`.github/workflows/sandbox-reset.yml`](../.github/workflows/sandbox-reset.yml) → `/api/cron/sandbox-reset` |

- Manual ya: Actions → **Sandbox reset** → Run workflow  
- Apagar al fin de semana: Disable workflow **o** `SANDBOX_RESET_ENABLED=false`

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://tool-coolmeals-api-ten.vercel.app/api/cron/sandbox-reset"
```

OK: `"enabled": true`. Si `"skippedReason"` → flag off o pasó `UNTIL`.

---

*Planilla técnica:* [`planilla-flujo-ia-definitiva.csv`](./planilla-flujo-ia-definitiva.csv)
