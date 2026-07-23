import type { AuthUser } from "./auth";

export type Role = AuthUser["role"];

const LEVEL: Record<Role, number> = {
  OWNER: 4,
  TENANT: 1,
  VENDOR: 1,
};

export function hasMinRole(role: Role | undefined, min: Role): boolean {
  return (LEVEL[role ?? "TENANT"] ?? 0) >= LEVEL[min];
}

export function can(role: Role | undefined) {
  return {
    // Properties
    createProperty:  hasMinRole(role, "OWNER"),
    editProperty:    hasMinRole(role, "OWNER"),
    deleteProperty:  hasMinRole(role, "OWNER"),
    createUnit:      hasMinRole(role, "OWNER"),
    editUnit:        hasMinRole(role, "OWNER"),
    deleteUnit:      hasMinRole(role, "OWNER"),
    // Tenants
    createTenant:    hasMinRole(role, "OWNER"),
    editTenant:      hasMinRole(role, "OWNER"),
    terminateTenant: hasMinRole(role, "OWNER"),
    // Payments
    managePayments:  hasMinRole(role, "OWNER"),
    // Maintenance
    manageMaintenance: hasMinRole(role, "OWNER"),
    viewMaintenance:   hasMinRole(role, "OWNER"),
    // Team
    viewTeam:        hasMinRole(role, "OWNER"),
    inviteStaff:     hasMinRole(role, "OWNER"),
    removeMembers:   hasMinRole(role, "OWNER"),
  };
}

// Nav items visible per role
export const NAV_ROLES: Record<string, Role> = {
  "/dashboard":   "OWNER",
  "/properties":  "OWNER",
  "/vacancy":     "OWNER",
  "/tenants":     "OWNER",
  "/payments":    "OWNER",
  "/screening":   "OWNER",
  "/marketing":   "OWNER",
  "/maintenance": "OWNER",
  "/settings":    "OWNER",
};
