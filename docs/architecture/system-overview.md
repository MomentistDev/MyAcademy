# System Overview

## Architecture Style

MyAcademy MVP uses a modular web application with a control plane for platform operations and a tenant app for organization-level workflows.

## High-Level Components

- **Control Plane**: super admin functions (tenant lifecycle, plan control, support actions).
- **Tenant App API**: business logic for LMS, onboarding, assessments, notifications, analytics.
- **Web Client**: role-aware UI for org admin, trainer, learner.
- **Data Layer**: tenant-scoped transactional data + analytics snapshots.
- **Event Bus**: asynchronous trigger processing for automation and notifications.
- **Billing Adapter**: external payment provider integration.

## Request Flow

1. Client authenticates and receives session with tenant context.
2. API resolves membership and role.
3. Policy layer authorizes action.
4. Repository layer executes tenant-scoped query.
5. Domain events emitted for downstream automation and analytics.

## Data Boundaries

- Tenant business data isolated by `organization_id`.
- Billing data handled in separate module with minimal tenant metadata.
- Event log stores normalized action events used by dashboards.

## Module Boundaries

- `identity-and-rbac`
- `organization-and-branches`
- `lms-core`
- `onboarding-automation`
- `assessment-and-certification`
- `notification-engine`
- `analytics-and-reporting`
- `subscription-and-billing`

## Key Cross-Cutting Concerns

- Tenant isolation and authorization.
- Auditability of privileged actions.
- Idempotency for event-driven jobs.
- Mobile-first learner UX.
- Observability with tracing + structured logs.
