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
import { DocumentReviewQueueSection, TeamConsoleLink, type DocumentReviewItem } from "../document-review-queue-section";

export const metadata: Metadata = {
  title: "Review queue",
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function TrainerReviewQueuePage({ searchParams }: Props) {
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
        <p>
          This queue is for <strong>org admins</strong> and <strong>trainers</strong>. Sign in as{" "}
          <code className="rounded bg-zinc-100 px-1">trainer@acme.test</code> or{" "}
          <code className="rounded bg-zinc-100 px-1">admin@acme.test</code>.
        </p>
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
  const listQ = new URLSearchParams({ organizationId: orgId, limit: "100" }).toString();
  const countQ = new URLSearchParams({ organizationId: orgId }).toString();
  const [reviewsRes, countRes] = await Promise.all([
    apiGetJson<{ items: DocumentReviewItem[] }>(session, `/api/onboarding/progress/document-reviews?${listQ}`),
    apiGetJson<{ pending: number }>(session, `/api/onboarding/progress/document-reviews/count?${countQ}`),
  ]);

  const pendingCount = countRes.ok
    ? countRes.data.pending
    : reviewsRes.ok
      ? reviewsRes.data.items.length
      : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-6">
        {query.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{query.error}</p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Trainer review queue</h1>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={dashboardTeamPath(orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
              Team
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
          <span className="font-medium text-zinc-900">{current.organizations?.name ?? "Organization"}</span>
          {pendingCount > 0 ? (
            <span className="text-zinc-500"> · {pendingCount} pending</span>
          ) : (
            <span className="text-zinc-500"> · nothing waiting</span>
          )}
        </p>
        {staff.length > 1 ? (
          <nav className="flex flex-wrap gap-2 text-sm">
            {staff.map((s) => (
              <Link
                key={s.organization_id}
                href={dashboardTeamReviewQueuePath(s.organization_id)}
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

      <DocumentReviewQueueSection
        organizationId={orgId}
        loadOk={reviewsRes.ok}
        loadStatus={reviewsRes.ok ? undefined : reviewsRes.status}
        items={reviewsRes.ok ? reviewsRes.data.items : []}
        heading="Pending document reviews"
        description="Approve submissions to complete the checklist item, or reject with a short note so the learner can resubmit."
        footer={<TeamConsoleLink organizationId={orgId} />}
        afterAction="review-queue"
      />
    </div>
  );
}
