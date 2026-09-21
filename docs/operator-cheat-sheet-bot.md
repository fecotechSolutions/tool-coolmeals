# Cool Meals — Cómo trabaja el bot (para operadores)

Una hoja para mostrar / imprimir. Actualizado: **15 sep 2026**.

> Guía larga: [`pipeline-bot-user-guide.md`](./pipeline-bot-user-guide.md) · Entornos: [`environments.md`](./environments.md)

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
| Volumen **a partir de 50** cajas (cualquier provincia) | Si aún no eligió: menú muestras/pedido. Si **ya** quiere pedir → Pedidos directo | **Muestras** (opción 1) o **Pedidos** lead/cliente |
| **&lt; 50** (cualquier provincia, **incluye Córdoba**) | Distribuidor de zona | **Derivado** (+ hashtag naranja) |
| Sin distribuidor / sin gestión en la zona | Aviso sin cobertura | **Sin cobertura** → ~**5 días** desaparece + ended (no Descartado) |
| Volumen / precios inciertos | **1ª:** volumen normal. **Si no sabe → 2ª:** ¿a partir de 50 o menos? Si tampoco → operador | Según orientación / **Atención humana** |
| Quiere **ser** rep / fasón | Cierre rápido + **handoff** | Columna correspondiente |
| Quiere **ser** distribuidor | Ver §1b | Columna + luego cierre por vol/zona |
| Consumidor final (casa / 1 unidad) | Cierre amable | **Descartado** |

### 1b. Quiere ser distribuidor (importante)

1. El bot hace las **4 preguntas** (congelados, depósito, logística, estructura).  
2. **4 SÍ** → la card va a **Quiere ser distribuidor**, pero el bot **NO se pausa** (no hay handoff todavía).  
3. Sigue: zona + volumen → ruteo → **ahí sí** handoff según el caso (≥50 menú, &lt;50 dist/sin cobertura también en Córdoba).  
4. Si falta alguna de las 4 → no queda en esa columna; tipifica compra o Descartado.

**En una frase:** los 4 SÍ solo marcan la columna; el handoff viene después, con el ruteo comercial.

### 1c. Contacto obligatorio (antes de cualquier cierre comercial)

Toda derivación / handoff comercial pide:

1. **Nombre completo**  
2. **Nombre del negocio / local**  
3. **Teléfono confirmado** (aunque ya esté en WhatsApp: “¿este mismo número te sirve?”)

Si el lead **se niega** → va a **Atención humana** igual (sin inventar datos).  
No alcanza el nombre del perfil de WhatsApp.

**Excepciones:** consumidor **Descartado**; **Muestras** (ficha de envío); **Pedidos**:
- **Cliente** + pedido → **no** pedir nombre/negocio (alcanza el WA) → **Pedidos (clientes)**.
- **Lead** + pedido → pedir en el cierre, pero **igual** → **Pedidos (leads)**.

### 1d. Derivado a dist. (orden)

1. Mensaje al lead: “te va a contactar [dist]…” + despedida.  
2. Recién ahí se registra la derivación → **fila en el Google Sheet de ese dist.**  
3. El bot se pausa.

Si se invierte el orden, el lead **no recibe** el mensaje.

### 1e. Si el lead deja de responder (Nuevo / IA atendiendo)

1. ~**20 h** → un WhatsApp de recontacto (sigue en la misma columna).  
2. ~**24 h** → **Esperando respuesta** (bot pausado).  
3. ~**24 h** más → **Descartado**.

Derivado / Muestras / Atención / Quiere ser… **no** se auto-descartan: cierran con **Resultado**.

### 1f. Sheets (resumen)

| Destino | Sheet |
|---------|--------|
| Derivado a un dist. | Planilla **de ese** distribuidor |
| Muestras | Sheet muestras |
| Quiere ser dist/rep/fasón | Sheet atención comercial |
| Sin cobertura | Sheet sin cobertura |

---

## 2. Tres momentos: handoff · Kapso · cierre ops

### A) Cuándo la card hace **handoff** (bot se pausa)

| Flujo | ¿Handoff? | Momento |
|-------|-----------|---------|
| Quiere ser **representante** | Sí | Al confirmar *ser* rep (después del contacto) |
| Quiere ser **fasón** | Sí | Al confirmar fasón (después del contacto) |
| Quiere ser **distribuidor** (solo 4 SÍ) | **No** | Solo marca columna |
| Dist 4 SÍ → luego ≥50 / &lt;50 (cualquier provincia) | Sí | Al cerrar ese ruteo |
| Volumen / dato clave inseguro | Sí → **Atención humana** | Lead no sabe cuánto / necesita más data; no inventar &lt;50 ni sin_cobertura |
| **Atención humana** | Sí | “hablar con alguien”, 2ª vez precio/dato desconocido, rep/fasón |
| **Pedidos (lead / cliente)** | Sí | Intención de pedir (menú 2 / lista / “quiero pedido” / cliente). **Sin Sheet.** Cliente: solo WA. Lead: pide datos en cierre pero igual deriva. Copy: asesor confirma stock/logística + lista opcional |
| **Derivado** | Sí | Tras el **mensaje** de cierre + registro |
| **Sin cobertura** | Sí | Al avisar sin zona |
| **Muestras** | **No** (`ended`) | Tras agendar muestras — card sigue hasta Resultado |
| **Descartado** (consumidor **o proveedor**) | No `handoff_to_human` | IA **ended**. Proveedor: mensaje con `Compras@coolmeals.com.ar` |
| Nuevo / IA atendiendo | No | Bot sigue |

### B) Cuándo se **cierra en Kapso** (execution → `ended`)

| Situación | ¿Kapso `ended`? |
|-----------|-----------------|
| Operador elige **Resultado** | Sí |
| Auto Sin cobertura ~**5 días** | Sí (`ended`) + card oculta; **no** Descartado |
| Auto Esperando respuesta ~**24 h** | Sí (+ **Descartado**) |
| Bot Descartado (consumidor o proveedor) | Sí |
| Bot **Muestras** (agendadas) | Sí — card sigue en **Muestras** hasta Resultado |
| Solo handoff (Atención, Derivado, Quiere ser rep/fasón…) | **No** — queda en `handoff` hasta Resultado (o auto si aplica) |
| Execution trabada en `running` ≥3 min | Sí (watchdog) |

**Antes de escribir vos en WhatsApp:**
- Ideal: mové la card a **Atención humana** (u otra columna con handoff).
- Si usás la **app WhatsApp Business**, hay auto-pausa (fase E) al detectar tu mensaje.
- Si usás **Kapso Inbox**, la auto-pausa **no** aplica: mové la card primero.

### C) Cuándo se **cierra para ustedes** (Pipeline limpio)

| Situación | Columna final | Quién |
|-----------|---------------|-------|
| Resultado éxito / sin éxito | **Finalizado** | Operador |
| Resultado Descartado | **Descartado** | Operador |
| Auto Sin cobertura | Card oculta + ended | Sistema ~**5 días** (no Descartado) |
| Auto Esperando respuesta | **Descartado** | Sistema ~**24 h** |
| Bot consumidor | **Descartado** | Bot |
| Card en Atención / Derivado / Muestras / Quiere ser… | Sigue **abierta** | Ustedes con Resultado |

**Resumen:** handoff = bot pausado · Kapso `ended` = hilo técnico muerto · cierre ops = Finalizado o Descartado.

**Visibilidad Pipeline:** Finalizado ~5 días desde el cierre; Descartado ~2 días desde el alta de la card. Después desaparecen del tablero pero **siguen en Dashboard/métricas** (no se borran).

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
- [ ] Sin cobertura: auto ~**5 días** → desaparece + ended (no Descartado)  
- [ ] Esperando respuesta: auto ~**24 h** → **Descartado**  
- [ ] Derivados: mirar el **sheet del dist.** (no el master viejo)  
- [ ] Dashboard con filtro de fecha  

---

## 7. Sandbox — wipe **solo a pedido**

**Canales:**
- **Prod (clientes):** WhatsApp `+54 9 351 549-5440` → panel en https://tool-coolmeals-web.vercel.app (badge **PROD**).
- **Pruebas:** Kapso **Sandbox** → cards en localhost / Supabase DEV (badge **DEV**). Ver [`environments.md`](./environments.md).

El reset automático **está apagado**. El mismo WhatsApp de prueba **no** se limpia solo cada 20 min.

Para retestear el mismo número hay que pedir wipe (Kapso `ended` en `waiting|running|handoff` + borrar cards / muestras en Supabase **DEV**, no en prod).

El endpoint `/api/cron/sandbox-reset` existe, pero:
- no dejar `SANDBOX_RESET_ENABLED=true` ni el workflow de GitHub activo en permanente;
- en **PROD** (`APP_ENV=production`) el wipe está **bloqueado en código**.

```bash
# Solo tiene sentido contra API DEV / local, no como hábito en prod
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3001/api/cron/sandbox-reset"
```

Si `"enabled": false` / `"skippedReason"` → flag off o entorno prod (es lo esperado).

---

*Planilla técnica:* [`planilla-flujo-ia-definitiva.csv`](./planilla-flujo-ia-definitiva.csv)
