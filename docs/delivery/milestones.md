# Delivery Milestones (MVP)

This plan sequences delivery into eight 2-week sprints (16 weeks total) with clear acceptance criteria and go-live gates.

## Milestone Table

## Sprint 1 (Week 1-2): Platform Foundation

**Scope**
- Project scaffolding, environments, CI checks.
- Tenant-aware auth/session skeleton.
- Base database schema for organizations, users, memberships.

**Acceptance Criteria**
- Team can run app and API locally with seeded tenant/user.
- Session includes `organization_id` and `role` context.
- CI pipeline runs tests and lint on pull requests.

## Sprint 2 (Week 3-4): RBAC + Isolation Hardening

**Scope**
- Permission middleware and policy checks.
- Tenant guardrails in repository/data-access layer.
- Audit logging v1 for privileged actions.

**Acceptance Criteria**
- Unauthorized role access returns proper 403 responses.
- Cross-tenant access attempts are blocked and tested.
- Audit records created for membership/course admin actions.

## Sprint 3 (Week 5-6): LMS Core v1

**Scope**
- Course creation/edit/publish flow.
- Content items (video, PDF, attachment).
- Basic trainer and learner screens.

**Acceptance Criteria**
- Trainer can publish a course with at least 3 content item types.
- Learner can view assigned course and persist progress.
- Admin can assign course to learner(s).

## Sprint 4 (Week 7-8): Onboarding Automation USP

**Scope**
- Onboarding templates and staged checklist model.
- Auto-trigger on new learner and role assignment.
- Learner “What to learn today” dashboard.

**Acceptance Criteria**
- New learner automatically receives onboarding instance.
- Checklist progression updates status and due dates correctly.
- Admin can monitor onboarding status at org level.

## Sprint 5 (Week 9-10): Assessment + Certification

**Scope**
- Quiz builder (MCQ), pass/fail rules, auto grading.
- Quiz attempts and scoring.
- Certificate generation with expiry date field.

**Acceptance Criteria**
- Published quiz can be attempted and auto graded.
- Passing learner receives downloadable certificate record.
- Failed attempts are visible in trainer/admin views.

## Sprint 6 (Week 11-12): Notifications + Manager Analytics

**Scope**
- In-app and email notifications for assignment/due/overdue.
- Core analytics dashboard for completion and overdue risk.
- Trainer progress report export.

**Acceptance Criteria**
- Triggered reminders are delivered and logged.
- Dashboard loads completion and overdue metrics in under 3 seconds on baseline data.
- Exported trainer report includes learner status and score.

## Sprint 7 (Week 13-14): Billing + Plan Enforcement

**Scope**
- Tiered plans and entitlement checks.
- Stripe subscription lifecycle integration.
- Usage metering for active users and assigned courses.

**Acceptance Criteria**
- Organization can start trial and upgrade to paid plan.
- Entitlement checks enforce plan limits.
- Billing webhook updates subscription status safely.

## Sprint 8 (Week 15-16): Go-Live Readiness

**Scope**
- Security hardening, monitoring, backup policy.
- UAT with pilot customers.
- Operational runbooks and launch checklist.

**Acceptance Criteria**
- Critical security checklist complete (auth, transport, audit coverage).
- Pilot UAT sign-off from at least one target customer persona.
- Incident response and rollback procedures documented.

## Go-Live Checkpoints

- **Checkpoint 1: Product Readiness**  
  Core user journeys validated: org setup, assignment, learning completion, reporting.

- **Checkpoint 2: Commercial Readiness**  
  Billing, subscription enforcement, and plan messaging are production-ready.

- **Checkpoint 3: Operational Readiness**  
  Monitoring, alerts, backup, support procedures, and ownership rotation defined.

## Definition of Done (Every Sprint)

- Feature tests pass and cover primary success/failure path.
- Security and tenant isolation checks included for affected endpoints.
- Product spec updates merged in docs.
- Demo recorded and reviewed with stakeholder.
