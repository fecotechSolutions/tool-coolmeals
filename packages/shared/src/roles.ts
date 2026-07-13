import { z } from "zod";

/** Roles prepared for Auth (to be wired later). */
export const UserRole = {
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const userRoleSchema = z.enum(["superadmin", "admin"]);

export const ROLE_PERMISSIONS = {
  superadmin: {
    canManageUsers: true,
    canDeleteLeads: true,
    canExportLeads: true,
    canManageSettings: true,
  },
  admin: {
    canManageUsers: false,
    canDeleteLeads: false,
    canExportLeads: true,
    canManageSettings: false,
  },
} as const satisfies Record<
  UserRole,
  {
    canManageUsers: boolean;
    canDeleteLeads: boolean;
    canExportLeads: boolean;
    canManageSettings: boolean;
  }
>;

export function hasPermission(
  role: UserRole,
  permission: keyof (typeof ROLE_PERMISSIONS)[UserRole],
): boolean {
  return ROLE_PERMISSIONS[role][permission];
}
