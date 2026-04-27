# MVP Scope

## In Scope (Sellable MVP)

- Multi-tenant organization setup and tenant isolation.
- Roles: `org_admin`, `trainer`, `learner` (+ `super_admin` control plane).
- Course creation with video/PDF/attachments.
- Quiz builder v1 (MCQ, pass mark, auto grading).
- Learning path assignment and learner progress tracking.
- Onboarding templates with auto-trigger on new employee/role assignment.
- Certificates with optional expiry metadata.
- Manager/admin dashboards for completion and overdue risk.
- Email + in-app reminders.
- Subscription plans with Stripe integration.

## Out of Scope (Post-MVP)

- SCORM package support.
- Advanced anti-cheat mechanics.
- AI quiz generation and recommendation engine.
- Skill framework and gap analysis.
- SOP-to-course conversion.
- Career path visual roadmap.
- KPI correlation and ROI engine.

## Non-Functional Requirements

- Mobile-friendly learner experience.
- Tenant-safe data access for all reads/writes.
- Baseline audit logging for sensitive admin actions.
- Performance target: key dashboards under 3 seconds on baseline dataset.
- Uptime target at launch: 99.5% monthly.

## Primary User Journeys

1. Org admin creates workspace and invites learners/trainers.
2. New learner is added and onboarding auto-assigns.
3. Trainer publishes course and quiz, assigns path.
4. Learner completes assignments and receives certification.
5. Manager/admin monitors completion and overdue risk.
