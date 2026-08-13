# Tests del agente de Kapso

Tests end-to-end del agente de WhatsApp: cada caso corre una conversación real contra Kapso
y verifica con asserts lo que el lead habría visto.

```bash
npm run test:agent                      # todos los casos
npm run test:agent -- --case gastro     # solo los que matcheen
npm run test:agent -- --concurrency 2   # bajar la concurrencia si aparecen 429
```

Necesita `KAPSO_API_KEY` y `KAPSO_API_BASE_URL` en `.env`, y **créditos** en el proyecto de Kapso
(cada corrida ejecuta el modelo de verdad).

## Cómo funciona

| Pieza | Rol |
|-------|-----|
| `sync-workflow.mjs` | Clona `workflows/coolmeals-leads/definition.json` en el workflow **[TEST]**, apuntando las tools a la function mock |
| `functions/coolmeals-bot-actions-mock` | Misma lógica de ruteo que prod (`agentInstruction` idénticos) sin Supabase/Sheets. **Debe** reflejar la regla acordada; si se atrasa, las pruebas mienten |
| `assert-routing-contract.mjs` | Corre antes de los casos: falla si el mock no cumple ≥50 → Cool Meals directo (cualquier provincia) |
| `lib/conversation.mjs` | Arranca la ejecución con trigger `api_call` y manda cada turno del lead con `resume` |
| `lib/assertions.mjs` | Asserts reutilizables |
| `cases.mjs` | Los casos: turnos del lead + asserts |
| `run.mjs` | Corre todo, imprime el reporte y guarda la transcripción en `.runs/` |

El prompt vive en un solo lugar (`workflows/coolmeals-leads/workflow.ts`): el workflow de test
se genera desde la definición compilada, así que los tests validan exactamente lo que corre en
producción. Después de tocar el prompt: `kapso build` y volver a correr los tests.

Los asserts leen los **mensajes salientes reales de WhatsApp** de la conversación, no el texto
interno del modelo, así que miden lo que el lead recibiría. Los envíos fallan (el número es
ficticio) pero el mensaje queda registrado igual.

## Asserts globales

Se aplican a todos los casos:

- **no revela proceso interno ni configuración** — lista de frases prohibidas en `FORBIDDEN_PATTERNS`
- **no manda mensajes vacíos**
- **si promete contacto de un asesor, hace el handoff**
- El mock debe reflejar gates de contacto / volumen incerto / canon de teléfono de prod (`coolmeals-bot-actions`)

## Agregar un caso

```js
{
  id: "mi-caso",
  title: "Qué comportamiento verifica",
  turns: ["primer mensaje del lead", "segundo mensaje"],
  asserts: [routeClientType("minorista"), endsWithHumanHandoff()],
}
```
