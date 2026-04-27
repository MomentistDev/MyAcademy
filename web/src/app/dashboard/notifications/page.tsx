import type { Metadata } from "next";
import { apiGetJson, getApiSession } from "@/lib/api-server";
import { dashboardOrgUrl, dashboardTeamInsightsPath, dashboardTeamReviewQueuePath } from "@/lib/dashboard-org-urls";
import { learningDashboardUrl } from "@/lib/learning-dashboard-url";
import Link from "next/link";
import { redirect } from "next/navigation";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";

export const metadata: Metadata = {
  title: "Notifications",
};

type Props = {
  searchParams: Promise<{ organizationId?: string; error?: string }>;
};

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function notificationKindLabel(kind: string): string {
  switch (kind) {
    case "learning.course_assigned":
      return "Course assignment";
    case "learning.path_assigned":
      return "Learning path assignment";
    case "onboarding.document_pending_review":
      return "Onboarding — review needed";
    case "onboarding.document_approved":
      return "Onboarding — approved";
    case "onboarding.document_rejected":
      return "Onboarding — changes requested";
    default:
      return kind;
  }
}

function notificationQuickLink(
  kind: string,
  organizationId: string,
): { href: string; label: string } | null {
  switch (kind) {
    case "learning.course_assigned":
    case "learning.path_assigned":
    case "onboarding.document_approved":
    case "onboarding.document_rejected":
      return {
        href: learningDashboardUrl(organizationId),
        label: "Open Learning",
      };
    case "onboarding.document_pending_review":
      return {
        href: dashboardTeamReviewQueuePath(organizationId),
        label: "Open review queue",
      };
    default:
      return null;
  }
}

export default async function NotificationsPage({ searchParams }: Props) {
  const query = await searchParams;
  const session = await getApiSession();
  if (!session) redirect("/login");

  const membershipsRes = await apiGetJson<{ memberships: Array<{ id: string; organization_id: string; role: string; organizations: { name: string } | null }> }>(
    session,
    "/api/me/memberships",
  );

  if (!membershipsRes.ok) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-sm text-red-700">
        Could not load memberships (HTTP {membershipsRes.status}).
      </div>
    );
  }

  const memberships = membershipsRes.data.memberships;
  let orgId = query.organizationId;
  if (!orgId || !UUID_RE.test(orgId) || !memberships.some((m) => m.organization_id === orgId)) {
    orgId = memberships[0]?.organization_id;
  }

  if (!orgId) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-sm text-zinc-700">
        <p>No organization memberships.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-zinc-900 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const currentOrgName = memberships.find((m) => m.organization_id === orgId)?.organizations?.name ?? "Organization";
  const canTeamForOrg = memberships.some(
    (m) => m.organization_id === orgId && (m.role === "org_admin" || m.role === "trainer"),
  );
  const canLearnForOrg = memberships.some((m) => m.organization_id === orgId && m.role === "learner");
  const q = new URLSearchParams({ organizationId: orgId, limit: "40", unreadOnly: "false" }).toString();
  const listRes = await apiGetJson<{ items: NotificationRow[] }>(session, `/api/me/notifications?${q}`);
  const hasUnread = listRes.ok && listRes.data.items.some((row) => !row.readAt);

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6">
        {query.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{query.error}</p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Notifications</h1>
          <nav className="flex flex-wrap items-center gap-3 text-sm">
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
            {canLearnForOrg ? (
              <Link href={learningDashboardUrl(orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
                Learning
              </Link>
            ) : null}
            <Link href="/dashboard" className="font-medium text-zinc-600 hover:text-zinc-900">
              Dashboard
            </Link>
          </nav>
        </div>
        <p className="text-sm text-zinc-600">{currentOrgName}</p>
        {memberships.length > 1 ? (
          <nav className="flex flex-wrap gap-2 text-xs">
            {memberships.map((m) => (
              <Link
                key={m.id}
                href={dashboardOrgUrl("notifications", m.organization_id)}
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

      {!listRes.ok ? (
        <p className="text-sm text-red-700">Could not load notifications (HTTP {listRes.status}).</p>
      ) : listRes.data.items.length === 0 ? (
        <div className="space-y-2 text-sm text-zinc-600">
          <p>No notifications in this organization yet.</p>
          <p className="text-xs text-zinc-500">
            Course and path assignments, onboarding submits, and document reviews create messages here. If you approved a
            document before notifications existed, run the latest Supabase migrations (or{" "}
            <code className="rounded bg-zinc-100 px-1">supabase db reset</code> locally) so past approvals are backfilled
            for learners.
          </p>
        </div>
      ) : (
        <>
          {hasUnread ? (
            <form action={markAllNotificationsReadAction} className="flex justify-end">
              <input type="hidden" name="organizationId" value={orgId} />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Mark all as read
              </button>
            </form>
          ) : null}
          <ul className="space-y-3 text-sm">
          {listRes.data.items.map((row) => {
            const quick = notificationQuickLink(row.kind, orgId);
            return (
            <li
              key={row.id}
              className={`rounded-lg border px-4 py-3 ${
                row.readAt ? "border-zinc-100 bg-zinc-50/80" : "border-amber-200 bg-amber-50/60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-zinc-900">{row.title}</p>
                  {row.body ? <p className="mt-1 text-zinc-700">{row.body}</p> : null}
                  {quick ? (
                    <p className="mt-2">
                      <Link href={quick.href} className="text-sm font-medium text-zinc-900 underline underline-offset-2">
                        {quick.label}
                      </Link>
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-zinc-500">
                    {new Date(row.createdAt).toLocaleString()} · {notificationKindLabel(row.kind)}
                  </p>
                </div>
                {!row.readAt ? (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="organizationId" value={orgId} />
                    <input type="hidden" name="notificationId" value={row.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      Mark read
                    </button>
                  </form>
                ) : (
                  <span className="text-xs text-zinc-500">Read</span>
                )}
              </div>
            </li>
            );
          })}
          </ul>
        </>
      )}
    </div>
  );
}
