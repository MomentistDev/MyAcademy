import type { Metadata } from "next";
import { apiGetJson, getApiSession } from "@/lib/api-server";
import { dashboardOrgUrl } from "@/lib/dashboard-org-urls";
import { learningDashboardUrl } from "@/lib/learning-dashboard-url";
import Link from "next/link";
import { redirect } from "next/navigation";
import { submitQuizAttemptAction } from "./actions";

export const metadata: Metadata = {
  title: "Quiz",
};

type PageProps = {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ organizationId?: string; membershipId?: string; error?: string }>;
};

type InProgressView = {
  phase: "in_progress";
  quizTitle: string;
  passMarkPercent: number;
  questions: Array<{ id: string; prompt: string; options: string[] }>;
};

type SubmittedView = {
  phase: "submitted";
  quizTitle: string;
  passMarkPercent: number;
  scorePercent: number | null;
  result: string | null;
};

export default async function QuizAttemptPage({ params, searchParams }: PageProps) {
  const { attemptId } = await params;
  const query = await searchParams;
  const session = await getApiSession();
  if (!session) redirect("/login");

  const organizationId = query.organizationId ?? "";
  const membershipId = query.membershipId ?? "";
  if (!organizationId || !membershipId) {
    redirect(learningDashboardUrl(undefined, "Missing organization or membership in URL."));
  }

  const membershipsRes = await apiGetJson<{ memberships: Array<{ organization_id: string; role: string }> }>(
    session,
    "/api/me/memberships",
  );
  const memberships = membershipsRes.ok ? membershipsRes.data.memberships : [];
  const canTeamForOrg = memberships.some(
    (m) => m.organization_id === organizationId && (m.role === "org_admin" || m.role === "trainer"),
  );

  const subNav = (
    <div className="flex flex-wrap gap-3 text-sm">
      <Link
        href={dashboardOrgUrl("notifications", organizationId)}
        className="font-medium text-zinc-600 hover:text-zinc-900"
      >
        Notifications
      </Link>
      {canTeamForOrg ? (
        <>
          <Link href={dashboardOrgUrl("team", organizationId)} className="font-medium text-zinc-600 hover:text-zinc-900">
            Team
          </Link>
          <Link href={dashboardOrgUrl("audit", organizationId)} className="font-medium text-zinc-600 hover:text-zinc-900">
            Activity log
          </Link>
        </>
      ) : null}
      <Link href={learningDashboardUrl(organizationId)} className="font-medium text-zinc-600 hover:text-zinc-900">
        Learning
      </Link>
      <Link href="/dashboard" className="font-medium text-zinc-600 hover:text-zinc-900">
        Dashboard
      </Link>
    </div>
  );

  const q = new URLSearchParams({ organizationId, membershipId }).toString();
  const viewRes = await apiGetJson<InProgressView | SubmittedView>(
    session,
    `/api/learn/quiz-attempts/${encodeURIComponent(attemptId)}?${q}`,
  );

  if (!viewRes.ok) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-6 py-12 text-sm text-red-700">
        {subNav}
        <p>
          Could not load quiz (HTTP {viewRes.status}).{" "}
          <Link href={learningDashboardUrl(organizationId)} className="underline">
            Back to Learning
          </Link>
        </p>
      </div>
    );
  }

  const view = viewRes.data;

  return (
    <div className="mx-auto max-w-xl space-y-6 px-6 py-12">
      {subNav}

      {query.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{query.error}</p>
      ) : null}

      <h1 className="text-xl font-semibold text-zinc-900">{view.quizTitle}</h1>

      {view.phase === "submitted" ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-800">
          <p className="font-medium text-zinc-900">Submitted</p>
          <p className="mt-2">
            Score: <strong>{view.scorePercent ?? "—"}%</strong> (pass mark {view.passMarkPercent}%)
          </p>
          <p className="mt-1">
            Result: <strong>{view.result ?? "—"}</strong>
          </p>
          <Link
            href={learningDashboardUrl(organizationId)}
            className="mt-4 inline-block text-sm font-medium text-zinc-900 underline"
          >
            Back to Learning
          </Link>
        </div>
      ) : (
        <form action={submitQuizAttemptAction} className="space-y-6">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="membershipId" value={membershipId} />
          <input type="hidden" name="attemptId" value={attemptId} />
          <p className="text-xs text-zinc-500">Pass mark: {view.passMarkPercent}%</p>
          {view.questions.map((question) => (
            <fieldset key={question.id} className="rounded-lg border border-zinc-200 bg-white p-4">
              <legend className="text-sm font-medium text-zinc-900">{question.prompt}</legend>
              <div className="mt-3 space-y-2">
                {question.options.map((opt, idx) => (
                  <label key={idx} className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700">
                    <input
                      type="radio"
                      name={`q-${question.id}`}
                      value={String(idx)}
                      required
                      className="mt-1"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Submit answers
          </button>
        </form>
      )}
    </div>
  );
}
