import { z } from "zod";

export const LeadStatus = {
  NEW: "new",
  CONTACTED: "contacted",
  QUALIFIED: "qualified",
  WON: "won",
  LOST: "lost",
} as const;

export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const leadStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
]);

export const leadSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1).max(200),
  email: z.string().email().nullable(),
  phone: z.string().min(5).max(40).nullable(),
  company: z.string().max(200).nullable(),
  source: z.string().max(100).nullable(),
  status: leadStatusSchema,
  notes: z.string().max(5000).nullable(),
  assigned_to: z.string().uuid().nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Lead = z.infer<typeof leadSchema>;

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const createLeadSchema = z.object({
  full_name: z.string().trim().min(1, "Nombre requerido").max(200),
  email: z.preprocess(
    emptyToNull,
    z.string().email("Email inválido").nullable().optional(),
  ),
  phone: z.preprocess(
    emptyToNull,
    z.string().trim().min(5).max(40).nullable().optional(),
  ),
  company: z.preprocess(
    emptyToNull,
    z.string().trim().max(200).nullable().optional(),
  ),
  source: z.preprocess(
    emptyToNull,
    z.string().trim().max(100).nullable().optional(),
  ),
  status: leadStatusSchema.default("new"),
  notes: z.preprocess(
    emptyToNull,
    z.string().trim().max(5000).nullable().optional(),
  ),
  assigned_to: z.preprocess(
    emptyToNull,
    z.string().uuid().nullable().optional(),
  ),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = createLeadSchema.partial();

export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const listLeadsQuerySchema = z.object({
  status: leadStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
