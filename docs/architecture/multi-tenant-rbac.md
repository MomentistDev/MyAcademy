# Multi-Tenant RBAC and Isolation (MVP)

This document defines access control for MyAcademy MVP and the mandatory tenant isolation rules.

## Role Definitions

- `super_admin`: SaaS operator role; manages platform-wide tenancy, plans, support actions.
- `org_admin`: customer organization admin; manages people, content assignment, reporting, branding basics.
- `trainer`: creates and manages courses/quizzes; tracks learner progress.
- `learner`: consumes assigned learning and assessments.

## Permission Matrix (MVP)

Legend: `C` create, `R` read, `U` update, `D` delete, `A` assign, `X` execute

| Capability | super_admin | org_admin | trainer | learner |
|---|---|---|---|---|
| Manage organizations (create/suspend/plan) | CRUD | R | - | - |
| Manage organization profile/branding | R | RU | - | - |
| Manage branches | R | CRUD | - | - |
| Invite users and manage memberships | R | CRUD | - | - |
| Set roles (`org_admin`,`trainer`,`learner`) | R | U | - | - |
| Create/edit/publish courses | - | CRUD | CRUD | - |
| Upload course content | - | CRUD | CRUD | - |
| Create/edit/publish quizzes | - | CRUD | CRUD | - |
| Build learning paths | - | CRUD | CRU | - |
| Assign courses/paths | - | A | A (limited to own-created content) | - |
| View learner progress | R | R | R (assigned/owned scope) | R (self only) |
| Attempt quizzes | - | - | - | X |
| Complete checklist/document submit | - | - | - | X |
| Issue/revoke certificates | - | CRU | CRU | R (self only) |
| View analytics dashboards | R | R | R (trainer scope) | R (self dashboard only) |
| Manage subscription and billing | CRUD | R | - | - |
| Access audit logs | R | R | - | - |

## Scope Rules

- `super_admin` is outside tenant scope for platform operations but must still provide explicit `organization_id` when acting on tenant data.
- `org_admin`, `trainer`, and `learner` are always bound to a single active `membership` in one organization context per request.
- Cross-tenant joins are forbidden in application query layer.

## Tenant Isolation Policy

## 1) Data Partitioning

- Every tenant-owned table has mandatory `organization_id` (not nullable).
- Composite indexes start with `organization_id` for high-cardinality lookup and accidental leak prevention.
- Global tables (`user`, payment provider metadata) must never include tenant-private content.

## 2) Query Enforcement

- All read/write queries for tenant data include `WHERE organization_id = :contextOrgId`.
- Background jobs must receive and validate `organization_id` from event payload.
- API handlers reject requests where route organization does not match session organization.

## 3) Write Guardrails

- On insert, server derives `organization_id` from authenticated membership context, never from client payload.
- On update/delete, affected row must match caller `organization_id`.
- Bulk operations require row-count verification and audit trail.

## 4) Object Storage Isolation

- Bucket object paths are namespaced as `org/{organization_id}/...`.
- Signed URLs are scoped to tenant namespace and short-lived.
- Attachment metadata records include `organization_id`.

## 5) Analytics Isolation

- Materialized views aggregate per `organization_id`.
- Dashboard queries always include tenant filter.
- Cross-tenant benchmarks are optional and anonymized, only available to `super_admin`.

## Endpoint Authorization Pattern

1. Authenticate user session.
2. Resolve active membership (`organization_id`, `role`).
3. Check role permission for requested action.
4. Execute tenant-scoped query with organization predicate.
5. Write audit event for privileged actions.

## Policy Examples

- `learner` can only read `enrollments` where `membership_id = self` and `organization_id = context`.
- `trainer` can update a course only if:
  - course is in same `organization_id`, and
  - trainer is creator or has delegated content permission.
- `org_admin` can assign learning to any active learner in same tenant.

## Audit Log Minimum Fields

- `id`
- `organization_id` (nullable for super-admin platform actions)
- `actor_user_id`
- `actor_role`
- `action_key` (for example: `membership.invite`, `course.publish`)
- `target_type`, `target_id`
- `request_id`
- `ip_address`
- `created_at`

## Security Baseline Controls

- Password hashing with modern adaptive algorithm (Argon2id or bcrypt with strong cost).
- Session expiration and refresh rotation.
- Optional SSO (Google/Microsoft) behind organization-level setting.
- Encrypt sensitive data at rest and in transit (TLS mandatory).
- Limit PII fields exported by trainer role.
