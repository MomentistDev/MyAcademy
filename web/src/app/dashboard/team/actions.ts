"use server";

import { apiGetJson, apiPostJson, getApiSession } from "@/lib/api-server";
import {
  dashboardTeamErrorOnly,
  dashboardTeamPath,
  dashboardTeamReviewQueuePath,
} from "@/lib/dashboard-org-urls";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function teamPath(organizationId: string, error?: string, courseId?: string, learningPathId?: string) {
  return dashboardTeamPath(organizationId, { error, courseId, learningPathId });
}

function parseApiError(body: string, status: number): string {
  try {
    const j = JSON.parse(body) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* ignore */
  }
  return body || `HTTP ${status}`;
}

export async function syncOnboardingStatusesAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!organizationId) {
    redirect(dashboardTeamErrorOnly("Missing organization."));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/onboarding/sync-status", { organizationId, maxRows: 500 });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status)));
  }

  revalidatePath("/dashboard/team");
  redirect(teamPath(organizationId));
}

export async function inviteMemberAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "learner");

  if (!organizationId) {
    redirect(dashboardTeamErrorOnly("Email and organization are required."));
  }
  if (!email) {
    redirect(teamPath(organizationId, "Email and organization are required."));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/memberships/invite", {
    organizationId,
    email,
    role,
  });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status)));
  }

  revalidatePath("/dashboard/team");
  redirect(teamPath(organizationId));
}

export async function createCourseAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "skill");

  if (!organizationId) {
    redirect(dashboardTeamErrorOnly("Missing organization."));
  }
  if (title.length < 3) {
    redirect(teamPath(organizationId, "Title must be at least 3 characters."));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/courses", {
    organizationId,
    title,
    description: description || undefined,
    category,
  });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status)));
  }

  revalidatePath("/dashboard/team");
  redirect(teamPath(organizationId));
}

export async function publishCourseAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");

  if (!organizationId || !courseId) {
    redirect(
      organizationId
        ? teamPath(organizationId, "Missing course or organization.")
        : dashboardTeamErrorOnly("Missing course or organization."),
    );
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/courses/publish", { organizationId, courseId });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status)));
  }

  revalidatePath("/dashboard/team");
  redirect(teamPath(organizationId));
}

export async function assignCourseEnrollmentAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  const returnCourseId = String(formData.get("returnCourseId") ?? "").trim() || undefined;

  if (!organizationId || !membershipId || !courseId) {
    redirect(
      organizationId
        ? teamPath(organizationId, "Choose a learner and a published course.", returnCourseId)
        : dashboardTeamErrorOnly("Choose a learner and a published course."),
    );
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/enrollments/assign-course", {
    organizationId,
    membershipId,
    courseId,
  });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status), returnCourseId));
  }

  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/learning");
  revalidatePath("/dashboard/notifications");
  redirect(teamPath(organizationId, undefined, returnCourseId));
}

export async function createQuizDraftAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const passRaw = Number(formData.get("passMarkPercent") ?? 70);

  if (!organizationId || !courseId) {
    redirect(
      organizationId
        ? teamPath(organizationId, "Missing course for quiz.")
        : dashboardTeamErrorOnly("Missing course for quiz."),
    );
  }
  if (title.length < 2) {
    redirect(teamPath(organizationId, "Quiz title is required.", courseId));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/org/quizzes", {
    organizationId,
    courseId,
    title,
    description: description || undefined,
    passMarkPercent: Number.isFinite(passRaw) ? passRaw : 70,
  });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status), courseId));
  }

  revalidatePath("/dashboard/team");
  redirect(teamPath(organizationId, undefined, courseId));
}

export async function addQuizMcqQuestionAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  const quizId = String(formData.get("quizId") ?? "");
  const prompt = String(formData.get("prompt") ?? "").trim();
  const rawOptions = [0, 1, 2, 3].map((i) => String(formData.get(`option${i}`) ?? "").trim());
  const correctIndex = Number(formData.get("correctIndex") ?? 0);

  if (!organizationId || !courseId || !quizId) {
    redirect(teamPath(organizationId, "Missing quiz context.", courseId));
  }
  if (prompt.length < 1) {
    redirect(teamPath(organizationId, "Question prompt is required.", courseId));
  }

  const cleaned: string[] = [];
  for (const s of rawOptions) {
    if (s.length === 0) break;
    cleaned.push(s);
  }

  if (cleaned.length < 2) {
    redirect(teamPath(organizationId, "Enter at least two answer choices.", courseId));
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= cleaned.length) {
    redirect(teamPath(organizationId, "Pick a valid correct answer.", courseId));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/org/quizzes/mcq", {
    organizationId,
    quizId,
    prompt,
    options: cleaned,
    correctIndex,
  });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status), courseId));
  }

  revalidatePath("/dashboard/team");
  redirect(teamPath(organizationId, undefined, courseId));
}

export async function addCourseContentItemAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  const type = String(formData.get("type") ?? "video");
  const title = String(formData.get("title") ?? "").trim();
  const resourceUrl = String(formData.get("resourceUrl") ?? "").trim();
  const isRequired = String(formData.get("isRequired") ?? "true") === "true";

  if (!organizationId || !courseId) {
    redirect(
      organizationId
        ? teamPath(organizationId, "Missing course.", courseId)
        : dashboardTeamErrorOnly("Missing course."),
    );
  }
  if (title.length < 1) {
    redirect(teamPath(organizationId, "Title is required.", courseId));
  }
  if (resourceUrl.length < 4) {
    redirect(teamPath(organizationId, "Resource URL is required.", courseId));
  }

  const allowed = new Set(["video", "pdf", "slide", "attachment"]);
  if (!allowed.has(type)) {
    redirect(teamPath(organizationId, "Invalid content type.", courseId));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/org/course-content", {
    organizationId,
    courseId,
    type,
    title,
    resourceUrl,
    isRequired,
  });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status), courseId));
  }

  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/learning");
  redirect(teamPath(organizationId, undefined, courseId));
}

export async function publishQuizAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  const quizId = String(formData.get("quizId") ?? "");

  if (!organizationId) {
    redirect(dashboardTeamErrorOnly("Missing quiz."));
  }
  if (!quizId) {
    redirect(teamPath(organizationId, "Missing quiz.", courseId || undefined));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/org/quizzes/publish", { organizationId, quizId });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status), courseId || undefined));
  }

  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/learning");
  redirect(teamPath(organizationId, undefined, courseId || undefined));
}

export async function createLearningPathDraftAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!organizationId) {
    redirect(dashboardTeamErrorOnly("Missing organization."));
  }
  if (name.length < 2) {
    redirect(teamPath(organizationId, "Path name is required."));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson<{ created: true; learningPathId: string }>(session, "/api/org/learning-paths", {
    organizationId,
    name,
    description: description || undefined,
  });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status)));
  }

  revalidatePath("/dashboard/team");
  redirect(teamPath(organizationId, undefined, undefined, res.data.learningPathId));
}

export async function addLearningPathStepAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const learningPathId = String(formData.get("learningPathId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  const required = String(formData.get("required") ?? "true") === "true";
  const dueRaw = String(formData.get("dueOffsetDays") ?? "").trim();
  const dueOffsetDays = dueRaw.length > 0 ? Number(dueRaw) : undefined;

  if (!organizationId || !learningPathId || !courseId) {
    redirect(teamPath(organizationId, "Missing path or course.", undefined, learningPathId || undefined));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const payload: {
    organizationId: string;
    learningPathId: string;
    courseId: string;
    required: boolean;
    dueOffsetDays?: number;
  } = { organizationId, learningPathId, courseId, required };
  if (dueOffsetDays != null && Number.isFinite(dueOffsetDays)) {
    payload.dueOffsetDays = Math.max(0, Math.floor(dueOffsetDays));
  }

  const res = await apiPostJson(session, "/api/org/learning-path-steps", payload);
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status), undefined, learningPathId));
  }

  revalidatePath("/dashboard/team");
  redirect(teamPath(organizationId, undefined, undefined, learningPathId));
}

export async function publishLearningPathAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const learningPathId = String(formData.get("learningPathId") ?? "");

  if (!organizationId || !learningPathId) {
    redirect(
      organizationId
        ? teamPath(organizationId, "Missing learning path.", undefined, learningPathId || undefined)
        : dashboardTeamErrorOnly("Missing learning path."),
    );
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/org/learning-paths/publish", { organizationId, learningPathId });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status), undefined, learningPathId));
  }

  revalidatePath("/dashboard/team");
  redirect(teamPath(organizationId, undefined, undefined, learningPathId));
}

export async function assignLearningPathCoursesAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const learningPathId = String(formData.get("learningPathId") ?? "");

  if (!organizationId || !membershipId || !learningPathId) {
    redirect(teamPath(organizationId, "Choose a learner and a published path.", undefined, learningPathId || undefined));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/enrollments/assign-learning-path", {
    organizationId,
    membershipId,
    learningPathId,
  });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status), undefined, learningPathId));
  }

  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/learning");
  revalidatePath("/dashboard/notifications");
  redirect(teamPath(organizationId, undefined, undefined, learningPathId));
}

export async function assignOnboardingAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const onboardingTemplateId = String(formData.get("onboardingTemplateId") ?? "");

  if (!organizationId || !membershipId || !onboardingTemplateId) {
    redirect(
      organizationId
        ? teamPath(organizationId, "Choose a learner and a template.")
        : dashboardTeamErrorOnly("Choose a learner and a template."),
    );
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/onboarding/assign", {
    organizationId,
    membershipId,
    onboardingTemplateId,
    triggerSource: "manual",
  });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status)));
  }

  revalidatePath("/dashboard/team");
  redirect(teamPath(organizationId));
}

export async function downloadChecklistEvidenceAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const checklistProgressId = String(formData.get("checklistProgressId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "team").trim();

  if (!organizationId || !checklistProgressId) {
    redirect(
      organizationId
        ? returnTo === "review-queue"
          ? dashboardTeamReviewQueuePath(organizationId, "Missing download context.")
          : teamPath(organizationId, "Missing download context.")
        : dashboardTeamErrorOnly("Missing download context."),
    );
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const q = new URLSearchParams({
    organizationId,
    checklistProgressId,
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
    const err = message || `HTTP ${res.status}`;
    redirect(returnTo === "review-queue" ? dashboardTeamReviewQueuePath(organizationId, err) : teamPath(organizationId, err));
  }

  redirect(res.data.signedUrl);
}

export async function reviewChecklistItemAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const checklistProgressId = String(formData.get("checklistProgressId") ?? "");
  const actionRaw = String(formData.get("action") ?? "");
  const noteRaw = String(formData.get("note") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "team").trim();

  if (!organizationId || !checklistProgressId) {
    redirect(
      organizationId
        ? returnTo === "review-queue"
          ? dashboardTeamReviewQueuePath(organizationId, "Missing review fields.")
          : teamPath(organizationId, "Missing review fields.")
        : dashboardTeamErrorOnly("Missing review fields."),
    );
  }

  const action = actionRaw === "failed" ? "failed" : "waived";

  const session = await getApiSession();
  if (!session) redirect("/login");

  const payload: { organizationId: string; checklistProgressId: string; action: "failed" | "waived"; note?: string } =
    {
      organizationId,
      checklistProgressId,
      action,
    };
  if (action === "failed" && noteRaw.length > 0) {
    payload.note = noteRaw.slice(0, 500);
  }

  const res = await apiPostJson(session, "/api/onboarding/progress/review", payload);
  if (!res.ok) {
    const err = parseApiError(res.body, res.status);
    redirect(returnTo === "review-queue" ? dashboardTeamReviewQueuePath(organizationId, err) : teamPath(organizationId, err));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/team/review-queue");
  revalidatePath("/dashboard/audit");
  redirect(returnTo === "review-queue" ? dashboardTeamReviewQueuePath(organizationId) : teamPath(organizationId));
}

export async function revokeCertificateAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const certificateId = String(formData.get("certificateId") ?? "");
  if (!organizationId || !certificateId) {
    redirect(organizationId ? teamPath(organizationId, "Missing certificate.") : dashboardTeamErrorOnly("Missing certificate."));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/org/certificates/update", {
    organizationId,
    certificateId,
    action: "revoke",
  });
  if (!res.ok) {
    redirect(teamPath(organizationId, parseApiError(res.body, res.status)));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/learning");
  redirect(teamPath(organizationId));
}

export async function setCertificateExpiryAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const certificateId = String(formData.get("certificateId") ?? "");
  const clearExpiry = String(formData.get("clearExpiry") ?? "") === "1";
  const expiresAtLocal = String(formData.get("expiresAtLocal") ?? "").trim();

  if (!organizationId || !certificateId) {
    redirect(organizationId ? teamPath(organizationId, "Missing certificate.") : dashboardTeamErrorOnly("Missing certificate."));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  if (clearExpiry) {
    const res = await apiPostJson(session, "/api/org/certificates/update", {
      organizationId,
      certificateId,
      action: "set_expiry",
      expiresAt: null,
    });
    if (!res.ok) {
      redirect(teamPath(organizationId, parseApiError(res.body, res.status)));
    }
  } else {
    if (!expiresAtLocal) {
      redirect(teamPath(organizationId, "Choose a date and time for expiry."));
    }
    const parsed = new Date(expiresAtLocal);
    if (Number.isNaN(parsed.getTime())) {
      redirect(teamPath(organizationId, "Invalid expiry date."));
    }
    const res = await apiPostJson(session, "/api/org/certificates/update", {
      organizationId,
      certificateId,
      action: "set_expiry",
      expiresAt: parsed.toISOString(),
    });
    if (!res.ok) {
      redirect(teamPath(organizationId, parseApiError(res.body, res.status)));
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/learning");
  redirect(teamPath(organizationId));
}
