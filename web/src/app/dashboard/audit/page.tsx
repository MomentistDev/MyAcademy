import type { Metadata } from "next";
import { apiGetJson, getApiSession } from "@/lib/api-server";
import { dashboardOrgUrl } from "@/lib/dashboard-org-urls";
import { learningDashboardUrl } from "@/lib/learning-dashboard-url";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Activity log",
};

type Props = {
  searchParams: Promise<{ organizationId?: string }>;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  role: string;
  organizations: { slug: string; name: string } | null;
};

type AuditRow = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string;
  actionKey: string;
  targetType: string;
  targetId: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AuditLogPage({ searchParams }: Props) {
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
        <p>Activity log is available to org admins and trainers.</p>
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
  const canLearnForOrg = membershipsRes.data.memberships.some(
    (m) => m.organization_id === orgId && m.role === "learner",
  );
  const q = new URLSearchParams({ organizationId: orgId, limit: "60" }).toString();
  const auditRes = await apiGetJson<{ items: AuditRow[] }>(session, `/api/org/audit-logs?${q}`);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Activity log</h1>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={dashboardOrgUrl("notifications", orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
              Notifications
            </Link>
            <Link href={dashboardOrgUrl("team", orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
              Team
            </Link>
            {canLearnForOrg ? (
              <Link href={learningDashboardUrl(orgId)} className="font-medium text-zinc-600 hover:text-zinc-900">
                Learning
              </Link>
            ) : null}
            <Link href="/dashboard" className="font-medium text-zinc-600 hover:text-zinc-900">
              Dashboard
            </Link>
          </div>
        </div>
        <p className="text-sm text-zinc-600">
          {current.organizations?.name ?? "Organization"} — recent audit events (checklist reviews, etc.).
        </p>
        {staff.length > 1 ? (
          <nav className="flex flex-wrap gap-2 text-xs">
            {staff.map((s) => (
              <Link
                key={s.organization_id}
                href={dashboardOrgUrl("audit", s.organization_id)}
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

      {!auditRes.ok ? (
        <p className="text-sm text-red-700">
          Could not load audit log (HTTP {auditRes.status}). You may need org admin or trainer access in this organization.
        </p>
      ) : auditRes.data.items.length === 0 ? (
        <p className="text-sm text-zinc-600">No audit entries yet. Checklist reviews appear here after trainers act.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white text-sm shadow-sm">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                <th className="py-2 pl-3 pr-2">When</th>
                <th className="py-2 pr-2">Actor</th>
                <th className="py-2 pr-2">Action</th>
                <th className="py-2 pr-3">Target</th>
              </tr>
            </thead>
            <tbody>
              {auditRes.data.items.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 align-top">
                  <td className="whitespace-nowrap py-2 pl-3 pr-2 text-xs text-zinc-600">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-2 text-xs text-zinc-800">
                    <span className="font-medium">{row.actorEmail ?? row.actorUserId?.slice(0, 8) ?? "—"}</span>
                    <span className="block text-zinc-500">{row.actorRole}</span>
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs text-zinc-900">{row.actionKey}</td>
                  <td className="py-2 pr-3 text-xs text-zinc-700">
                    <span className="font-mono">{row.targetType}</span>
                    {row.targetId ? (
                      <span className="ml-1 text-zinc-500">{row.targetId.slice(0, 8)}…</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
