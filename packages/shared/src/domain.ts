import { z } from "zod";

/**
 * Domain contract for Cool Meals Leads — UI ↔ API ↔ Kapso.
 *
 * Semántica clientType:
 * - distribuidor / representante = quieren SERLO (no son red interna)
 * - fason = interés en producción a fasón / maquila
 * - otro = no calza en las categorías anteriores
 */

export const ClientType = {
  MAYORISTA: "mayorista",
  MINORISTA: "minorista",
  RETAIL: "retail",
  REPRESENTANTE: "representante",
  DISTRIBUIDOR: "distribuidor",
  FASON: "fason",
  OTRO: "otro",
} as const;
export type ClientType = (typeof ClientType)[keyof typeof ClientType];

export const clientTypeSchema = z.enum([
  "mayorista",
  "minorista",
  "retail",
  "representante",
  "distribuidor",
  "fason",
  "otro",
]);

export const LeadOrigin = {
  WHATSAPP: "whatsapp",
  WEB: "web",
  INSTAGRAM: "instagram",
  REFERIDO: "referido",
  LLAMADA: "llamada",
  OTRO: "otro",
} as const;
export type LeadOrigin = (typeof LeadOrigin)[keyof typeof LeadOrigin];

export const leadOriginSchema = z.enum([
  "whatsapp",
  "web",
  "instagram",
  "referido",
  "llamada",
  "otro",
]);

export const LeadEstado = {
  NUEVO: "nuevo",
  EN_CURSO: "en_curso",
  CALIFICADO: "calificado",
  DERIVADO: "derivado",
  PEDIDO: "pedido",
  MUESTRAS: "muestras",
  GANADO: "ganado",
  PERDIDO: "perdido",
} as const;
export type LeadEstado = (typeof LeadEstado)[keyof typeof LeadEstado];

export const leadEstadoSchema = z.enum([
  "nuevo",
  "en_curso",
  "calificado",
  "derivado",
  "pedido",
  "muestras",
  "ganado",
  "perdido",
]);

/**
 * Pedido lead vs cliente:
 * - pedido_lead → primer pedido / todavía prospecto
 * - pedido_cliente → pedido de cuenta ya cliente
 */
export const ConversationStatus = {
  NUEVO: "nuevo",
  IA_ATENDIENDO: "ia_atendiendo",
  ESPERANDO_RESPUESTA: "esperando_respuesta",
  ATENCION_REPRESENTANTE: "atencion_representante",
  QUIERE_SER_DISTRIBUIDOR: "quiere_ser_distribuidor",
  QUIERE_SER_REPRESENTANTE: "quiere_ser_representante",
  QUIERE_SER_FASON: "quiere_ser_fason",
  DERIVADO: "derivado",
  DERIVADO_DISTRIBUIDOR: "derivado_distribuidor",
  SIN_COBERTURA: "sin_cobertura",
  MUESTRAS: "muestras",
  PEDIDO_LEAD: "pedido_lead",
  PEDIDO_CLIENTE: "pedido_cliente",
  FINALIZADO: "finalizado",
  DESCARTADO: "descartado",
} as const;
export type ConversationStatus =
  (typeof ConversationStatus)[keyof typeof ConversationStatus];

export const conversationStatusSchema = z.enum([
  "nuevo",
  "ia_atendiendo",
  "esperando_respuesta",
  "atencion_representante",
  "quiere_ser_distribuidor",
  "quiere_ser_representante",
  "quiere_ser_fason",
  "derivado",
  "derivado_distribuidor",
  "sin_cobertura",
  "muestras",
  "pedido_lead",
  "pedido_cliente",
  "finalizado",
  "descartado",
]);

/** Outcomes del FLUJO (resultado comercial de la conversación). */
export const ConversationOutcome = {
  DERIVADO_DISTRIBUIDOR: "derivado_distribuidor",
  HANDOFF_HUMANO: "handoff_humano",
  MUESTRAS: "muestras",
  PEDIDO: "pedido",
  SIN_COBERTURA: "sin_cobertura",
  DESCARTADO: "descartado",
  QUIERE_SER_DISTRIBUIDOR: "quiere_ser_distribuidor",
  QUIERE_SER_REPRESENTANTE: "quiere_ser_representante",
  QUIERE_SER_FASON: "quiere_ser_fason",
  INFO_ENTREGADA: "info_entregada",
} as const;
export type ConversationOutcome =
  (typeof ConversationOutcome)[keyof typeof ConversationOutcome];

export const conversationOutcomeSchema = z.enum([
  "derivado_distribuidor",
  "handoff_humano",
  "muestras",
  "pedido",
  "sin_cobertura",
  "descartado",
  "quiere_ser_distribuidor",
  "quiere_ser_representante",
  "quiere_ser_fason",
  "info_entregada",
]);

/** Hashtag visible cuando la card está en Atención humana (handoff). */
export const HASHTAG_ATENCION_HUMANA = "#atencion_humana";
/** @deprecated Usar HASHTAG_ATENCION_HUMANA */
export const HASHTAG_ATENDIDO_REPRESENTANTE = HASHTAG_ATENCION_HUMANA;

export const PROVINCES = [
  "Buenos Aires",
  "CABA",
  "Córdoba",
  "Santa Fe",
  "Mendoza",
  "Tucumán",
  "Entre Ríos",
  "Salta",
  "Neuquén",
  "Río Negro",
  "La Rioja",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Corrientes",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "Misiones",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santiago del Estero",
  "Tierra del Fuego",
] as const;
export type Province = (typeof PROVINCES)[number] | (string & {});

export const provinceSchema = z.string().trim().min(1).max(80);

export const conversationMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant", "agent", "system"]),
  content: z.string(),
  createdAt: z.string(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const distributorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  province: provinceSchema,
  zones: z.array(z.string()),
  contactName: z.string(),
  whatsapp: z.string(),
  email: z.string(),
  active: z.boolean(),
  coveredProvinces: z.array(z.string()),
  postalCodes: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Distributor = z.infer<typeof distributorSchema>;

export const createDistributorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  province: provinceSchema,
  zones: z.array(z.string()).default([]),
  contactName: z.string().trim().default(""),
  whatsapp: z.string().trim().default(""),
  email: z.string().trim().default(""),
  active: z.boolean().default(true),
  coveredProvinces: z.array(z.string()).default([]),
  postalCodes: z.array(z.string()).default([]),
});
export type CreateDistributorInput = z.infer<typeof createDistributorSchema>;
export const updateDistributorSchema = createDistributorSchema.partial();

export const leadSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().min(1),
  company: z.string().nullable(),
  phone: z.string(),
  email: z.string().nullable(),
  province: provinceSchema,
  city: z.string(),
  postalCode: z.string(),
  businessType: z.string(),
  clientType: clientTypeSchema,
  distributorId: z.string().uuid().nullable(),
  origin: leadOriginSchema,
  status: leadEstadoSchema,
  isCustomer: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Lead = z.infer<typeof leadSchema>;

export const createLeadSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).default(""),
  email: z
    .union([z.string().email(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  province: provinceSchema,
  city: z.string().trim().default(""),
  postalCode: z.string().trim().default(""),
  businessType: z.string().trim().default(""),
  clientType: clientTypeSchema.default("minorista"),
  distributorId: z.string().uuid().nullable().optional(),
  origin: leadOriginSchema.default("otro"),
  status: leadEstadoSchema.default("nuevo"),
  isCustomer: z.boolean().default(false),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export const updateLeadSchema = createLeadSchema.partial();
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const listLeadsQuerySchema = z.object({
  status: leadEstadoSchema.optional(),
  clientType: clientTypeSchema.optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

export const conversationSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string(),
  name: z.string(),
  phone: z.string(),
  origin: leadOriginSchema,
  status: conversationStatusSchema,
  clientType: clientTypeSchema,
  province: provinceSchema,
  distributorId: z.string().uuid().nullable(),
  aiSummary: z.string(),
  lastMessage: z.string(),
  notes: z.string(),
  tags: z.array(z.string()),
  assignedTo: z.string().nullable(),
  isCustomer: z.boolean(),
  messages: z.array(conversationMessageSchema),
  kapsoConversationId: z.string().nullable().optional(),
  kapsoExecutionId: z.string().nullable().optional(),
  estimatedVolume: z.number().int().nullable().optional(),
  outcome: conversationOutcomeSchema.nullable().optional(),
  humanHandoffAt: z.string().nullable().optional(),
  /** Cuando se derivó a distribuidor (inicio ventana handoff). */
  derivedAt: z.string().nullable().optional(),
  /** Cuándo auto-pasar a Finalizado / ended en Kapso. */
  finalizeAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const updateConversationSchema = z.object({
  status: conversationStatusSchema.optional(),
  notes: z.string().optional(),
  assignedTo: z.string().nullable().optional(),
  aiSummary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  distributorId: z.string().uuid().nullable().optional(),
  isCustomer: z.boolean().optional(),
  clientType: clientTypeSchema.optional(),
  province: provinceSchema.optional(),
  estimatedVolume: z.number().int().nonnegative().nullable().optional(),
  outcome: conversationOutcomeSchema.nullable().optional(),
  lastMessage: z.string().optional(),
});
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

export const commercialRuleConditionSchema = z.object({
  field: z.enum([
    "clientType",
    "minBundles",
    "province",
    "distributorId",
    "outsideProvinces",
  ]),
  operator: z.enum(["eq", "neq", "lt", "gt", "in", "not_in"]),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

export const commercialRuleActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("derive") }),
  z.object({
    type: z.literal("derive_to_distributor"),
    distributorId: z.string().uuid(),
  }),
  z.object({ type: z.literal("own_attention") }),
  z.object({ type: z.literal("request_samples") }),
  z.object({ type: z.literal("close") }),
  z.object({ type: z.literal("no_coverage") }),
]);

export const commercialRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priority: z.number().int(),
  active: z.boolean(),
  conditions: z.array(commercialRuleConditionSchema),
  action: commercialRuleActionSchema,
  updatedAt: z.string(),
});
export type CommercialRule = z.infer<typeof commercialRuleSchema>;

export const commercialSettingsSchema = z.object({
  minBundlesDefault: z.number().int().positive().default(50),
  provinceDistributorMap: z.array(
    z.object({
      province: z.string(),
      distributorId: z.string().uuid(),
    }),
  ),
  rules: z.array(commercialRuleSchema),
});
export type CommercialSettings = z.infer<typeof commercialSettingsSchema>;

export const KnowledgeCategory = {
  FAQ: "faq",
  PRECIOS: "precios",
  POLITICAS: "politicas",
  PROCESO_COMERCIAL: "proceso_comercial",
  TIPOS_NEGOCIO: "tipos_negocio",
  INSTITUCIONAL: "institucional",
} as const;
export type KnowledgeCategory =
  (typeof KnowledgeCategory)[keyof typeof KnowledgeCategory];

export const knowledgeCategorySchema = z.enum([
  "faq",
  "precios",
  "politicas",
  "proceso_comercial",
  "tipos_negocio",
  "institucional",
]);

export const knowledgeArticleSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  category: knowledgeCategorySchema,
  content: z.string(),
  active: z.boolean(),
  updatedAt: z.string(),
});
export type KnowledgeArticle = z.infer<typeof knowledgeArticleSchema>;

export const createKnowledgeArticleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: knowledgeCategorySchema,
  content: z.string().default(""),
  active: z.boolean().default(true),
});
export const updateKnowledgeArticleSchema = createKnowledgeArticleSchema.partial();

export const promptConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  personality: z.string(),
  tone: z.string(),
  objectives: z.string(),
  restrictions: z.string(),
  flows: z.string(),
  rules: z.string(),
  updatedAt: z.string(),
});
export type PromptConfig = z.infer<typeof promptConfigSchema>;

export const updatePromptConfigSchema = z.object({
  name: z.string().trim().min(1).optional(),
  personality: z.string().optional(),
  tone: z.string().optional(),
  objectives: z.string().optional(),
  restrictions: z.string().optional(),
  flows: z.string().optional(),
  rules: z.string().optional(),
});

/** Datos exactos para logística de muestras (respuesta Octavio). */
export const sampleRequestSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid().nullable(),
  leadId: z.string().uuid().nullable(),
  fullName: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
  city: z.string().default(""),
  province: z.string().default(""),
  postalCode: z.string().default(""),
  status: z.enum(["pendiente", "enviado", "entregado", "cancelado"]),
  sheetSyncedAt: z.string().nullable(),
  notes: z.string().default(""),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SampleRequest = z.infer<typeof sampleRequestSchema>;

export const createSampleRequestSchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  fullName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(5).max(40),
  address: z.string().trim().min(1).max(500),
  city: z.string().trim().default(""),
  province: z.string().trim().default(""),
  postalCode: z.string().trim().default(""),
  notes: z.string().trim().default(""),
});
export type CreateSampleRequestInput = z.infer<typeof createSampleRequestSchema>;

export const updateSampleRequestSchema = z.object({
  status: z.enum(["pendiente", "enviado", "entregado", "cancelado"]).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type UpdateSampleRequestInput = z.infer<typeof updateSampleRequestSchema>;

/** Acciones que el motor comercial puede devolver al bot Kapso. */
export const routeDecisionSchema = z.object({
  action: z.enum([
    "derive_to_distributor",
    "own_attention",
    "request_samples",
    "no_coverage",
    "quiere_ser_distribuidor",
    "quiere_ser_representante",
    "quiere_ser_fason",
    "close",
  ]),
  conversationStatus: conversationStatusSchema,
  outcome: conversationOutcomeSchema.nullable(),
  distributorId: z.string().uuid().nullable(),
  distributorName: z.string().nullable(),
  reason: z.string(),
  syncDerivedSheet: z.boolean(),
});
export type RouteDecision = z.infer<typeof routeDecisionSchema>;

export const decideRouteInputSchema = z.object({
  clientType: clientTypeSchema,
  province: provinceSchema,
  postalCode: z.string().trim().optional().default(""),
  estimatedVolume: z.number().int().nonnegative().nullable().optional(),
  wantsToBeDistributor: z.boolean().optional().default(false),
  isCustomer: z.boolean().optional().default(false),
});
export type DecideRouteInput = z.infer<typeof decideRouteInputSchema>;

export const botUpsertConversationSchema = z.object({
  phone: z.string().trim().min(5).max(40),
  name: z.string().trim().min(1).max(200).optional(),
  origin: leadOriginSchema.default("whatsapp"),
  status: conversationStatusSchema.optional(),
  clientType: clientTypeSchema.optional(),
  province: provinceSchema.optional(),
  distributorId: z.string().uuid().nullable().optional(),
  aiSummary: z.string().optional(),
  lastMessage: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  estimatedVolume: z.number().int().nonnegative().nullable().optional(),
  outcome: conversationOutcomeSchema.nullable().optional(),
  kapsoConversationId: z.string().optional(),
  kapsoExecutionId: z.string().optional(),
  message: conversationMessageSchema.optional(),
});
export type BotUpsertConversationInput = z.infer<
  typeof botUpsertConversationSchema
>;

export const botHandoffSchema = z.object({
  conversationId: z.string().uuid().optional(),
  phone: z.string().trim().min(5).max(40).optional(),
  reason: z.string().trim().min(1).max(1000),
  aiSummary: z.string().optional(),
  kapsoExecutionId: z.string().optional(),
  /** Columna Pipeline tras handoff. Default: atencion_representante. */
  status: z
    .enum([
      "atencion_representante",
      "quiere_ser_distribuidor",
      "quiere_ser_representante",
      "quiere_ser_fason",
      "sin_cobertura",
      "muestras",
      "esperando_respuesta",
    ])
    .optional(),
  outcome: conversationOutcomeSchema.optional(),
});
export type BotHandoffInput = z.infer<typeof botHandoffSchema>;

export const PIPELINE_STATUSES = [
  "nuevo",
  "ia_atendiendo",
  "esperando_respuesta",
  "atencion_representante",
  "quiere_ser_distribuidor",
  "quiere_ser_representante",
  "quiere_ser_fason",
  "derivado_distribuidor",
  "sin_cobertura",
  "muestras",
  "pedido_lead",
  "pedido_cliente",
  "finalizado",
  "descartado",
] as const satisfies readonly ConversationStatus[];

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  mayorista: "Mayorista",
  minorista: "Minorista",
  retail: "Retail",
  representante: "Quiere ser representante",
  distribuidor: "Quiere ser distribuidor",
  fason: "Fasón",
  otro: "Otro",
};

export const ORIGIN_LABELS: Record<LeadOrigin, string> = {
  whatsapp: "WhatsApp",
  web: "Web",
  instagram: "Instagram",
  referido: "Referido",
  llamada: "Llamada",
  otro: "Otro",
};

export const LEAD_STATUS_LABELS: Record<LeadEstado, string> = {
  nuevo: "Nuevo",
  en_curso: "En curso",
  calificado: "Calificado",
  derivado: "Derivado",
  pedido: "Pedido",
  muestras: "Muestras",
  ganado: "Ganado",
  perdido: "Perdido",
};

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  nuevo: "Nuevo",
  ia_atendiendo: "IA atendiendo",
  esperando_respuesta: "Esperando respuesta",
  atencion_representante: "Atención humana",
  quiere_ser_distribuidor: "Quiere ser distribuidor",
  quiere_ser_representante: "Quiere ser representante",
  quiere_ser_fason: "Quiere ser fasón",
  derivado: "Derivado",
  derivado_distribuidor: "Derivado a distribuidor",
  sin_cobertura: "Sin cobertura",
  muestras: "Muestras",
  pedido_lead: "Pedidos (leads)",
  pedido_cliente: "Pedidos (clientes)",
  finalizado: "Finalizado",
  descartado: "Descartado",
};

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  faq: "Preguntas frecuentes",
  precios: "Lista de precios",
  politicas: "Políticas",
  proceso_comercial: "Proceso comercial",
  tipos_negocio: "Tipos de negocio",
  institucional: "Información institucional",
};

export function distributorHashtag(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `#${slug}`;
}

export function suggestedOrderStatus(
  isCustomer: boolean,
): Extract<ConversationStatus, "pedido_lead" | "pedido_cliente"> {
  return isCustomer ? "pedido_cliente" : "pedido_lead";
}
