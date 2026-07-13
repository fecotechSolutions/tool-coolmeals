import { z } from "zod";
import { userRoleSchema } from "./roles";

export const profileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().nullable(),
  role: userRoleSchema,
  is_active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Profile = z.infer<typeof profileSchema>;

/** Shape of the future authenticated user context (Auth TBD). */
export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: userRoleSchema,
});

export type AuthUser = z.infer<typeof authUserSchema>;
