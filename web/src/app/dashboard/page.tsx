import type { Metadata } from "next";
import { apiGetJson, getApiSession } from "@/lib/api-server";
import { dashboardOrgUrl, dashboardTeamInsightsPath, dashboardTeamReviewQueuePath } from "@/lib/dashboard-org-urls";
import { learningDashboardUrl } from "@/lib/learning-dashboard-url";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "../login/actions";
import { startChipCheckoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Dashboard",
};

type ApiMembership = {
  id: string;
  organization_id: string;
  role: string;
  organizations: { slug: string; name: string } | null;
};

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getApiSession();
  if (!session) redirect("/login");
  const sp = (await searchParams) ?? {};
  const errorMessage = typeof sp.error === "string" ? sp.error : undefined;
  const chipFlag = typeof sp.chip === "string" ? sp.chip : undefined;
  const chipStatus = typeof sp.status === "string" ? sp.status : undefined;
  const chipPlan = typeof sp.plan === "string" ? sp.plan : undefined;

  const membershipsRes = await apiGetJson<{ memberships: ApiMembership[] }>(session, "/api/me/memberships");

  const memberships = membershipsRes.ok ? membershipsRes.data.memberships : [];
  const hasStaffMembership = memberships.some((m) => m.role === "org_admin" || m.role === "trainer");
  const firstMembershipOrgId = memberships[0]?.organization_id;
  const firstStaffOrgId = memberships.find((m) => m.role === "org_admin" || m.role === "trainer")?.organization_id;
  const firstBillingOrgId = memberships.find((m) => m.role === "org_admin")?.organization_id;
  const firstLearnerOrgId = memberships.find((m) => m.role === "learner")?.organization_id;
  const staffOrganizationIds = [
    ...new Set(
      memberships.filter((m) => m.role === "org_admin" || m.role === "trainer").map((m) => m.organization_id),
    ),
  ];

  const [unreadRes, ...pendingCountResults] = await Promise.all([
    apiGetJson<{ unreadCount: number }>(session, "/api/me/notifications/unread-count"),
    ...staffOrganizationIds.map((organizationId) =>
      apiGetJson<{ pending: number }>(
        session,
        `/api/onboarding/progress/document-reviews/count?${new URLSearchParams({ organizationId }).toString()}`,
      ),
    ),
  ]);

  const billingRes =
    firstBillingOrgId != null
      ? await apiGetJson<{ organizationId: string; currentPlan: "starter" | "growth" | "enterprise"; updatedAt: string }>(
          session,
          `/api/org/billing/status?${new URLSearchParams({ organizationId: firstBillingOrgId }).toString()}`,
        )
      : null;

  const unread = unreadRes.ok ? unreadRes.data.unreadCount : 0;
  const pendingReviewCount =
    staffOrganizationIds.length > 0 && pendingCountResults.length > 0 && pendingCountResults.every((r) => r.ok)
      ? pendingCountResults.reduce((sum, r) => sum + (r.ok ? r.data.pending : 0), 0)
      : null;

  const notificationsHref =
    firstMembershipOrgId != null ? dashboardOrgUrl("notifications", firstMembershipOrgId) : "/dashboard/notifications";
  const teamHref = firstStaffOrgId != null ? dashboardOrgUrl("team", firstStaffOrgId) : "/dashboard/team";
  const reviewQueueHref =
    firstStaffOrgId != null ? dashboardTeamReviewQueuePath(firstStaffOrgId) : "/dashboard/team/review-queue";
  const insightsHref =
    firstStaffOrgId != null ? dashboardTeamInsightsPath(firstStaffOrgId) : "/dashboard/team/insights";
  const auditHref = firstStaffOrgId != null ? dashboardOrgUrl("audit", firstStaffOrgId) : "/dashboard/audit";
  const learningHref = firstLearnerOrgId != null ? learningDashboardUrl(firstLearnerOrgId) : "/dashboard/learning";

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-600">
          Signed in as{" "}
          <span className="font-medium text-zinc-900">{session.userEmail ?? "your account"}</span>
        </p>
      </header>

      {errorMessage ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{errorMessage}</p>
      ) : null}

      {chipFlag === "1" && chipStatus ? (
        <p
          className={
            chipStatus === "success"
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
              : "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          }
        >
          {chipStatus === "success"
            ? `Payment flow returned success${chipPlan ? ` for ${chipPlan}` : ""}.`
            : `Payment flow returned failure${chipPlan ? ` for ${chipPlan}` : ""}.`}
        </p>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-700 shadow-sm">
        <p className="mb-3 font-medium text-zinc-900">API session (Express)</p>
        <p className="mb-3 text-zinc-600">
          The API validates your Supabase access token and loads your organization roles from{" "}
          <code className="rounded bg-zinc-100 px-1">memberships</code>. Keep{" "}
          <code className="rounded bg-zinc-100 px-1">npm run dev</code> on port 4000 running alongside the web app.
        </p>
        {!membershipsRes.ok ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            Could not reach the API at {session.apiUrl}: HTTP {membershipsRes.status}
          </p>
        ) : memberships.length > 0 ? (
          <ul className="space-y-2">
            {memberships.map((m) => (
              <li key={m.id} className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2">
                <span className="font-medium text-zinc-900">{m.organizations?.name ?? "Organization"}</span>
                <span className="text-zinc-500"> · </span>
                <span className="text-zinc-700">{m.role}</span>
                {m.organizations?.slug ? (
                  <>
                    <span className="text-zinc-500"> · </span>
                    <code className="text-xs text-zinc-600">{m.organizations.slug}</code>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-600">No memberships returned from the API.</p>
        )}
      </section>

      {firstBillingOrgId ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-700 shadow-sm">
          <p className="mb-3 font-medium text-zinc-900">Billing (CHIP Collect)</p>
          {billingRes?.ok ? (
            <p className="mb-4 text-zinc-700">
              Current plan: <span className="font-semibold text-zinc-900">{billingRes.data.currentPlan}</span>
            </p>
          ) : (
            <p className="mb-4 text-amber-700">
              Could not load billing status from API
              {billingRes ? ` (HTTP ${billingRes.status})` : ""}.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <form action={startChipCheckoutAction}>
              <input type="hidden" name="organizationId" value={firstBillingOrgId} />
              <input type="hidden" name="targetPlan" value="growth" />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
              >
                Upgrade to Growth
              </button>
            </form>
            <form action={startChipCheckoutAction}>
              <input type="hidden" name="organizationId" value={firstBillingOrgId} />
              <input type="hidden" name="targetPlan" value="enterprise" />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
              >
                Upgrade to Enterprise
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-700">
        <p className="mb-2 font-medium text-zinc-900">Postgres RLS</p>
        <p className="space-y-2">
          Row-level security reads <code className="rounded bg-zinc-200 px-1">organization_id</code> and{" "}
          <code className="rounded bg-zinc-200 px-1">role</code> from JWT{" "}
          <code className="rounded bg-zinc-200 px-1">app_metadata</code>. After changing metadata, sign out and back in
          so your session picks up the new claims.
        </p>
      </section>

      <div className="flex flex-wrap gap-4">
        <Link
          href={notificationsHref}
          className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
        >
          Notifications{unread > 0 ? ` (${unread})` : ""}
        </Link>
        {hasStaffMembership ? (
          <>
            <Link
              href={reviewQueueHref}
              className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
            >
              Review queue
              {pendingReviewCount != null && pendingReviewCount > 0 ? ` (${pendingReviewCount})` : ""}
            </Link>
            <Link
              href={insightsHref}
              className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
            >
              Insights
            </Link>
            <Link
              href={auditHref}
              className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
            >
              Activity log
            </Link>
          </>
        ) : null}
        <Link
          href={teamHref}
          className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
        >
          Team
        </Link>
        <Link
          href={learningHref}
          className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
        >
          Learning
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
          >
            Sign out
          </button>
        </form>
        <Link
          href="/"
          className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
