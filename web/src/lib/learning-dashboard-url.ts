/** Learning dashboard URL with optional org scope (multi-org learners) and error query. */
export function learningDashboardUrl(organizationId?: string, error?: string): string {
  const p = new URLSearchParams();
  if (organizationId) p.set("organizationId", organizationId);
  if (error) p.set("error", error);
  const qs = p.toString();
  return qs ? `/dashboard/learning?${qs}` : "/dashboard/learning";
}

/** In-progress or submitted quiz attempt (org + learner membership in query; optional error after failed submit). */
export function learningQuizAttemptUrl(
  attemptId: string,
  organizationId: string,
  membershipId: string,
  error?: string,
): string {
  const p = new URLSearchParams({ organizationId, membershipId });
  if (error) p.set("error", error);
  return `/dashboard/learning/quiz/${encodeURIComponent(attemptId)}?${p.toString()}`;
}
