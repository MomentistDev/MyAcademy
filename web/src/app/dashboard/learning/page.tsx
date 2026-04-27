import type { Metadata } from "next";
import { getApiSession, apiGetJson } from "@/lib/api-server";
import { dashboardOrgUrl, dashboardTeamInsightsPath, dashboardTeamReviewQueuePath } from "@/lib/dashboard-org-urls";
import { learningDashboardUrl } from "@/lib/learning-dashboard-url";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  completeChecklistItemAction,
  completeEnrollmentAction,
  downloadMyChecklistEvidenceAction,
  startQuizAttemptAction,
  submitDocumentForReviewAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Learning",
};

type PageProps = {
  searchParams: Promise<{ error?: string; organizationId?: string }>;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  role: string;
  organizations: { slug: string; name: string } | null;
};

type AssignmentsPayload = {
  items: Array<{
    id: string;
    status: string;
    title: string | null;
    courseId: string | null;
    contentItems: Array<{
      id: string;
      type: string;
      title: string;
      resourceUrl: string | null;
      isRequired: boolean;
    }>;
    quizzes: Array<{ id: string; title: string }>;
  }>;
};

type OnboardingPayload = {
  summary: { total: number; completed: number; completionRate: number };
  items: Array<{
    id: string;
    status: string;
    reviewStatus: string;
    reviewNote: string | null;
    hasEvidence: boolean;
    title: string;
    itemType: string;
  }>;
};

type CertificatesPayload = {
  items: Array<{
    id: string;
    title: string;
    credentialCode: string;
    issuedAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    quizId: string;
  }>;
};

function checklistRowNeedsAction(row: OnboardingPayload["items"][number]): boolean {
  if (row.status === "completed" || row.status === "waived") return false;
  if (row.itemType === "submit_document" && row.reviewStatus === "pending_review") return false;
  return true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function LearningPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const session = await getApiSession();
  if (!session) redirect("/login");

  const membershipsRes = await apiGetJson<{ memberships: MembershipRow[] }>(session, "/api/me/memberships");
  if (!membershipsRes.ok) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-sm text-red-700">
        Could not load memberships ({membershipsRes.status}). Is the API running on {session.apiUrl}?
      </div>
    );
  }

  const memberships = membershipsRes.data.memberships;
  const learnerMemberships = memberships.filter((m) => m.role === "learner");

  let requestedOrgId = query.organizationId?.trim();
  if (
    !requestedOrgId ||
    !UUID_RE.test(requestedOrgId) ||
    !learnerMemberships.some((m) => m.organization_id === requestedOrgId)
  ) {
    requestedOrgId = undefined;
  }

  const learnerMembership =
    (requestedOrgId ? learnerMemberships.find((m) => m.organization_id === requestedOrgId) : undefined) ??
    learnerMemberships[0];

  if (!learnerMembership) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-6 py-12">
        <p className="text-sm text-zinc-700">
          This view calls learner-only APIs. Sign in as{" "}
          <code className="rounded bg-zinc-100 px-1">learner@acme.test</code> to see assignments and onboarding
          progress.
        </p>
        <Link href="/dashboard" className="text-sm font-medium text-zinc-900 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const orgId = learnerMembership.organization_id;
  const memberId = learnerMembership.id;
  const canTeamForOrg = memberships.some(
    (m) => m.organization_id === orgId && (m.role === "org_admin" || m.role === "trainer"),
  );
  const q = new URLSearchParams({ organizationId: orgId, membershipId: memberId }).toString();

  const [assignmentsRes, onboardingRes, certificatesRes] = await Promise.all([
    apiGetJson<AssignmentsPayload>(session, `/api/assignments/me?${q}`),
    apiGetJson<OnboardingPayload>(session, `/api/onboarding/progress/me?${q}`),
    apiGetJson<CertificatesPayload>(session, `/api/me/certificates?${q}`),
  ]);

  const nowMs = new Date().getTime();

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6">
        {query.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{query.error}</p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Learning</h1>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={dashboardOrgUrl("notifications", orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
              Notifications
            </Link>
            {canTeamForOrg ? (
              <>
                <Link href={dashboardOrgUrl("team", orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
                  Team
                </Link>
                <Link
                  href={dashboardTeamReviewQueuePath(orgId)}
                  className="font-medium text-zinc-600 hover:text-zinc-900"
                >
                  Review queue
                </Link>
                <Link href={dashboardTeamInsightsPath(orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
                  Insights
                </Link>
                <Link href={dashboardOrgUrl("audit", orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
                  Activity log
                </Link>
              </>
            ) : null}
            <Link href="/dashboard" className="font-medium text-zinc-600 hover:text-zinc-900">
              Dashboard
            </Link>
          </div>
        </div>
        <p className="text-sm text-zinc-600">
          {learnerMembership.organizations?.name ?? "Organization"} — course assignments and onboarding checklist
          (from the Express API).
        </p>
        {learnerMemberships.length > 1 ? (
          <nav className="flex flex-wrap gap-2 text-xs">
            {learnerMemberships.map((m) => (
              <Link
                key={m.id}
                href={learningDashboardUrl(m.organization_id)}
                className={`rounded-full px-3 py-1 ${
                  m.organization_id === orgId ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
                }`}
              >
                {m.organizations?.name ?? "Org"}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Course assignments</h2>
        {!assignmentsRes.ok ? (
          <p className="text-sm text-red-700">Failed to load assignments ({assignmentsRes.status}).</p>
        ) : assignmentsRes.data.items.length === 0 ? (
          <p className="text-sm text-zinc-600">No enrollments yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm">
            {assignmentsRes.data.items.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 py-3">
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-zinc-900">{row.title ?? "Course"}</span>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                    {row.status}
                  </span>
                </div>
                {row.contentItems && row.contentItems.length > 0 ? (
                  <ul className="ml-1 space-y-1.5 border-l border-zinc-200 pl-3 text-sm">
                    {row.contentItems.map((item) => (
                      <li key={item.id} className="text-zinc-800">
                        <span className="text-xs uppercase text-zinc-500">{item.type}</span>{" "}
                        {item.resourceUrl ? (
                          <a
                            href={item.resourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-zinc-900 underline decoration-zinc-400 hover:decoration-zinc-900"
                          >
                            {item.title}
                          </a>
                        ) : (
                          <span className="font-medium">{item.title}</span>
                        )}
                        {item.isRequired ? (
                          <span className="ml-1 text-xs text-zinc-500">(required)</span>
                        ) : (
                          <span className="ml-1 text-xs text-zinc-500">(optional)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {row.quizzes && row.quizzes.length > 0 ? (
                  <ul className="ml-1 space-y-2 border-l border-zinc-200 pl-3">
                    {row.quizzes.map((qz) => (
                      <li key={qz.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-zinc-700">{qz.title}</span>
                        <form action={startQuizAttemptAction}>
                          <input type="hidden" name="organizationId" value={orgId} />
                          <input type="hidden" name="membershipId" value={memberId} />
                          <input type="hidden" name="quizId" value={qz.id} />
                          <button
                            type="submit"
                            className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800"
                          >
                            Start quiz
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {row.courseId && row.status !== "completed" ? (
                  <form action={completeEnrollmentAction} className="pt-1">
                    <input type="hidden" name="organizationId" value={orgId} />
                    <input type="hidden" name="membershipId" value={memberId} />
                    <input type="hidden" name="enrollmentId" value={row.id} />
                    <button
                      type="submit"
                      className="text-xs font-medium text-zinc-600 underline decoration-zinc-400 hover:text-zinc-900"
                    >
                      Mark course complete
                    </button>
                  </form>
                ) : row.status === "completed" ? (
                  <p className="pt-1 text-xs font-medium text-emerald-700">Course completed</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Onboarding checklist</h2>
          {onboardingRes.ok ? (
            <p className="text-xs text-zinc-500">
              {onboardingRes.data.summary.completed}/{onboardingRes.data.summary.total} complete (
              {onboardingRes.data.summary.completionRate}%)
            </p>
          ) : null}
        </div>
        {!onboardingRes.ok ? (
          <p className="text-sm text-red-700">Failed to load onboarding ({onboardingRes.status}).</p>
        ) : onboardingRes.data.items.length === 0 ? (
          <p className="text-sm text-zinc-600">No onboarding checklist rows.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {onboardingRes.data.items.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 rounded-md border border-zinc-100 bg-zinc-50/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-zinc-900">{row.title}</p>
                  <p className="text-xs text-zinc-500">
                    {row.itemType.replace(/_/g, " ")} · {row.status}
                    {row.reviewStatus !== "not_required" ? ` · review: ${row.reviewStatus}` : null}
                  </p>
                  {row.itemType === "submit_document" && row.reviewStatus === "pending_review" ? (
                    <div className="mt-1 space-y-2">
                      <p className="text-xs font-medium text-amber-800">Awaiting trainer review</p>
                      {row.hasEvidence ? (
                        <form action={downloadMyChecklistEvidenceAction}>
                          <input type="hidden" name="organizationId" value={orgId} />
                          <input type="hidden" name="membershipId" value={memberId} />
                          <input type="hidden" name="checklistProgressId" value={row.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                          >
                            Download my file
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                  {row.itemType === "submit_document" && row.reviewStatus === "rejected" ? (
                    <p className="mt-1 text-xs text-zinc-600">
                      Trainer requested changes — you can submit again.
                      {row.reviewNote ? (
                        <span className="mt-1 block rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-zinc-800">
                          {row.reviewNote}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                {checklistRowNeedsAction(row) ? (
                  row.itemType === "submit_document" ? (
                    <form
                      action={submitDocumentForReviewAction}
                      className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end"
                    >
                      <input type="hidden" name="organizationId" value={orgId} />
                      <input type="hidden" name="membershipId" value={memberId} />
                      <input type="hidden" name="checklistProgressId" value={row.id} />
                      <label className="text-xs text-zinc-600">
                        PDF or image, max 10 MB
                        <input
                          name="file"
                          type="file"
                          required
                          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                          className="mt-1 block w-full max-w-xs text-xs text-zinc-800 file:mr-2 file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1 file:text-xs"
                        />
                      </label>
                      <button
                        type="submit"
                        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                      >
                        Submit for review
                      </button>
                    </form>
                  ) : (
                    <form action={completeChecklistItemAction} className="shrink-0">
                      <input type="hidden" name="organizationId" value={orgId} />
                      <input type="hidden" name="membershipId" value={memberId} />
                      <input type="hidden" name="checklistProgressId" value={row.id} />
                      <button
                        type="submit"
                        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                      >
                        Mark complete
                      </button>
                    </form>
                  )
                ) : row.status === "completed" || row.status === "waived" ? (
                  <span className="text-xs font-medium text-emerald-700">Done</span>
                ) : (
                  <span className="text-xs font-medium text-zinc-500">—</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Certificates</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Earned when you <strong>pass</strong> a published quiz. Download a PDF or share the credential code to prove
          completion.
        </p>
        {!certificatesRes.ok ? (
          <p className="text-sm text-red-700">Could not load certificates ({certificatesRes.status}).</p>
        ) : certificatesRes.data.items.length === 0 ? (
          <p className="text-sm text-zinc-600">No certificates yet — pass a quiz to earn one.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm">
            {certificatesRes.data.items.map((c) => {
              const expired = c.expiresAt != null && new Date(c.expiresAt).getTime() < nowMs;
              const revoked = c.revokedAt != null;
              const canPdf = !revoked && !expired;
              return (
              <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-zinc-900">{c.title}</p>
                  <p className="text-xs text-zinc-500">
                    Issued {new Date(c.issuedAt).toLocaleDateString()}
                    {c.expiresAt ? ` · Expires ${new Date(c.expiresAt).toLocaleDateString()}` : ""}
                    {revoked ? " · Revoked" : null}
                    {expired && !revoked ? " · Expired" : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                  {canPdf ? (
                    <a
                      href={`/api/me/certificate-pdf?organizationId=${encodeURIComponent(orgId)}&membershipId=${encodeURIComponent(memberId)}&credentialCode=${encodeURIComponent(c.credentialCode)}`}
                      className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-center text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                    >
                      Download PDF
                    </a>
                  ) : (
                    <span className="text-center text-xs text-zinc-500">PDF unavailable</span>
                  )}
                  <code className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-900">
                    {c.credentialCode}
                  </code>
                </div>
              </li>
            );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
