import type { ReactNode } from "react";
import Link from "next/link";
import { dashboardTeamPath } from "@/lib/dashboard-org-urls";
import { downloadChecklistEvidenceAction, reviewChecklistItemAction } from "./actions";

export type DocumentReviewItem = {
  checklistProgressId: string;
  title: string;
  membershipId: string;
  learnerEmail: string | null;
  status: string;
  hasEvidence: boolean;
  submittedAt: string | null;
};

type Props = {
  organizationId: string;
  loadOk: boolean;
  loadStatus?: number;
  items: DocumentReviewItem[];
  heading?: string;
  description?: string;
  /** Shown under the list (e.g. link back to full Team console). */
  footer?: ReactNode;
  /** Where server actions redirect after approve/reject or failed download (default: Team page). */
  afterAction?: "team" | "review-queue";
};

export function DocumentReviewQueueSection({
  organizationId,
  loadOk,
  loadStatus,
  items,
  heading = "Document submissions",
  description = 'When a learner uses "Submit for review" on a document checklist item, it appears here until you approve or reject.',
  footer,
  afterAction = "team",
}: Props) {
  const returnToField =
    afterAction === "review-queue" ? <input type="hidden" name="returnTo" value="review-queue" /> : null;
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-zinc-900">{heading}</h2>
      <p className="mb-4 text-xs text-zinc-500">{description}</p>
      {!loadOk ? (
        <p className="text-sm text-red-700">Could not load review queue{loadStatus != null ? ` (HTTP ${loadStatus})` : ""}.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-600">No submissions awaiting review.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm">
          {items.map((row) => (
            <li
              key={row.checklistProgressId}
              className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-zinc-900">{row.title}</p>
                <p className="text-xs text-zinc-500">
                  {row.learnerEmail ?? "Learner"} ·{" "}
                  <span className="font-mono">{row.checklistProgressId.slice(0, 8)}…</span>
                  {row.submittedAt ? (
                    <>
                      {" "}
                      · Submitted {new Date(row.submittedAt).toLocaleString()}
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                {row.hasEvidence ? (
                  <form action={downloadChecklistEvidenceAction}>
                    <input type="hidden" name="organizationId" value={organizationId} />
                    <input type="hidden" name="checklistProgressId" value={row.checklistProgressId} />
                    {returnToField}
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-100"
                    >
                      Download file
                    </button>
                  </form>
                ) : null}
                <form action={reviewChecklistItemAction}>
                  <input type="hidden" name="organizationId" value={organizationId} />
                  <input type="hidden" name="checklistProgressId" value={row.checklistProgressId} />
                  <input type="hidden" name="action" value="waived" />
                  {returnToField}
                  <button
                    type="submit"
                    className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                  >
                    Approve
                  </button>
                </form>
                <form action={reviewChecklistItemAction} className="flex min-w-[200px] flex-col gap-2 sm:items-end">
                  <input type="hidden" name="organizationId" value={organizationId} />
                  <input type="hidden" name="checklistProgressId" value={row.checklistProgressId} />
                  <input type="hidden" name="action" value="failed" />
                  {returnToField}
                  <label className="w-full text-xs text-zinc-600 sm:max-w-xs sm:text-right">
                    Feedback for learner (optional)
                    <textarea
                      name="note"
                      rows={2}
                      maxLength={500}
                      placeholder="What should they fix?"
                      className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 sm:text-left"
                    />
                  </label>
                  <button
                    type="submit"
                    className="self-stretch rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 sm:self-end"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {footer ? <div className="mt-4 border-t border-zinc-100 pt-4 text-sm">{footer}</div> : null}
    </section>
  );
}

export function TeamConsoleLink({ organizationId }: { organizationId: string }) {
  return (
    <Link href={dashboardTeamPath(organizationId)} className="font-medium text-zinc-900 underline">
      Open full Team & onboarding console
    </Link>
  );
}
