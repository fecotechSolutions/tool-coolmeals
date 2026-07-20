/**
 * @deprecated Import from `./domain` instead.
 * Re-exports kept for backward-compatible imports during migration.
 */
export {
  leadSchema,
  createLeadSchema,
  updateLeadSchema,
  listLeadsQuerySchema,
  leadEstadoSchema as leadStatusSchema,
  LeadEstado as LeadStatus,
  type Lead,
  type CreateLeadInput,
  type UpdateLeadInput,
  type ListLeadsQuery,
  type LeadEstado as LeadStatusType,
} from "./domain";
