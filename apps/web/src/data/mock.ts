import type {
  CommercialDashboard,
  CommercialSettings,
  CommercialTypeKey,
  Conversation,
  Distributor,
  ExecutiveDashboard,
  KnowledgeArticle,
  Lead,
  PromptConfig,
} from "@/domain/types";

const now = Date.now();
const iso = (daysAgo: number, hours = 10) =>
  new Date(now - daysAgo * 86400000 - hours * 3600000).toISOString();

export const mockDistributors: Distributor[] = [
  {
    id: "dist-1",
    name: "Distribuidora Norte SA",
    province: "Córdoba",
    zones: ["Capital", "Interior norte"],
    contactName: "Laura Méndez",
    whatsapp: "+54 351 555-0101",
    email: "laura@norte.com.ar",
    active: true,
    coveredProvinces: ["Córdoba", "Tucumán"],
    postalCodes: ["5000", "5001", "5012", "5147"],
    createdAt: iso(40),
    updatedAt: iso(2),
  },
  {
    id: "dist-2",
    name: "Cool Logística Cuyo",
    province: "Mendoza",
    zones: ["Gran Mendoza", "San Juan corredor"],
    contactName: "Martín Ríos",
    whatsapp: "+54 261 555-0202",
    email: "martin@cuyo.cool",
    active: true,
    coveredProvinces: ["Mendoza", "Neuquén"],
    postalCodes: ["5500", "5515", "5600"],
    createdAt: iso(60),
    updatedAt: iso(5),
  },
  {
    id: "dist-3",
    name: "Litoral Fresh",
    province: "Santa Fe",
    zones: ["Rosario", "Santa Fe capital"],
    contactName: "Ana Belucci",
    whatsapp: "+54 341 555-0303",
    email: "ana@litoralfresh.com",
    active: true,
    coveredProvinces: ["Santa Fe", "Entre Ríos"],
    postalCodes: ["2000", "3000", "3100"],
    createdAt: iso(12),
    updatedAt: iso(1),
  },
  {
    id: "dist-4",
    name: "AMBA Partners",
    province: "Buenos Aires",
    zones: ["GBA Norte", "GBA Sur"],
    contactName: "Diego Paz",
    whatsapp: "+54 11 5555-0404",
    email: "diego@ambapartners.com",
    active: false,
    coveredProvinces: ["Buenos Aires", "CABA"],
    postalCodes: ["1600", "1800", "B1600"],
    createdAt: iso(90),
    updatedAt: iso(20),
  },
];

export const mockLeads: Lead[] = [
  {
    id: "lead-1",
    fullName: "Carolina Suárez",
    company: "Almacén El Sol",
    phone: "+54 351 411-2200",
    email: "carolina@elsol.com",
    province: "Córdoba",
    city: "Córdoba",
    postalCode: "5000",
    businessType: "Almacén",
    clientType: "minorista",
    distributorId: "dist-1",
    origin: "whatsapp",
    status: "en_curso",
    isCustomer: false,
    createdAt: iso(0, 2),
    updatedAt: iso(0, 1),
  },
  {
    id: "lead-2",
    fullName: "Grupo Gastro Andino",
    company: "Grupo Gastro Andino",
    phone: "+54 261 422-8899",
    email: "compras@gastroandino.com",
    province: "Mendoza",
    city: "Godoy Cruz",
    postalCode: "5501",
    businessType: "Cadena HORECA",
    clientType: "mayorista",
    distributorId: "dist-2",
    origin: "web",
    status: "calificado",
    isCustomer: false,
    createdAt: iso(1),
    updatedAt: iso(0, 4),
  },
  {
    id: "lead-3",
    fullName: "Lucía Fernández",
    company: "Market 24",
    phone: "+54 341 455-6677",
    email: null,
    province: "Santa Fe",
    city: "Rosario",
    postalCode: "2000",
    businessType: "Minimarket",
    clientType: "retail",
    distributorId: "dist-3",
    origin: "instagram",
    status: "derivado",
    isCustomer: false,
    createdAt: iso(3),
    updatedAt: iso(2),
  },
  {
    id: "lead-4",
    fullName: "Hernán Vidal",
    company: "Vidal Representaciones",
    phone: "+54 11 4800-1122",
    email: "hernan@vidalrep.com",
    province: "CABA",
    city: "Palermo",
    postalCode: "1425",
    businessType: "Representaciones",
    clientType: "representante",
    distributorId: null,
    origin: "referido",
    status: "nuevo",
    isCustomer: false,
    createdAt: iso(0, 5),
    updatedAt: iso(0, 5),
  },
  {
    id: "lead-5",
    fullName: "Super Norte SRL",
    company: "Super Norte SRL",
    phone: "+54 381 430-9988",
    email: "pedidos@supernorte.com",
    province: "Tucumán",
    city: "San Miguel",
    postalCode: "4000",
    businessType: "Supermercado",
    clientType: "mayorista",
    distributorId: "dist-1",
    origin: "llamada",
    status: "pedido",
    isCustomer: false,
    createdAt: iso(8),
    updatedAt: iso(1),
  },
  {
    id: "lead-6",
    fullName: "Paula Roldán",
    company: "Kiosco Central",
    phone: "+54 343 415-7788",
    email: "paula@kioscocentral.com",
    province: "Entre Ríos",
    city: "Paraná",
    postalCode: "3100",
    businessType: "Kiosco",
    clientType: "minorista",
    distributorId: "dist-3",
    origin: "whatsapp",
    status: "muestras",
    isCustomer: false,
    createdAt: iso(15),
    updatedAt: iso(4),
  },
  {
    id: "lead-7",
    fullName: "Red Retail Patagonia",
    company: "Red Retail Patagonia",
    phone: "+54 299 445-2211",
    email: "ops@redpatagonia.com",
    province: "Neuquén",
    city: "Neuquén",
    postalCode: "8300",
    businessType: "Retail regional",
    clientType: "retail",
    distributorId: "dist-2",
    origin: "web",
    status: "ganado",
    isCustomer: true,
    createdAt: iso(25),
    updatedAt: iso(6),
  },
  {
    id: "lead-8",
    fullName: "Tomás Aguirre",
    company: null,
    phone: "+54 387 422-1001",
    email: "tomas.aguirre@mail.com",
    province: "Salta",
    city: "Salta",
    postalCode: "4400",
    businessType: "Almacén",
    clientType: "minorista",
    distributorId: null,
    origin: "instagram",
    status: "perdido",
    isCustomer: false,
    createdAt: iso(18),
    updatedAt: iso(10),
  },
  {
    id: "lead-9",
    fullName: "Marca Andina Foods",
    company: "Marca Andina Foods",
    phone: "+54 261 500-1212",
    email: "ops@andinafoods.com",
    province: "Mendoza",
    city: "Mendoza",
    postalCode: "5500",
    businessType: "Marca propia",
    clientType: "fason",
    distributorId: null,
    origin: "web",
    status: "nuevo",
    isCustomer: false,
    createdAt: iso(0, 3),
    updatedAt: iso(0, 3),
  },
  {
    id: "lead-10",
    fullName: "Logística Sur SA",
    company: "Logística Sur SA",
    phone: "+54 291 455-9090",
    email: "comercial@logisticasur.com",
    province: "Buenos Aires",
    city: "Bahía Blanca",
    postalCode: "8000",
    businessType: "Distribución",
    clientType: "distribuidor",
    distributorId: null,
    origin: "llamada",
    status: "en_curso",
    isCustomer: false,
    createdAt: iso(1),
    updatedAt: iso(0, 4),
  },
  {
    id: "lead-11",
    fullName: "Valeria Soto",
    company: "Soto Food Brokers",
    phone: "+54 351 422-7788",
    email: "valeria@sotobrokers.com",
    province: "Córdoba",
    city: "Córdoba",
    postalCode: "5000",
    businessType: "Representaciones",
    clientType: "representante",
    distributorId: null,
    origin: "referido",
    status: "calificado",
    isCustomer: false,
    createdAt: iso(2),
    updatedAt: iso(1),
  },
];

export const mockConversations: Conversation[] = [
  {
    id: "conv-1",
    leadId: "lead-1",
    name: "Carolina Suárez",
    phone: "+54 351 411-2200",
    origin: "whatsapp",
    status: "ia_atendiendo",
    clientType: "minorista",
    province: "Córdoba",
    distributorId: "dist-1",
    aiSummary:
      "Consulta por listado de precios y mínimo de pedido. Interés en línea congelados para almacén.",
    lastMessage: "¿Pueden enviarme la lista actualizada?",
    notes: "",
    tags: [],

    isCustomer: false,
    assignedTo: null,
    messages: [
      {
        id: "m1",
        role: "user",
        content: "Hola, quiero info de Cool Meals para mi almacén",
        createdAt: iso(0, 3),
      },
      {
        id: "m2",
        role: "assistant",
        content:
          "¡Hola Carolina! Soy el asistente de Cool Meals. ¿Buscás mayorista o minorista?",
        createdAt: iso(0, 3),
      },
      {
        id: "m3",
        role: "user",
        content: "Minorista. ¿Pueden enviarme la lista actualizada?",
        createdAt: iso(0, 1),
      },
    ],
    createdAt: iso(0, 3),
    updatedAt: iso(0, 1),
  },
  {
    id: "conv-2",
    leadId: "lead-2",
    name: "Grupo Gastro Andino",
    phone: "+54 261 422-8899",
    origin: "web",
    status: "esperando_respuesta",
    clientType: "mayorista",
    province: "Mendoza",
    distributorId: "dist-2",
    aiSummary:
      "Mayorista HORECA. Volumen estimado 80 bultos/mes. Pidió demos de 3 SKUs.",
    lastMessage: "Perfecto, esperamos la propuesta comercial.",
    notes: "Prioridad alta — cadena gastronómica",
    tags: [],

    isCustomer: false,
    assignedTo: "admin@coolmeals.com",
    messages: [
      {
        id: "m4",
        role: "user",
        content: "Somos una cadena gastronómica en Mendoza",
        createdAt: iso(1, 2),
      },
      {
        id: "m5",
        role: "assistant",
        content: "Excelente. ¿Qué volumen mensual estiman?",
        createdAt: iso(1, 2),
      },
      {
        id: "m6",
        role: "user",
        content: "Perfecto, esperamos la propuesta comercial.",
        createdAt: iso(0, 4),
      },
    ],
    createdAt: iso(1, 2),
    updatedAt: iso(0, 4),
  },
  {
    id: "conv-3",
    leadId: "lead-3",
    name: "Lucía Fernández",
    phone: "+54 341 455-6677",
    origin: "instagram",
    status: "derivado_distribuidor",
    clientType: "retail",
    province: "Santa Fe",
    distributorId: "dist-3",
    aiSummary:
      "Retail en Rosario. Derivada a Litoral Fresh (distribuidor 3) por zona.",
    lastMessage: "El distribuidor se va a contactar hoy.",
    notes: "Asignada a Dist. 3 — Litoral Fresh",
    tags: [],

    isCustomer: false,
    assignedTo: null,
    messages: [
      {
        id: "m7",
        role: "user",
        content: "Vi su IG, quiero reponer congelados",
        createdAt: iso(3),
      },
      {
        id: "m8",
        role: "system",
        content: "Conversación derivada a Litoral Fresh (dist-3)",
        createdAt: iso(2),
      },
    ],
    createdAt: iso(3),
    updatedAt: iso(2),
  },
  {
    id: "conv-3b",
    leadId: "lead-6",
    name: "Mercado del Puerto",
    phone: "+54 341 480-2211",
    origin: "whatsapp",
    status: "derivado_distribuidor",
    clientType: "minorista",
    province: "Santa Fe",
    distributorId: "dist-3",
    aiSummary:
      "Almacén en zona sur de Rosario. Bajo volumen; derivado a Dist. 3 Litoral Fresh.",
    lastMessage: "Ok, espero el llamado del distribuidor",
    notes: "Asignada a Dist. 3 — Litoral Fresh",
    tags: [],

    isCustomer: false,
    assignedTo: null,
    messages: [
      {
        id: "m7b",
        role: "user",
        content: "Quiero comprar pero no llego al mínimo de 50",
        createdAt: iso(2, 1),
      },
      {
        id: "m7c",
        role: "system",
        content: "Derivado a Litoral Fresh por regla de zona Santa Fe",
        createdAt: iso(2),
      },
    ],
    createdAt: iso(2, 1),
    updatedAt: iso(1, 2),
  },
  {
    id: "conv-3c",
    leadId: "lead-2",
    name: "Bodega Sur Cocina",
    phone: "+54 261 444-9090",
    origin: "web",
    status: "derivado_distribuidor",
    clientType: "mayorista",
    province: "Mendoza",
    distributorId: "dist-2",
    aiSummary:
      "HORECA Mendoza. Volumen 40 bultos. Derivado a Dist. 2 Cool Logística Cuyo.",
    lastMessage: "Martín de Cuyo ya me escribió",
    notes: "Asignada a Dist. 2 — Cool Logística Cuyo",
    tags: [],

    isCustomer: false,
    assignedTo: null,
    messages: [
      {
        id: "m7d",
        role: "user",
        content: "Somos un grupo de restaurantes en Godoy Cruz",
        createdAt: iso(4),
      },
      {
        id: "m7e",
        role: "system",
        content: "Derivado a Cool Logística Cuyo (dist-2)",
        createdAt: iso(3),
      },
    ],
    createdAt: iso(4),
    updatedAt: iso(1),
  },
  {
    id: "conv-3d",
    leadId: "lead-7",
    name: "Autoservicio Neuquén Centro",
    phone: "+54 299 442-1188",
    origin: "llamada",
    status: "derivado_distribuidor",
    clientType: "retail",
    province: "Neuquén",
    distributorId: "dist-2",
    aiSummary:
      "Retail Patagonia. Cobertura vía Dist. 2 Cool Logística Cuyo (corredor Neuquén).",
    lastMessage: "Coordinamos visita del distribuidor",
    notes: "Asignada a Dist. 2 — Cool Logística Cuyo",
    tags: [],

    isCustomer: false,
    assignedTo: null,
    messages: [
      {
        id: "m7f",
        role: "user",
        content: "Necesitamos reposición semanal de congelados",
        createdAt: iso(5),
      },
      {
        id: "m7g",
        role: "system",
        content: "Derivado a Cool Logística Cuyo (dist-2) por mapa de provincia",
        createdAt: iso(4),
      },
    ],
    createdAt: iso(5),
    updatedAt: iso(2),
  },
  {
    id: "conv-4",
    leadId: "lead-4",
    name: "Hernán Vidal",
    phone: "+54 11 4800-1122",
    origin: "referido",
    status: "atencion_representante",
    clientType: "representante",
    province: "CABA",
    distributorId: null,
    aiSummary:
      "Representante de zona AMBA. Pidió condiciones comerciales y catálogo. Requiere respuesta humana.",
    lastMessage: "¿Me pueden llamar para armar la propuesta?",
    notes: "Escalar a representante comercial",
    tags: [],
    isCustomer: false,
    assignedTo: null,
    messages: [
      {
        id: "m9",
        role: "user",
        content:
          "Me pasó un contacto de ustedes. ¿Me pueden llamar para armar la propuesta?",
        createdAt: iso(0, 5),
      },
    ],
    createdAt: iso(0, 5),
    updatedAt: iso(0, 5),
  },
  {
    id: "conv-4b",
    leadId: "lead-1",
    name: "Silvina Acosta",
    phone: "+54 351 500-7788",
    origin: "whatsapp",
    status: "atencion_representante",
    clientType: "mayorista",
    province: "Córdoba",
    distributorId: null,
    aiSummary:
      "Mayorista con objeción de precio. La IA no pudo cerrar; espera representante.",
    lastMessage: "Prefiero hablar con una persona de ventas",
    notes: "",
    tags: [],
    isCustomer: false,
    assignedTo: null,
    messages: [
      {
        id: "m9b",
        role: "user",
        content: "Prefiero hablar con una persona de ventas",
        createdAt: iso(0, 2),
      },
    ],
    createdAt: iso(0, 2),
    updatedAt: iso(0, 2),
  },
  {
    id: "conv-4c",
    leadId: "lead-2",
    name: "Joaquín Pereyra",
    phone: "+54 261 411-3344",
    origin: "web",
    status: "esperando_respuesta",
    clientType: "representante",
    province: "Mendoza",
    distributorId: null,
    aiSummary:
      "Ya fue atendido por representante. Quedó pendiente envío de lista de precios.",
    lastMessage: "Gracias, quedo a la espera del PDF",
    notes: "Seguimiento post llamada",
    tags: ["#atendido_por_representante"],
    isCustomer: false,
    assignedTo: "admin@coolmeals.com",
    messages: [
      {
        id: "m9c",
        role: "agent",
        content: "Hablamos por teléfono, te envío el PDF hoy",
        createdAt: iso(1),
      },
      {
        id: "m9d",
        role: "user",
        content: "Gracias, quedo a la espera del PDF",
        createdAt: iso(0, 6),
      },
    ],
    createdAt: iso(2),
    updatedAt: iso(0, 6),
  },
  {
    id: "conv-5",
    leadId: "lead-5",
    name: "Super Norte SRL",
    phone: "+54 381 430-9988",
    origin: "llamada",
    status: "pedido_lead",
    clientType: "mayorista",
    province: "Tucumán",
    distributorId: "dist-1",
    aiSummary: "Pedido en armado: 60 bultos. Coordinación con Norte SA. Pedido de lead (aún no cliente).",
    lastMessage: "Confirmamos entrega para el jueves",
    notes: "OC #4821 · pedido_lead",
    tags: [],

    isCustomer: false,
    assignedTo: "admin@coolmeals.com",
    messages: [
      {
        id: "m10",
        role: "agent",
        content: "Confirmamos entrega para el jueves",
        createdAt: iso(1),
      },
    ],
    createdAt: iso(8),
    updatedAt: iso(1),
  },
  {
    id: "conv-6",
    leadId: "lead-6",
    name: "Paula Roldán",
    phone: "+54 343 415-7788",
    origin: "whatsapp",
    status: "muestras",
    clientType: "minorista",
    province: "Entre Ríos",
    distributorId: "dist-3",
    aiSummary: "Solicitud de muestras para kiosco. Envío programado.",
    lastMessage: "¿Cuándo llegan las muestras?",
    notes: "",
    tags: [],

    isCustomer: false,
    assignedTo: null,
    messages: [
      {
        id: "m11",
        role: "user",
        content: "¿Cuándo llegan las muestras?",
        createdAt: iso(4),
      },
    ],
    createdAt: iso(15),
    updatedAt: iso(4),
  },
  {
    id: "conv-7",
    leadId: "lead-7",
    name: "Red Retail Patagonia",
    phone: "+54 299 445-2211",
    origin: "web",
    status: "finalizado",
    clientType: "retail",
    province: "Neuquén",
    distributorId: "dist-2",
    aiSummary: "Cuenta cerrada. Alta comercial completada. Ya es cliente Cool Meals.",
    lastMessage: "Gracias, quedamos operativos",
    notes: "Cliente ganado",
    tags: [],

    isCustomer: true,
    assignedTo: "admin@coolmeals.com",
    messages: [
      {
        id: "m12",
        role: "user",
        content: "Gracias, quedamos operativos",
        createdAt: iso(6),
      },
    ],
    createdAt: iso(25),
    updatedAt: iso(6),
  },
  {
    id: "conv-7b",
    leadId: "lead-7",
    name: "Red Retail Patagonia",
    phone: "+54 299 445-2211",
    origin: "web",
    status: "pedido_cliente",
    clientType: "retail",
    province: "Neuquén",
    distributorId: "dist-2",
    aiSummary:
      "Reposición mensual. Pedido de cliente existente (isCustomer=true).",
    lastMessage: "Confirmamos 40 bultos para la semana que viene",
    notes: "pedido_cliente · cuenta activa",
    tags: [],
    isCustomer: true,
    assignedTo: "admin@coolmeals.com",
    messages: [
      {
        id: "m12b",
        role: "user",
        content: "Confirmamos 40 bultos para la semana que viene",
        createdAt: iso(0, 8),
      },
    ],
    createdAt: iso(2),
    updatedAt: iso(0, 8),
  },
  {
    id: "conv-9",
    leadId: "lead-10",
    name: "Logística Sur SA",
    phone: "+54 291 455-9090",
    origin: "llamada",
    status: "quiere_ser_distribuidor",
    clientType: "distribuidor",
    province: "Buenos Aires",
    distributorId: null,
    aiSummary:
      "Quiere sumarse como distribuidor Cool Meals en Bahía Blanca / Sur.",
    lastMessage: "¿Cuáles son los requisitos para ser distribuidor?",
    notes: "Lead de red — no confundir con derivado a dist existente",
    tags: [],
    isCustomer: false,
    assignedTo: null,
    messages: [
      {
        id: "m20",
        role: "user",
        content: "¿Cuáles son los requisitos para ser distribuidor?",
        createdAt: iso(1),
      },
    ],
    createdAt: iso(1),
    updatedAt: iso(0, 4),
  },
  {
    id: "conv-10",
    leadId: "lead-9",
    name: "Marca Andina Foods",
    phone: "+54 261 500-1212",
    origin: "web",
    status: "nuevo",
    clientType: "fason",
    province: "Mendoza",
    distributorId: null,
    aiSummary: "Marca propia busca producción a fasón en planta Cool Meals.",
    lastMessage: "Queremos cotizar 3 SKUs a fasón",
    notes: "",
    tags: [],
    isCustomer: false,
    assignedTo: null,
    messages: [
      {
        id: "m21",
        role: "user",
        content: "Queremos cotizar 3 SKUs a fasón",
        createdAt: iso(0, 3),
      },
    ],
    createdAt: iso(0, 3),
    updatedAt: iso(0, 3),
  },
  {
    id: "conv-11",
    leadId: "lead-11",
    name: "Valeria Soto",
    phone: "+54 351 422-7788",
    origin: "referido",
    status: "atencion_representante",
    clientType: "representante",
    province: "Córdoba",
    distributorId: null,
    aiSummary:
      "Quiere ser representante comercial de Cool Meals (no es staff interno).",
    lastMessage: "Me interesa cubrir el interior de Córdoba",
    notes: "",
    tags: [],
    isCustomer: false,
    assignedTo: null,
    messages: [
      {
        id: "m22",
        role: "user",
        content: "Me interesa cubrir el interior de Córdoba",
        createdAt: iso(2),
      },
    ],
    createdAt: iso(2),
    updatedAt: iso(1),
  },
  {
    id: "conv-8",
    leadId: "lead-8",
    name: "Tomás Aguirre",
    phone: "+54 387 422-1001",
    origin: "instagram",
    status: "descartado",
    clientType: "minorista",
    province: "Salta",
    distributorId: null,
    aiSummary: "Sin volumen mínimo. Descartado por política comercial.",
    lastMessage: "Por ahora no me cierra el mínimo",
    notes: "Fuera de umbral",
    tags: [],

    isCustomer: false,
    assignedTo: null,
    messages: [
      {
        id: "m13",
        role: "user",
        content: "Por ahora no me cierra el mínimo",
        createdAt: iso(10),
      },
    ],
    createdAt: iso(18),
    updatedAt: iso(10),
  },
];

export const mockCommercialSettings: CommercialSettings = {
  minBundlesDefault: 50,
  provinceDistributorMap: [
    { province: "Córdoba", distributorId: "dist-1" },
    { province: "Tucumán", distributorId: "dist-1" },
    { province: "Mendoza", distributorId: "dist-2" },
    { province: "Neuquén", distributorId: "dist-2" },
    { province: "Santa Fe", distributorId: "dist-3" },
    { province: "Entre Ríos", distributorId: "dist-3" },
  ],
  rules: [
    {
      id: "rule-1",
      name: "Mayorista bajo volumen fuera de Córdoba",
      description:
        "SI mayorista AND menos de 50 bultos AND fuera de Córdoba → Derivar",
      priority: 10,
      active: true,
      conditions: [
        { field: "clientType", operator: "eq", value: "mayorista" },
        { field: "minBundles", operator: "lt", value: 50 },
        { field: "outsideProvinces", operator: "in", value: ["Córdoba"] },
      ],
      action: { type: "derive" },
      updatedAt: iso(3),
    },
    {
      id: "rule-2",
      name: "Distribuidor → atención propia",
      description: "SI tipo = distribuidor → Siempre atención propia",
      priority: 1,
      active: true,
      conditions: [
        { field: "clientType", operator: "eq", value: "distribuidor" },
      ],
      action: { type: "own_attention" },
      updatedAt: iso(7),
    },
    {
      id: "rule-3",
      name: "Retail Santa Fe → Litoral Fresh",
      description: "Retail en Santa Fe se deriva al distribuidor de zona",
      priority: 20,
      active: true,
      conditions: [
        { field: "clientType", operator: "eq", value: "retail" },
        { field: "province", operator: "eq", value: "Santa Fe" },
      ],
      action: { type: "derive_to_distributor", distributorId: "dist-3" },
      updatedAt: iso(1),
    },
  ],
};

export const mockKnowledge: KnowledgeArticle[] = [
  {
    id: "kb-1",
    title: "¿Cuál es el pedido mínimo?",
    category: "faq",
    content:
      "El pedido mínimo estándar es de 50 bultos. Puede variar según provincia y tipo de cliente según las reglas comerciales.",
    active: true,
    updatedAt: iso(2),
  },
  {
    id: "kb-2",
    title: "Lista de precios mayo 2026",
    category: "precios",
    content:
      "Línea clásica: consultar PDF interno. Congelados premium +12%. Descuentos por volumen desde 80 bultos.",
    active: true,
    updatedAt: iso(5),
  },
  {
    id: "kb-3",
    title: "Política de muestras",
    category: "politicas",
    content:
      "Hasta 3 SKUs de muestra por lead calificado. No aplica a pedidos descartados por mínimo.",
    active: true,
    updatedAt: iso(9),
  },
  {
    id: "kb-4",
    title: "Proceso de derivación",
    category: "proceso_comercial",
    content:
      "1) IA califica 2) Reglas comerciales 3) Deriva a distribuidor o atención propia 4) Seguimiento humano.",
    active: true,
    updatedAt: iso(4),
  },
  {
    id: "kb-5",
    title: "Tipos de negocio admitidos",
    category: "tipos_negocio",
    content:
      "Almacén, minimarket, supermercado, HORECA, kiosco, retail regional, representaciones.",
    active: true,
    updatedAt: iso(11),
  },
  {
    id: "kb-6",
    title: "Sobre Cool Meals",
    category: "institucional",
    content:
      "Cool Meals elabora y distribuye comidas congeladas de calidad para el canal comercial argentino.",
    active: true,
    updatedAt: iso(20),
  },
];

export const mockPrompt: PromptConfig = {
  id: "prompt-main",
  name: "Prompt principal WhatsApp",
  personality:
    "Sos el asistente comercial de Cool Meals. Amable, claro y orientado a calificar leads.",
  tone: "Profesional cercano, español rioplatense, sin slang excesivo.",
  objectives:
    "Identificar tipo de cliente, provincia, volumen estimado y necesidad. Aplicar reglas comerciales. Derivar o continuar según configuración.",
  restrictions:
    "No inventar precios. No prometer entregas sin confirmar. No compartir datos internos. No cerrar descuentos fuera de política.",
  flows:
    "Saludo → tipo de cliente → zona → volumen → oferta de info/precios/muestras → regla comercial → cierre o derivación.",
  rules:
    "Consultar base de conocimiento antes de responder FAQ. Si no hay match, escalar a humano.",
  updatedAt: iso(1),
};

export function buildExecutiveDashboard(
  leads: Lead[],
  conversations: Conversation[],
): ExecutiveDashboard {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(
    startOfDay.getFullYear(),
    startOfDay.getMonth(),
    1,
  );

  const conversationsOpen = conversations.filter(
    (c) => c.status !== "finalizado" && c.status !== "descartado",
  ).length;
  const conversationsClosed = conversations.filter(
    (c) => c.status === "finalizado" || c.status === "descartado",
  ).length;
  const noClientReplyCount = conversations.filter(
    (c) => c.status === "esperando_respuesta",
  ).length;
  const conversationsTotal = conversations.length || 1;

  return {
    leadsToday: leads.filter((l) => new Date(l.createdAt) >= startOfDay).length,
    leadsMonth: leads.filter((l) => new Date(l.createdAt) >= startOfMonth)
      .length,
    conversationsOpen,
    conversationsClosed,
    noClientReplyCount,
    conversationsTotal: conversations.length,
    pctNoClientReply:
      Math.round((noClientReplyCount / conversationsTotal) * 1000) / 10,
    leadsQuiereSerDistribuidor: leads.filter(
      (l) => l.clientType === "distribuidor",
    ).length,
    leadsFason: leads.filter((l) => l.clientType === "fason").length,
    leadsQuiereSerRepresentante: leads.filter(
      (l) => l.clientType === "representante",
    ).length,
  };
}

const COMMERCIAL_LABELS: Record<CommercialTypeKey, string> = {
  mayoristas: "Mayoristas",
  retail: "Retail",
  minoristas: "Minoristas",
  quiere_ser_distribuidor: "Quiere ser distribuidor",
  quiere_ser_representante: "Quiere ser representante",
  fason: "Fasón",
};

function emptyTypeCounts(): Record<CommercialTypeKey, number> {
  return {
    mayoristas: 0,
    retail: 0,
    minoristas: 0,
    quiere_ser_distribuidor: 0,
    quiere_ser_representante: 0,
    fason: 0,
  };
}

function mapLeadToCommercialKey(clientType: Lead["clientType"]): CommercialTypeKey | null {
  if (clientType === "mayorista") return "mayoristas";
  if (clientType === "retail") return "retail";
  if (clientType === "minorista") return "minoristas";
  if (clientType === "distribuidor") return "quiere_ser_distribuidor";
  if (clientType === "representante") return "quiere_ser_representante";
  if (clientType === "fason") return "fason";
  return null;
}

function countTypesForPeriod(leads: Lead[], from: Date, to: Date) {
  const counts = emptyTypeCounts();
  for (const lead of leads) {
    const created = new Date(lead.createdAt);
    if (created < from || created >= to) continue;
    const key = mapLeadToCommercialKey(lead.clientType);
    if (key) counts[key] += 1;
  }
  return counts;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("es-AR", { month: "short", year: "numeric" });
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function seedMonth(
  base: Record<CommercialTypeKey, number>,
  factor: number,
): Record<CommercialTypeKey, number> {
  return {
    mayoristas: Math.max(0, Math.round(base.mayoristas * factor + 1)),
    retail: Math.max(0, Math.round(base.retail * factor)),
    minoristas: Math.max(0, Math.round(base.minoristas * factor + 2)),
    quiere_ser_distribuidor: Math.max(
      0,
      Math.round(base.quiere_ser_distribuidor * factor),
    ),
    quiere_ser_representante: Math.max(
      0,
      Math.round(base.quiere_ser_representante * factor),
    ),
    fason: Math.max(0, Math.round(base.fason * factor)),
  };
}

export function buildCommercialDashboard(
  leads: Lead[],
  conversations: Conversation[],
  distributors: Distributor[],
): CommercialDashboard {
  const now = new Date();
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const counts = emptyTypeCounts();
  for (const lead of leads) {
    const key = mapLeadToCommercialKey(lead.clientType);
    if (key) counts[key] += 1;
  }

  const totalTypes = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  const percentages = (Object.keys(COMMERCIAL_LABELS) as CommercialTypeKey[]).map(
    (key) => ({
      key,
      label: COMMERCIAL_LABELS[key],
      count: counts[key],
      pct: Math.round((counts[key] / totalTypes) * 1000) / 10,
    }),
  );

  const derived = conversations.filter(
    (c) => c.status === "derivado_distribuidor" && c.distributorId,
  );
  const byDistributorRaw = distributors.map((d) => ({
    distributorId: d.id,
    name: d.name,
    count: derived.filter((c) => c.distributorId === d.id).length,
  }));
  const derivedTotal =
    byDistributorRaw.reduce((sum, row) => sum + row.count, 0) || 1;
  const byDistributor = byDistributorRaw.map((row) => ({
    ...row,
    pct: Math.round((row.count / derivedTotal) * 1000) / 10,
  }));

  const monthlyEvolution = [];
  for (let i = 5; i >= 0; i -= 1) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    let period = countTypesForPeriod(leads, from, to);
    if (!Object.values(period).some((v) => v > 0)) {
      period = seedMonth(counts, 0.35 + (5 - i) * 0.1);
    }
    if (i === 0) period = { ...counts };
    monthlyEvolution.push({
      monthKey: monthKey(from),
      label: monthLabel(from),
      ...period,
    });
  }

  const previous = countTypesForPeriod(leads, startPrevMonth, startThisMonth);
  const previousSeeded = Object.values(previous).some((v) => v > 0)
    ? previous
    : seedMonth(counts, 0.75);

  const vsPreviousMonth = (Object.keys(COMMERCIAL_LABELS) as CommercialTypeKey[]).map(
    (key) => {
      const current = counts[key];
      const prev = previousSeeded[key];
      const deltaPct =
        prev === 0
          ? current > 0
            ? 100
            : null
          : Math.round(((current - prev) / prev) * 1000) / 10;
      return {
        key,
        label: COMMERCIAL_LABELS[key],
        current,
        previous: prev,
        deltaPct,
      };
    },
  );

  return {
    counts,
    percentages,
    byDistributor,
    interestKpis: {
      quiereSerDistribuidor: counts.quiere_ser_distribuidor,
      fason: counts.fason,
      quiereSerRepresentante: counts.quiere_ser_representante,
    },
    monthlyEvolution,
    vsPreviousMonth,
  };
}
