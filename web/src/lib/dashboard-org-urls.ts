/** Org-scoped dashboard routes (single source for query string shape). */
export type DashboardOrgScopedPage = "notifications" | "team" | "audit";

const BASE: Record<DashboardOrgScopedPage, string> = {
  notifications: "/dashboard/notifications",
  team: "/dashboard/team",
  audit: "/dashboard/audit",
};

/** Team page: org plus optional error, course quiz builder, or learning path context. */
export function dashboardTeamPath(
  organizationId: string,
  options?: { error?: string; courseId?: string; learningPathId?: string },
): string {
  const q = new URLSearchParams({ organizationId });
  if (options?.error) q.set("error", options.error);
  if (options?.courseId) q.set("courseId", options.courseId);
  if (options?.learningPathId) q.set("learningPathId", options.learningPathId);
  return `${BASE.team}?${q.toString()}`;
}

/** Focused onboarding document review queue for trainers and org admins. */
export function dashboardTeamReviewQueuePath(organizationId: string, error?: string): string {
  const q = new URLSearchParams({ organizationId });
  if (error) q.set("error", error);
  return `/dashboard/team/review-queue?${q.toString()}`;
}

/** Org-scoped completion / enrollment snapshot for staff. */
export function dashboardTeamInsightsPath(organizationId: string, error?: string): string {
  const q = new URLSearchParams({ organizationId });
  if (error) q.set("error", error);
  return `/dashboard/team/insights?${q.toString()}`;
}

/** Notifications list for one org, optional error banner query. */
export function dashboardNotificationsPath(organizationId: string, error?: string): string {
  const q = new URLSearchParams({ organizationId });
  if (error) q.set("error", error);
  return `${BASE.notifications}?${q.toString()}`;
}

/** Notifications list with only an error query (no organizationId yet). */
export function dashboardNotificationsErrorOnly(message: string): string {
  return `${BASE.notifications}?error=${encodeURIComponent(message)}`;
}

/** Team page with only an error query (no organizationId yet). */
export function dashboardTeamErrorOnly(message: string): string {
  return `${BASE.team}?error=${encodeURIComponent(message)}`;
}

export function dashboardOrgUrl(page: DashboardOrgScopedPage, organizationId: string): string {
  if (page === "team") return dashboardTeamPath(organizationId);
  if (page === "notifications") return dashboardNotificationsPath(organizationId);
  const q = new URLSearchParams({ organizationId });
  return `${BASE[page]}?${q.toString()}`;
}
