"use server";

import { apiGetJson, apiPostJson, getApiSession } from "@/lib/api-server";
import { learningDashboardUrl, learningQuizAttemptUrl } from "@/lib/learning-dashboard-url";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

function guessContentType(file: File): string {
  if (file.type && file.type.length > 0) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

export async function completeChecklistItemAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const checklistProgressId = String(formData.get("checklistProgressId") ?? "");

  if (!organizationId || !membershipId || !checklistProgressId) {
    redirect(learningDashboardUrl(undefined, "Missing form fields."));
  }

  const session = await getApiSession();
  if (!session) {
    redirect(`/login`);
  }

  const res = await apiPostJson<{ completed: boolean; onboardingStatus: string }>(
    session,
    "/api/onboarding/progress/complete",
    { organizationId, membershipId, checklistProgressId },
  );

  if (!res.ok) {
    let message = res.body;
    try {
      const j = JSON.parse(res.body) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* keep raw */
    }
    redirect(learningDashboardUrl(organizationId, message || `HTTP ${res.status}`));
  }

  revalidatePath("/dashboard/learning");
  redirect(learningDashboardUrl(organizationId));
}

export async function submitDocumentForReviewAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const checklistProgressId = String(formData.get("checklistProgressId") ?? "");
  const file = formData.get("file");

  if (!organizationId || !membershipId || !checklistProgressId || !(file instanceof File)) {
    redirect(learningDashboardUrl(undefined, "Choose a file to upload."));
  }
  if (file.size === 0 || file.size > MAX_DOCUMENT_BYTES) {
    redirect(learningDashboardUrl(organizationId, "File must be between 1 byte and 10 MB."));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const signRes = await apiPostJson<{ objectPath: string; signedUrl: string }>(
    session,
    "/api/onboarding/progress/document-upload-url",
    {
      organizationId,
      membershipId,
      checklistProgressId,
      filename: file.name,
    },
  );

  if (!signRes.ok) {
    let message = signRes.body;
    try {
      const j = JSON.parse(signRes.body) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* keep */
    }
    redirect(learningDashboardUrl(organizationId, message || `HTTP ${signRes.status}`));
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const putRes = await fetch(signRes.data.signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": guessContentType(file),
      "Cache-Control": "3600",
    },
    body: buf,
  });

  if (!putRes.ok) {
    redirect(learningDashboardUrl(organizationId, `Upload failed (${putRes.status}). Try again.`));
  }

  const completeRes = await apiPostJson<{ completed: boolean; onboardingStatus: string }>(
    session,
    "/api/onboarding/progress/complete",
    {
      organizationId,
      membershipId,
      checklistProgressId,
      evidenceObjectPath: signRes.data.objectPath,
    },
  );

  if (!completeRes.ok) {
    let message = completeRes.body;
    try {
      const j = JSON.parse(completeRes.body) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* keep */
    }
    redirect(learningDashboardUrl(organizationId, message || `HTTP ${completeRes.status}`));
  }

  revalidatePath("/dashboard/learning");
  redirect(learningDashboardUrl(organizationId));
}

export async function downloadMyChecklistEvidenceAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const checklistProgressId = String(formData.get("checklistProgressId") ?? "");

  if (!organizationId || !membershipId || !checklistProgressId) {
    redirect(learningDashboardUrl(undefined, "Missing download context."));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const q = new URLSearchParams({
    organizationId,
    checklistProgressId,
    membershipId,
  }).toString();

  const res = await apiGetJson<{ signedUrl: string }>(session, `/api/onboarding/progress/document-evidence-url?${q}`);
  if (!res.ok) {
    let message = res.body;
    try {
      const j = JSON.parse(res.body) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* keep */
    }
    redirect(learningDashboardUrl(organizationId, message || `HTTP ${res.status}`));
  }

  redirect(res.data.signedUrl);
}

export async function startQuizAttemptAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const quizId = String(formData.get("quizId") ?? "");

  if (!organizationId || !membershipId || !quizId) {
    redirect(learningDashboardUrl(undefined, "Missing quiz context."));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson<{ attemptId: string }>(session, "/api/learn/quiz-attempts/start", {
    organizationId,
    membershipId,
    quizId,
  });

  if (!res.ok) {
    let message = res.body;
    try {
      const j = JSON.parse(res.body) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* keep */
    }
    redirect(learningDashboardUrl(organizationId, message || `HTTP ${res.status}`));
  }

  const attemptId = res.data.attemptId;
  if (!attemptId) {
    redirect(learningDashboardUrl(organizationId, "API did not return attempt id."));
  }

  revalidatePath("/dashboard/learning");
  redirect(learningQuizAttemptUrl(attemptId, organizationId, membershipId));
}

export async function completeEnrollmentAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");

  if (!organizationId || !membershipId || !enrollmentId) {
    redirect(learningDashboardUrl(undefined, "Missing enrollment context."));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/learn/enrollments/complete", {
    organizationId,
    membershipId,
    enrollmentId,
  });

  if (!res.ok) {
    let message = res.body;
    try {
      const j = JSON.parse(res.body) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* keep */
    }
    redirect(learningDashboardUrl(organizationId, message || `HTTP ${res.status}`));
  }

  revalidatePath("/dashboard/learning");
  redirect(learningDashboardUrl(organizationId));
}
