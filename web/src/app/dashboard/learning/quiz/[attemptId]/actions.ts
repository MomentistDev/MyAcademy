"use server";

import { apiPostJson, getApiSession } from "@/lib/api-server";
import { learningDashboardUrl, learningQuizAttemptUrl } from "@/lib/learning-dashboard-url";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function submitQuizAttemptAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const attemptId = String(formData.get("attemptId") ?? "");

  if (!organizationId || !membershipId || !attemptId) {
    redirect(learningDashboardUrl(organizationId || undefined, "Missing quiz attempt context."));
  }

  const answers: Array<{ questionId: string; choiceIndex: number }> = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("q-") && typeof value === "string") {
      const questionId = key.slice(2);
      const choiceIndex = Number(value);
      if (questionId && Number.isInteger(choiceIndex) && choiceIndex >= 0) {
        answers.push({ questionId, choiceIndex });
      }
    }
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/learn/quiz-attempts/submit", {
    organizationId,
    membershipId,
    attemptId,
    answers,
  });

  if (!res.ok) {
    let message = res.body;
    try {
      const j = JSON.parse(res.body) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* keep */
    }
    redirect(learningQuizAttemptUrl(attemptId, organizationId, membershipId, message || `HTTP ${res.status}`));
  }

  revalidatePath(`/dashboard/learning/quiz/${attemptId}`);
  revalidatePath("/dashboard/learning");
  redirect(learningQuizAttemptUrl(attemptId, organizationId, membershipId));
}
