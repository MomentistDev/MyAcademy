# MVP Analytics Specification

This document defines dashboard metrics, event schema, and baseline reporting queries for MyAcademy MVP.

## Analytics Principles

- Metrics must be tenant-scoped and near real-time (up to 15-minute lag acceptable for MVP).
- Each metric must map to an operational decision (admin action, manager intervention, learner follow-up).
- Keep event taxonomy small and stable in MVP.

## Dashboard Personas

- **Org Admin**: adoption, overdue risk, onboarding effectiveness.
- **Trainer**: content performance and learner completion.
- **Learner**: personal progress and due work.
- **Super Admin**: tenant health and usage (control plane).

## Core Metrics (MVP)

## 1) Completion Rate

- Definition: completed enrollments / assigned enrollments in period.
- Dimensions: `department`, `branch`, `course_category`, `role`.
- Refresh: 15 minutes.

## 2) Overdue Learner Count

- Definition: unique learners with at least one overdue required assignment.
- Dimensions: `department`, `manager`, `onboarding_template`.
- Refresh: hourly.

## 3) Onboarding Progress Rate

- Definition: average required checklist completion percentage per onboarding instance.
- Dimensions: `template_name`, `stage_name`, `cohort_month`.
- Refresh: 15 minutes.

## 4) Quiz Pass Rate

- Definition: passed attempts / submitted attempts for each quiz.
- Dimensions: `quiz_id`, `course_id`, `department`.
- Refresh: 15 minutes.

## 5) Time Spent Learning

- Definition: total learning minutes captured from content progress events.
- Dimensions: `learner`, `course`, `week`.
- Refresh: daily aggregate + optional near-real-time session summary.

## 6) Drop-Off Stage

- Definition: stage or content item where most learners stop progressing for 7+ days.
- Dimensions: `learning_path`, `onboarding_template`, `course`.
- Refresh: daily.

## Event Tracking Schema

## Shared Event Envelope

- `event_id` (uuid)
- `event_name`
- `occurred_at` (UTC)
- `organization_id`
- `actor_user_id` (nullable for system events)
- `actor_membership_id` (nullable)
- `target_type`
- `target_id`
- `context_json` (device, source, assignment type, etc.)

## Required MVP Events

- `course.assigned`
- `course.started`
- `course.completed`
- `content.progressed`
- `quiz.started`
- `quiz.submitted`
- `quiz.graded`
- `onboarding.assigned`
- `onboarding.item_completed`
- `onboarding.completed`
- `notification.sent`
- `notification.clicked`

## Metric-to-Event Mapping

- Completion rate: `course.assigned` + `course.completed`
- Overdue learner count: assignment due metadata + status transition events
- Onboarding progress: `onboarding.assigned` + `onboarding.item_completed`
- Quiz pass rate: `quiz.submitted` + `quiz.graded`
- Time spent learning: `content.progressed`
- Drop-off stage: progression event sequence gaps

## Data Model Additions

- `event_log` table for raw event ingestion.
- `daily_metric_snapshot` table for fast dashboard queries.
- Optional materialized views:
  - `mv_org_completion_rate_daily`
  - `mv_onboarding_progress_daily`
  - `mv_quiz_pass_rate_daily`

## Example SQL Queries

## A) Completion Rate by Department (last 30 days)

```sql
SELECT
  m.department,
  COUNT(*) FILTER (WHERE e.status = 'completed')::decimal
    / NULLIF(COUNT(*), 0) AS completion_rate
FROM enrollments e
JOIN memberships m
  ON m.id = e.membership_id
 AND m.organization_id = e.organization_id
WHERE e.organization_id = :org_id
  AND e.assigned_at >= NOW() - INTERVAL '30 days'
GROUP BY m.department
ORDER BY completion_rate DESC;
```

## B) Learners At Risk (overdue onboarding)

```sql
SELECT
  oi.membership_id,
  MAX(oi.target_end_at) AS latest_due_at,
  COUNT(*) FILTER (WHERE oi.status = 'overdue') AS overdue_instances
FROM onboarding_instances oi
WHERE oi.organization_id = :org_id
  AND oi.status IN ('in_progress', 'overdue')
GROUP BY oi.membership_id
HAVING COUNT(*) FILTER (WHERE oi.status = 'overdue') > 0
ORDER BY overdue_instances DESC, latest_due_at ASC;
```

## C) Quiz Pass Rate by Quiz

```sql
SELECT
  qa.quiz_id,
  COUNT(*) FILTER (WHERE qa.result = 'pass')::decimal
    / NULLIF(COUNT(*), 0) AS pass_rate
FROM quiz_attempts qa
WHERE qa.organization_id = :org_id
  AND qa.submitted_at >= NOW() - INTERVAL '30 days'
GROUP BY qa.quiz_id
ORDER BY pass_rate ASC;
```

## D) Content Drop-Off Detection

```sql
SELECT
  lp.learning_path_id,
  lp.step_id,
  COUNT(*) AS stalled_learners
FROM learner_path_progress lp
WHERE lp.organization_id = :org_id
  AND lp.last_progress_at < NOW() - INTERVAL '7 days'
  AND lp.status = 'in_progress'
GROUP BY lp.learning_path_id, lp.step_id
ORDER BY stalled_learners DESC
LIMIT 20;
```

## Data Quality and Governance

- Enforce non-null `organization_id`, `event_name`, `occurred_at` in `event_log`.
- Reject events with timestamp skew above allowed threshold (for example 24h) unless flagged from offline client.
- Define event versioning via `context_json.schema_version`.
- Keep PII out of events whenever possible; use IDs, not raw personal content.
