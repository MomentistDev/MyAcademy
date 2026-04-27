import { assertTenantAccess, hasPermission, type Permission } from "../../contracts/rbac";
import type { AuthContext } from "./auth-context";

export function requirePermission(context: AuthContext, permission: Permission): void {
  if (!hasPermission(context.role, permission)) {
    throw new Error(`Forbidden: missing permission ${permission}`);
  }
}

export function requireTenantAccess(context: AuthContext, organizationId: string): void {
  assertTenantAccess(context, organizationId);
}
