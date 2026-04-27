import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { listMembershipsForUser, resolveAuthContext, resolveAuthUserId } from "./lib/auth-context";
import { ConsoleEventPublisher } from "./lib/event-publisher";
import { getSupabaseAdminClient } from "./lib/supabase-admin";
import { handleChipCollectWebhook } from "./routes/chip-webhook";
import { Phase1Handlers } from "./routes/phase1-handlers";

const inviteMembershipSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["org_admin", "trainer", "learner"]),
});

const createCourseSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().optional(),
  category: z.enum(["onboarding", "compliance", "skill", "leadership"]),
});

const publishCourseSchema = z.object({
  organizationId: z.string().uuid(),
  courseId: z.string().uuid(),
});

const assignCourseEnrollmentSchema = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
  courseId: z.string().uuid(),
});

const assignOnboardingSchema = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
  onboardingTemplateId: z.string().uuid(),
  triggerSource: z.enum(["new_employee", "role_assigned", "manual"]),
});

const listAssignmentsSchema = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
});

const certificatePdfQuery = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
  credentialCode: z.string().min(6).max(80).regex(/^[A-Za-z0-9\-]+$/),
});

const listOnboardingProgressSchema = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
});

const completeChecklistItemSchema = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
  checklistProgressId: z.string().uuid(),
  evidenceObjectPath: z.string().min(3).max(512).optional(),
});

const documentUploadUrlBody = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
  checklistProgressId: z.string().uuid(),
  filename: z.string().min(1).max(200),
});

const documentEvidenceUrlQuery = z.object({
  organizationId: z.string().uuid(),
  checklistProgressId: z.string().uuid(),
  membershipId: z.string().uuid().optional(),
});

const listMyNotificationsQuery = z.object({
  organizationId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  unreadOnly: z.enum(["true", "false"]).optional(),
});

const markNotificationsReadBody = z.object({
  organizationId: z.string().uuid(),
  notificationIds: z.array(z.string().uuid()).min(1).max(50),
});

const markAllNotificationsReadBody = z.object({
  organizationId: z.string().uuid(),
});

const reviewChecklistItemSchema = z.object({
  organizationId: z.string().uuid(),
  checklistProgressId: z.string().uuid(),
  action: z.enum(["failed", "waived"]),
  note: z.string().max(500).optional(),
});

const listTeamOnboardingProgressSchema = z.object({
  organizationId: z.string().uuid(),
  status: z.enum(["assigned", "in_progress", "completed", "overdue", "cancelled"]).optional(),
  membershipId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const syncOnboardingStatusSchema = z.object({
  organizationId: z.string().uuid(),
  maxRows: z.coerce.number().int().min(1).max(2000).optional(),
});

const orgIdQuerySchema = z.object({
  organizationId: z.string().uuid(),
});

const listAuditLogsQuery = z.object({
  organizationId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const listDocumentReviewsQuery = z.object({
  organizationId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const learnerQuizContextQuery = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
});

const listCourseQuizzesQuery = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
  courseId: z.string().uuid(),
});

const startQuizAttemptBody = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
  quizId: z.string().uuid(),
});

const submitQuizAttemptBody = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
  attemptId: z.string().uuid(),
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      choiceIndex: z.coerce.number().int().min(0),
    }),
  ),
});

const completeEnrollmentBody = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
});

const listOrgQuizzesQuery = z.object({
  organizationId: z.string().uuid(),
  courseId: z.string().uuid(),
});

const createQuizDraftBody = z.object({
  organizationId: z.string().uuid(),
  courseId: z.string().uuid(),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  passMarkPercent: z.coerce.number().int().min(1).max(100).optional().default(70),
});

const addQuizMcqBody = z.object({
  organizationId: z.string().uuid(),
  quizId: z.string().uuid(),
  prompt: z.string().min(1).max(2000),
  options: z.array(z.string().min(1).max(500)).min(2).max(10),
  correctIndex: z.coerce.number().int().min(0),
});

const publishQuizBody = z.object({
  organizationId: z.string().uuid(),
  quizId: z.string().uuid(),
});

const listOrgCourseContentQuery = z.object({
  organizationId: z.string().uuid(),
  courseId: z.string().uuid(),
});

const addCourseContentBody = z.object({
  organizationId: z.string().uuid(),
  courseId: z.string().uuid(),
  type: z.enum(["video", "pdf", "slide", "attachment"]),
  title: z.string().min(1).max(300),
  resourceUrl: z.string().min(4).max(2000),
  isRequired: z.boolean().optional().default(true),
});

const createLearningPathBody = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
});

const listLearningPathStepsQuery = z.object({
  organizationId: z.string().uuid(),
  learningPathId: z.string().uuid(),
});

const addLearningPathStepBody = z.object({
  organizationId: z.string().uuid(),
  learningPathId: z.string().uuid(),
  courseId: z.string().uuid(),
  required: z.boolean().optional().default(true),
  dueOffsetDays: z.coerce.number().int().min(0).max(3650).optional(),
});

const publishLearningPathBody = z.object({
  organizationId: z.string().uuid(),
  learningPathId: z.string().uuid(),
});

const assignLearningPathBody = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
  learningPathId: z.string().uuid(),
});

const listOrgCertificatesQuery = z.object({
  organizationId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function singleQueryParam(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

const publicCertificateVerifyQuery = z.object({
  credentialCode: z.string().min(6).max(80).regex(/^[A-Za-z0-9\-]+$/),
  organizationSlug: z.string().min(1).max(120).optional(),
});

const updateOrgCertificateBody = z.discriminatedUnion("action", [
  z.object({
    organizationId: z.string().uuid(),
    certificateId: z.string().uuid(),
    action: z.literal("revoke"),
  }),
  z.object({
    organizationId: z.string().uuid(),
    certificateId: z.string().uuid(),
    action: z.literal("set_expiry"),
    expiresAt: z.union([z.string().min(4).max(64), z.null()]),
  }),
]);

let handlers: Phase1Handlers | null = null;

function getHandlers(): Phase1Handlers {
  if (handlers) return handlers;
  handlers = new Phase1Handlers(getSupabaseAdminClient(), new ConsoleEventPublisher());
  return handlers;
}

export const app = express();
app.use(
  express.json({
    verify: (req, _res, buf: Buffer) => {
      Object.assign(req, { rawBody: buf });
    },
  }),
);

const chipCollectCheckoutBody = z.object({
  organizationId: z.string().uuid(),
  targetPlan: z.enum(["growth", "enterprise"]),
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "myacademy-api" });
});

app.post("/api/billing/chip/webhook", async (req, res, next) => {
  try {
    await handleChipCollectWebhook(req, res, getSupabaseAdminClient());
  } catch (error) {
    next(error);
  }
});

app.post("/api/org/billing/chip/checkout", async (req, res, next) => {
  try {
    const body = chipCollectCheckoutBody.parse(req.body);
    const ctx = await resolveAuthContext(req, body.organizationId);
    const result = await getHandlers().createChipCollectCheckout(ctx, body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/org/billing/status", async (req, res, next) => {
  try {
    const { organizationId } = orgIdQuerySchema.parse(req.query);
    const ctx = await resolveAuthContext(req, organizationId);
    const result = await getHandlers().getOrganizationBillingStatus(ctx, { organizationId });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/public/certificates/verify", async (req, res, next) => {
  try {
    const raw: { credentialCode?: string; organizationSlug?: string } = {
      credentialCode: singleQueryParam(req.query.credentialCode),
    };
    const slug = singleQueryParam(req.query.organizationSlug);
    if (slug && slug.trim().length > 0) {
      raw.organizationSlug = slug.trim();
    }
    const q = publicCertificateVerifyQuery.parse(raw);
    const result = await getHandlers().verifyPublicCertificate({
      credentialCode: q.credentialCode,
      organizationSlug: q.organizationSlug,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/me/memberships", async (req, res, next) => {
  try {
    const items = await listMembershipsForUser(req);
    res.status(200).json({ memberships: items });
  } catch (error) {
    next(error);
  }
});

app.get("/api/me/notifications/unread-count", async (req, res, next) => {
  try {
    const supabase = getSupabaseAdminClient();
    const userId = await resolveAuthUserId(req, supabase);
    const result = await getHandlers().countUnreadInAppNotificationsForUser(userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/me/notifications", async (req, res, next) => {
  try {
    const q = listMyNotificationsQuery.parse(req.query);
    const ctx = await resolveAuthContext(req, q.organizationId);
    const result = await getHandlers().listMyNotifications(ctx, {
      organizationId: q.organizationId,
      limit: q.limit,
      unreadOnly: q.unreadOnly === "true",
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/me/notifications/read", async (req, res, next) => {
  try {
    const body = markNotificationsReadBody.parse(req.body);
    const ctx = await resolveAuthContext(req, body.organizationId);
    const result = await getHandlers().markNotificationsRead(ctx, {
      organizationId: body.organizationId,
      notificationIds: body.notificationIds,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/me/notifications/read-all", async (req, res, next) => {
  try {
    const body = markAllNotificationsReadBody.parse(req.body);
    const ctx = await resolveAuthContext(req, body.organizationId);
    const result = await getHandlers().markAllNotificationsRead(ctx, {
      organizationId: body.organizationId,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/memberships/invite", async (req, res, next) => {
  try {
    const input = inviteMembershipSchema.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().inviteMembership(ctx, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/courses", async (req, res, next) => {
  try {
    const input = createCourseSchema.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().createCourse(ctx, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/courses/publish", async (req, res, next) => {
  try {
    const input = publishCourseSchema.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().publishCourse(ctx, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/org/courses", async (req, res, next) => {
  try {
    const { organizationId } = orgIdQuerySchema.parse(req.query);
    const ctx = await resolveAuthContext(req, organizationId);
    const result = await getHandlers().listOrgCourses(ctx, organizationId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/org/quizzes", async (req, res, next) => {
  try {
    const q = listOrgQuizzesQuery.parse(req.query);
    const ctx = await resolveAuthContext(req, q.organizationId);
    const result = await getHandlers().listQuizzesForCourseStaff(ctx, {
      organizationId: q.organizationId,
      courseId: q.courseId,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/org/quizzes", async (req, res, next) => {
  try {
    const input = createQuizDraftBody.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().createQuizDraft(ctx, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/org/quizzes/mcq", async (req, res, next) => {
  try {
    const input = addQuizMcqBody.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().addQuizMcqQuestion(ctx, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/org/quizzes/publish", async (req, res, next) => {
  try {
    const input = publishQuizBody.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().publishQuiz(ctx, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/org/course-content", async (req, res, next) => {
  try {
    const q = listOrgCourseContentQuery.parse(req.query);
    const ctx = await resolveAuthContext(req, q.organizationId);
    const result = await getHandlers().listCourseContentForStaff(ctx, {
      organizationId: q.organizationId,
      courseId: q.courseId,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/org/course-content", async (req, res, next) => {
  try {
    const input = addCourseContentBody.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().addCourseContentItem(ctx, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/org/learning-paths", async (req, res, next) => {
  try {
    const { organizationId } = orgIdQuerySchema.parse(req.query);
    const ctx = await resolveAuthContext(req, organizationId);
    const result = await getHandlers().listOrgLearningPaths(ctx, organizationId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/org/learning-paths", async (req, res, next) => {
  try {
    const input = createLearningPathBody.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().createLearningPathDraft(ctx, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/org/learning-path-steps", async (req, res, next) => {
  try {
    const q = listLearningPathStepsQuery.parse(req.query);
    const ctx = await resolveAuthContext(req, q.organizationId);
    const result = await getHandlers().listLearningPathStepsStaff(ctx, {
      organizationId: q.organizationId,
      learningPathId: q.learningPathId,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/org/learning-path-steps", async (req, res, next) => {
  try {
    const input = addLearningPathStepBody.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().addLearningPathCourseStep(ctx, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/org/learning-paths/publish", async (req, res, next) => {
  try {
    const input = publishLearningPathBody.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().publishLearningPath(ctx, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/enrollments/assign-learning-path", async (req, res, next) => {
  try {
    const input = assignLearningPathBody.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().assignLearningPathCourses(ctx, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/enrollments/assign-course", async (req, res, next) => {
  try {
    const input = assignCourseEnrollmentSchema.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().assignCourseEnrollment(ctx, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/onboarding/assign", async (req, res, next) => {
  try {
    const input = assignOnboardingSchema.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().assignOnboarding(ctx, input);
    res.status(202).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/assignments/me", async (req, res, next) => {
  try {
    const input = listAssignmentsSchema.parse(req.query);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().listMyAssignments(ctx, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/me/certificates", async (req, res, next) => {
  try {
    const input = listAssignmentsSchema.parse(req.query);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().listMyCertificates(ctx, {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/me/certificates/pdf", async (req, res, next) => {
  try {
    const input = certificatePdfQuery.parse(req.query);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const { body, filename } = await getHandlers().downloadMyCertificatePdf(ctx, input);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(body);
  } catch (error) {
    next(error);
  }
});

app.get("/api/org/certificates", async (req, res, next) => {
  try {
    const q = listOrgCertificatesQuery.parse(req.query);
    const ctx = await resolveAuthContext(req, q.organizationId);
    const result = await getHandlers().listOrgCertificates(ctx, {
      organizationId: q.organizationId,
      limit: q.limit,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/org/certificates/export.csv", async (req, res, next) => {
  try {
    const input = orgIdQuerySchema.parse(req.query);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const { csv } = await getHandlers().exportOrgCertificatesCsv(ctx, {
      organizationId: input.organizationId,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="certificates.csv"');
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
});

app.post("/api/org/certificates/update", async (req, res, next) => {
  try {
    const body = updateOrgCertificateBody.parse(req.body);
    const ctx = await resolveAuthContext(req, body.organizationId);
    const result = await getHandlers().updateOrgCertificate(ctx, {
      organizationId: body.organizationId,
      certificateId: body.certificateId,
      action: body.action,
      expiresAt: body.action === "set_expiry" ? body.expiresAt : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/org/insights/overview", async (req, res, next) => {
  try {
    const input = orgIdQuerySchema.parse(req.query);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().getOrgLearningOverview(ctx, {
      organizationId: input.organizationId,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/onboarding/progress/me", async (req, res, next) => {
  try {
    const input = listOnboardingProgressSchema.parse(req.query);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().listMyOnboardingProgress(ctx, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/onboarding/progress/complete", async (req, res, next) => {
  try {
    const input = completeChecklistItemSchema.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().completeChecklistItem(ctx, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/onboarding/progress/document-upload-url", async (req, res, next) => {
  try {
    const input = documentUploadUrlBody.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().requestDocumentUploadUrl(ctx, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/onboarding/progress/document-evidence-url", async (req, res, next) => {
  try {
    const input = documentEvidenceUrlQuery.parse(req.query);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().getChecklistEvidenceSignedUrl(ctx, {
      organizationId: input.organizationId,
      checklistProgressId: input.checklistProgressId,
      membershipId: input.membershipId,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/onboarding/progress/review", async (req, res, next) => {
  try {
    const input = reviewChecklistItemSchema.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().reviewChecklistItem(ctx, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/onboarding/progress/team", async (req, res, next) => {
  try {
    const input = listTeamOnboardingProgressSchema.parse(req.query);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().listTeamOnboardingProgress(ctx, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/onboarding/progress/document-reviews", async (req, res, next) => {
  try {
    const input = listDocumentReviewsQuery.parse(req.query);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().listPendingDocumentReviews(ctx, {
      organizationId: input.organizationId,
      limit: input.limit,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/onboarding/progress/document-reviews/count", async (req, res, next) => {
  try {
    const input = orgIdQuerySchema.parse(req.query);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().countPendingDocumentReviews(ctx, {
      organizationId: input.organizationId,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/onboarding/sync-status", async (req, res, next) => {
  try {
    const input = syncOnboardingStatusSchema.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().syncOnboardingStatuses(ctx, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/org/memberships", async (req, res, next) => {
  try {
    const { organizationId } = orgIdQuerySchema.parse(req.query);
    const ctx = await resolveAuthContext(req, organizationId);
    const result = await getHandlers().listOrgMemberships(ctx, organizationId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/org/onboarding-templates", async (req, res, next) => {
  try {
    const { organizationId } = orgIdQuerySchema.parse(req.query);
    const ctx = await resolveAuthContext(req, organizationId);
    const result = await getHandlers().listPublishedOnboardingTemplates(ctx, organizationId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/org/audit-logs", async (req, res, next) => {
  try {
    const q = listAuditLogsQuery.parse(req.query);
    const ctx = await resolveAuthContext(req, q.organizationId);
    const result = await getHandlers().listOrgAuditLogs(ctx, {
      organizationId: q.organizationId,
      limit: q.limit,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/learn/quizzes", async (req, res, next) => {
  try {
    const input = listCourseQuizzesQuery.parse(req.query);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().listCourseQuizzesForLearner(ctx, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/learn/quiz-attempts/start", async (req, res, next) => {
  try {
    const input = startQuizAttemptBody.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().startQuizAttempt(ctx, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/learn/quiz-attempts/:attemptId", async (req, res, next) => {
  try {
    const q = learnerQuizContextQuery.parse(req.query);
    const attemptId = z.string().uuid().parse(req.params.attemptId);
    const ctx = await resolveAuthContext(req, q.organizationId);
    const result = await getHandlers().getQuizAttemptView(ctx, {
      organizationId: q.organizationId,
      membershipId: q.membershipId,
      attemptId,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/learn/quiz-attempts/submit", async (req, res, next) => {
  try {
    const input = submitQuizAttemptBody.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().submitQuizAttempt(ctx, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/learn/enrollments/complete", async (req, res, next) => {
  try {
    const input = completeEnrollmentBody.parse(req.body);
    const ctx = await resolveAuthContext(req, input.organizationId);
    const result = await getHandlers().completeCourseEnrollment(ctx, input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: "ValidationError", details: err.issues });
    return;
  }

  if (err instanceof Error) {
    const isUnauthorized = err.message.startsWith("Unauthorized");
    const isForbidden =
      err.message.startsWith("Forbidden") || err.message.includes("Cross-tenant") || err.message.includes("not a member");
    const isNotFound = err.message.startsWith("Not found:");
    const isServerConfig = err.message.includes("SUPABASE_URL") || err.message.includes("SUPABASE_SERVICE_ROLE_KEY");
    const status = isServerConfig
      ? 500
      : isUnauthorized
        ? 401
        : isForbidden
          ? 403
          : isNotFound
            ? 404
            : 400;
    res.status(status).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: "InternalServerError" });
});
