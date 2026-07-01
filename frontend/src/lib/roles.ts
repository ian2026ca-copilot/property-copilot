import type { AuthUser } from "./auth";

export type Role = AuthUser["role"];

const LEVEL: Record<Role, number> = {
  OWNER: 4,
  MANAGER: 3,
  AGENT: 2,
  TENANT: 1,
  VENDOR: 1,
};

export function hasMinRole(role: Role | undefined, min: Role): boolean {
  return (LEVEL[role ?? "TENANT"] ?? 0) >= LEVEL[min];
}

export function can(role: Role | undefined) {
  return {
    // Properties
    createProperty:  hasMinRole(role, "MANAGER"),
    editProperty:    hasMinRole(role, "MANAGER"),
    deleteProperty:  hasMinRole(role, "OWNER"),
    createUnit:      hasMinRole(role, "MANAGER"),
    editUnit:        hasMinRole(role, "MANAGER"),
    deleteUnit:      hasMinRole(role, "MANAGER"),
    // Tenants
    createTenant:    hasMinRole(role, "MANAGER"),
    editTenant:      hasMinRole(role, "MANAGER"),
    terminateTenant: hasMinRole(role, "OWNER"),
    // Payments
    managePayments:  hasMinRole(role, "MANAGER"),
    // Maintenance
    manageMaintenance: hasMinRole(role, "MANAGER"),
    viewMaintenance:   hasMinRole(role, "AGENT"),
    // Team
    viewTeam:        hasMinRole(role, "MANAGER"),
    inviteStaff:     hasMinRole(role, "MANAGER"),
    changeRoles:     hasMinRole(role, "OWNER"),
    removeMembers:   hasMinRole(role, "OWNER"),
  };
}

// Nav items visible per role
export const NAV_ROLES: Record<string, Role> = {
  "/dashboard":   "AGENT",
  "/properties":  "AGENT",
  "/vacancy":     "AGENT",
  "/tenants":     "AGENT",
  "/payments":    "MANAGER",
  "/screening":   "AGENT",
  "/marketing":   "AGENT",
  "/maintenance": "AGENT",
  "/settings":    "MANAGER",
};
