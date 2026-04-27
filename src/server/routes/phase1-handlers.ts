import { randomBytes } from "node:crypto";
import { hasPermission, type AppRole } from "../../contracts/rbac";
import type { AuthContext } from "../lib/auth-context";
import { buildCertificatePdfBuffer } from "../lib/certificate-pdf";
import { isSmtpConfigured, sendOptionalSmtpMail } from "../lib/mailer";
import { requirePermission, requireTenantAccess } from "../lib/guards";
import type { EventPublisher } from "../lib/event-publisher";
import { chipCollectCreatePurchase, chipCollectIsConfigured, getChipBrandId } from "../lib/chip-collect";
import type { SupabaseClient } from "@supabase/supabase-js";

type Uuid = string;

const CHECKLIST_EVIDENCE_BUCKET = "checklist-evidence";
const DEFAULT_ONBOARDING_WINDOW_DAYS = 30;

function evidenceBasename(filename: string): string {
  const trimmed = filename.trim().replace(/\\/g, "/");
  const seg = trimmed.split("/").pop() ?? trimmed;
  return seg.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120) || "document";
}

function evidenceExtensionFromFilename(filename: string): string | null {
  const base = evidenceBasename(filename).toLowerCase();
  const m = base.match(/\.([a-z0-9]+)$/);
  if (!m) return null;
  const ext = `.${m[1]}`;
  const allowed = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);
  if (!allowed.has(ext)) return null;
  return ext;
}

function contentTypeForEvidenceExt(ext: string): string {
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function assertEvidenceObjectPathValid(args: {
  organizationId: string;
  checklistProgressId: string;
  evidenceObjectPath: string;
}): void {
  const { organizationId, checklistProgressId, evidenceObjectPath } = args;
  if (!evidenceObjectPath || evidenceObjectPath.length > 512) {
    throw new Error("Invalid evidence path.");
  }
  if (evidenceObjectPath.includes("..") || evidenceObjectPath.startsWith("/")) {
    throw new Error("Invalid evidence path.");
  }
  const prefix = `${organizationId}/${checklistProgressId}/`;
  if (!evidenceObjectPath.startsWith(prefix)) {
    throw new Error("Evidence file does not match this checklist item.");
  }
}

function addDaysUtc(iso: string, days: number): string {
  const d = new Date(iso);
  d.setTime(d.getTime() + days * 86400000);
  return d.toISOString();
}

function resolveOnboardingInstanceStatus(args: {
  hasRemainingRequiredWork: boolean;
  targetEndAt: string | null;
}): "completed" | "overdue" | "in_progress" {
  if (!args.hasRemainingRequiredWork) return "completed";
  if (args.targetEndAt && new Date(args.targetEndAt).getTime() < Date.now()) return "overdue";
  return "in_progress";
}

function effectiveOnboardingStatus(
  dbStatus: string,
  targetEndAt: string | null,
): "assigned" | "in_progress" | "completed" | "overdue" | "cancelled" {
  if (dbStatus === "completed" || dbStatus === "cancelled") return dbStatus as "completed" | "cancelled";
  if (dbStatus === "overdue") return "overdue";
  if (targetEndAt && new Date(targetEndAt).getTime() < Date.now()) return "overdue";
  return dbStatus as "assigned" | "in_progress";
}

function hasIncompleteRequiredChecklist(
  progressRows: Array<{
    onboarding_instance_id: string;
    status: string;
    onboarding_checklist_items: unknown;
  }>,
  instanceId: string,
): boolean {
  const rows = progressRows.filter((r) => r.onboarding_instance_id === instanceId);
  if (rows.length === 0) return false;
  return rows.some((r) => {
    const item = r.onboarding_checklist_items as { required?: boolean } | null;
    const required = item?.required ?? true;
    if (!required) return false;
    return r.status !== "completed" && r.status !== "waived";
  });
}

export interface InviteMembershipInput {
  organizationId: Uuid;
  email: string;
  role: "org_admin" | "trainer" | "learner";
}

export interface CreateCourseInput {
  organizationId: Uuid;
  title: string;
  description?: string;
  category: "onboarding" | "compliance" | "skill" | "leadership";
}

export interface PublishCourseInput {
  organizationId: Uuid;
  courseId: Uuid;
}

export interface AssignCourseEnrollmentInput {
  organizationId: Uuid;
  membershipId: Uuid;
  courseId: Uuid;
}

export interface ListQuizzesForCourseStaffInput {
  organizationId: Uuid;
  courseId: Uuid;
}

export interface CreateQuizDraftInput {
  organizationId: Uuid;
  courseId: Uuid;
  title: string;
  description?: string;
  passMarkPercent: number;
}

export interface AddQuizMcqQuestionInput {
  organizationId: Uuid;
  quizId: Uuid;
  prompt: string;
  options: string[];
  correctIndex: number;
}

export interface PublishQuizInput {
  organizationId: Uuid;
  quizId: Uuid;
}

export interface ListCourseContentStaffInput {
  organizationId: Uuid;
  courseId: Uuid;
}

export interface AddCourseContentItemInput {
  organizationId: Uuid;
  courseId: Uuid;
  type: "video" | "pdf" | "slide" | "attachment";
  title: string;
  resourceUrl: string;
  isRequired: boolean;
}

export interface CreateLearningPathDraftInput {
  organizationId: Uuid;
  name: string;
  description?: string;
}

export interface AddLearningPathCourseStepInput {
  organizationId: Uuid;
  learningPathId: Uuid;
  courseId: Uuid;
  required: boolean;
  dueOffsetDays?: number | null;
}

export interface PublishLearningPathInput {
  organizationId: Uuid;
  learningPathId: Uuid;
}

export interface AssignLearningPathCoursesInput {
  organizationId: Uuid;
  membershipId: Uuid;
  learningPathId: Uuid;
}

export interface AssignOnboardingInput {
  organizationId: Uuid;
  membershipId: Uuid;
  onboardingTemplateId: Uuid;
  triggerSource: "new_employee" | "role_assigned" | "manual";
}

export interface ListMyAssignmentsInput {
  organizationId: Uuid;
  membershipId: Uuid;
}

export interface ListMyCertificatesInput {
  organizationId: Uuid;
  membershipId: Uuid;
}

export interface DownloadMyCertificatePdfInput {
  organizationId: Uuid;
  membershipId: Uuid;
  credentialCode: string;
}

export interface ListOrgCertificatesInput {
  organizationId: Uuid;
  limit?: number;
}

export interface ListMyOnboardingProgressInput {
  organizationId: Uuid;
  membershipId: Uuid;
}

export interface CompleteChecklistItemInput {
  organizationId: Uuid;
  membershipId: Uuid;
  checklistProgressId: Uuid;
  /** Storage object path inside checklist-evidence bucket (from upload-url response). */
  evidenceObjectPath?: string;
}

export interface RequestDocumentUploadUrlInput {
  organizationId: Uuid;
  membershipId: Uuid;
  checklistProgressId: Uuid;
  filename: string;
}

export interface GetChecklistEvidenceSignedUrlInput {
  organizationId: Uuid;
  checklistProgressId: Uuid;
  /** Required when caller is a learner (self download). */
  membershipId?: Uuid;
}

export interface ReviewChecklistItemInput {
  organizationId: Uuid;
  checklistProgressId: Uuid;
  action: "failed" | "waived";
  note?: string;
}

export interface ListTeamOnboardingProgressInput {
  organizationId: Uuid;
  status?: "assigned" | "in_progress" | "completed" | "overdue" | "cancelled";
  membershipId?: Uuid;
  templateId?: Uuid;
  limit?: number;
}

export interface SyncOnboardingStatusInput {
  organizationId: Uuid;
  maxRows?: number;
}

export interface ListCourseQuizzesInput {
  organizationId: Uuid;
  membershipId: Uuid;
  courseId: Uuid;
}

export interface StartQuizAttemptInput {
  organizationId: Uuid;
  membershipId: Uuid;
  quizId: Uuid;
}

export interface SubmitQuizAttemptInput {
  organizationId: Uuid;
  membershipId: Uuid;
  attemptId: Uuid;
  answers: Array<{ questionId: Uuid; choiceIndex: number }>;
}

export interface GetQuizAttemptViewInput {
  organizationId: Uuid;
  membershipId: Uuid;
  attemptId: Uuid;
}

export interface CompleteEnrollmentInput {
  organizationId: Uuid;
  membershipId: Uuid;
  enrollmentId: Uuid;
}

export interface ListPendingDocumentReviewsInput {
  organizationId: Uuid;
  limit?: number;
}

export interface ListMyNotificationsInput {
  organizationId: Uuid;
  limit?: number;
  unreadOnly?: boolean;
}

export interface MarkNotificationsReadInput {
  organizationId: Uuid;
  notificationIds: Uuid[];
}

export interface MarkAllNotificationsReadInput {
  organizationId: Uuid;
}

export interface ListOrgAuditLogsInput {
  organizationId: Uuid;
  limit?: number;
}

export interface CreateChipCollectCheckoutInput {
  organizationId: Uuid;
  targetPlan: "growth" | "enterprise";
}

export interface GetOrganizationBillingStatusInput {
  organizationId: Uuid;
}

function publicWebAppBaseUrl(): string {
  const raw =
    process.env.PUBLIC_WEB_APP_URL?.trim() ||
    process.env.WEB_APP_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    throw new Error(
      "Set PUBLIC_WEB_APP_URL (for example http://localhost:3000) so CHIP Collect redirect URLs can be built.",
    );
  }
  return raw.replace(/\/+$/, "");
}

function readMcqCorrectIndex(correct: unknown): number | null {
  if (correct == null) return null;
  if (typeof correct === "number" && Number.isInteger(correct)) return correct;
  const o = correct as { correctIndex?: number };
  if (typeof o.correctIndex === "number" && Number.isInteger(o.correctIndex)) return o.correctIndex;
  return null;
}

function parseOptionsJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

export class Phase1Handlers {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly events: EventPublisher,
  ) {}

  async inviteMembership(ctx: AuthContext, input: InviteMembershipInput): Promise<{ invited: true }> {
    requirePermission(ctx, "membership.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data: invitedUser, error: inviteError } = await this.supabase.auth.admin.inviteUserByEmail(
      input.email,
      {
        data: {
          organization_id: input.organizationId,
          role: input.role,
        },
      },
    );

    if (inviteError) {
      throw new Error(`Failed to invite user: ${inviteError.message}`);
    }

    if (!invitedUser.user?.id) {
      throw new Error("Invite succeeded but user id is missing in response.");
    }

    const { error: membershipError } = await this.supabase.from("memberships").insert({
      organization_id: input.organizationId,
      user_id: invitedUser.user.id,
      role: input.role,
      employment_status: "invited",
    });

    if (membershipError) {
      throw new Error(`Failed to create membership: ${membershipError.message}`);
    }

    return { invited: true };
  }

  async createCourse(ctx: AuthContext, input: CreateCourseInput): Promise<{ created: true; courseId: Uuid }> {
    requirePermission(ctx, "course.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data: actorMem, error: actorMemErr } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .maybeSingle();

    if (actorMemErr) {
      throw new Error(`Failed to resolve author membership: ${actorMemErr.message}`);
    }

    const { data, error } = await this.supabase
      .from("courses")
      .insert({
        organization_id: input.organizationId,
        created_by_membership_id: (actorMem?.id as string | undefined) ?? null,
        title: input.title,
        description: input.description ?? null,
        category: input.category,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to create course: ${error.message}`);
    }

    const courseId = data.id as Uuid;
    return { created: true, courseId };
  }

  async listOrgCourses(
    ctx: AuthContext,
    organizationId: Uuid,
  ): Promise<{
    items: Array<{
      id: string;
      title: string;
      description: string | null;
      category: string;
      status: string;
      updatedAt: string;
    }>;
  }> {
    requirePermission(ctx, "course.manage");
    requireTenantAccess(ctx, organizationId);

    const { data, error } = await this.supabase
      .from("courses")
      .select("id, title, description, category, status, updated_at")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to load courses: ${error.message}`);
    }

    const items = (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      category: row.category as string,
      status: row.status as string,
      updatedAt: row.updated_at as string,
    }));

    return { items };
  }

  async publishCourse(ctx: AuthContext, input: PublishCourseInput): Promise<{ published: true }> {
    requirePermission(ctx, "course.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data: course, error: loadErr } = await this.supabase
      .from("courses")
      .select("id, status")
      .eq("id", input.courseId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (loadErr || !course) {
      throw new Error("Course not found in this organization.");
    }

    const status = course.status as string;
    if (status === "published") {
      return { published: true };
    }
    if (status !== "draft") {
      throw new Error("Only draft courses can be published.");
    }

    const { error: updErr } = await this.supabase
      .from("courses")
      .update({ status: "published" })
      .eq("id", input.courseId)
      .eq("organization_id", input.organizationId);

    if (updErr) {
      throw new Error(`Failed to publish course: ${updErr.message}`);
    }

    return { published: true };
  }

  async assignCourseEnrollment(ctx: AuthContext, input: AssignCourseEnrollmentInput): Promise<{ assigned: true; enrollmentId: Uuid }> {
    requirePermission(ctx, "course.assign");
    requireTenantAccess(ctx, input.organizationId);

    const { data: course, error: courseErr } = await this.supabase
      .from("courses")
      .select("id, status, title")
      .eq("id", input.courseId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (courseErr || !course || (course.status as string) !== "published") {
      throw new Error("Course not found or not published.");
    }

    const courseTitle = (course.title as string | undefined)?.trim() || "Course";

    const { data: learnerMem, error: memErr } = await this.supabase
      .from("memberships")
      .select("id, role, user_id")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (memErr || !learnerMem || (learnerMem.role as string) !== "learner") {
      throw new Error("Target membership must be a learner in this organization.");
    }

    const learnerUserId = learnerMem.user_id as string;

    const { data: activeDupRows, error: dupErr } = await this.supabase
      .from("enrollments")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("membership_id", input.membershipId)
      .eq("course_id", input.courseId)
      .in("status", ["assigned", "in_progress", "overdue"])
      .limit(1);

    if (dupErr) {
      throw new Error(`Failed to check existing enrollments: ${dupErr.message}`);
    }
    if (activeDupRows && activeDupRows.length > 0) {
      throw new Error("This learner already has an active enrollment for this course.");
    }

    const { data: assignerMem } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .maybeSingle();

    const assignedAt = new Date().toISOString();

    const { data: enrollment, error: insErr } = await this.supabase
      .from("enrollments")
      .insert({
        organization_id: input.organizationId,
        membership_id: input.membershipId,
        assignment_type: "course",
        course_id: input.courseId,
        assigned_by_membership_id: (assignerMem?.id as string | undefined) ?? null,
        source: "manual",
        status: "assigned",
        assigned_at: assignedAt,
      })
      .select("id")
      .single();

    if (insErr || !enrollment) {
      throw new Error(`Failed to create enrollment: ${insErr?.message ?? "unknown"}`);
    }

    const enrollmentId = enrollment.id as Uuid;

    try {
      await this.events.publish(
        "course.assigned",
        { enrollmentId, assignmentType: "course" },
        ctx,
      );
    } catch {
      /* ignore */
    }

    try {
      await this.notifyLearnerCourseAssigned(ctx, {
        organizationId: input.organizationId,
        learnerUserId,
        learnerMembershipId: input.membershipId,
        courseTitle,
        enrollmentId,
      });
    } catch (err) {
      console.error("[notifications] learner course assign notify failed:", err);
    }

    return { assigned: true, enrollmentId };
  }

  async listQuizzesForCourseStaff(
    ctx: AuthContext,
    input: ListQuizzesForCourseStaffInput,
  ): Promise<{
    items: Array<{ id: string; title: string; status: string; passMarkPercent: number; questionCount: number }>;
  }> {
    requirePermission(ctx, "quiz.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data: course, error: courseErr } = await this.supabase
      .from("courses")
      .select("id")
      .eq("id", input.courseId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (courseErr || !course) {
      throw new Error("Course not found in this organization.");
    }

    const { data: quizRows, error: quizErr } = await this.supabase
      .from("quizzes")
      .select("id, title, status, pass_mark_percent")
      .eq("organization_id", input.organizationId)
      .eq("course_id", input.courseId)
      .order("updated_at", { ascending: false });

    if (quizErr) {
      throw new Error(`Failed to load quizzes: ${quizErr.message}`);
    }

    const quizzes = quizRows ?? [];
    const quizIds = quizzes.map((q) => q.id as string);
    const countByQuiz = new Map<string, number>();
    if (quizIds.length > 0) {
      const { data: qcRows, error: qcErr } = await this.supabase
        .from("quiz_questions")
        .select("quiz_id")
        .eq("organization_id", input.organizationId)
        .eq("question_type", "mcq")
        .in("quiz_id", quizIds);

      if (qcErr) {
        throw new Error(`Failed to count quiz questions: ${qcErr.message}`);
      }
      for (const row of qcRows ?? []) {
        const qid = row.quiz_id as string;
        countByQuiz.set(qid, (countByQuiz.get(qid) ?? 0) + 1);
      }
    }

    const items = quizzes.map((row) => ({
      id: row.id as string,
      title: row.title as string,
      status: row.status as string,
      passMarkPercent: Number(row.pass_mark_percent ?? 70),
      questionCount: countByQuiz.get(row.id as string) ?? 0,
    }));

    return { items };
  }

  async createQuizDraft(ctx: AuthContext, input: CreateQuizDraftInput): Promise<{ created: true; quizId: Uuid }> {
    requirePermission(ctx, "quiz.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data: course, error: courseErr } = await this.supabase
      .from("courses")
      .select("id")
      .eq("id", input.courseId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (courseErr || !course) {
      throw new Error("Course not found in this organization.");
    }

    const { data: actorMem } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .maybeSingle();

    const pass = Math.min(100, Math.max(1, Math.floor(input.passMarkPercent)));

    const { data: inserted, error: insErr } = await this.supabase
      .from("quizzes")
      .insert({
        organization_id: input.organizationId,
        course_id: input.courseId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        pass_mark_percent: pass,
        status: "draft",
        created_by_membership_id: (actorMem?.id as string | undefined) ?? null,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      throw new Error(`Failed to create quiz: ${insErr?.message ?? "unknown"}`);
    }

    return { created: true, quizId: inserted.id as Uuid };
  }

  async addQuizMcqQuestion(ctx: AuthContext, input: AddQuizMcqQuestionInput): Promise<{ added: true; questionId: Uuid }> {
    requirePermission(ctx, "quiz.manage");
    requireTenantAccess(ctx, input.organizationId);

    const options = input.options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (options.length < 2 || options.length > 10) {
      throw new Error("Provide between 2 and 10 non-empty answer options.");
    }
    if (!Number.isInteger(input.correctIndex) || input.correctIndex < 0 || input.correctIndex >= options.length) {
      throw new Error("correctIndex must match one of the options.");
    }

    const { data: quiz, error: quizErr } = await this.supabase
      .from("quizzes")
      .select("id, status, course_id")
      .eq("id", input.quizId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (quizErr || !quiz || (quiz.status as string) !== "draft") {
      throw new Error("Quiz not found or not editable (draft only).");
    }

    const { data: maxRow } = await this.supabase
      .from("quiz_questions")
      .select("order_index")
      .eq("organization_id", input.organizationId)
      .eq("quiz_id", input.quizId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    const maxIdx = maxRow != null ? (maxRow.order_index as number | undefined) : undefined;
    const nextOrder = maxIdx != null && Number.isFinite(maxIdx) ? maxIdx + 1 : 1;

    const { data: qRow, error: qErr } = await this.supabase
      .from("quiz_questions")
      .insert({
        organization_id: input.organizationId,
        quiz_id: input.quizId,
        question_type: "mcq",
        prompt: input.prompt.trim(),
        options_json: options,
        correct_answer_json: { correctIndex: input.correctIndex },
        order_index: nextOrder,
        points: 1,
      })
      .select("id")
      .single();

    if (qErr || !qRow) {
      throw new Error(`Failed to add question: ${qErr?.message ?? "unknown"}`);
    }

    return { added: true, questionId: qRow.id as Uuid };
  }

  async publishQuiz(ctx: AuthContext, input: PublishQuizInput): Promise<{ published: true }> {
    requirePermission(ctx, "quiz.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data: quiz, error: quizErr } = await this.supabase
      .from("quizzes")
      .select("id, status")
      .eq("id", input.quizId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (quizErr || !quiz) {
      throw new Error("Quiz not found.");
    }

    if ((quiz.status as string) === "published") {
      return { published: true };
    }
    if ((quiz.status as string) !== "draft") {
      throw new Error("Only draft quizzes can be published.");
    }

    const questions = await this.loadMcqQuestionsForQuiz(input.organizationId, input.quizId, true);
    const scored = questions.filter((q) => q.correctIndex != null && q.options.length >= 2);
    if (scored.length === 0) {
      throw new Error("Add at least one multiple-choice question with a valid correct answer before publishing.");
    }

    const { error: updErr } = await this.supabase
      .from("quizzes")
      .update({ status: "published" })
      .eq("id", input.quizId)
      .eq("organization_id", input.organizationId);

    if (updErr) {
      throw new Error(`Failed to publish quiz: ${updErr.message}`);
    }

    return { published: true };
  }

  async listCourseContentForStaff(
    ctx: AuthContext,
    input: ListCourseContentStaffInput,
  ): Promise<{
    items: Array<{
      id: string;
      type: string;
      title: string;
      resourceUrl: string | null;
      isRequired: boolean;
      orderIndex: number;
    }>;
  }> {
    requirePermission(ctx, "course.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data: course, error: courseErr } = await this.supabase
      .from("courses")
      .select("id")
      .eq("id", input.courseId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (courseErr || !course) {
      throw new Error("Course not found in this organization.");
    }

    const { data: rows, error } = await this.supabase
      .from("course_content_items")
      .select("id, type, title, resource_url, is_required, order_index")
      .eq("organization_id", input.organizationId)
      .eq("course_id", input.courseId)
      .order("order_index", { ascending: true });

    if (error) {
      throw new Error(`Failed to load course content: ${error.message}`);
    }

    const items = (rows ?? []).map((row) => ({
      id: row.id as string,
      type: row.type as string,
      title: row.title as string,
      resourceUrl: (row.resource_url as string | null) ?? null,
      isRequired: Boolean(row.is_required),
      orderIndex: Number(row.order_index ?? 0),
    }));

    return { items };
  }

  async addCourseContentItem(ctx: AuthContext, input: AddCourseContentItemInput): Promise<{ created: true; itemId: Uuid }> {
    requirePermission(ctx, "course.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data: course, error: courseErr } = await this.supabase
      .from("courses")
      .select("id")
      .eq("id", input.courseId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (courseErr || !course) {
      throw new Error("Course not found in this organization.");
    }

    const url = input.resourceUrl.trim();
    if (url.length < 4) {
      throw new Error("resourceUrl is required (link to video, PDF, or file).");
    }

    const { data: maxRow } = await this.supabase
      .from("course_content_items")
      .select("order_index")
      .eq("organization_id", input.organizationId)
      .eq("course_id", input.courseId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    const maxIdx = maxRow != null ? (maxRow.order_index as number | undefined) : undefined;
    const nextOrder = maxIdx != null && Number.isFinite(maxIdx) ? maxIdx + 1 : 1;

    const { data: inserted, error: insErr } = await this.supabase
      .from("course_content_items")
      .insert({
        organization_id: input.organizationId,
        course_id: input.courseId,
        order_index: nextOrder,
        type: input.type,
        title: input.title.trim(),
        resource_url: url,
        is_required: input.isRequired,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      throw new Error(`Failed to add content item: ${insErr?.message ?? "unknown"}`);
    }

    return { created: true, itemId: inserted.id as Uuid };
  }

  async listOrgLearningPaths(
    ctx: AuthContext,
    organizationId: Uuid,
  ): Promise<{ items: Array<{ id: string; name: string; status: string; stepCount: number }> }> {
    requirePermission(ctx, "learning_path.manage");
    requireTenantAccess(ctx, organizationId);

    const { data: paths, error } = await this.supabase
      .from("learning_paths")
      .select("id, name, status")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to load learning paths: ${error.message}`);
    }

    const pathIds = (paths ?? []).map((p) => p.id as string);
    const countByPath = new Map<string, number>();
    if (pathIds.length > 0) {
      const { data: stepRows, error: stepErr } = await this.supabase
        .from("learning_path_steps")
        .select("learning_path_id")
        .eq("organization_id", organizationId)
        .in("learning_path_id", pathIds);

      if (stepErr) {
        throw new Error(`Failed to count path steps: ${stepErr.message}`);
      }
      for (const r of stepRows ?? []) {
        const pid = r.learning_path_id as string;
        countByPath.set(pid, (countByPath.get(pid) ?? 0) + 1);
      }
    }

    const items = (paths ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      status: row.status as string,
      stepCount: countByPath.get(row.id as string) ?? 0,
    }));

    return { items };
  }

  async createLearningPathDraft(
    ctx: AuthContext,
    input: CreateLearningPathDraftInput,
  ): Promise<{ created: true; learningPathId: Uuid }> {
    requirePermission(ctx, "learning_path.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data: actorMem } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .maybeSingle();

    const { data: inserted, error: insErr } = await this.supabase
      .from("learning_paths")
      .insert({
        organization_id: input.organizationId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        path_type: "custom",
        status: "draft",
        created_by_membership_id: (actorMem?.id as string | undefined) ?? null,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      throw new Error(`Failed to create learning path: ${insErr?.message ?? "unknown"}`);
    }

    return { created: true, learningPathId: inserted.id as Uuid };
  }

  async listLearningPathStepsStaff(
    ctx: AuthContext,
    args: { organizationId: Uuid; learningPathId: Uuid },
  ): Promise<{
    items: Array<{
      id: string;
      stepOrder: number;
      stepType: string;
      courseId: string | null;
      courseTitle: string | null;
      required: boolean;
      dueOffsetDays: number | null;
    }>;
  }> {
    requirePermission(ctx, "learning_path.manage");
    requireTenantAccess(ctx, args.organizationId);

    const { data: path, error: pathErr } = await this.supabase
      .from("learning_paths")
      .select("id")
      .eq("id", args.learningPathId)
      .eq("organization_id", args.organizationId)
      .maybeSingle();

    if (pathErr || !path) {
      throw new Error("Learning path not found in this organization.");
    }

    const { data: rows, error } = await this.supabase
      .from("learning_path_steps")
      .select("id, step_order, step_type, course_id, required, due_offset_days, courses(title)")
      .eq("organization_id", args.organizationId)
      .eq("learning_path_id", args.learningPathId)
      .order("step_order", { ascending: true });

    if (error) {
      throw new Error(`Failed to load path steps: ${error.message}`);
    }

    const items = (rows ?? []).map((row) => {
      const c = row.courses as unknown as { title?: string } | null;
      return {
        id: row.id as string,
        stepOrder: Number(row.step_order ?? 0),
        stepType: row.step_type as string,
        courseId: (row.course_id as string | null) ?? null,
        courseTitle: c?.title ?? null,
        required: Boolean(row.required),
        dueOffsetDays: (row.due_offset_days as number | null) ?? null,
      };
    });

    return { items };
  }

  async addLearningPathCourseStep(ctx: AuthContext, input: AddLearningPathCourseStepInput): Promise<{ added: true }> {
    requirePermission(ctx, "learning_path.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data: path, error: pathErr } = await this.supabase
      .from("learning_paths")
      .select("id, status")
      .eq("id", input.learningPathId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (pathErr || !path || (path.status as string) !== "draft") {
      throw new Error("Learning path not found or not editable (draft only).");
    }

    const { data: course, error: courseErr } = await this.supabase
      .from("courses")
      .select("id, status")
      .eq("id", input.courseId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (courseErr || !course || (course.status as string) !== "published") {
      throw new Error("Course not found or not published — only published courses can be added to a path.");
    }

    const { data: maxRow } = await this.supabase
      .from("learning_path_steps")
      .select("step_order")
      .eq("organization_id", input.organizationId)
      .eq("learning_path_id", input.learningPathId)
      .order("step_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const maxOrder = maxRow != null ? (maxRow.step_order as number | undefined) : undefined;
    const nextOrder = maxOrder != null && Number.isFinite(maxOrder) ? maxOrder + 1 : 1;

    const due =
      input.dueOffsetDays != null && Number.isFinite(input.dueOffsetDays)
        ? Math.max(0, Math.floor(input.dueOffsetDays))
        : null;

    const { error: insErr } = await this.supabase.from("learning_path_steps").insert({
      organization_id: input.organizationId,
      learning_path_id: input.learningPathId,
      step_order: nextOrder,
      step_type: "course",
      course_id: input.courseId,
      required: input.required,
      due_offset_days: due,
    });

    if (insErr) {
      throw new Error(`Failed to add path step: ${insErr.message}`);
    }

    return { added: true };
  }

  async publishLearningPath(ctx: AuthContext, input: PublishLearningPathInput): Promise<{ published: true }> {
    requirePermission(ctx, "learning_path.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data: path, error: pathErr } = await this.supabase
      .from("learning_paths")
      .select("id, status")
      .eq("id", input.learningPathId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (pathErr || !path) {
      throw new Error("Learning path not found.");
    }

    if ((path.status as string) === "published") {
      return { published: true };
    }
    if ((path.status as string) !== "draft") {
      throw new Error("Only draft learning paths can be published.");
    }

    const { data: steps, error: stepErr } = await this.supabase
      .from("learning_path_steps")
      .select("step_type, course_id")
      .eq("organization_id", input.organizationId)
      .eq("learning_path_id", input.learningPathId)
      .order("step_order", { ascending: true });

    if (stepErr) {
      throw new Error(`Failed to load steps: ${stepErr.message}`);
    }

    const courseSteps = (steps ?? []).filter((s) => (s.step_type as string) === "course" && s.course_id);
    if (courseSteps.length === 0) {
      throw new Error("Add at least one course step before publishing.");
    }

    const courseIds = [...new Set(courseSteps.map((s) => s.course_id as string))];
    const { data: courses, error: cErr } = await this.supabase
      .from("courses")
      .select("id, status")
      .eq("organization_id", input.organizationId)
      .in("id", courseIds);

    if (cErr || !courses || courses.length !== courseIds.length) {
      throw new Error("One or more courses on this path are missing or not in this organization.");
    }
    for (const c of courses) {
      if ((c.status as string) !== "published") {
        throw new Error("All courses on the path must be published before the path can go live.");
      }
    }

    const { error: updErr } = await this.supabase
      .from("learning_paths")
      .update({ status: "published" })
      .eq("id", input.learningPathId)
      .eq("organization_id", input.organizationId);

    if (updErr) {
      throw new Error(`Failed to publish learning path: ${updErr.message}`);
    }

    return { published: true };
  }

  async assignLearningPathCourses(ctx: AuthContext, input: AssignLearningPathCoursesInput): Promise<{
    assigned: true;
    coursesAssigned: number;
    enrollmentIds: Uuid[];
  }> {
    requirePermission(ctx, "course.assign");
    requireTenantAccess(ctx, input.organizationId);

    const { data: path, error: pathErr } = await this.supabase
      .from("learning_paths")
      .select("id, status, name")
      .eq("id", input.learningPathId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (pathErr || !path || (path.status as string) !== "published") {
      throw new Error("Learning path not found or not published.");
    }

    const pathName = (path.name as string | undefined)?.trim() || "Learning path";

    const { data: learnerMem, error: memErr } = await this.supabase
      .from("memberships")
      .select("id, role, user_id")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (memErr || !learnerMem || (learnerMem.role as string) !== "learner") {
      throw new Error("Target membership must be a learner in this organization.");
    }

    const learnerUserId = learnerMem.user_id as string;

    const { data: stepRows, error: stepErr } = await this.supabase
      .from("learning_path_steps")
      .select("step_order, step_type, course_id")
      .eq("organization_id", input.organizationId)
      .eq("learning_path_id", input.learningPathId)
      .order("step_order", { ascending: true });

    if (stepErr) {
      throw new Error(`Failed to load path steps: ${stepErr.message}`);
    }

    const orderedCourseIds: Uuid[] = [];
    const seen = new Set<string>();
    for (const row of stepRows ?? []) {
      if ((row.step_type as string) !== "course") continue;
      const cid = row.course_id as string | null;
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      orderedCourseIds.push(cid);
    }

    if (orderedCourseIds.length === 0) {
      throw new Error("This learning path has no assignable course steps.");
    }

    const { data: assignerMem } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .maybeSingle();

    const assignedAt = new Date().toISOString();
    const enrollmentIds: Uuid[] = [];

    for (const courseId of orderedCourseIds) {
      const { data: course, error: courseLookupErr } = await this.supabase
        .from("courses")
        .select("id, status")
        .eq("id", courseId)
        .eq("organization_id", input.organizationId)
        .maybeSingle();

      if (courseLookupErr || !course || (course.status as string) !== "published") {
        throw new Error(`Course ${courseId} is not available on this path.`);
      }

      const { data: activeDupRows, error: dupErr } = await this.supabase
        .from("enrollments")
        .select("id")
        .eq("organization_id", input.organizationId)
        .eq("membership_id", input.membershipId)
        .eq("course_id", courseId)
        .in("status", ["assigned", "in_progress", "overdue"])
        .limit(1);

      if (dupErr) {
        throw new Error(`Failed to check enrollments: ${dupErr.message}`);
      }
      if (activeDupRows && activeDupRows.length > 0) {
        continue;
      }

      const { data: enrollment, error: insErr } = await this.supabase
        .from("enrollments")
        .insert({
          organization_id: input.organizationId,
          membership_id: input.membershipId,
          assignment_type: "course",
          course_id: courseId,
          assigned_by_membership_id: (assignerMem?.id as string | undefined) ?? null,
          source: "manual",
          status: "assigned",
          assigned_at: assignedAt,
        })
        .select("id")
        .single();

      if (insErr || !enrollment) {
        throw new Error(`Failed to create enrollment: ${insErr?.message ?? "unknown"}`);
      }

      const enrollmentId = enrollment.id as Uuid;
      enrollmentIds.push(enrollmentId);

      try {
        await this.events.publish(
          "course.assigned",
          { enrollmentId, assignmentType: "course" },
          ctx,
        );
      } catch {
        /* ignore */
      }
    }

    if (enrollmentIds.length === 0) {
      throw new Error("Learner already has active enrollments for every course on this path.");
    }

    try {
      await this.notifyLearnerLearningPathAssigned(ctx, {
        organizationId: input.organizationId,
        learnerUserId,
        learnerMembershipId: input.membershipId,
        pathName,
        coursesAssigned: enrollmentIds.length,
        learningPathId: input.learningPathId,
        enrollmentIds,
      });
    } catch (err) {
      console.error("[notifications] learner path assign notify failed:", err);
    }

    return { assigned: true, coursesAssigned: enrollmentIds.length, enrollmentIds };
  }

  async listOrgMemberships(
    ctx: AuthContext,
    organizationId: Uuid,
  ): Promise<{ items: Array<{ id: string; role: string; email: string | null }> }> {
    requirePermission(ctx, "course.assign");
    requireTenantAccess(ctx, organizationId);

    const { data: rows, error } = await this.supabase
      .from("memberships")
      .select("id, role, user_id")
      .eq("organization_id", organizationId)
      .order("joined_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to load memberships: ${error.message}`);
    }

    const items: Array<{ id: string; role: string; email: string | null }> = [];
    for (const row of rows ?? []) {
      const userId = row.user_id as string;
      const { data, error: _userError } = await this.supabase.auth.admin.getUserById(userId);
      if (_userError) {
        items.push({ id: row.id as string, role: row.role as string, email: null });
      } else {
        items.push({ id: row.id as string, role: row.role as string, email: data.user?.email ?? null });
      }
    }

    return { items };
  }

  async listOrgAuditLogs(
    ctx: AuthContext,
    input: ListOrgAuditLogsInput,
  ): Promise<{
    items: Array<{
      id: string;
      actorUserId: string | null;
      actorEmail: string | null;
      actorRole: string;
      actionKey: string;
      targetType: string;
      targetId: string | null;
      metadataJson: Record<string, unknown>;
      createdAt: string;
    }>;
  }> {
    requirePermission(ctx, "audit.read");
    requireTenantAccess(ctx, input.organizationId);

    const limit = Math.min(Math.max(input.limit ?? 40, 1), 100);

    const { data: rows, error } = await this.supabase
      .from("audit_logs")
      .select("id, actor_user_id, actor_role, action_key, target_type, target_id, metadata_json, created_at")
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to load audit logs: ${error.message}`);
    }

    const actorIds = [
      ...new Set((rows ?? []).map((r) => r.actor_user_id as string | null).filter((id): id is string => Boolean(id))),
    ];
    const emailByUserId = new Map<string, string | null>();
    for (const uid of actorIds.slice(0, 40)) {
      const { data, error: userErr } = await this.supabase.auth.admin.getUserById(uid);
      if (userErr) {
        emailByUserId.set(uid, null);
      } else {
        emailByUserId.set(uid, data.user?.email ?? null);
      }
    }

    const items = (rows ?? []).map((row) => {
      const aid = (row.actor_user_id as string | null) ?? null;
      return {
        id: row.id as string,
        actorUserId: aid,
        actorEmail: aid ? (emailByUserId.get(aid) ?? null) : null,
        actorRole: row.actor_role as string,
        actionKey: row.action_key as string,
        targetType: row.target_type as string,
        targetId: (row.target_id as string | null) ?? null,
        metadataJson: (row.metadata_json as Record<string, unknown>) ?? {},
        createdAt: row.created_at as string,
      };
    });

    return { items };
  }

  async listPublishedOnboardingTemplates(
    ctx: AuthContext,
    organizationId: Uuid,
  ): Promise<{ items: Array<{ id: string; name: string; status: string }> }> {
    requirePermission(ctx, "course.assign");
    requireTenantAccess(ctx, organizationId);

    const { data, error } = await this.supabase
      .from("onboarding_templates")
      .select("id, name, status")
      .eq("organization_id", organizationId)
      .eq("status", "published")
      .order("name", { ascending: true });

    if (error) {
      throw new Error(`Failed to load onboarding templates: ${error.message}`);
    }

    return { items: (data ?? []) as Array<{ id: string; name: string; status: string }> };
  }

  async assignOnboarding(ctx: AuthContext, input: AssignOnboardingInput): Promise<{ assigned: true }> {
    requirePermission(ctx, "course.assign");
    requireTenantAccess(ctx, input.organizationId);

    const { data: template, error: templateError } = await this.supabase
      .from("onboarding_templates")
      .select("id")
      .eq("id", input.onboardingTemplateId)
      .eq("organization_id", input.organizationId)
      .single();

    if (templateError || !template) {
      throw new Error("Onboarding template not found for this organization.");
    }

    const { data: stages, error: stagesError } = await this.supabase
      .from("onboarding_stages")
      .select("end_offset_days")
      .eq("organization_id", input.organizationId)
      .eq("onboarding_template_id", input.onboardingTemplateId);

    if (stagesError) {
      throw new Error(`Failed to load onboarding stages: ${stagesError.message}`);
    }

    const { data: checklistItems, error: checklistItemsError } = await this.supabase
      .from("onboarding_checklist_items")
      .select("id,required,due_offset_days,onboarding_stages!inner(onboarding_template_id)")
      .eq("organization_id", input.organizationId)
      .eq("onboarding_stages.onboarding_template_id", input.onboardingTemplateId);

    if (checklistItemsError) {
      throw new Error(`Failed to load onboarding checklist items: ${checklistItemsError.message}`);
    }

    const assignedAt = new Date().toISOString();
    let maxOffsetDays = 0;
    let hasOffset = false;
    for (const stage of stages ?? []) {
      const endDays = stage.end_offset_days as number | null | undefined;
      if (endDays != null && Number.isFinite(endDays)) {
        hasOffset = true;
        maxOffsetDays = Math.max(maxOffsetDays, endDays);
      }
    }
    if (!hasOffset) {
      for (const item of checklistItems ?? []) {
        const dueDays = item.due_offset_days as number | null | undefined;
        if (dueDays != null && Number.isFinite(dueDays)) {
          hasOffset = true;
          maxOffsetDays = Math.max(maxOffsetDays, dueDays);
        }
      }
    }
    if (!hasOffset) {
      maxOffsetDays = DEFAULT_ONBOARDING_WINDOW_DAYS;
    } else {
      maxOffsetDays = Math.max(1, maxOffsetDays);
    }
    const targetEndAt = addDaysUtc(assignedAt, maxOffsetDays);

    const { data: instance, error: instanceError } = await this.supabase
      .from("onboarding_instances")
      .insert({
        organization_id: input.organizationId,
        membership_id: input.membershipId,
        onboarding_template_id: input.onboardingTemplateId,
        status: "assigned",
        trigger_source: input.triggerSource,
        started_at: assignedAt,
        target_end_at: targetEndAt,
      })
      .select("id")
      .single();

    if (instanceError) {
      throw new Error(`Failed to assign onboarding: ${instanceError.message}`);
    }

    if (checklistItems && checklistItems.length > 0) {
      const checklistInsertRows = checklistItems.map((item) => ({
        organization_id: input.organizationId,
        onboarding_instance_id: instance.id as string,
        checklist_item_id: item.id as string,
        status: "not_started" as const,
        review_status: "not_required",
      }));

      const { error: checklistInsertError } = await this.supabase
        .from("checklist_progress")
        .insert(checklistInsertRows);

      if (checklistInsertError) {
        throw new Error(`Failed to initialize onboarding checklist progress: ${checklistInsertError.message}`);
      }
    }

    await this.events.publish(
      "onboarding.assigned",
      {
        onboardingInstanceId: instance.id as string,
        templateId: input.onboardingTemplateId,
        triggerSource: input.triggerSource,
      },
      ctx,
    );

    return { assigned: true };
  }

  async listMyAssignments(
    ctx: AuthContext,
    input: ListMyAssignmentsInput,
  ): Promise<{
    items: Array<{
      id: string;
      status: string;
      title: string | null;
      courseId: string | null;
      contentItems: Array<{
        id: string;
        type: string;
        title: string;
        resourceUrl: string | null;
        isRequired: boolean;
      }>;
      quizzes: Array<{ id: string; title: string }>;
    }>;
  }> {
    requirePermission(ctx, "self.learning.read");
    requireTenantAccess(ctx, input.organizationId);

    if (ctx.role !== "learner") {
      throw new Error("Only learners can access self assignments endpoint.");
    }

    const { data: membership, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .single();

    if (membershipError || !membership) {
      throw new Error("Learner membership not found for current user.");
    }

    const { data, error } = await this.supabase
      .from("enrollments")
      .select("id,status,course_id,courses(title)")
      .eq("organization_id", input.organizationId)
      .eq("membership_id", input.membershipId)
      .order("assigned_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to load assignments: ${error.message}`);
    }

    const rows = data ?? [];
    const courseIds = [...new Set(rows.map((r) => r.course_id as string | null).filter((x): x is string => Boolean(x)))];

    const quizzesByCourse = new Map<string, Array<{ id: string; title: string }>>();
    if (courseIds.length > 0) {
      const { data: quizRows, error: quizErr } = await this.supabase
        .from("quizzes")
        .select("id, title, course_id")
        .eq("organization_id", input.organizationId)
        .eq("status", "published")
        .in("course_id", courseIds)
        .order("title", { ascending: true });

      if (quizErr) {
        throw new Error(`Failed to load quizzes for assignments: ${quizErr.message}`);
      }

      for (const q of quizRows ?? []) {
        const cid = q.course_id as string | null;
        if (!cid) continue;
        const list = quizzesByCourse.get(cid) ?? [];
        list.push({ id: q.id as string, title: q.title as string });
        quizzesByCourse.set(cid, list);
      }
    }

    const materialTypes = ["video", "pdf", "slide", "attachment"] as const;
    const contentByCourse = new Map<
      string,
      Array<{ id: string; type: string; title: string; resourceUrl: string | null; isRequired: boolean }>
    >();
    if (courseIds.length > 0) {
      const { data: contentRows, error: contentErr } = await this.supabase
        .from("course_content_items")
        .select("id, course_id, type, title, resource_url, is_required, order_index")
        .eq("organization_id", input.organizationId)
        .in("course_id", courseIds)
        .in("type", [...materialTypes])
        .order("order_index", { ascending: true });

      if (contentErr) {
        throw new Error(`Failed to load course content: ${contentErr.message}`);
      }

      for (const row of contentRows ?? []) {
        const cid = row.course_id as string;
        const list = contentByCourse.get(cid) ?? [];
        list.push({
          id: row.id as string,
          type: row.type as string,
          title: row.title as string,
          resourceUrl: (row.resource_url as string | null) ?? null,
          isRequired: Boolean(row.is_required),
        });
        contentByCourse.set(cid, list);
      }
    }

    const items = rows.map((row) => {
      const c = row.courses as unknown as { title?: string } | null;
      const courseId = (row.course_id as string | null) ?? null;
      return {
        id: row.id as string,
        status: row.status as string,
        title: c?.title ?? null,
        courseId,
        contentItems: courseId ? (contentByCourse.get(courseId) ?? []) : [],
        quizzes: courseId ? (quizzesByCourse.get(courseId) ?? []) : [],
      };
    });

    return { items };
  }

  async listMyCertificates(
    ctx: AuthContext,
    input: ListMyCertificatesInput,
  ): Promise<{
    items: Array<{
      id: string;
      title: string;
      credentialCode: string;
      issuedAt: string;
      expiresAt: string | null;
      revokedAt: string | null;
      quizId: string;
    }>;
  }> {
    requirePermission(ctx, "self.learning.read");
    requireTenantAccess(ctx, input.organizationId);

    if (ctx.role !== "learner") {
      throw new Error("Only learners can list their certificates.");
    }

    const { data: membership, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .single();

    if (membershipError || !membership) {
      throw new Error("Learner membership not found for current user.");
    }

    const { data: rows, error } = await this.supabase
      .from("certificates")
      .select("id, title, credential_code, issued_at, expires_at, revoked_at, quiz_id")
      .eq("organization_id", input.organizationId)
      .eq("membership_id", input.membershipId)
      .order("issued_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to load certificates: ${error.message}`);
    }

    const items = (rows ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      credentialCode: row.credential_code as string,
      issuedAt: row.issued_at as string,
      expiresAt: (row.expires_at as string | null) ?? null,
      revokedAt: (row.revoked_at as string | null) ?? null,
      quizId: row.quiz_id as string,
    }));

    return { items };
  }

  async downloadMyCertificatePdf(
    ctx: AuthContext,
    input: DownloadMyCertificatePdfInput,
  ): Promise<{ body: Buffer; filename: string }> {
    requirePermission(ctx, "self.learning.read");
    requireTenantAccess(ctx, input.organizationId);

    if (ctx.role !== "learner") {
      throw new Error("Only learners can download their certificates.");
    }

    const { data: membership, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .single();

    if (membershipError || !membership) {
      throw new Error("Learner membership not found for current user.");
    }

    const { data: cert, error: certError } = await this.supabase
      .from("certificates")
      .select("title, credential_code, issued_at, expires_at, revoked_at")
      .eq("organization_id", input.organizationId)
      .eq("membership_id", input.membershipId)
      .eq("credential_code", input.credentialCode)
      .maybeSingle();

    if (certError) {
      throw new Error(`Failed to load certificate: ${certError.message}`);
    }
    if (!cert) {
      throw new Error("Not found: certificate");
    }
    if ((cert.revoked_at as string | null) != null) {
      throw new Error("Certificate has been revoked.");
    }
    const expAt = cert.expires_at as string | null;
    if (expAt && new Date(expAt).getTime() < Date.now()) {
      throw new Error("Certificate has expired.");
    }

    const { data: orgRow } = await this.supabase
      .from("organizations")
      .select("name")
      .eq("id", input.organizationId)
      .maybeSingle();
    const organizationName = (orgRow?.name as string | undefined) ?? "Organization";

    const { data: authUser, error: userErr } = await this.supabase.auth.admin.getUserById(ctx.userId);
    const recipientLine = userErr ? ctx.userId : (authUser.user?.email ?? ctx.userId);

    const body = await buildCertificatePdfBuffer({
      title: cert.title as string,
      credentialCode: cert.credential_code as string,
      issuedAtIso: cert.issued_at as string,
      expiresAtIso: (cert.expires_at as string | null) ?? null,
      organizationName,
      recipientLine,
    });

    const safeCode = String(cert.credential_code).replace(/[^A-Za-z0-9\-]/g, "_");
    const filename = `certificate-${safeCode}.pdf`;

    return { body, filename };
  }

  async listOrgCertificates(
    ctx: AuthContext,
    input: ListOrgCertificatesInput,
  ): Promise<{
    items: Array<{
      id: string;
      title: string;
      credentialCode: string;
      issuedAt: string;
      expiresAt: string | null;
      revokedAt: string | null;
      membershipId: string;
      learnerEmail: string | null;
      quizId: string;
    }>;
  }> {
    requirePermission(ctx, "certificate.manage");
    requireTenantAccess(ctx, input.organizationId);

    const limit = Math.min(Math.max(input.limit ?? 40, 1), 100);

    const { data: rows, error } = await this.supabase
      .from("certificates")
      .select("id, title, credential_code, issued_at, expires_at, revoked_at, membership_id, quiz_id")
      .eq("organization_id", input.organizationId)
      .order("issued_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to load certificates: ${error.message}`);
    }

    const membershipIds = [...new Set((rows ?? []).map((r) => r.membership_id as string))];
    const emailByMembership = new Map<string, string | null>();
    for (const mid of membershipIds.slice(0, 50)) {
      const { data: mem, error: memErr } = await this.supabase
        .from("memberships")
        .select("user_id")
        .eq("id", mid)
        .eq("organization_id", input.organizationId)
        .maybeSingle();
      if (memErr || !mem) {
        emailByMembership.set(mid, null);
        continue;
      }
      const { data: userData, error: userErr } = await this.supabase.auth.admin.getUserById(mem.user_id as string);
      emailByMembership.set(mid, userErr ? null : (userData.user?.email ?? null));
    }

    const items = (rows ?? []).map((row) => {
      const mid = row.membership_id as string;
      return {
        id: row.id as string,
        title: row.title as string,
        credentialCode: row.credential_code as string,
        issuedAt: row.issued_at as string,
        expiresAt: (row.expires_at as string | null) ?? null,
        revokedAt: (row.revoked_at as string | null) ?? null,
        membershipId: mid,
        learnerEmail: emailByMembership.get(mid) ?? null,
        quizId: row.quiz_id as string,
      };
    });

    return { items };
  }

  async verifyPublicCertificate(input: {
    credentialCode: string;
    organizationSlug?: string;
  }): Promise<
    | { found: false }
    | { found: true; valid: false; reason: "revoked" | "expired" }
    | {
        found: true;
        valid: true;
        title: string;
        organizationName: string;
        organizationSlug: string;
        issuedAt: string;
        expiresAt: string | null;
      }
  > {
    const code = input.credentialCode.trim();
    const { data: cert, error: certErr } = await this.supabase
      .from("certificates")
      .select("title, issued_at, expires_at, revoked_at, organization_id")
      .eq("credential_code", code)
      .maybeSingle();

    if (certErr) {
      if (!certErr.message.includes("No suitable key") && !certErr.message.includes("wrong key type")) {
        console.error("[public verify] certificate lookup:", certErr.message);
      }
      return { found: false };
    }
    if (!cert) {
      return { found: false };
    }

    const { data: org, error: orgErr } = await this.supabase
      .from("organizations")
      .select("name, slug")
      .eq("id", cert.organization_id as string)
      .maybeSingle();

    if (orgErr || !org) {
      return { found: false };
    }

    const slug = (org.slug as string).trim();
    if (input.organizationSlug && input.organizationSlug.trim().toLowerCase() !== slug.toLowerCase()) {
      return { found: false };
    }

    if ((cert.revoked_at as string | null) != null) {
      return { found: true, valid: false, reason: "revoked" };
    }

    const exp = cert.expires_at as string | null;
    if (exp && new Date(exp).getTime() < Date.now()) {
      return { found: true, valid: false, reason: "expired" };
    }

    return {
      found: true,
      valid: true,
      title: cert.title as string,
      organizationName: org.name as string,
      organizationSlug: slug,
      issuedAt: cert.issued_at as string,
      expiresAt: exp,
    };
  }

  async updateOrgCertificate(
    ctx: AuthContext,
    input: {
      organizationId: Uuid;
      certificateId: Uuid;
      action: "revoke" | "set_expiry";
      expiresAt?: string | null;
    },
  ): Promise<{ updated: true }> {
    requirePermission(ctx, "certificate.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data: row, error: rowErr } = await this.supabase
      .from("certificates")
      .select("id")
      .eq("id", input.certificateId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (rowErr || !row) {
      throw new Error("Not found: certificate");
    }

    if (input.action === "revoke") {
      const { error: upErr } = await this.supabase
        .from("certificates")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", input.certificateId)
        .eq("organization_id", input.organizationId);

      if (upErr) {
        throw new Error(`Failed to revoke certificate: ${upErr.message}`);
      }

      await this.supabase.from("audit_logs").insert({
        organization_id: input.organizationId,
        actor_user_id: ctx.userId,
        actor_role: ctx.role,
        action_key: "certificate.revoke",
        target_type: "certificate",
        target_id: input.certificateId,
        metadata_json: {},
      });
    } else {
      const expiresAt =
        input.expiresAt === undefined
          ? undefined
          : input.expiresAt === null || String(input.expiresAt).trim() === ""
            ? null
            : new Date(String(input.expiresAt)).toISOString();

      if (
        expiresAt !== undefined &&
        expiresAt !== null &&
        Number.isNaN(new Date(expiresAt as string).getTime())
      ) {
        throw new Error("Invalid expiresAt: expected ISO date-time or null.");
      }

      const { error: upErr } = await this.supabase
        .from("certificates")
        .update(expiresAt === undefined ? {} : { expires_at: expiresAt })
        .eq("id", input.certificateId)
        .eq("organization_id", input.organizationId);

      if (upErr) {
        throw new Error(`Failed to update certificate expiry: ${upErr.message}`);
      }

      await this.supabase.from("audit_logs").insert({
        organization_id: input.organizationId,
        actor_user_id: ctx.userId,
        actor_role: ctx.role,
        action_key: "certificate.expiry_updated",
        target_type: "certificate",
        target_id: input.certificateId,
        metadata_json: { expiresAt: expiresAt ?? null },
      });
    }

    return { updated: true };
  }

  async exportOrgCertificatesCsv(ctx: AuthContext, input: { organizationId: Uuid }): Promise<{ csv: string }> {
    requirePermission(ctx, "certificate.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data: rows, error } = await this.supabase
      .from("certificates")
      .select("id, title, credential_code, issued_at, expires_at, revoked_at, membership_id, quiz_id")
      .eq("organization_id", input.organizationId)
      .order("issued_at", { ascending: false })
      .limit(500);

    if (error) {
      throw new Error(`Failed to load certificates for export: ${error.message}`);
    }

    const membershipIds = [...new Set((rows ?? []).map((r) => r.membership_id as string))];
    const emailByMembership = new Map<string, string | null>();
    for (const mid of membershipIds.slice(0, 200)) {
      const { data: mem, error: memErr } = await this.supabase
        .from("memberships")
        .select("user_id")
        .eq("id", mid)
        .eq("organization_id", input.organizationId)
        .maybeSingle();
      if (memErr || !mem) {
        emailByMembership.set(mid, null);
        continue;
      }
      const { data: userData, error: userErr } = await this.supabase.auth.admin.getUserById(mem.user_id as string);
      emailByMembership.set(mid, userErr ? null : (userData.user?.email ?? null));
    }

    const esc = (v: string | null | undefined): string => {
      const s = v ?? "";
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const header = [
      "credential_code",
      "title",
      "learner_email",
      "issued_at",
      "expires_at",
      "revoked_at",
      "quiz_id",
      "membership_id",
    ].join(",");

    const lines = (rows ?? []).map((row) => {
      const mid = row.membership_id as string;
      return [
        esc(row.credential_code as string),
        esc(row.title as string),
        esc(emailByMembership.get(mid) ?? ""),
        esc(row.issued_at as string),
        esc((row.expires_at as string | null) ?? ""),
        esc((row.revoked_at as string | null) ?? ""),
        esc(row.quiz_id as string),
        esc(mid),
      ].join(",");
    });

    return { csv: [header, ...lines].join("\n") + "\n" };
  }

  async getOrgLearningOverview(
    ctx: AuthContext,
    input: { organizationId: Uuid },
  ): Promise<{
    learners: { total: number };
    onboardingInstances: {
      assigned: number;
      in_progress: number;
      completed: number;
      overdue: number;
      cancelled: number;
    };
    /** Instances that are not completed/cancelled, have a due date, and that date is in the past. */
    onboardingPastDueIncomplete: number;
    enrollments: {
      assigned: number;
      in_progress: number;
      completed: number;
      overdue: number;
      expired: number;
    };
  }> {
    requirePermission(ctx, "course.assign");
    requireTenantAccess(ctx, input.organizationId);

    const orgId = input.organizationId;
    const nowIso = new Date().toISOString();

    const headCount = async (label: string, run: () => unknown) => {
      const { count, error } = (await Promise.resolve(run())) as {
        count: number | null;
        error: { message: string } | null;
      };
      if (error) {
        throw new Error(`Failed to count ${label}: ${error.message}`);
      }
      return count ?? 0;
    };

    const [
      learnersTotal,
      oAssigned,
      oInProgress,
      oCompleted,
      oOverdue,
      oCancelled,
      pastDueIncomplete,
      eAssigned,
      eInProgress,
      eCompleted,
      eOverdue,
      eExpired,
    ] = await Promise.all([
      headCount("learners", () =>
        this.supabase
          .from("memberships")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("role", "learner"),
      ),
      headCount("onboarding assigned", () =>
        this.supabase
          .from("onboarding_instances")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "assigned"),
      ),
      headCount("onboarding in_progress", () =>
        this.supabase
          .from("onboarding_instances")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "in_progress"),
      ),
      headCount("onboarding completed", () =>
        this.supabase
          .from("onboarding_instances")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "completed"),
      ),
      headCount("onboarding overdue", () =>
        this.supabase
          .from("onboarding_instances")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "overdue"),
      ),
      headCount("onboarding cancelled", () =>
        this.supabase
          .from("onboarding_instances")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "cancelled"),
      ),
      headCount("onboarding past due incomplete", () =>
        this.supabase
          .from("onboarding_instances")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .not("status", "in", "(completed,cancelled)")
          .not("target_end_at", "is", null)
          .lt("target_end_at", nowIso),
      ),
      headCount("enrollments assigned", () =>
        this.supabase
          .from("enrollments")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "assigned"),
      ),
      headCount("enrollments in_progress", () =>
        this.supabase
          .from("enrollments")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "in_progress"),
      ),
      headCount("enrollments completed", () =>
        this.supabase
          .from("enrollments")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "completed"),
      ),
      headCount("enrollments overdue", () =>
        this.supabase
          .from("enrollments")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "overdue"),
      ),
      headCount("enrollments expired", () =>
        this.supabase
          .from("enrollments")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "expired"),
      ),
    ]);

    return {
      learners: { total: learnersTotal },
      onboardingInstances: {
        assigned: oAssigned,
        in_progress: oInProgress,
        completed: oCompleted,
        overdue: oOverdue,
        cancelled: oCancelled,
      },
      onboardingPastDueIncomplete: pastDueIncomplete,
      enrollments: {
        assigned: eAssigned,
        in_progress: eInProgress,
        completed: eCompleted,
        overdue: eOverdue,
        expired: eExpired,
      },
    };
  }

  /**
   * Creates a CHIP Collect purchase and returns `checkoutUrl` for redirect checkout.
   * Webhook `POST /api/billing/chip/webhook` upgrades `organizations.plan_tier` when payment succeeds.
   */
  async createChipCollectCheckout(
    ctx: AuthContext,
    input: CreateChipCollectCheckoutInput,
  ): Promise<{ purchaseId: string; checkoutUrl: string }> {
    requirePermission(ctx, "subscription.manage");
    requireTenantAccess(ctx, input.organizationId);

    if (!chipCollectIsConfigured()) {
      throw new Error("CHIP Collect is not configured: set CHIP_COLLECT_API_KEY and CHIP_COLLECT_BRAND_ID.");
    }
    const brandId = getChipBrandId();
    if (!brandId) {
      throw new Error("CHIP_COLLECT_BRAND_ID is not set.");
    }

    const { data: authUser, error: authErr } = await this.supabase.auth.admin.getUserById(ctx.userId);
    if (authErr || !authUser?.user?.email) {
      throw new Error("Could not load your account email for CHIP checkout.");
    }
    const email = authUser.user.email;

    const { data: org, error: orgErr } = await this.supabase
      .from("organizations")
      .select("name, plan_tier")
      .eq("id", input.organizationId)
      .maybeSingle();

    if (orgErr || !org) {
      throw new Error("Organization not found.");
    }

    const base = publicWebAppBaseUrl();
    const q = new URLSearchParams({
      chip: "1",
      organizationId: input.organizationId,
      plan: input.targetPlan,
    });
    const success_redirect = `${base}/dashboard?${q.toString()}&status=success`;
    const failure_redirect = `${base}/dashboard?${q.toString()}&status=failure`;

    const growthCents = Number.parseInt(process.env.CHIP_COLLECT_PRICE_GROWTH_CENTS ?? "29900", 10);
    const enterpriseCents = Number.parseInt(process.env.CHIP_COLLECT_PRICE_ENTERPRISE_CENTS ?? "99900", 10);
    const price = input.targetPlan === "growth" ? growthCents : enterpriseCents;
    const currency = (process.env.CHIP_COLLECT_CURRENCY ?? "MYR").trim().toUpperCase().slice(0, 3);

    const orgName = (org.name as string | undefined) ?? "Organization";
    const productName =
      input.targetPlan === "growth" ? `MyAcademy Growth — ${orgName}` : `MyAcademy Enterprise — ${orgName}`;

    const reference = `myacademy:${input.organizationId}:${input.targetPlan}`;
    if (reference.length > 128) {
      throw new Error("Purchase reference is too long for CHIP.");
    }

    const metaName = authUser.user.user_metadata?.full_name;
    const full_name = typeof metaName === "string" && metaName.trim().length > 0 ? metaName.trim() : undefined;

    const body: Record<string, unknown> = {
      brand_id: brandId,
      client: full_name ? { email, full_name } : { email },
      purchase: {
        currency,
        products: [{ name: productName, price }],
      },
      reference,
      success_redirect,
      failure_redirect,
      platform: "web",
    };

    const { id, checkoutUrl } = await chipCollectCreatePurchase(body);
    return { purchaseId: id, checkoutUrl };
  }

  async getOrganizationBillingStatus(
    ctx: AuthContext,
    input: GetOrganizationBillingStatusInput,
  ): Promise<{ organizationId: string; currentPlan: "starter" | "growth" | "enterprise"; updatedAt: string }> {
    requirePermission(ctx, "subscription.manage");
    requireTenantAccess(ctx, input.organizationId);

    const { data, error } = await this.supabase
      .from("organizations")
      .select("id, plan_tier, updated_at")
      .eq("id", input.organizationId)
      .single();

    if (error || !data) {
      throw new Error("Organization not found.");
    }

    const tier = data.plan_tier as string | null | undefined;
    const currentPlan: "starter" | "growth" | "enterprise" =
      tier === "growth" || tier === "enterprise" ? tier : "starter";
    return {
      organizationId: data.id as string,
      currentPlan,
      updatedAt: (data.updated_at as string) ?? new Date().toISOString(),
    };
  }

  async listMyOnboardingProgress(
    ctx: AuthContext,
    input: ListMyOnboardingProgressInput,
  ): Promise<{
    summary: { total: number; completed: number; completionRate: number };
    items: Array<{
      id: string;
      status: string;
      reviewStatus: string;
      reviewNote: string | null;
      hasEvidence: boolean;
      title: string;
      itemType: string;
    }>;
  }> {
    requirePermission(ctx, "self.learning.read");
    requireTenantAccess(ctx, input.organizationId);

    if (ctx.role !== "learner") {
      throw new Error("Only learners can access self onboarding progress endpoint.");
    }

    const { data: membership, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .single();

    if (membershipError || !membership) {
      throw new Error("Learner membership not found for current user.");
    }

    const { data, error } = await this.supabase
      .from("checklist_progress")
      .select(
        "id,status,review_status,review_note,evidence_url,onboarding_checklist_items!inner(title,item_type),onboarding_instances!inner(membership_id)",
      )
      .eq("organization_id", input.organizationId)
      .eq("onboarding_instances.membership_id", input.membershipId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to load onboarding progress: ${error.message}`);
    }

    const items = (data ?? []).map((row) => {
      const item = row.onboarding_checklist_items as unknown as { title?: string; item_type?: string };
      return {
        id: row.id as string,
        status: row.status as string,
        reviewStatus: row.review_status as string,
        reviewNote: (row.review_note as string | null) ?? null,
        hasEvidence: Boolean((row.evidence_url as string | null)?.trim()),
        title: item?.title ?? "Checklist item",
        itemType: item?.item_type ?? "unknown",
      };
    });

    const total = items.length;
    const completed = items.filter((item) => item.status === "completed").length;
    const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

    return {
      summary: { total, completed, completionRate },
      items,
    };
  }

  async requestDocumentUploadUrl(
    ctx: AuthContext,
    input: RequestDocumentUploadUrlInput,
  ): Promise<{ bucket: string; objectPath: string; signedUrl: string }> {
    requirePermission(ctx, "self.learning.read");
    requireTenantAccess(ctx, input.organizationId);

    if (ctx.role !== "learner") {
      throw new Error("Only learners can request document upload URLs.");
    }

    const { data: membership, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .single();

    if (membershipError || !membership) {
      throw new Error("Learner membership not found for current user.");
    }

    const { data: progressRow, error: progressError } = await this.supabase
      .from("checklist_progress")
      .select(
        "id,status,review_status,onboarding_instances!inner(membership_id),onboarding_checklist_items!inner(item_type)",
      )
      .eq("id", input.checklistProgressId)
      .eq("organization_id", input.organizationId)
      .eq("onboarding_instances.membership_id", input.membershipId)
      .single();

    if (progressError || !progressRow) {
      throw new Error("Checklist item progress not found for learner.");
    }

    const itemType = (progressRow.onboarding_checklist_items as unknown as { item_type: string }).item_type;
    if (itemType !== "submit_document") {
      throw new Error("Upload URLs are only available for document checklist items.");
    }

    const priorReview = progressRow.review_status as string;
    const priorStatus = progressRow.status as string;
    if (priorReview === "pending_review") {
      throw new Error("This item is already submitted for review.");
    }
    if (priorStatus === "waived" || priorStatus === "completed") {
      throw new Error("This checklist item is closed.");
    }

    const ext = evidenceExtensionFromFilename(input.filename);
    if (!ext) {
      throw new Error("Unsupported file type. Use PDF, PNG, JPG, or WebP.");
    }

    const objectPath = `${input.organizationId}/${input.checklistProgressId}/${crypto.randomUUID()}${ext}`;
    const { data: signData, error: signError } = await this.supabase.storage
      .from(CHECKLIST_EVIDENCE_BUCKET)
      .createSignedUploadUrl(objectPath, { upsert: true });

    if (signError || !signData) {
      throw new Error(`Could not create upload URL: ${signError?.message ?? "unknown error"}`);
    }

    return {
      bucket: CHECKLIST_EVIDENCE_BUCKET,
      objectPath: signData.path,
      signedUrl: signData.signedUrl,
    };
  }

  async getChecklistEvidenceSignedUrl(
    ctx: AuthContext,
    input: GetChecklistEvidenceSignedUrlInput,
  ): Promise<{ signedUrl: string; expiresIn: number }> {
    requireTenantAccess(ctx, input.organizationId);

    const { data: progressRow, error: progressError } = await this.supabase
      .from("checklist_progress")
      .select("id,evidence_url,onboarding_instances!inner(membership_id)")
      .eq("id", input.checklistProgressId)
      .eq("organization_id", input.organizationId)
      .single();

    if (progressError || !progressRow) {
      throw new Error("Checklist progress not found.");
    }

    const evidencePath = (progressRow.evidence_url as string | null)?.trim() ?? "";
    if (!evidencePath) {
      throw new Error("No document has been uploaded for this checklist item.");
    }

    const rowMembershipId = (progressRow.onboarding_instances as unknown as { membership_id: string }).membership_id;

    if (ctx.role === "learner") {
      if (!input.membershipId || input.membershipId !== rowMembershipId) {
        throw new Error("Forbidden: cannot download another learner's document.");
      }
      const { data: membership, error: membershipError } = await this.supabase
        .from("memberships")
        .select("id")
        .eq("id", input.membershipId)
        .eq("organization_id", input.organizationId)
        .eq("user_id", ctx.userId)
        .single();
      if (membershipError || !membership) {
        throw new Error("Learner membership not found for current user.");
      }
    } else {
      requirePermission(ctx, "course.assign");
    }

    assertEvidenceObjectPathValid({
      organizationId: input.organizationId,
      checklistProgressId: input.checklistProgressId,
      evidenceObjectPath: evidencePath,
    });

    const expiresIn = 120;
    const { data: signed, error: signedErr } = await this.supabase.storage
      .from(CHECKLIST_EVIDENCE_BUCKET)
      .createSignedUrl(evidencePath, expiresIn);

    if (signedErr || !signed?.signedUrl) {
      throw new Error(`Could not create download URL: ${signedErr?.message ?? "unknown error"}`);
    }

    return { signedUrl: signed.signedUrl, expiresIn };
  }

  async completeChecklistItem(
    ctx: AuthContext,
    input: CompleteChecklistItemInput,
  ): Promise<{ completed: true; onboardingStatus: string }> {
    requirePermission(ctx, "self.learning.read");
    requireTenantAccess(ctx, input.organizationId);

    if (ctx.role !== "learner") {
      throw new Error("Only learners can complete checklist items.");
    }

    const { data: membership, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .single();

    if (membershipError || !membership) {
      throw new Error("Learner membership not found for current user.");
    }

    const { data: progressRow, error: progressError } = await this.supabase
      .from("checklist_progress")
      .select(
        "id,status,review_status,attempt_count,onboarding_instance_id,onboarding_instances!inner(membership_id),onboarding_checklist_items!inner(item_type,required,title)",
      )
      .eq("id", input.checklistProgressId)
      .eq("organization_id", input.organizationId)
      .eq("onboarding_instances.membership_id", input.membershipId)
      .single();

    if (progressError || !progressRow) {
      throw new Error("Checklist item progress not found for learner.");
    }

    const itemType = (progressRow.onboarding_checklist_items as unknown as { item_type: string }).item_type;
    const priorStatus = progressRow.status as string;
    const priorReview = progressRow.review_status as string;

    if (itemType === "submit_document") {
      if (priorReview === "pending_review") {
        throw new Error("This item is already submitted for review.");
      }
      if (priorStatus === "waived" || priorStatus === "completed") {
        throw new Error("This checklist item is closed.");
      }

      const trimmedPath = input.evidenceObjectPath?.trim();
      if (!trimmedPath) {
        throw new Error("Attach a file before submitting for review.");
      }
      assertEvidenceObjectPathValid({
        organizationId: input.organizationId,
        checklistProgressId: input.checklistProgressId,
        evidenceObjectPath: trimmedPath,
      });

      const { data: existsData, error: existsErr } = await this.supabase.storage
        .from(CHECKLIST_EVIDENCE_BUCKET)
        .exists(trimmedPath);
      if (existsErr) {
        throw new Error(`Storage check failed: ${existsErr.message}`);
      }
      if (!existsData) {
        throw new Error("Uploaded file was not found in storage. Try uploading again.");
      }

      const currentAttemptCount = Number(progressRow.attempt_count ?? 0);
      const { data: updatedProgressRows, error: updateProgressError } = await this.supabase
        .from("checklist_progress")
        .update({
          status: "in_progress",
          review_status: "pending_review",
          review_note: null,
          evidence_url: trimmedPath,
          last_attempt_at: new Date().toISOString(),
          attempt_count: currentAttemptCount + 1,
          completed_at: null,
        })
        .select("id")
        .eq("id", input.checklistProgressId)
        .eq("organization_id", input.organizationId);

      if (updateProgressError) {
        throw new Error(`Failed to submit document for review: ${updateProgressError.message}`);
      }
      if (!updatedProgressRows || updatedProgressRows.length === 0) {
        throw new Error("Checklist progress update did not affect any row.");
      }
    } else {
      const completionEligibleTypes = new Set(["read_attachment", "watch_video", "pass_quiz"]);
      if (!completionEligibleTypes.has(itemType)) {
        throw new Error("Checklist item type is not eligible for manual completion.");
      }

      const currentAttemptCount = Number(progressRow.attempt_count ?? 0);
      const { data: updatedProgressRows, error: updateProgressError } = await this.supabase
        .from("checklist_progress")
        .update({
          status: "completed",
          last_attempt_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          attempt_count: currentAttemptCount + 1,
        })
        .select("id")
        .eq("id", input.checklistProgressId)
        .eq("organization_id", input.organizationId);

      if (updateProgressError) {
        throw new Error(`Failed to mark checklist item completed: ${updateProgressError.message}`);
      }
      if (!updatedProgressRows || updatedProgressRows.length === 0) {
        throw new Error("Checklist progress update did not affect any row.");
      }
    }

    const onboardingInstanceId = progressRow.onboarding_instance_id as string;
    const { data: remainingRequired, error: remainingError } = await this.supabase
      .from("checklist_progress")
      .select("id,onboarding_checklist_items!inner(required)")
      .eq("organization_id", input.organizationId)
      .eq("onboarding_instance_id", onboardingInstanceId)
      .eq("onboarding_checklist_items.required", true)
      .not("status", "in", "(completed,waived)");

    if (remainingError) {
      throw new Error(`Failed to evaluate onboarding completion: ${remainingError.message}`);
    }

    const { data: instanceRow, error: instanceRowError } = await this.supabase
      .from("onboarding_instances")
      .select("target_end_at")
      .eq("id", onboardingInstanceId)
      .eq("organization_id", input.organizationId)
      .single();

    if (instanceRowError || !instanceRow) {
      throw new Error("Onboarding instance not found after checklist update.");
    }

    const hasRemainingRequiredWork = (remainingRequired?.length ?? 0) > 0;
    const targetEndAt = instanceRow.target_end_at as string | null;
    const onboardingStatus = resolveOnboardingInstanceStatus({
      hasRemainingRequiredWork,
      targetEndAt,
    });

    const { data: updatedInstances, error: updateInstanceError } = await this.supabase
      .from("onboarding_instances")
      .update({
        status: onboardingStatus,
        completed_at: onboardingStatus === "completed" ? new Date().toISOString() : null,
      })
      .select("id")
      .eq("id", onboardingInstanceId)
      .eq("organization_id", input.organizationId);

    if (updateInstanceError) {
      throw new Error(`Failed to update onboarding instance status: ${updateInstanceError.message}`);
    }
    if (!updatedInstances || updatedInstances.length === 0) {
      throw new Error("Onboarding instance update did not affect any row.");
    }

    if (itemType !== "submit_document") {
      await this.events.publish(
        "onboarding.item_completed",
        {
          onboardingInstanceId,
          checklistItemId: input.checklistProgressId,
          itemType: itemType as "watch_video" | "pass_quiz" | "submit_document" | "read_attachment",
        },
        ctx,
      );
    }

    if (itemType === "submit_document") {
      const checklistTitle =
        (progressRow.onboarding_checklist_items as unknown as { title?: string }).title ?? "Document";
      try {
        await this.notifyStaffDocumentPendingReview(ctx, {
          organizationId: input.organizationId,
          checklistProgressId: input.checklistProgressId,
          checklistTitle,
        });
      } catch (err) {
        console.error("[notifications] notify staff pending review failed:", err);
      }
    }

    return { completed: true, onboardingStatus };
  }

  async reviewChecklistItem(
    ctx: AuthContext,
    input: ReviewChecklistItemInput,
  ): Promise<{ reviewed: true; checklistStatus: "failed" | "waived" | "completed"; onboardingStatus: string }> {
    requirePermission(ctx, "course.assign");
    requireTenantAccess(ctx, input.organizationId);

    const { data: progressRow, error: progressError } = await this.supabase
      .from("checklist_progress")
      .select("id,onboarding_instance_id,review_status,onboarding_checklist_items!inner(required,item_type,title)")
      .eq("id", input.checklistProgressId)
      .eq("organization_id", input.organizationId)
      .single();

    if (progressError || !progressRow) {
      throw new Error("Checklist progress record not found for review.");
    }

    if ((progressRow.review_status as string) !== "pending_review") {
      throw new Error("This checklist item is not awaiting review.");
    }

    const itemType = (progressRow.onboarding_checklist_items as unknown as { item_type: string }).item_type;
    const approve = input.action === "waived";
    const progressStatus =
      !approve ? "failed" : itemType === "submit_document" ? "completed" : "waived";
    const reviewStatus = approve ? "approved" : "rejected";
    const checklistStatusForResponse = !approve ? "failed" : itemType === "submit_document" ? "completed" : "waived";
    const trimmedNote = input.note?.trim();
    const reviewNoteForRow = approve ? null : trimmedNote && trimmedNote.length > 0 ? trimmedNote : null;

    const { data: updatedProgressRows, error: updateProgressError } = await this.supabase
      .from("checklist_progress")
      .update({
        status: progressStatus,
        review_status: reviewStatus,
        review_note: reviewNoteForRow,
        completed_at: approve ? new Date().toISOString() : null,
        last_attempt_at: new Date().toISOString(),
      })
      .select("id")
      .eq("id", input.checklistProgressId)
      .eq("organization_id", input.organizationId);

    if (updateProgressError) {
      throw new Error(`Failed to review checklist item: ${updateProgressError.message}`);
    }
    if (!updatedProgressRows || updatedProgressRows.length === 0) {
      throw new Error("Checklist review update did not affect any row.");
    }

    const onboardingInstanceId = progressRow.onboarding_instance_id as string;
    const { data: remainingRequired, error: remainingError } = await this.supabase
      .from("checklist_progress")
      .select("id,onboarding_checklist_items!inner(required)")
      .eq("organization_id", input.organizationId)
      .eq("onboarding_instance_id", onboardingInstanceId)
      .eq("onboarding_checklist_items.required", true)
      .not("status", "in", "(completed,waived)");

    if (remainingError) {
      throw new Error(`Failed to evaluate onboarding status after review: ${remainingError.message}`);
    }

    const { data: instanceAfterReview, error: instanceAfterReviewError } = await this.supabase
      .from("onboarding_instances")
      .select("target_end_at")
      .eq("id", onboardingInstanceId)
      .eq("organization_id", input.organizationId)
      .single();

    if (instanceAfterReviewError || !instanceAfterReview) {
      throw new Error("Onboarding instance not found after checklist review.");
    }

    const hasRemainingRequiredWorkAfterReview = (remainingRequired?.length ?? 0) > 0;
    const onboardingStatus = resolveOnboardingInstanceStatus({
      hasRemainingRequiredWork: hasRemainingRequiredWorkAfterReview,
      targetEndAt: instanceAfterReview.target_end_at as string | null,
    });

    const { data: updatedInstances, error: updateInstanceError } = await this.supabase
      .from("onboarding_instances")
      .update({
        status: onboardingStatus,
        completed_at: onboardingStatus === "completed" ? new Date().toISOString() : null,
      })
      .select("id")
      .eq("id", onboardingInstanceId)
      .eq("organization_id", input.organizationId);

    if (updateInstanceError) {
      throw new Error(`Failed to update onboarding instance after review: ${updateInstanceError.message}`);
    }
    if (!updatedInstances || updatedInstances.length === 0) {
      throw new Error("Onboarding instance update did not affect any row after review.");
    }

    const { error: auditError } = await this.supabase.from("audit_logs").insert({
      organization_id: input.organizationId,
      actor_user_id: ctx.userId,
      actor_role: ctx.role,
      action_key: "onboarding.checklist.review",
      target_type: "checklist_progress",
      target_id: input.checklistProgressId,
      metadata_json: {
        onboarding_instance_id: onboardingInstanceId,
        action: input.action,
        note: input.note ?? null,
      },
    });

    if (auditError) {
      throw new Error(`Checklist review succeeded but audit log write failed: ${auditError.message}`);
    }

    if (approve && itemType === "submit_document") {
      await this.events.publish(
        "onboarding.item_completed",
        {
          onboardingInstanceId,
          checklistItemId: input.checklistProgressId,
          itemType: "submit_document",
        },
        ctx,
      );
    }

    if (itemType === "submit_document") {
      const checklistTitle =
        (progressRow.onboarding_checklist_items as unknown as { title?: string }).title ?? "Checklist item";
      try {
        await this.notifyLearnerChecklistReviewed(ctx, {
          organizationId: input.organizationId,
          onboardingInstanceId,
          checklistProgressId: input.checklistProgressId,
          checklistTitle,
          approve,
          note: reviewNoteForRow,
        });
      } catch (err) {
        console.error("[notifications] notify learner review outcome failed:", err);
      }
    }

    return { reviewed: true, checklistStatus: checklistStatusForResponse, onboardingStatus };
  }

  async listPendingDocumentReviews(
    ctx: AuthContext,
    input: ListPendingDocumentReviewsInput,
  ): Promise<{
    items: Array<{
      checklistProgressId: string;
      title: string;
      membershipId: string;
      learnerEmail: string | null;
      status: string;
      hasEvidence: boolean;
      submittedAt: string | null;
    }>;
  }> {
    requirePermission(ctx, "course.assign");
    requireTenantAccess(ctx, input.organizationId);

    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);

    const { data: rows, error } = await this.supabase
      .from("checklist_progress")
      .select(
        "id,status,last_attempt_at,evidence_url,onboarding_instances!inner(membership_id),onboarding_checklist_items!inner(title,item_type)",
      )
      .eq("organization_id", input.organizationId)
      .eq("review_status", "pending_review")
      .order("last_attempt_at", { ascending: false })
      .limit(limit * 2);

    if (error) {
      throw new Error(`Failed to load document review queue: ${error.message}`);
    }

    const docRows = (rows ?? []).filter((row) => {
      const item = row.onboarding_checklist_items as unknown as { item_type?: string };
      return item?.item_type === "submit_document";
    });
    const capped = docRows.slice(0, limit);

    const membershipIds = [
      ...new Set(
        capped.map((r) => (r.onboarding_instances as unknown as { membership_id: string }).membership_id),
      ),
    ];
    const emailByMembership = new Map<string, string | null>();
    for (const mid of membershipIds) {
      const { data: mem, error: memErr } = await this.supabase
        .from("memberships")
        .select("user_id")
        .eq("id", mid)
        .eq("organization_id", input.organizationId)
        .maybeSingle();
      if (memErr || !mem) {
        emailByMembership.set(mid, null);
        continue;
      }
      const { data: userData, error: userErr } = await this.supabase.auth.admin.getUserById(mem.user_id as string);
      if (userErr) {
        emailByMembership.set(mid, null);
      } else {
        emailByMembership.set(mid, userData.user?.email ?? null);
      }
    }

    const items = capped.map((row) => {
      const inst = row.onboarding_instances as unknown as { membership_id: string };
      const item = row.onboarding_checklist_items as unknown as { title?: string };
      const mid = inst.membership_id;
      return {
        checklistProgressId: row.id as string,
        title: item?.title ?? "Document",
        membershipId: mid,
        learnerEmail: emailByMembership.get(mid) ?? null,
        status: row.status as string,
        hasEvidence: Boolean((row.evidence_url as string | null)?.trim()),
        submittedAt: (row.last_attempt_at as string | null) ?? null,
      };
    });

    return { items };
  }

  async countPendingDocumentReviews(
    ctx: AuthContext,
    input: { organizationId: Uuid },
  ): Promise<{ pending: number }> {
    requirePermission(ctx, "course.assign");
    requireTenantAccess(ctx, input.organizationId);

    const { count, error } = await this.supabase
      .from("checklist_progress")
      .select("id, onboarding_checklist_items!inner(item_type)", { count: "exact", head: true })
      .eq("organization_id", input.organizationId)
      .eq("review_status", "pending_review")
      .eq("onboarding_checklist_items.item_type", "submit_document");

    if (error) {
      throw new Error(`Failed to count pending document reviews: ${error.message}`);
    }

    return { pending: count ?? 0 };
  }

  async listTeamOnboardingProgress(
    ctx: AuthContext,
    input: ListTeamOnboardingProgressInput,
  ): Promise<{
    items: Array<{
      onboardingInstanceId: string;
      membershipId: string;
      learnerUserId: string | null;
      templateId: string;
      status: string;
      effectiveStatus: string;
      isOverdue: boolean;
      targetEndAt: string | null;
      startedAt: string | null;
      createdAt: string;
      completedAt: string | null;
      checklist: { total: number; completed: number };
    }>;
  }> {
    requirePermission(ctx, "course.assign");
    requireTenantAccess(ctx, input.organizationId);

    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const nowIso = new Date().toISOString();

    let query = this.supabase
      .from("onboarding_instances")
      .select(
        "id,membership_id,onboarding_template_id,status,created_at,completed_at,started_at,target_end_at,memberships!inner(user_id)",
      )
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (input.status === "overdue") {
      query = query
        .not("status", "in", "(completed,cancelled)")
        .not("target_end_at", "is", null)
        .lt("target_end_at", nowIso);
    } else if (input.status) {
      query = query.eq("status", input.status);
    }
    if (input.membershipId) query = query.eq("membership_id", input.membershipId);
    if (input.templateId) query = query.eq("onboarding_template_id", input.templateId);

    const { data: instances, error: instancesError } = await query;
    if (instancesError) {
      throw new Error(`Failed to load team onboarding instances: ${instancesError.message}`);
    }

    const onboardingInstanceIds = (instances ?? []).map((row) => row.id as string);
    if (onboardingInstanceIds.length === 0) {
      return { items: [] };
    }

    const { data: checklistRows, error: checklistError } = await this.supabase
      .from("checklist_progress")
      .select("onboarding_instance_id,status")
      .eq("organization_id", input.organizationId)
      .in("onboarding_instance_id", onboardingInstanceIds);

    if (checklistError) {
      throw new Error(`Failed to load checklist stats: ${checklistError.message}`);
    }

    const checklistByInstance = new Map<string, { total: number; completed: number }>();
    for (const row of checklistRows ?? []) {
      const key = row.onboarding_instance_id as string;
      const current = checklistByInstance.get(key) ?? { total: 0, completed: 0 };
      current.total += 1;
      if (row.status === "completed" || row.status === "waived") {
        current.completed += 1;
      }
      checklistByInstance.set(key, current);
    }

    const items = (instances ?? []).map((row) => {
      const membership = row.memberships as unknown as { user_id?: string };
      const checklist = checklistByInstance.get(row.id as string) ?? { total: 0, completed: 0 };
      const dbStatus = row.status as string;
      const targetEndAt = (row.target_end_at as string | null) ?? null;
      const effectiveStatus = effectiveOnboardingStatus(dbStatus, targetEndAt);
      const isOverdue = effectiveStatus === "overdue";
      return {
        onboardingInstanceId: row.id as string,
        membershipId: row.membership_id as string,
        learnerUserId: membership?.user_id ?? null,
        templateId: row.onboarding_template_id as string,
        status: dbStatus,
        effectiveStatus,
        isOverdue,
        targetEndAt,
        startedAt: (row.started_at as string | null) ?? null,
        createdAt: row.created_at as string,
        completedAt: (row.completed_at as string | null) ?? null,
        checklist,
      };
    });

    if (input.status === "overdue") {
      const filtered = items.filter((row) => row.effectiveStatus === "overdue");
      return { items: filtered };
    }

    return { items };
  }

  async syncOnboardingStatuses(
    ctx: AuthContext,
    input: SyncOnboardingStatusInput,
  ): Promise<{
    scanned: number;
    updated: { completed: number; overdue: number; in_progress: number };
  }> {
    requireTenantAccess(ctx, input.organizationId);

    const role = ctx.role as AppRole;
    const canRun =
      role === "super_admin" ||
      hasPermission(role, "membership.manage") ||
      hasPermission(role, "course.assign");
    if (!canRun) {
      throw new Error("Forbidden: onboarding status sync requires admin or trainer privileges.");
    }

    const maxRows = Math.min(Math.max(input.maxRows ?? 500, 1), 2000);

    const { data: instances, error: instancesError } = await this.supabase
      .from("onboarding_instances")
      .select("id,status,target_end_at,completed_at")
      .eq("organization_id", input.organizationId)
      .not("status", "in", "(completed,cancelled)")
      .limit(maxRows);

    if (instancesError) {
      throw new Error(`Failed to load onboarding instances for sync: ${instancesError.message}`);
    }

    const instanceList = instances ?? [];
    if (instanceList.length === 0) {
      return { scanned: 0, updated: { completed: 0, overdue: 0, in_progress: 0 } };
    }

    const instanceIds = instanceList.map((row) => row.id as string);

    const { data: progressRows, error: progressError } = await this.supabase
      .from("checklist_progress")
      .select("onboarding_instance_id,status,onboarding_checklist_items(required)")
      .eq("organization_id", input.organizationId)
      .in("onboarding_instance_id", instanceIds);

    if (progressError) {
      throw new Error(`Failed to load checklist progress for sync: ${progressError.message}`);
    }

    const rows = (progressRows ?? []) as Array<{
      onboarding_instance_id: string;
      status: string;
      onboarding_checklist_items: unknown;
    }>;

    let completed = 0;
    let overdue = 0;
    let inProgress = 0;

    for (const inst of instanceList) {
      const id = inst.id as string;
      const currentStatus = inst.status as string;
      const targetEndAt = (inst.target_end_at as string | null) ?? null;
      const hasWork = hasIncompleteRequiredChecklist(rows, id);
      const desired = resolveOnboardingInstanceStatus({
        hasRemainingRequiredWork: hasWork,
        targetEndAt,
      });

      if (desired === currentStatus) continue;

      const completedAt =
        desired === "completed" ? ((inst.completed_at as string | null) ?? new Date().toISOString()) : null;

      const { data: updatedRows, error: updateError } = await this.supabase
        .from("onboarding_instances")
        .update({
          status: desired,
          completed_at: completedAt,
        })
        .eq("id", id)
        .eq("organization_id", input.organizationId)
        .select("id");

      if (updateError) {
        throw new Error(`Failed to update onboarding instance ${id}: ${updateError.message}`);
      }
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error(`Onboarding instance sync update did not affect row ${id}.`);
      }

      if (desired === "completed") completed += 1;
      else if (desired === "overdue") overdue += 1;
      else inProgress += 1;
    }

    return {
      scanned: instanceList.length,
      updated: { completed, overdue, in_progress: inProgress },
    };
  }

  async listCourseQuizzesForLearner(
    ctx: AuthContext,
    input: ListCourseQuizzesInput,
  ): Promise<{ items: Array<{ id: string; title: string; passMarkPercent: number }> }> {
    requirePermission(ctx, "self.learning.read");
    requireTenantAccess(ctx, input.organizationId);

    if (ctx.role !== "learner") {
      throw new Error("Only learners can list course quizzes.");
    }

    const { data: membership, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .single();

    if (membershipError || !membership) {
      throw new Error("Learner membership not found for current user.");
    }

    const { data: enrollment, error: enrollmentError } = await this.supabase
      .from("enrollments")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("membership_id", input.membershipId)
      .eq("course_id", input.courseId)
      .maybeSingle();

    if (enrollmentError || !enrollment) {
      throw new Error("You are not enrolled in this course.");
    }

    const { data, error } = await this.supabase
      .from("quizzes")
      .select("id, title, pass_mark_percent")
      .eq("organization_id", input.organizationId)
      .eq("course_id", input.courseId)
      .eq("status", "published")
      .order("title", { ascending: true });

    if (error) {
      throw new Error(`Failed to load quizzes: ${error.message}`);
    }

    return {
      items: (data ?? []).map((row) => ({
        id: row.id as string,
        title: row.title as string,
        passMarkPercent: Number(row.pass_mark_percent ?? 70),
      })),
    };
  }

  private async loadMcqQuestionsForQuiz(
    organizationId: Uuid,
    quizId: Uuid,
    includeCorrect: boolean,
  ): Promise<
    Array<{
      id: string;
      prompt: string;
      options: string[];
      correctIndex: number | null;
    }>
  > {
    const { data, error } = await this.supabase
      .from("quiz_questions")
      .select("id, prompt, options_json, correct_answer_json, question_type")
      .eq("organization_id", organizationId)
      .eq("quiz_id", quizId)
      .eq("question_type", "mcq")
      .order("order_index", { ascending: true });

    if (error) {
      throw new Error(`Failed to load quiz questions: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      id: row.id as string,
      prompt: row.prompt as string,
      options: parseOptionsJson(row.options_json),
      correctIndex: includeCorrect ? readMcqCorrectIndex(row.correct_answer_json) : null,
    }));
  }

  async startQuizAttempt(
    ctx: AuthContext,
    input: StartQuizAttemptInput,
  ): Promise<{
    attemptId: string;
    quizTitle: string;
    passMarkPercent: number;
    questions: Array<{ id: string; prompt: string; options: string[] }>;
  }> {
    requirePermission(ctx, "self.learning.read");
    requireTenantAccess(ctx, input.organizationId);

    if (ctx.role !== "learner") {
      throw new Error("Only learners can start quiz attempts.");
    }

    const { data: membership, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .single();

    if (membershipError || !membership) {
      throw new Error("Learner membership not found for current user.");
    }

    const { data: quiz, error: quizError } = await this.supabase
      .from("quizzes")
      .select("id, title, pass_mark_percent, course_id, status")
      .eq("id", input.quizId)
      .eq("organization_id", input.organizationId)
      .single();

    if (quizError || !quiz) {
      throw new Error("Quiz not found.");
    }

    if ((quiz.status as string) !== "published") {
      throw new Error("Quiz is not available.");
    }

    const courseId = quiz.course_id as string | null;
    if (!courseId) {
      throw new Error("Quiz is not linked to a course.");
    }

    const { data: enrollment, error: enrollmentError } = await this.supabase
      .from("enrollments")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("membership_id", input.membershipId)
      .eq("course_id", courseId)
      .maybeSingle();

    if (enrollmentError || !enrollment) {
      throw new Error("You are not enrolled in this course.");
    }

    const { data: openAttempt, error: openErr } = await this.supabase
      .from("quiz_attempts")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("quiz_id", input.quizId)
      .eq("membership_id", input.membershipId)
      .is("submitted_at", null)
      .maybeSingle();

    if (openErr) {
      throw new Error(`Failed to check open attempts: ${openErr.message}`);
    }

    let attemptId: string;

    if (openAttempt?.id) {
      attemptId = openAttempt.id as string;
    } else {
      const { data: lastAttempt, error: lastErr } = await this.supabase
        .from("quiz_attempts")
        .select("attempt_number")
        .eq("organization_id", input.organizationId)
        .eq("quiz_id", input.quizId)
        .eq("membership_id", input.membershipId)
        .order("attempt_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastErr) {
        throw new Error(`Failed to resolve attempt number: ${lastErr.message}`);
      }

      const lastNum = lastAttempt?.attempt_number as number | undefined;
      const nextAttempt = lastNum != null ? lastNum + 1 : 1;

      const { data: inserted, error: insertErr } = await this.supabase
        .from("quiz_attempts")
        .insert({
          organization_id: input.organizationId,
          quiz_id: input.quizId,
          membership_id: input.membershipId,
          attempt_number: nextAttempt,
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        throw new Error(`Failed to start quiz attempt: ${insertErr?.message ?? "unknown"}`);
      }

      attemptId = inserted.id as string;
    }

    const questionsRaw = await this.loadMcqQuestionsForQuiz(input.organizationId, input.quizId, false);
    const questions = questionsRaw.map(({ id, prompt, options }) => ({ id, prompt, options }));

    if (questions.length === 0) {
      throw new Error("This quiz has no multiple-choice questions yet.");
    }

    return {
      attemptId,
      quizTitle: quiz.title as string,
      passMarkPercent: Number(quiz.pass_mark_percent ?? 70),
      questions,
    };
  }

  async getQuizAttemptView(
    ctx: AuthContext,
    input: GetQuizAttemptViewInput,
  ): Promise<
    | {
        phase: "in_progress";
        quizTitle: string;
        passMarkPercent: number;
        questions: Array<{ id: string; prompt: string; options: string[] }>;
      }
    | {
        phase: "submitted";
        quizTitle: string;
        passMarkPercent: number;
        scorePercent: number | null;
        result: string | null;
      }
  > {
    requirePermission(ctx, "self.learning.read");
    requireTenantAccess(ctx, input.organizationId);

    if (ctx.role !== "learner") {
      throw new Error("Only learners can view quiz attempts.");
    }

    const { data: membership, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .single();

    if (membershipError || !membership) {
      throw new Error("Learner membership not found for current user.");
    }

    const { data: attempt, error: attemptError } = await this.supabase
      .from("quiz_attempts")
      .select("id, quiz_id, submitted_at, score_percent, result")
      .eq("id", input.attemptId)
      .eq("organization_id", input.organizationId)
      .eq("membership_id", input.membershipId)
      .single();

    if (attemptError || !attempt) {
      throw new Error("Quiz attempt not found.");
    }

    const { data: quiz, error: quizError } = await this.supabase
      .from("quizzes")
      .select("title, pass_mark_percent")
      .eq("id", attempt.quiz_id as string)
      .eq("organization_id", input.organizationId)
      .single();

    if (quizError || !quiz) {
      throw new Error("Quiz metadata not found.");
    }

    const quizTitle = quiz.title as string;
    const passMarkPercent = Number(quiz.pass_mark_percent ?? 70);

    if (attempt.submitted_at) {
      return {
        phase: "submitted",
        quizTitle,
        passMarkPercent,
        scorePercent: attempt.score_percent as number | null,
        result: attempt.result as string | null,
      };
    }

    const questionsRaw = await this.loadMcqQuestionsForQuiz(
      input.organizationId,
      attempt.quiz_id as string,
      false,
    );
    const questions = questionsRaw.map(({ id, prompt, options }) => ({ id, prompt, options }));

    return {
      phase: "in_progress",
      quizTitle,
      passMarkPercent,
      questions,
    };
  }

  private async issueOrRefreshQuizCertificate(args: {
    organizationId: string;
    membershipId: string;
    quizId: string;
    attemptId: string;
  }): Promise<void> {
    const { data: quizRow, error: quizTitleErr } = await this.supabase
      .from("quizzes")
      .select("title")
      .eq("id", args.quizId)
      .eq("organization_id", args.organizationId)
      .maybeSingle();

    if (quizTitleErr) {
      console.error("[certificates] quiz title load failed:", quizTitleErr.message);
      return;
    }

    const baseTitle = ((quizRow?.title as string | undefined) ?? "Quiz").trim() || "Quiz";
    const title = `Certificate: ${baseTitle}`;
    const nowIso = new Date().toISOString();

    const { data: existing, error: exErr } = await this.supabase
      .from("certificates")
      .select("id, credential_code")
      .eq("organization_id", args.organizationId)
      .eq("membership_id", args.membershipId)
      .eq("quiz_id", args.quizId)
      .maybeSingle();

    if (exErr) {
      console.error("[certificates] lookup failed:", exErr.message);
      return;
    }

    if (existing?.id) {
      const { error: upErr } = await this.supabase
        .from("certificates")
        .update({
          quiz_attempt_id: args.attemptId,
          title,
          issued_at: nowIso,
          revoked_at: null,
        })
        .eq("id", existing.id as string);
      if (upErr) {
        console.error("[certificates] update failed:", upErr.message);
      }
      return;
    }

    for (let i = 0; i < 8; i++) {
      const credential_code = `MYA-${randomBytes(6).toString("hex").toUpperCase()}`;
      const { error: insErr } = await this.supabase.from("certificates").insert({
        organization_id: args.organizationId,
        membership_id: args.membershipId,
        quiz_id: args.quizId,
        quiz_attempt_id: args.attemptId,
        title,
        credential_code,
        issued_at: nowIso,
        expires_at: null,
      });
      if (!insErr) return;
      if (!insErr.message.toLowerCase().includes("credential")) {
        console.error("[certificates] insert failed:", insErr.message);
        return;
      }
    }
    console.error("[certificates] exhausted credential_code retries");
  }

  async submitQuizAttempt(ctx: AuthContext, input: SubmitQuizAttemptInput): Promise<{
    scorePercent: number;
    result: "pass" | "fail";
    passMarkPercent: number;
  }> {
    requirePermission(ctx, "self.learning.read");
    requireTenantAccess(ctx, input.organizationId);

    if (ctx.role !== "learner") {
      throw new Error("Only learners can submit quiz attempts.");
    }

    const { data: membership, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .single();

    if (membershipError || !membership) {
      throw new Error("Learner membership not found for current user.");
    }

    const { data: attempt, error: attemptError } = await this.supabase
      .from("quiz_attempts")
      .select("id, quiz_id, submitted_at")
      .eq("id", input.attemptId)
      .eq("organization_id", input.organizationId)
      .eq("membership_id", input.membershipId)
      .single();

    if (attemptError || !attempt) {
      throw new Error("Quiz attempt not found.");
    }

    if (attempt.submitted_at) {
      throw new Error("This attempt was already submitted.");
    }

    const quizId = attempt.quiz_id as string;

    const { data: quiz, error: quizError } = await this.supabase
      .from("quizzes")
      .select("pass_mark_percent")
      .eq("id", quizId)
      .eq("organization_id", input.organizationId)
      .single();

    if (quizError || !quiz) {
      throw new Error("Quiz not found.");
    }

    const passMarkPercent = Number(quiz.pass_mark_percent ?? 70);

    const questions = await this.loadMcqQuestionsForQuiz(input.organizationId, quizId, true);
    if (questions.length === 0) {
      throw new Error("No scored questions on this quiz.");
    }

    const answerByQuestion = new Map(input.answers.map((a) => [a.questionId, a.choiceIndex]));

    let correct = 0;
    for (const q of questions) {
      const chosen = answerByQuestion.get(q.id);
      const expected = q.correctIndex;
      if (expected == null) continue;
      if (chosen === expected) correct += 1;
    }

    const total = questions.filter((q) => q.correctIndex != null).length;
    const scorePercent = total === 0 ? 0 : Math.round((correct / total) * 100);
    const result: "pass" | "fail" = scorePercent >= passMarkPercent ? "pass" : "fail";

    const { error: updateError } = await this.supabase
      .from("quiz_attempts")
      .update({
        submitted_at: new Date().toISOString(),
        score_percent: scorePercent,
        result,
      })
      .eq("id", input.attemptId)
      .eq("organization_id", input.organizationId);

    if (updateError) {
      throw new Error(`Failed to save quiz results: ${updateError.message}`);
    }

    if (result === "pass") {
      try {
        await this.issueOrRefreshQuizCertificate({
          organizationId: input.organizationId,
          membershipId: input.membershipId,
          quizId,
          attemptId: input.attemptId,
        });
      } catch (err) {
        console.error("[certificates] issue failed:", err instanceof Error ? err.message : err);
      }
    }

    return { scorePercent, result, passMarkPercent };
  }

  async completeCourseEnrollment(
    ctx: AuthContext,
    input: CompleteEnrollmentInput,
  ): Promise<{ completed: true; alreadyCompleted?: boolean }> {
    requirePermission(ctx, "self.learning.read");
    requireTenantAccess(ctx, input.organizationId);

    if (ctx.role !== "learner") {
      throw new Error("Only learners can complete enrollments.");
    }

    const { data: membership, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("id", input.membershipId)
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .single();

    if (membershipError || !membership) {
      throw new Error("Learner membership not found for current user.");
    }

    const { data: enrollment, error: enrollmentError } = await this.supabase
      .from("enrollments")
      .select("id, status, course_id, assignment_type")
      .eq("id", input.enrollmentId)
      .eq("organization_id", input.organizationId)
      .eq("membership_id", input.membershipId)
      .single();

    if (enrollmentError || !enrollment) {
      throw new Error("Enrollment not found.");
    }

    if (enrollment.assignment_type !== "course" || !enrollment.course_id) {
      throw new Error("Only course enrollments can be completed through this action.");
    }

    const status = enrollment.status as string;
    if (status === "completed") {
      return { completed: true, alreadyCompleted: true };
    }
    if (status === "expired") {
      throw new Error("This enrollment has expired and cannot be completed.");
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await this.supabase
      .from("enrollments")
      .update({
        status: "completed",
        completed_at: now,
      })
      .eq("id", input.enrollmentId)
      .eq("organization_id", input.organizationId)
      .select("id");

    if (updateError || !updated || updated.length === 0) {
      throw new Error(`Failed to complete enrollment: ${updateError?.message ?? "unknown"}`);
    }

    return { completed: true };
  }

  async countUnreadInAppNotificationsForUser(userId: string): Promise<{ unreadCount: number }> {
    const { count, error } = await this.supabase
      .from("in_app_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      throw new Error(`Failed to count notifications: ${error.message}`);
    }

    return { unreadCount: count ?? 0 };
  }

  async listMyNotifications(
    ctx: AuthContext,
    input: ListMyNotificationsInput,
  ): Promise<{
    items: Array<{
      id: string;
      kind: string;
      title: string;
      body: string | null;
      readAt: string | null;
      createdAt: string;
    }>;
  }> {
    requireTenantAccess(ctx, input.organizationId);

    const { data: membershipRows, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .limit(1);

    if (membershipError || !membershipRows?.length) {
      throw new Error("Forbidden: not a member of this organization.");
    }

    const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
    let q = this.supabase
      .from("in_app_notifications")
      .select("id,kind,title,body,read_at,created_at")
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (input.unreadOnly) {
      q = q.is("read_at", null);
    }

    const { data: rows, error } = await q;
    if (error) {
      throw new Error(`Failed to load notifications: ${error.message}`);
    }

    const items = (rows ?? []).map((row) => ({
      id: row.id as string,
      kind: row.kind as string,
      title: row.title as string,
      body: (row.body as string | null) ?? null,
      readAt: (row.read_at as string | null) ?? null,
      createdAt: row.created_at as string,
    }));

    return { items };
  }

  async markNotificationsRead(ctx: AuthContext, input: MarkNotificationsReadInput): Promise<{ updated: number }> {
    requireTenantAccess(ctx, input.organizationId);

    const { data: membershipRows, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .limit(1);

    if (membershipError || !membershipRows?.length) {
      throw new Error("Forbidden: not a member of this organization.");
    }

    const ids = [...new Set(input.notificationIds)].slice(0, 50);
    if (ids.length === 0) {
      return { updated: 0 };
    }

    const now = new Date().toISOString();
    const { data: updatedRows, error } = await this.supabase
      .from("in_app_notifications")
      .update({ read_at: now })
      .in("id", ids)
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .is("read_at", null)
      .select("id");

    if (error) {
      throw new Error(`Failed to mark notifications read: ${error.message}`);
    }

    return { updated: updatedRows?.length ?? 0 };
  }

  async markAllNotificationsRead(ctx: AuthContext, input: MarkAllNotificationsReadInput): Promise<{ updated: number }> {
    requireTenantAccess(ctx, input.organizationId);

    const { data: membershipRows, error: membershipError } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .limit(1);

    if (membershipError || !membershipRows?.length) {
      throw new Error("Forbidden: not a member of this organization.");
    }

    const now = new Date().toISOString();
    const { data: updatedRows, error } = await this.supabase
      .from("in_app_notifications")
      .update({ read_at: now })
      .eq("organization_id", input.organizationId)
      .eq("user_id", ctx.userId)
      .is("read_at", null)
      .select("id");

    if (error) {
      throw new Error(`Failed to mark all notifications read: ${error.message}`);
    }

    return { updated: updatedRows?.length ?? 0 };
  }

  private async notifyLearnerCourseAssigned(
    ctx: AuthContext,
    args: {
      organizationId: string;
      learnerUserId: string;
      learnerMembershipId: string;
      courseTitle: string;
      enrollmentId: string;
    },
  ): Promise<void> {
    const kind = "learning.course_assigned";
    const title = "New course assignment";
    const body = `You have been assigned "${args.courseTitle}". Open MyAcademy → Learning to start.`;

    const { error: insErr } = await this.supabase.from("in_app_notifications").insert({
      organization_id: args.organizationId,
      user_id: args.learnerUserId,
      kind,
      title,
      body,
      metadata_json: {
        enrollment_id: args.enrollmentId,
        membership_id: args.learnerMembershipId,
      },
    });

    if (insErr) {
      console.error("[notifications] learner course assign in_app failed:", insErr.message);
      return;
    }

    try {
      await this.events.publish(
        "notification.sent",
        {
          channel: "in_app",
          templateKey: kind,
          recipientMembershipId: args.learnerMembershipId,
        },
        ctx,
      );
    } catch {
      /* ignore */
    }

    if (!isSmtpConfigured()) return;

    const { data: orgRow } = await this.supabase
      .from("organizations")
      .select("name")
      .eq("id", args.organizationId)
      .maybeSingle();
    const orgName = (orgRow?.name as string | undefined) ?? "Organization";

    const { data: authLearner, error: learnerAuthErr } = await this.supabase.auth.admin.getUserById(args.learnerUserId);
    const to = authLearner?.user?.email;
    if (learnerAuthErr || !to) return;

    const subject = `[${orgName}] ${title}`;
    const text = [
      `You have been assigned a new course.`,
      ``,
      `Course: "${args.courseTitle}"`,
      `Organization: ${orgName}`,
      ``,
      `Open MyAcademy → Learning to start.`,
    ].join("\n");

    const mailResult = await sendOptionalSmtpMail({ to, subject, text });
    if (mailResult.ok) {
      try {
        await this.events.publish(
          "notification.sent",
          {
            channel: "email",
            templateKey: kind,
            recipientMembershipId: args.learnerMembershipId,
          },
          ctx,
        );
      } catch {
        /* ignore */
      }
    }
  }

  private async notifyLearnerLearningPathAssigned(
    ctx: AuthContext,
    args: {
      organizationId: string;
      learnerUserId: string;
      learnerMembershipId: string;
      pathName: string;
      coursesAssigned: number;
      learningPathId: string;
      enrollmentIds: string[];
    },
  ): Promise<void> {
    const kind = "learning.path_assigned";
    const title = "New learning path assignment";
    const body =
      args.coursesAssigned === 1
        ? `"${args.pathName}" added 1 new course to your Learning.`
        : `"${args.pathName}" added ${args.coursesAssigned} new courses to your Learning.`;

    const { error: insErr } = await this.supabase.from("in_app_notifications").insert({
      organization_id: args.organizationId,
      user_id: args.learnerUserId,
      kind,
      title,
      body,
      metadata_json: {
        learning_path_id: args.learningPathId,
        membership_id: args.learnerMembershipId,
        enrollment_ids: args.enrollmentIds,
      },
    });

    if (insErr) {
      console.error("[notifications] learner path assign in_app failed:", insErr.message);
      return;
    }

    try {
      await this.events.publish(
        "notification.sent",
        {
          channel: "in_app",
          templateKey: kind,
          recipientMembershipId: args.learnerMembershipId,
        },
        ctx,
      );
    } catch {
      /* ignore */
    }

    if (!isSmtpConfigured()) return;

    const { data: orgRow } = await this.supabase
      .from("organizations")
      .select("name")
      .eq("id", args.organizationId)
      .maybeSingle();
    const orgName = (orgRow?.name as string | undefined) ?? "Organization";

    const { data: authLearner, error: learnerAuthErr } = await this.supabase.auth.admin.getUserById(args.learnerUserId);
    const to = authLearner?.user?.email;
    if (learnerAuthErr || !to) return;

    const subject = `[${orgName}] ${title}`;
    const text = [
      args.coursesAssigned === 1
        ? `A learning path added 1 new course enrollment for you.`
        : `A learning path added ${args.coursesAssigned} new course enrollments for you.`,
      ``,
      `Path: "${args.pathName}"`,
      `Organization: ${orgName}`,
      ``,
      `Open MyAcademy → Learning to view your assignments.`,
    ].join("\n");

    const mailResult = await sendOptionalSmtpMail({ to, subject, text });
    if (mailResult.ok) {
      try {
        await this.events.publish(
          "notification.sent",
          {
            channel: "email",
            templateKey: kind,
            recipientMembershipId: args.learnerMembershipId,
          },
          ctx,
        );
      } catch {
        /* ignore */
      }
    }
  }

  private async notifyStaffDocumentPendingReview(
    ctx: AuthContext,
    args: { organizationId: string; checklistProgressId: string; checklistTitle: string },
  ): Promise<void> {
    const { data: staff, error } = await this.supabase
      .from("memberships")
      .select("id, user_id")
      .eq("organization_id", args.organizationId)
      .in("role", ["trainer", "org_admin"]);

    if (error || !staff?.length) {
      return;
    }

    const rows = staff
      .filter((s) => (s.user_id as string) !== ctx.userId)
      .map((s) => ({
        organization_id: args.organizationId,
        user_id: s.user_id as string,
        kind: "onboarding.document_pending_review",
        title: "Document submitted for review",
        body: `"${args.checklistTitle}" is awaiting your review in Team → Document submissions.`,
        metadata_json: { checklist_progress_id: args.checklistProgressId, membership_id: s.id },
      }));

    if (rows.length === 0) {
      return;
    }

    const { error: insErr } = await this.supabase.from("in_app_notifications").insert(rows);
    if (insErr) {
      console.error("[notifications] staff insert failed:", insErr.message);
      return;
    }

    for (const s of staff) {
      if ((s.user_id as string) === ctx.userId) continue;
      try {
        await this.events.publish(
          "notification.sent",
          {
            channel: "in_app",
            templateKey: "onboarding.document_pending_review",
            recipientMembershipId: s.id as string,
          },
          ctx,
        );
      } catch {
        /* ignore event failures */
      }
    }

    if (isSmtpConfigured()) {
      const { data: orgRow } = await this.supabase
        .from("organizations")
        .select("name")
        .eq("id", args.organizationId)
        .maybeSingle();
      const orgName = (orgRow?.name as string | undefined) ?? "Organization";

      for (const s of staff) {
        if ((s.user_id as string) === ctx.userId) continue;
        const { data: authData, error: authErr } = await this.supabase.auth.admin.getUserById(s.user_id as string);
        const to = authData?.user?.email;
        if (authErr || !to) continue;
        const subject = `[${orgName}] Document submitted for review`;
        const text = [
          `A learner submitted a document checklist item for review.`,
          ``,
          `Item: "${args.checklistTitle}"`,
          `Organization: ${orgName}`,
          ``,
          `Open MyAcademy → Team → Document submissions to approve or reject.`,
        ].join("\n");

        const mailResult = await sendOptionalSmtpMail({ to, subject, text });
        if (mailResult.ok) {
          try {
            await this.events.publish(
              "notification.sent",
              {
                channel: "email",
                templateKey: "onboarding.document_pending_review",
                recipientMembershipId: s.id as string,
              },
              ctx,
            );
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  private async notifyLearnerChecklistReviewed(
    ctx: AuthContext,
    args: {
      organizationId: string;
      onboardingInstanceId: string;
      checklistProgressId: string;
      checklistTitle: string;
      approve: boolean;
      note: string | null;
    },
  ): Promise<void> {
    const { data: inst, error: instErr } = await this.supabase
      .from("onboarding_instances")
      .select("membership_id")
      .eq("id", args.onboardingInstanceId)
      .eq("organization_id", args.organizationId)
      .maybeSingle();

    if (instErr || !inst?.membership_id) {
      console.error("[notifications] resolve onboarding instance for learner notify failed:", instErr?.message);
      return;
    }

    const membershipId = inst.membership_id as string;
    const { data: mem, error: memErr } = await this.supabase
      .from("memberships")
      .select("user_id")
      .eq("id", membershipId)
      .eq("organization_id", args.organizationId)
      .maybeSingle();

    if (memErr || !mem?.user_id) {
      console.error("[notifications] resolve membership for learner notify failed:", memErr?.message);
      return;
    }

    const learnerUserId = mem.user_id as string;
    const title = args.approve ? "Document approved" : "Document needs changes";
    const body = args.approve
      ? `Your submission for "${args.checklistTitle}" was approved.`
      : `Your submission for "${args.checklistTitle}" was rejected.${args.note ? ` Feedback: ${args.note}` : " Open Learning to upload again."}`;
    const kind = args.approve ? "onboarding.document_approved" : "onboarding.document_rejected";

    const { error: insErr } = await this.supabase.from("in_app_notifications").insert({
      organization_id: args.organizationId,
      user_id: learnerUserId,
      kind,
      title,
      body,
      metadata_json: {
        checklist_progress_id: args.checklistProgressId,
        membership_id: membershipId,
      },
    });

    if (insErr) {
      console.error("[notifications] learner insert failed:", insErr.message);
      return;
    }

    try {
      await this.events.publish(
        "notification.sent",
        {
          channel: "in_app",
          templateKey: kind,
          recipientMembershipId: membershipId,
        },
        ctx,
      );
    } catch {
      /* ignore */
    }

    if (isSmtpConfigured()) {
      const { data: authLearner, error: learnerAuthErr } = await this.supabase.auth.admin.getUserById(learnerUserId);
      const to = authLearner?.user?.email;
      if (!learnerAuthErr && to) {
        const { data: orgRow } = await this.supabase
          .from("organizations")
          .select("name")
          .eq("id", args.organizationId)
          .maybeSingle();
        const orgName = (orgRow?.name as string | undefined) ?? "Organization";
        const subject = args.approve ? `[${orgName}] Document approved` : `[${orgName}] Document needs changes`;
        const textLines = args.approve
          ? [
              `Your submission for "${args.checklistTitle}" was approved.`,
              ``,
              `Organization: ${orgName}`,
              ``,
              `You can continue in MyAcademy → Learning.`,
            ]
          : [
              `Your submission for "${args.checklistTitle}" was reviewed and needs changes.`,
              args.note ? `Feedback: ${args.note}` : ``,
              ``,
              `Organization: ${orgName}`,
              ``,
              `Open MyAcademy → Learning to upload again and resubmit.`,
            ];
        const mailResult = await sendOptionalSmtpMail({ to, subject, text: textLines.filter(Boolean).join("\n") });
        if (mailResult.ok) {
          try {
            await this.events.publish(
              "notification.sent",
              {
                channel: "email",
                templateKey: kind,
                recipientMembershipId: membershipId,
              },
              ctx,
            );
          } catch {
            /* ignore */
          }
        }
      }
    }
  }
}
