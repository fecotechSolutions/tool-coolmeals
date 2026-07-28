# Cool Meals — Cómo trabaja el bot (para operadores)

Una hoja para mostrar / imprimir. Actualizado: 28 jul 2026.

---

## 1. Qué hace la IA (en orden)

```
Lead escribe por WhatsApp
        ↓
Saludo + link Beacons (catálogo, SIN precios)
        ↓
Califica: tipo de negocio + zona (+ volumen si aplica)
        ↓
¿Qué decide el sistema?
```

| Situación | Qué pasa | Qué ves en Pipeline |
|-----------|----------|---------------------|
| Volumen **≥ 50 cajas** (cualquier provincia) | Menú: muestras o pedido | Atención humana → luego **Muestras** o se queda en atención |
| **Córdoba** y **&lt; 50** (o sin volumen) | Asesor Cool Meals (sin menú) | **Atención humana** |
| **Otra provincia** y **&lt; 50** | Distribuidor de zona | **Derivado** (+ hashtag naranja) |
| Sin distribuidor en la zona | Aviso sin cobertura | **Sin cobertura** → auto **Descartado** ~22 h |
| Quiere **ser** rep / fasón | Cierre rápido | Columna correspondiente |
| Quiere **ser** distribuidor | 4 preguntas; si 4 SÍ → columna y **sigue** el ruteo por volumen/zona | **Quiere ser distribuidor** y después el cierre comercial |
| Consumidor final (casa / 1 unidad) | Cierre amable | **Descartado** |

**Tu trabajo después del handoff:** el bot se pausa. Cerrás con el desplegable **Resultado** (`éxito` / `sin éxito` / `Descartado`), salvo Sin cobertura / Esperando respuesta que cierran solos.

---

## 2. Mismo teléfono = mismo lead (métricas)

| Caso | ¿Lead nuevo en el Dashboard? | ¿El bot tipifica de nuevo? |
|------|------------------------------|----------------------------|
| Mismo WA, **menos de 1 año**, todavía calificando (Nuevo / IA atendiendo) | No (misma card) | Sí, sigue armando la card |
| Mismo WA, **menos de 1 año**, **ya calificado** (cualquier otra columna, incluso Finalizado) | **No** | **No** — mensaje corto de “ya estás en proceso” |
| Mismo WA, última card hace **1 año o más** | **Sí** (card nueva) | **Sí**, de cero |

Así el Dashboard **no se infla** si el mismo número escribe varias veces en el año.

---

## 3. Dos cards del mismo teléfono (rojo + 1 / 2)

A veces puede haber **dos cards** del mismo número (ej. una vieja y otra tras el año, o un caso raro).

| Señal | Significado |
|-------|------------|
| Card **roja** | Hay otra card con el **mismo teléfono** |
| Badge **1** | La que **ingresó primero** |
| Badge **2** | La **segunda** (más nueva) |

### Qué tenés que hacer vos

1. Abrí ambas (pueden estar en columnas distintas).  
2. Revisá cuál es la vigente (casi siempre la **2**, o la que esté en proceso).  
3. **Cerrá las dos** con **Resultado** cuando el caso comercial esté resuelto:
   - la que sí cerró el negocio → `Finalizado con éxito` (o sin éxito / Descartado según corresponda);
   - la otra / duplicada → `Descartado` o `Finalizado sin éxito`, para que no quede colgada.
4. No hace falta “fusionar” cards a mano: el sistema ya cuenta métricas por **fecha de alta** de cada card.

**Regla de oro:** si ves rojo + número, **no dejes una card abierta “por las dudas”**. Cerrá ambas.

---

## 4. Cómo se guardan las métricas (para quedarte tranquilo)

```
Dashboard cuenta CARDS (conversaciones), no “mensajes de WhatsApp”.
Cada card tiene una fecha de alta (created_at).

• Un teléfono que escribe 10 veces el mismo mes
  → sigue siendo 1 lead (misma card), si está dentro del año.

• Dos cards del mismo teléfono (rojo 1 y 2)
  → el Dashboard puede mostrar 2 si ambas nacieron en el período filtrado.
  → Por eso cerrás las dos: el Pipeline queda limpio;
    el histórico de la card 1 no “borra” la 2 ni al revés.
```

| Pregunta del operador | Respuesta corta |
|----------------------|-----------------|
| ¿Si el lead vuelve a escribir, se duplica la métrica? | No, dentro del año y ya calificado. |
| ¿Y después de un año? | Sí: card nueva = lead nuevo en métricas. |
| ¿El rojo afecta al bot? | No. Solo te avisa a vos en el Pipeline. |
| ¿Tengo que tocar Kapso? | No para el día a día. Solo Resultado en Pipeline. |

---

## 5. Mini checklist diario

- [ ] Pipeline: mirar columnas de handoff (Atención, Derivado, Muestras, Quiere ser…).  
- [ ] Si hay card **roja**: cerrar **1 y 2** con Resultado.  
- [ ] Sin cobertura / Esperando: no hace falta cerrar a mano (auto ~22 h).  
- [ ] Dashboard: filtrar por fecha; los números salen de esas cards.

---

*Documento compañero:* `docs/pipeline-bot-user-guide.md` · planilla técnica: `docs/planilla-flujo-ia-definitiva.csv`
