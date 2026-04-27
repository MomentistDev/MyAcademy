export type PlatformRole = "super_admin";
export type OrganizationRole = "org_admin" | "trainer" | "learner";
export type AppRole = PlatformRole | OrganizationRole;

export type Permission =
  | "org.manage"
  | "branch.manage"
  | "membership.manage"
  | "course.manage"
  | "course.assign"
  | "quiz.manage"
  | "learning_path.manage"
  | "analytics.read"
  | "certificate.manage"
  | "subscription.manage"
  | "audit.read"
  | "self.learning.read"
  | "self.assessment.attempt";

const permissionsByRole: Record<AppRole, readonly Permission[]> = {
  super_admin: ["org.manage", "subscription.manage", "audit.read", "analytics.read"],
  org_admin: [
    "branch.manage",
    "membership.manage",
    "course.manage",
    "course.assign",
    "quiz.manage",
    "learning_path.manage",
    "analytics.read",
    "certificate.manage",
    "subscription.manage",
    "audit.read",
  ],
  trainer: [
    "course.manage",
    "course.assign",
    "quiz.manage",
    "learning_path.manage",
    "analytics.read",
    "certificate.manage",
    "audit.read",
  ],
  learner: ["self.learning.read", "self.assessment.attempt"],
};

export function hasPermission(role: AppRole, permission: Permission): boolean {
  return permissionsByRole[role].includes(permission);
}

export interface AuthContext {
  userId: string;
  role: AppRole;
  organizationId?: string;
}

export function assertTenantAccess(context: AuthContext, targetOrganizationId: string): void {
  if (context.role === "super_admin") return;

  if (!context.organizationId || context.organizationId !== targetOrganizationId) {
    throw new Error("Cross-tenant access denied.");
  }
}
