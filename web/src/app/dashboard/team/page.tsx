import type { Metadata } from "next";
import { apiGetJson, getApiSession } from "@/lib/api-server";
import {
  dashboardOrgUrl,
  dashboardTeamInsightsPath,
  dashboardTeamPath,
  dashboardTeamReviewQueuePath,
} from "@/lib/dashboard-org-urls";
import { learningDashboardUrl } from "@/lib/learning-dashboard-url";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  addCourseContentItemAction,
  addLearningPathStepAction,
  addQuizMcqQuestionAction,
  assignCourseEnrollmentAction,
  assignLearningPathCoursesAction,
  assignOnboardingAction,
  createCourseAction,
  createLearningPathDraftAction,
  createQuizDraftAction,
  inviteMemberAction,
  publishCourseAction,
  publishLearningPathAction,
  publishQuizAction,
  revokeCertificateAction,
  setCertificateExpiryAction,
  syncOnboardingStatusesAction,
} from "./actions";
import { DocumentReviewQueueSection, type DocumentReviewItem } from "./document-review-queue-section";

export const metadata: Metadata = {
  title: "Team",
};

type Props = {
  searchParams: Promise<{ organizationId?: string; error?: string; courseId?: string; learningPathId?: string }>;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  role: string;
  organizations: { slug: string; name: string } | null;
};

type TeamOnboardingItem = {
  onboardingInstanceId: string;
  membershipId: string;
  learnerUserId: string | null;
  templateId: string;
  status: string;
  effectiveStatus: string;
  isOverdue: boolean;
  targetEndAt: string | null;
  startedAt: string | null;
  createdAt: string;
  completedAt: string | null;
  checklist: { total: number; completed: number };
};

type OrgMember = { id: string; role: string; email: string | null };
type OrgCourseRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  updatedAt: string;
};

type OrgQuizRow = {
  id: string;
  title: string;
  status: string;
  passMarkPercent: number;
  questionCount: number;
};

type OrgContentRow = {
  id: string;
  type: string;
  title: string;
  resourceUrl: string | null;
  isRequired: boolean;
  orderIndex: number;
};

type OrgLearningPathRow = { id: string; name: string; status: string; stepCount: number };

type OrgPathStepRow = {
  id: string;
  stepOrder: number;
  stepType: string;
  courseId: string | null;
  courseTitle: string | null;
  required: boolean;
  dueOffsetDays: number | null;
};

type OrgCertRow = {
  id: string;
  title: string;
  credentialCode: string;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  membershipId: string;
  learnerEmail: string | null;
  quizId: string;
};

type TemplateRow = { id: string; name: string; status: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function TeamPage({ searchParams }: Props) {
  const query = await searchParams;
  const session = await getApiSession();
  if (!session) redirect("/login");

  const membershipsRes = await apiGetJson<{ memberships: MembershipRow[] }>(session, "/api/me/memberships");
  if (!membershipsRes.ok) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-red-700">
        Could not load memberships (HTTP {membershipsRes.status}).
      </div>
    );
  }

  const staff = membershipsRes.data.memberships.filter((m) => m.role === "org_admin" || m.role === "trainer");
  if (staff.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-12 text-sm text-zinc-700">
        <p>This area is for <strong>org admins</strong> and <strong>trainers</strong>. Sign in as </p>
        <p>
          <code className="rounded bg-zinc-100 px-1">trainer@acme.test</code> or{" "}
          <code className="rounded bg-zinc-100 px-1">admin@acme.test</code>.
        </p>
        <Link href="/dashboard" className="font-medium text-zinc-900 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  let orgId = query.organizationId;
  if (!orgId || !UUID_RE.test(orgId) || !staff.some((s) => s.organization_id === orgId)) {
    orgId = staff[0].organization_id;
  }

  const current = staff.find((s) => s.organization_id === orgId)!;
  const isOrgAdmin = current.role === "org_admin";

  const q = new URLSearchParams({ organizationId: orgId });
  const [teamRes, membersRes, templatesRes, reviewsRes, coursesRes, pathsRes, certsRes] = await Promise.all([
    apiGetJson<{ items: TeamOnboardingItem[] }>(session, `/api/onboarding/progress/team?${q}&limit=50`),
    apiGetJson<{ items: OrgMember[] }>(session, `/api/org/memberships?${q}`),
    apiGetJson<{ items: TemplateRow[] }>(session, `/api/org/onboarding-templates?${q}`),
    apiGetJson<{ items: DocumentReviewItem[] }>(session, `/api/onboarding/progress/document-reviews?${q}&limit=50`),
    apiGetJson<{ items: OrgCourseRow[] }>(session, `/api/org/courses?${q}`),
    apiGetJson<{ items: OrgLearningPathRow[] }>(session, `/api/org/learning-paths?${q}`),
    apiGetJson<{ items: OrgCertRow[] }>(session, `/api/org/certificates?${q}&limit=40`),
  ]);

  const learners = membersRes.ok ? membersRes.data.items.filter((m) => m.role === "learner") : [];
  const templates = templatesRes.ok ? templatesRes.data.items : [];
  const courses = coursesRes.ok ? coursesRes.data.items : [];
  const publishedCourses = courses.filter((c) => c.status === "published");
  const paths = pathsRes.ok ? pathsRes.data.items : [];

  const learningPathIdFromQuery = query.learningPathId?.trim();
  const selectedLearningPathId =
    learningPathIdFromQuery &&
    UUID_RE.test(learningPathIdFromQuery) &&
    paths.some((p) => p.id === learningPathIdFromQuery)
      ? learningPathIdFromQuery
      : undefined;
  const selectedPathMeta = selectedLearningPathId ? paths.find((p) => p.id === selectedLearningPathId) : undefined;

  const pathStepsRes =
    selectedLearningPathId && pathsRes.ok
      ? await apiGetJson<{ items: OrgPathStepRow[] }>(
          session,
          `/api/org/learning-path-steps?${new URLSearchParams({ organizationId: orgId, learningPathId: selectedLearningPathId }).toString()}`,
        )
      : null;

  const pathSteps = pathStepsRes?.ok ? pathStepsRes.data.items : [];

  const courseIdFromQuery = query.courseId?.trim();
  const selectedCourseId =
    courseIdFromQuery && UUID_RE.test(courseIdFromQuery) && courses.some((c) => c.id === courseIdFromQuery)
      ? courseIdFromQuery
      : undefined;
  const selectedCourse = selectedCourseId ? courses.find((c) => c.id === selectedCourseId) : undefined;

  const [quizzesRes, courseContentRes] =
    selectedCourseId && coursesRes.ok
      ? await Promise.all([
          apiGetJson<{ items: OrgQuizRow[] }>(
            session,
            `/api/org/quizzes?${new URLSearchParams({ organizationId: orgId, courseId: selectedCourseId }).toString()}`,
          ),
          apiGetJson<{ items: OrgContentRow[] }>(
            session,
            `/api/org/course-content?${new URLSearchParams({ organizationId: orgId, courseId: selectedCourseId }).toString()}`,
          ),
        ])
      : [null, null];

  const draftQuizzes = quizzesRes?.ok ? quizzesRes.data.items.filter((q) => q.status === "draft") : [];
  const courseContentItems = courseContentRes?.ok ? courseContentRes.data.items : [];

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-6">
        {query.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{query.error}</p>
        ) : null}
        {query.learningPathId && !selectedLearningPathId ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Unknown learning path — pick one from the list below.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Team & onboarding</h1>
          <div className="flex flex-wrap gap-3 text-sm">
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
            <Link href={dashboardOrgUrl("notifications", orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
              Notifications
            </Link>
            <Link href={learningDashboardUrl(orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
              Learning
            </Link>
            <Link href="/dashboard" className="font-medium text-zinc-600 hover:text-zinc-900">
              Dashboard
            </Link>
          </div>
        </div>
        <p className="text-sm text-zinc-600">
          Organization: <span className="font-medium text-zinc-900">{current.organizations?.name ?? orgId}</span>
          {current.organizations?.slug ? (
            <>
              {" "}
              (<code className="text-xs text-zinc-500">{current.organizations.slug}</code>)
            </>
          ) : null}
        </p>
        {staff.length > 1 ? (
          <nav className="flex flex-wrap gap-2 text-sm">
            {staff.map((s) => (
              <Link
                key={s.organization_id}
                href={dashboardOrgUrl("team", s.organization_id)}
                className={`rounded-full px-3 py-1 ${
                  s.organization_id === orgId ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
                }`}
              >
                {s.organizations?.name ?? "Org"}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Quiz certificates</h2>
          {certsRes.ok && certsRes.data.items.length > 0 ? (
            <a
              href={`/api/org/certificates-export?organizationId=${encodeURIComponent(orgId)}`}
              className="text-xs font-medium text-zinc-700 underline hover:text-zinc-900"
            >
              Download CSV
            </a>
          ) : null}
        </div>
        <p className="mb-4 text-xs text-zinc-500">
          Rows appear when a learner <strong>passes</strong> a published quiz. Revoke voids the credential for public
          verification and learner PDFs.{" "}
          <Link href="/verify" className="font-medium text-zinc-800 underline">
            Public verify
          </Link>
        </p>
        {!certsRes.ok ? (
          <p className="text-sm text-red-700">Could not load certificates (HTTP {certsRes.status}).</p>
        ) : certsRes.data.items.length === 0 ? (
          <p className="text-sm text-zinc-600">No certificates issued in this organization yet.</p>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 uppercase text-zinc-500">
                  <th className="py-2 pr-2">Learner</th>
                  <th className="py-2 pr-2">Title</th>
                  <th className="py-2 pr-2">Code</th>
                  <th className="py-2 pr-2">Issued</th>
                  <th className="py-2 pr-2">Expiry</th>
                  <th className="py-2">Admin</th>
                </tr>
              </thead>
              <tbody>
                {certsRes.data.items.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-100 align-top">
                    <td className="py-2 pr-2 text-zinc-800">{c.learnerEmail ?? c.membershipId.slice(0, 8)}</td>
                    <td className="py-2 pr-2 text-zinc-800">{c.title}</td>
                    <td className="py-2 pr-2 font-mono text-zinc-700">{c.credentialCode}</td>
                    <td className="py-2 pr-2 text-zinc-600">{new Date(c.issuedAt).toLocaleDateString()}</td>
                    <td className="py-2 pr-2 text-zinc-600">
                      {c.expiresAt ? new Date(c.expiresAt).toLocaleString() : "—"}
                      {c.revokedAt ? (
                        <span className="mt-1 block text-amber-800">Revoked {new Date(c.revokedAt).toLocaleString()}</span>
                      ) : null}
                    </td>
                    <td className="py-2">
                      {!c.revokedAt ? (
                        <div className="flex min-w-[200px] flex-col gap-2">
                          <form action={revokeCertificateAction} className="inline">
                            <input type="hidden" name="organizationId" value={orgId} />
                            <input type="hidden" name="certificateId" value={c.id} />
                            <button
                              type="submit"
                              className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-900 hover:bg-red-100"
                            >
                              Revoke
                            </button>
                          </form>
                          <form action={setCertificateExpiryAction} className="flex flex-col gap-1">
                            <input type="hidden" name="organizationId" value={orgId} />
                            <input type="hidden" name="certificateId" value={c.id} />
                            <label className="text-[10px] text-zinc-500">
                              Set / change expiry (local)
                              <input
                                name="expiresAtLocal"
                                type="datetime-local"
                                required
                                className="mt-0.5 w-full rounded border border-zinc-300 px-1 py-1 text-xs text-zinc-900"
                              />
                            </label>
                            <button
                              type="submit"
                              className="rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-100"
                            >
                              Save expiry
                            </button>
                          </form>
                          <form action={setCertificateExpiryAction}>
                            <input type="hidden" name="organizationId" value={orgId} />
                            <input type="hidden" name="certificateId" value={c.id} />
                            <input type="hidden" name="clearExpiry" value="1" />
                            <button
                              type="submit"
                              className="text-left text-[10px] font-medium text-zinc-600 underline"
                            >
                              Clear expiry
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Team onboarding</h2>
          <form action={syncOnboardingStatusesAction}>
            <input type="hidden" name="organizationId" value={orgId} />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Sync statuses
            </button>
          </form>
        </div>
        {!teamRes.ok ? (
          <p className="text-sm text-red-700">Could not load team progress (HTTP {teamRes.status}).</p>
        ) : teamRes.data.items.length === 0 ? (
          <p className="text-sm text-zinc-600">No onboarding instances yet. Assign a template below.</p>
        ) : (
          <div className="overflow-x-auto text-sm">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Checklist</th>
                  <th className="py-2 pr-3">Target</th>
                  <th className="py-2">Instance</th>
                </tr>
              </thead>
              <tbody>
                {teamRes.data.items.map((row) => (
                  <tr key={row.onboardingInstanceId} className="border-b border-zinc-100">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-zinc-900">{row.effectiveStatus}</span>
                      {row.isOverdue ? <span className="ml-1 text-xs text-amber-700">overdue</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-zinc-700">
                      {row.checklist.completed}/{row.checklist.total}
                    </td>
                    <td className="py-2 pr-3 text-xs text-zinc-600">
                      {row.targetEndAt ? new Date(row.targetEndAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 font-mono text-xs text-zinc-500">{row.onboardingInstanceId.slice(0, 8)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DocumentReviewQueueSection
        organizationId={orgId}
        loadOk={reviewsRes.ok}
        loadStatus={reviewsRes.ok ? undefined : reviewsRes.status}
        items={reviewsRes.ok ? reviewsRes.data.items : []}
        footer={
          <p className="text-xs text-zinc-500">
            <Link href={dashboardTeamReviewQueuePath(orgId)} className="font-medium text-zinc-900 underline">
              Open focused review queue
            </Link>{" "}
            in a separate view.
          </p>
        }
      />

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Courses</h2>
        {!coursesRes.ok ? (
          <p className="text-sm text-red-700">Could not load courses (HTTP {coursesRes.status}).</p>
        ) : courses.length === 0 ? (
          <p className="mb-6 text-sm text-zinc-600">No courses yet. Create a draft below.</p>
        ) : (
          <div className="mb-6 overflow-x-auto text-sm">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-3 font-medium text-zinc-900">{c.title}</td>
                    <td className="py-2 pr-3 text-zinc-600">{c.category}</td>
                    <td className="py-2 pr-3 text-zinc-700">{c.status}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {c.status === "draft" ? (
                          <form action={publishCourseAction} className="inline">
                            <input type="hidden" name="organizationId" value={orgId} />
                            <input type="hidden" name="courseId" value={c.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                            >
                              Publish
                            </button>
                          </form>
                        ) : null}
                        <Link
                          href={dashboardTeamPath(orgId, { courseId: c.id })}
                          className="text-xs font-medium text-zinc-700 underline hover:text-zinc-900"
                        >
                          Quizzes
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Create draft</h3>
        <form action={createCourseAction} className="space-y-3">
          <input type="hidden" name="organizationId" value={orgId} />
          <label className="block text-xs text-zinc-600">
            Title
            <input
              name="title"
              required
              minLength={3}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
              placeholder="Course title"
            />
          </label>
          <label className="block text-xs text-zinc-600">
            Description (optional)
            <textarea
              name="description"
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
            />
          </label>
          <label className="block text-xs text-zinc-600">
            Category
            <select name="category" className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 sm:w-60">
              <option value="onboarding">Onboarding</option>
              <option value="compliance">Compliance</option>
              <option value="skill">Skill</option>
              <option value="leadership">Leadership</option>
            </select>
          </label>
          <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            Create draft
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Assign course to learner</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Publishes an enrollment so the course appears on <strong>Learning</strong>. Learners need at least one
          published quiz on the course to use <strong>Start quiz</strong> (seed demo includes one).
        </p>
        {!membersRes.ok ? (
          <p className="text-sm text-red-700">Could not load members (HTTP {membersRes.status}).</p>
        ) : publishedCourses.length === 0 ? (
          <p className="text-sm text-zinc-600">Publish a course first, then assign it here.</p>
        ) : learners.length === 0 ? (
          <p className="text-sm text-zinc-600">No learner memberships to assign.</p>
        ) : (
          <form action={assignCourseEnrollmentAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <input type="hidden" name="organizationId" value={orgId} />
            <label className="block min-w-[220px] flex-1 text-xs text-zinc-600">
              Learner
              <select name="membershipId" required className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900">
                {learners.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.email ?? m.id.slice(0, 8)} ({m.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-[220px] flex-1 text-xs text-zinc-600">
              Published course
              <select name="courseId" required className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900">
                {publishedCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
              Assign course
            </button>
          </form>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Learning paths</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Ordered <strong>published courses</strong> as steps. Publishing a path requires every step course to already be
          published. Assigning a path enrolls the learner in each distinct course (skips courses they already have
          active) so work appears on <strong>Learning</strong>.
        </p>
        {!pathsRes.ok ? (
          <p className="text-sm text-red-700">Could not load learning paths (HTTP {pathsRes.status}).</p>
        ) : (
          <div className="mb-6 overflow-x-auto text-sm">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Steps</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Edit</th>
                </tr>
              </thead>
              <tbody>
                {paths.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-zinc-600">
                      No paths yet. Create a draft below.
                    </td>
                  </tr>
                ) : (
                  paths.map((p) => (
                    <tr key={p.id} className="border-b border-zinc-100">
                      <td className="py-2 pr-3 font-medium text-zinc-900">{p.name}</td>
                      <td className="py-2 pr-3 text-zinc-600">{p.stepCount}</td>
                      <td className="py-2 pr-3 text-zinc-700">{p.status}</td>
                      <td className="py-2">
                        <Link
                          href={dashboardTeamPath(orgId, { learningPathId: p.id })}
                          className="text-xs font-medium text-zinc-700 underline hover:text-zinc-900"
                        >
                          Steps
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">New draft path</h3>
        <form action={createLearningPathDraftAction} className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <input type="hidden" name="organizationId" value={orgId} />
          <label className="block min-w-[200px] flex-1 text-xs text-zinc-600">
            Name
            <input
              name="name"
              required
              minLength={2}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
              placeholder="e.g. Sales onboarding track"
            />
          </label>
          <label className="block min-w-[200px] flex-1 text-xs text-zinc-600">
            Description (optional)
            <input name="description" className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900" />
          </label>
          <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            Create path draft
          </button>
        </form>

        {selectedLearningPathId && selectedPathMeta ? (
          <div className="space-y-4 border-t border-zinc-200 pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-zinc-800">
                Editing: <span className="font-semibold text-zinc-900">{selectedPathMeta.name}</span>{" "}
                <span className="text-xs text-zinc-500">({selectedPathMeta.status})</span>
              </p>
              <Link href={dashboardTeamPath(orgId)} className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900">
                ← All paths
              </Link>
            </div>
            {!pathStepsRes?.ok ? (
              <p className="text-sm text-red-700">Could not load steps (HTTP {pathStepsRes?.status ?? "—"}).</p>
            ) : (
              <>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-800">
                  {pathSteps.length === 0 ? (
                    <li className="text-zinc-600">No steps yet — add a published course below.</li>
                  ) : (
                    pathSteps.map((s) => (
                      <li key={s.id}>
                        <span className="font-medium">{s.courseTitle ?? "Course"}</span>{" "}
                        <span className="text-xs text-zinc-500">
                          (order {s.stepOrder}
                          {s.required ? ", required" : ""}
                          {s.dueOffsetDays != null ? `, due +${s.dueOffsetDays}d` : ""})
                        </span>
                      </li>
                    ))
                  )}
                </ol>
                {selectedPathMeta.status === "draft" && publishedCourses.length > 0 ? (
                  <form action={addLearningPathStepAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <input type="hidden" name="organizationId" value={orgId} />
                    <input type="hidden" name="learningPathId" value={selectedLearningPathId} />
                    <label className="block min-w-[220px] flex-1 text-xs text-zinc-600">
                      Published course
                      <select name="courseId" required className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900">
                        {publishedCourses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-zinc-600">
                      Step required
                      <select name="required" className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 sm:w-36">
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </label>
                    <label className="block w-28 text-xs text-zinc-600">
                      Due +days
                      <input
                        name="dueOffsetDays"
                        type="number"
                        min={0}
                        placeholder="—"
                        className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                    >
                      Add course step
                    </button>
                  </form>
                ) : selectedPathMeta.status === "draft" && publishedCourses.length === 0 ? (
                  <p className="text-xs text-amber-800">Publish at least one course before adding path steps.</p>
                ) : null}
                {selectedPathMeta.status === "draft" && pathSteps.length > 0 ? (
                  <form action={publishLearningPathAction} className="inline">
                    <input type="hidden" name="organizationId" value={orgId} />
                    <input type="hidden" name="learningPathId" value={selectedLearningPathId} />
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                    >
                      Publish path
                    </button>
                  </form>
                ) : null}
                {selectedPathMeta.status === "published" && learners.length > 0 ? (
                  <form action={assignLearningPathCoursesAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <input type="hidden" name="organizationId" value={orgId} />
                    <input type="hidden" name="learningPathId" value={selectedLearningPathId} />
                    <label className="block min-w-[220px] flex-1 text-xs text-zinc-600">
                      Learner
                      <select name="membershipId" required className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900">
                        {learners.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.email ?? m.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                      Assign path (courses)
                    </button>
                  </form>
                ) : selectedPathMeta.status === "published" && learners.length === 0 ? (
                  <p className="text-xs text-zinc-500">Add a learner to assign this path.</p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Quiz builder (MCQ)</h2>
        {query.courseId && !selectedCourseId ? (
          <p className="mb-3 text-sm text-amber-800">That course was not found in this organization.</p>
        ) : null}
        {!selectedCourseId ? (
          <p className="text-sm text-zinc-600">
            Use <strong>Quizzes</strong> next to a course in the table above. Create a draft quiz, add at least one
            question, then publish so learners can <strong>Start quiz</strong> on the Learning page.
          </p>
        ) : !quizzesRes?.ok || !courseContentRes?.ok ? (
          <p className="text-sm text-red-700">
            Could not load course editor (quizzes{" "}
            {quizzesRes == null ? "—" : quizzesRes.ok ? "ok" : quizzesRes.status}, content{" "}
            {courseContentRes == null ? "—" : courseContentRes.ok ? "ok" : courseContentRes.status}).
          </p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 pb-3">
              <p className="text-sm text-zinc-700">
                Course: <span className="font-semibold text-zinc-900">{selectedCourse?.title ?? selectedCourseId}</span>
              </p>
              <Link href={dashboardTeamPath(orgId)} className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900">
                ← Leave quiz builder
              </Link>
            </div>
            <div className="overflow-x-auto text-sm">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                    <th className="py-2 pr-3">Quiz</th>
                    <th className="py-2 pr-3">Pass %</th>
                    <th className="py-2 pr-3">Questions</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">Publish</th>
                  </tr>
                </thead>
                <tbody>
                  {quizzesRes.data.items.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-100">
                      <td className="py-2 pr-3 font-medium text-zinc-900">{row.title}</td>
                      <td className="py-2 pr-3 text-zinc-600">{row.passMarkPercent}</td>
                      <td className="py-2 pr-3 text-zinc-600">{row.questionCount}</td>
                      <td className="py-2 pr-3 text-zinc-700">{row.status}</td>
                      <td className="py-2">
                        {row.status === "draft" && row.questionCount > 0 ? (
                          <form action={publishQuizAction} className="inline">
                            <input type="hidden" name="organizationId" value={orgId} />
                            <input type="hidden" name="courseId" value={selectedCourseId} />
                            <input type="hidden" name="quizId" value={row.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                            >
                              Publish quiz
                            </button>
                          </form>
                        ) : row.status === "draft" ? (
                          <span className="text-xs text-zinc-400">Add a question</span>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">New draft quiz</h3>
              <form action={createQuizDraftAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <input type="hidden" name="organizationId" value={orgId} />
                <input type="hidden" name="courseId" value={selectedCourseId} />
                <label className="block min-w-[200px] flex-1 text-xs text-zinc-600">
                  Title
                  <input
                    name="title"
                    required
                    minLength={2}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
                    placeholder="Quiz title"
                  />
                </label>
                <label className="block w-24 text-xs text-zinc-600">
                  Pass %
                  <input
                    name="passMarkPercent"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={70}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
                  />
                </label>
                <label className="block min-w-[220px] flex-1 text-xs text-zinc-600">
                  Description (optional)
                  <input
                    name="description"
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
                    placeholder="Shown to trainers only for now"
                  />
                </label>
                <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                  Create draft
                </button>
              </form>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Add MCQ to draft</h3>
              {draftQuizzes.length === 0 ? (
                <p className="text-sm text-zinc-600">Create a draft quiz first.</p>
              ) : (
                <form action={addQuizMcqQuestionAction} className="space-y-3">
                  <input type="hidden" name="organizationId" value={orgId} />
                  <input type="hidden" name="courseId" value={selectedCourseId} />
                  <label className="block text-xs text-zinc-600">
                    Draft quiz
                    <select name="quizId" required className="mt-1 w-full max-w-md rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900">
                      {draftQuizzes.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.title} ({q.questionCount} questions)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-zinc-600">
                    Question
                    <textarea
                      name="prompt"
                      required
                      rows={2}
                      className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
                      placeholder="Question text"
                    />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["A", "B", "C", "D"] as const).map((label, i) => (
                      <label key={label} className="block text-xs text-zinc-600">
                        Choice {label}
                        <input
                          name={`option${i}`}
                          {...(i < 2 ? { required: true } : {})}
                          className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
                          placeholder={i < 2 ? "Required" : "Optional"}
                        />
                      </label>
                    ))}
                  </div>
                  <fieldset className="text-xs text-zinc-600">
                    <legend className="mb-1 font-medium text-zinc-700">Correct answer</legend>
                    <div className="flex flex-wrap gap-3">
                      {([0, 1, 2, 3] as const).map((i) => (
                        <label key={i} className="inline-flex items-center gap-1">
                          <input type="radio" name="correctIndex" value={i} defaultChecked={i === 0} />
                          {String.fromCharCode(65 + i)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                    Add question
                  </button>
                </form>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Course materials</h3>
              <p className="mb-3 text-xs text-zinc-500">
                Ordered links (video URL, PDF, or file URL). Learners see these on <strong>Learning</strong> under each
                course.
              </p>
              {courseContentItems.length === 0 ? (
                <p className="mb-4 text-sm text-zinc-600">No materials yet.</p>
              ) : (
                <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-zinc-800">
                  {courseContentItems.map((row) => (
                    <li key={row.id}>
                      <span className="font-medium">{row.title}</span>{" "}
                      <span className="text-xs text-zinc-500">
                        ({row.type}
                        {row.isRequired ? ", required" : ", optional"})
                      </span>
                      {row.resourceUrl ? (
                        <>
                          {" "}
                          <a
                            href={row.resourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-zinc-700 underline"
                          >
                            Open link
                          </a>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
              <form action={addCourseContentItemAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <input type="hidden" name="organizationId" value={orgId} />
                <input type="hidden" name="courseId" value={selectedCourseId} />
                <label className="block text-xs text-zinc-600">
                  Type
                  <select name="type" className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 sm:w-36">
                    <option value="video">Video</option>
                    <option value="pdf">PDF</option>
                    <option value="slide">Slide</option>
                    <option value="attachment">Attachment</option>
                  </select>
                </label>
                <label className="block min-w-[160px] flex-1 text-xs text-zinc-600">
                  Title
                  <input
                    name="title"
                    required
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
                    placeholder="e.g. Watch: safety overview"
                  />
                </label>
                <label className="block min-w-[220px] flex-[2] text-xs text-zinc-600">
                  Resource URL
                  <input
                    name="resourceUrl"
                    required
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
                    placeholder="https://…"
                  />
                </label>
                <label className="block text-xs text-zinc-600">
                  Requirement
                  <select name="isRequired" className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 sm:w-36">
                    <option value="true">Required</option>
                    <option value="false">Optional</option>
                  </select>
                </label>
                <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                  Add material
                </button>
              </form>
            </div>
          </div>
        )}
      </section>

      {isOrgAdmin ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Invite member</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Sends a Supabase invite email. View it in the local mail UI from{" "}
            <code className="rounded bg-zinc-100 px-1">supabase status</code> (often{" "}
            <code className="rounded bg-zinc-100 px-1">http://127.0.0.1:54324</code>). If the API is
            configured with <code className="rounded bg-zinc-100 px-1">SMTP_HOST</code> to Inbucket (
            <code className="rounded bg-zinc-100 px-1">127.0.0.1:54325</code>), onboarding alert emails
            show up there too.
          </p>
          <form action={inviteMemberAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <input type="hidden" name="organizationId" value={orgId} />
            <label className="block min-w-[200px] flex-1 text-xs text-zinc-600">
              Email
              <input
                name="email"
                type="email"
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
                placeholder="name@company.com"
              />
            </label>
            <label className="block text-xs text-zinc-600">
              Role
              <select name="role" className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 sm:w-40">
                <option value="learner">Learner</option>
                <option value="trainer">Trainer</option>
                <option value="org_admin">Org admin</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Send invite
            </button>
          </form>
        </section>
      ) : (
        <p className="text-xs text-zinc-500">Invites are limited to org admins. You are signed in as a trainer.</p>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Assign onboarding</h2>
        {!membersRes.ok ? (
          <p className="text-sm text-red-700">Could not load members (HTTP {membersRes.status}).</p>
        ) : !templatesRes.ok ? (
          <p className="text-sm text-red-700">Could not load templates (HTTP {templatesRes.status}).</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-zinc-600">No published onboarding templates in this organization.</p>
        ) : learners.length === 0 ? (
          <p className="text-sm text-zinc-600">No learner memberships to assign.</p>
        ) : (
          <form action={assignOnboardingAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <input type="hidden" name="organizationId" value={orgId} />
            <label className="block min-w-[220px] flex-1 text-xs text-zinc-600">
              Learner
              <select name="membershipId" required className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900">
                {learners.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.email ?? m.id.slice(0, 8)} ({m.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-[220px] flex-1 text-xs text-zinc-600">
              Template
              <select
                name="onboardingTemplateId"
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
              Assign
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
