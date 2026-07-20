/**
 * Taxonomía de clasificación basada en el formulario Meta de Froodie
 * (capturas en el doc — sin integración Meta).
 *
 * El bot debe obtener información equivalente (no necesariamente las mismas
 * preguntas literales) y mapear a clientType interno.
 */

export const META_FORM_FIELDS = [
  {
    key: "businessType",
    question: "¿Qué tipo de negocio tenés?",
    example: "Local gastronómico",
  },
  {
    key: "productLine",
    question: "¿Qué línea de productos te interesa comercializar?",
    example: "Quiero recibir el catálogo completo",
  },
  {
    key: "buysFrozen",
    question: "¿Comprás actualmente productos congelados para tu negocio?",
    example: "Estoy evaluando incorporar congelados",
  },
  {
    key: "estimatedVolume",
    question: "¿Qué volumen de compra estimás realizar?",
    example: "No lo sé todavía, necesito asesoramiento",
  },
  {
    key: "hasFreezer",
    question:
      "¿Tenés freezer o capacidad de almacenamiento para productos congelados?",
    example: "Sí",
  },
  {
    key: "preferredContact",
    question: "¿Cuál es el mejor medio para contactarte?",
    example: "WhatsApp",
  },
  {
    key: "cityZone",
    question: "¿En qué ciudad o zona se encuentra tu negocio?",
    example: "Rio tercero, Córdoba",
  },
  {
    key: "company",
    question: "¿Cuál es el nombre de tu negocio o empresa?",
    example: "Gula (rotisería) y Pecados (resto bar)",
  },
  {
    key: "fullName",
    question: "Full name",
    example: "",
  },
  {
    key: "phone",
    question: "Phone number",
    example: "",
  },
] as const;

/**
 * Heurística de mapeo → clientType (refinar con opciones exactas del form).
 * Validación extra para "distribuidor": depósito + logística de congelados.
 */
export const CLASSIFICATION_HINTS = `
Clasificá internamente al lead usando estos criterios (equivalente al form Meta Froodie):

1. Tipo de negocio declarado (local gastronómico, distribuidora, mayorista, retail, etc.)
2. Línea de productos de interés
3. Si ya compra congelados o está evaluando
4. Volumen estimado (si menciona bultos/cajas/pallet → usar número; umbral comercial = 50 bultos)
5. Si tiene freezer / capacidad de frío
6. Ciudad/zona → provincia para cobertura de distribuidores
7. Nombre del negocio + nombre de contacto + teléfono

Mapeo a clientType:
- "distribuidor" SOLO si tiene (o declara) depósito + logística de congelados / preventa a negocios.
  Si dice "distribuidora" pero es almacén autoservicio / minorista grande → "minorista" u "otro".
- "mayorista" → compra por volumen para revender / abastecer.
- "retail" / "minorista" → local, rotisería, resto, supermercado chico, etc.
- "representante" → quiere vender a comisión / representar Cool Meals.
- "fason" → interés en producción a fasón / maquila.
- "otro" → no calza.

Datos mínimos antes de derivar: nombre, teléfono, tipo de negocio, ubicación (ciudad/provincia).
Para muestras: Nombre y Apellido, Teléfono de Contacto, Domicilio.
`.trim();
