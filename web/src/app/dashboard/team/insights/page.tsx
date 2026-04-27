import type { Metadata } from "next";
import { apiGetJson, getApiSession } from "@/lib/api-server";
import { dashboardOrgUrl, dashboardTeamPath, dashboardTeamInsightsPath, dashboardTeamReviewQueuePath } from "@/lib/dashboard-org-urls";
import { learningDashboardUrl } from "@/lib/learning-dashboard-url";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Insights",
};

type Props = {
  searchParams: Promise<{ organizationId?: string; error?: string }>;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  role: string;
  organizations: { slug: string; name: string } | null;
};

type OverviewPayload = {
  learners: { total: number };
  onboardingInstances: {
    assigned: number;
    in_progress: number;
    completed: number;
    overdue: number;
    cancelled: number;
  };
  onboardingPastDueIncomplete: number;
  enrollments: {
    assigned: number;
    in_progress: number;
    completed: number;
    overdue: number;
    expired: number;
  };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function TeamInsightsPage({ searchParams }: Props) {
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
        <p>This view is for org admins and trainers.</p>
        <Link href="/dashboard" className="font-medium text-zinc-900 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  let orgId = query.organizationId?.trim();
  if (!orgId || !UUID_RE.test(orgId) || !staff.some((s) => s.organization_id === orgId)) {
    orgId = staff[0].organization_id;
  }

  const current = staff.find((s) => s.organization_id === orgId)!;
  const q = new URLSearchParams({ organizationId: orgId }).toString();
  const overviewRes = await apiGetJson<OverviewPayload>(session, `/api/org/insights/overview?${q}`);

  const o = overviewRes.ok ? overviewRes.data.onboardingInstances : null;
  const e = overviewRes.ok ? overviewRes.data.enrollments : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-6">
        {query.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{query.error}</p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Learning insights</h1>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={dashboardTeamPath(orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
              Team
            </Link>
            <Link href={dashboardTeamReviewQueuePath(orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
              Review queue
            </Link>
            <Link href={dashboardOrgUrl("audit", orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
              Activity log
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
          <span className="font-medium text-zinc-900">{current.organizations?.name ?? "Organization"}</span> — snapshot
          of learners, onboarding instances, and course/path enrollments.
        </p>
        {staff.length > 1 ? (
          <nav className="flex flex-wrap gap-2 text-sm">
            {staff.map((s) => (
              <Link
                key={s.organization_id}
                href={dashboardTeamInsightsPath(s.organization_id)}
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

      {!overviewRes.ok ? (
        <p className="text-sm text-red-700">Could not load overview (HTTP {overviewRes.status}).</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Learners</h2>
            <p className="mt-2 text-3xl font-semibold text-zinc-900">{overviewRes.data.learners.total}</p>
            <p className="mt-1 text-xs text-zinc-500">Memberships with role learner in this org.</p>
          </section>
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Onboarding at risk</h2>
            <p className="mt-2 text-3xl font-semibold text-amber-800">{overviewRes.data.onboardingPastDueIncomplete}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Instances not completed/cancelled with a target date in the past (sync statuses on Team if this looks
              high).
            </p>
          </section>
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">Onboarding instances (DB status)</h2>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              <li className="rounded bg-zinc-50 px-2 py-2 text-center">
                <div className="text-xs text-zinc-500">Assigned</div>
                <div className="font-semibold text-zinc-900">{o?.assigned ?? 0}</div>
              </li>
              <li className="rounded bg-zinc-50 px-2 py-2 text-center">
                <div className="text-xs text-zinc-500">In progress</div>
                <div className="font-semibold text-zinc-900">{o?.in_progress ?? 0}</div>
              </li>
              <li className="rounded bg-zinc-50 px-2 py-2 text-center">
                <div className="text-xs text-zinc-500">Completed</div>
                <div className="font-semibold text-emerald-800">{o?.completed ?? 0}</div>
              </li>
              <li className="rounded bg-zinc-50 px-2 py-2 text-center">
                <div className="text-xs text-zinc-500">Overdue</div>
                <div className="font-semibold text-amber-800">{o?.overdue ?? 0}</div>
              </li>
              <li className="rounded bg-zinc-50 px-2 py-2 text-center">
                <div className="text-xs text-zinc-500">Cancelled</div>
                <div className="font-semibold text-zinc-700">{o?.cancelled ?? 0}</div>
              </li>
            </ul>
          </section>
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">Course / path enrollments</h2>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              <li className="rounded bg-zinc-50 px-2 py-2 text-center">
                <div className="text-xs text-zinc-500">Assigned</div>
                <div className="font-semibold text-zinc-900">{e?.assigned ?? 0}</div>
              </li>
              <li className="rounded bg-zinc-50 px-2 py-2 text-center">
                <div className="text-xs text-zinc-500">In progress</div>
                <div className="font-semibold text-zinc-900">{e?.in_progress ?? 0}</div>
              </li>
              <li className="rounded bg-zinc-50 px-2 py-2 text-center">
                <div className="text-xs text-zinc-500">Completed</div>
                <div className="font-semibold text-emerald-800">{e?.completed ?? 0}</div>
              </li>
              <li className="rounded bg-zinc-50 px-2 py-2 text-center">
                <div className="text-xs text-zinc-500">Overdue</div>
                <div className="font-semibold text-amber-800">{e?.overdue ?? 0}</div>
              </li>
              <li className="rounded bg-zinc-50 px-2 py-2 text-center">
                <div className="text-xs text-zinc-500">Expired</div>
                <div className="font-semibold text-zinc-700">{e?.expired ?? 0}</div>
              </li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
