export type CoreEventName =
  | "employee.created"
  | "membership.role_updated"
  | "course.assigned"
  | "course.due"
  | "onboarding.assigned"
  | "onboarding.item_completed"
  | "notification.sent";

export type EventTargetType =
  | "organization"
  | "membership"
  | "course"
  | "learning_path"
  | "onboarding_instance"
  | "notification";

export interface EventEnvelope<TContext extends object = object> {
  id: string;
  eventName: CoreEventName;
  organizationId: string;
  occurredAt: string;
  actorUserId?: string;
  actorMembershipId?: string;
  targetType?: EventTargetType;
  targetId?: string;
  context: TContext;
}

export interface EmployeeCreatedContext {
  membershipId: string;
  assignedRole: "learner" | "trainer" | "org_admin";
  source: "manual" | "import" | "hris_sync";
}

export interface MembershipRoleUpdatedContext {
  membershipId: string;
  previousRole: "learner" | "trainer" | "org_admin";
  newRole: "learner" | "trainer" | "org_admin";
}

export interface CourseAssignedContext {
  enrollmentId: string;
  assignmentType: "course" | "learning_path" | "onboarding_template";
  dueAt?: string;
}

export interface CourseDueContext {
  enrollmentId: string;
  dueAt: string;
  daysUntilDue: number;
}

export interface OnboardingAssignedContext {
  onboardingInstanceId: string;
  templateId: string;
  triggerSource: "new_employee" | "role_assigned" | "manual";
}

export interface OnboardingItemCompletedContext {
  onboardingInstanceId: string;
  checklistItemId: string;
  itemType: "watch_video" | "pass_quiz" | "submit_document" | "read_attachment";
}

export interface NotificationSentContext {
  channel: "in_app" | "email" | "whatsapp";
  templateKey: string;
  recipientMembershipId: string;
}

export interface DomainEventMap {
  "employee.created": EmployeeCreatedContext;
  "membership.role_updated": MembershipRoleUpdatedContext;
  "course.assigned": CourseAssignedContext;
  "course.due": CourseDueContext;
  "onboarding.assigned": OnboardingAssignedContext;
  "onboarding.item_completed": OnboardingItemCompletedContext;
  "notification.sent": NotificationSentContext;
}

export type DomainEvent<N extends CoreEventName = CoreEventName> = EventEnvelope<DomainEventMap[N]> & {
  eventName: N;
};

export function buildEvent<N extends CoreEventName>(
  input: Omit<DomainEvent<N>, "id" | "occurredAt"> & { id?: string; occurredAt?: string },
): DomainEvent<N> {
  return {
    id: input.id ?? crypto.randomUUID(),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    ...input,
  };
}
