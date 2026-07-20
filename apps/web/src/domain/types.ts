/** Domain types for Cool Meals Leads MVP — shared contract for UI ↔ API. */

/**
 * Tipo de lead / interés comercial.
 * `distribuidor` y `representante` = quieren SERLO (no son red interna).
 * `fason` = interés en producción a fasón / maquila.
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

export const LeadOrigin = {
  WHATSAPP: "whatsapp",
  WEB: "web",
  INSTAGRAM: "instagram",
  REFERIDO: "referido",
  LLAMADA: "llamada",
  OTRO: "otro",
} as const;
export type LeadOrigin = (typeof LeadOrigin)[keyof typeof LeadOrigin];

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

/**
 * Pedido lead vs cliente:
 * - pedido_lead → primer pedido / todavía prospecto (`isCustomer: false`)
 * - pedido_cliente → pedido de cuenta ya cliente Cool Meals (`isCustomer: true`)
 * Desde muestras se puede pasar a cualquiera de los dos.
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

/** Hashtag que marca atención humana completada por un comercial Cool Meals. */
/** Hashtag visible cuando la card está en Atención humana (handoff). */
export const HASHTAG_ATENCION_HUMANA = "#atencion_humana";
/** @deprecated Usar HASHTAG_ATENCION_HUMANA */
export const HASHTAG_ATENDIDO_REPRESENTANTE = HASHTAG_ATENCION_HUMANA;

export type Province =
  | "Buenos Aires"
  | "CABA"
  | "Córdoba"
  | "Santa Fe"
  | "Mendoza"
  | "Tucumán"
  | "Entre Ríos"
  | "Salta"
  | "Neuquén"
  | "Río Negro"
  | "La Rioja"
  | "Catamarca"
  | "Chaco"
  | "Chubut"
  | "Corrientes"
  | "Formosa"
  | "Jujuy"
  | "La Pampa"
  | "Misiones"
  | "San Juan"
  | "San Luis"
  | "Santa Cruz"
  | "Santiago del Estero"
  | "Tierra del Fuego";

export type Distributor = {
  id: string;
  name: string;
  province: Province;
  zones: string[];
  contactName: string;
  whatsapp: string;
  email: string;
  active: boolean;
  coveredProvinces: Province[];
  postalCodes: string[];
  createdAt: string;
  updatedAt: string;
};

export type Lead = {
  id: string;
  fullName: string;
  company: string | null;
  phone: string;
  email: string | null;
  province: Province;
  city: string;
  postalCode: string;
  businessType: string;
  clientType: ClientType;
  distributorId: string | null;
  origin: LeadOrigin;
  status: LeadEstado;
  /** true = ya es cliente Cool Meals (pedidos de cliente). */
  isCustomer: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant" | "agent" | "system";
  content: string;
  createdAt: string;
};

export type Conversation = {
  id: string;
  leadId: string;
  name: string;
  phone: string;
  origin: LeadOrigin;
  status: ConversationStatus;
  clientType: ClientType;
  province: Province;
  distributorId: string | null;
  aiSummary: string;
  lastMessage: string;
  notes: string;
  tags: string[];
  assignedTo: string | null;
  /** Identifica pedidos: false → pedido_lead; true → pedido_cliente. */
  isCustomer: boolean;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
};

export type CommercialRuleCondition = {
  field:
    | "clientType"
    | "minBundles"
    | "province"
    | "distributorId"
    | "outsideProvinces";
  operator: "eq" | "neq" | "lt" | "gt" | "in" | "not_in";
  value: string | number | string[];
};

export type CommercialRuleAction =
  | { type: "derive" }
  | { type: "derive_to_distributor"; distributorId: string }
  | { type: "own_attention" }
  | { type: "request_samples" }
  | { type: "close" }
  | { type: "no_coverage" };

export type CommercialRule = {
  id: string;
  name: string;
  description: string;
  priority: number;
  active: boolean;
  conditions: CommercialRuleCondition[];
  action: CommercialRuleAction;
  updatedAt: string;
};

export type CommercialSettings = {
  minBundlesDefault: number;
  provinceDistributorMap: Array<{
    province: Province;
    distributorId: string;
  }>;
  rules: CommercialRule[];
};

export type KnowledgeCategory =
  | "faq"
  | "precios"
  | "politicas"
  | "proceso_comercial"
  | "tipos_negocio"
  | "institucional";

export type KnowledgeArticle = {
  id: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
  active: boolean;
  updatedAt: string;
};

export type PromptConfig = {
  id: string;
  name: string;
  personality: string;
  tone: string;
  objectives: string;
  restrictions: string;
  flows: string;
  rules: string;
  updatedAt: string;
};

/** Logística de muestras — 3 datos mínimos: nombre, teléfono, domicilio. */
export type SampleRequest = {
  id: string;
  conversationId: string | null;
  leadId: string | null;
  fullName: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  status: "pendiente" | "enviado" | "entregado" | "cancelado";
  sheetSyncedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ExecutiveDashboard = {
  leadsToday: number;
  leadsMonth: number;
  conversationsOpen: number;
  conversationsClosed: number;
  pctNoClientReply: number;
  noClientReplyCount: number;
  conversationsTotal: number;
  /** Intereses de ingreso (reunion). */
  leadsQuiereSerDistribuidor: number;
  leadsFason: number;
  leadsQuiereSerRepresentante: number;
};

export type CommercialTypeKey =
  | "mayoristas"
  | "retail"
  | "minoristas"
  | "quiere_ser_distribuidor"
  | "quiere_ser_representante"
  | "fason";

export type CommercialDashboard = {
  counts: Record<CommercialTypeKey, number>;
  percentages: Array<{
    key: CommercialTypeKey;
    label: string;
    count: number;
    pct: number;
  }>;
  /** Clientes/leads derivados a cada distribuidor de la red. */
  byDistributor: Array<{
    distributorId: string;
    name: string;
    count: number;
    pct: number;
  }>;
  interestKpis: {
    quiereSerDistribuidor: number;
    fason: number;
    quiereSerRepresentante: number;
  };
  /** Conversaciones del período agrupadas por provincia (Pipeline). */
  byProvince: Array<{
    province: string;
    count: number;
    pct: number;
  }>;
};

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

/**
 * Estados fijos del pipeline.
 * Los distribuidores de red se agregan como columnas dinámicas (derivados).
 * Orden: … → quiere ser dist / rep / fasón → [dists] → muestras → pedidos lead/cliente → …
 */
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

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  faq: "Preguntas frecuentes",
  precios: "Lista de precios",
  politicas: "Políticas",
  proceso_comercial: "Proceso comercial",
  tipos_negocio: "Tipos de negocio",
  institucional: "Información institucional",
};

export const PROVINCES: Province[] = [
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
];

/** Hashtag visible en card cuando está derivado: solo el nombre de la distribuidora. */
export function distributorHashtag(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `#${slug}`;
}

/** Regla demo: desde muestras, el destino de pedido depende de isCustomer. */
export function suggestedOrderStatus(
  isCustomer: boolean,
): Extract<ConversationStatus, "pedido_lead" | "pedido_cliente"> {
  return isCustomer ? "pedido_cliente" : "pedido_lead";
}
