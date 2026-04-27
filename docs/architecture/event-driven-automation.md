# Onboarding Automation Specification (MVP)

This document defines onboarding templates, auto-trigger rules, and checklist progression behavior.

## Goal

Auto-enroll employees into structured onboarding journeys with minimal admin effort and clear completion visibility.

## Core Concepts

## 1) Onboarding Template

Reusable journey blueprint at organization level.

**Fields**
- `id`
- `organization_id`
- `name` (for example: `Default New Joiner`)
- `target_roles` (array of role tags/job families)
- `status` (`draft`, `published`, `archived`)
- `version`
- `created_by_membership_id`
- `created_at`, `updated_at`

## 2) Onboarding Stage

Time-boxed grouping of checklist items.

**Fields**
- `id`
- `organization_id`
- `onboarding_template_id`
- `name` (`Day 1`, `Week 1`, `Month 1`)
- `order_index`
- `start_offset_days`
- `end_offset_days`
- `created_at`, `updated_at`

## 3) Checklist Item

Executable requirement in a stage.

**Fields**
- `id`
- `organization_id`
- `onboarding_stage_id`
- `item_type` (`watch_video`, `pass_quiz`, `submit_document`, `read_attachment`)
- `title`
- `required`
- `course_id` (nullable)
- `quiz_id` (nullable)
- `document_schema_json` (nullable)
- `due_offset_days`
- `completion_rule_json`
- `created_at`, `updated_at`

## 4) Onboarding Instance

Runtime onboarding assigned to a learner.

**Fields**
- `id`
- `organization_id`
- `membership_id`
- `onboarding_template_id`
- `status` (`assigned`, `in_progress`, `completed`, `overdue`, `cancelled`)
- `started_at`
- `target_end_at`
- `completed_at`
- `trigger_source` (`new_employee`, `role_assigned`, `manual`)
- `created_at`, `updated_at`

## 5) Checklist Progress

Per-item learner progress.

**Fields**
- `id`
- `organization_id`
- `onboarding_instance_id`
- `checklist_item_id`
- `status` (`not_started`, `in_progress`, `completed`, `failed`, `waived`)
- `attempt_count`
- `last_attempt_at`
- `completed_at`
- `evidence_url` (nullable for document submissions)
- `review_status` (`not_required`, `pending_review`, `approved`, `rejected`)
- `created_at`, `updated_at`

## Trigger Rules

## Trigger 1: New Employee Added

Event: `employee.created`

Condition:
- new active `membership` created with role `learner`
- organization has default onboarding template or role-matched template

Action:
- create `onboarding_instance`
- expand checklist from template into progress rows
- assign linked course/path enrollments
- emit notifications (`onboarding.assigned`)

## Trigger 2: Role Assigned / Changed

Event: `membership.role_updated`

Condition:
- role changes into configured target role
- no active onboarding instance for same template

Action:
- start new onboarding instance (or append delta stage if configured)
- notify learner + manager

## Trigger 3: Manual Assignment by Org Admin

Event: `onboarding.manual_assign_requested`

Condition:
- actor role `org_admin` or `trainer` with assignment permission

Action:
- create onboarding instance with `trigger_source = manual`
- enqueue reminders

## Checklist Progression Logic

## Status Rules

- Instance becomes `in_progress` when first item starts.
- Item marked `completed` based on `item_type` rule:
  - `watch_video`: minimum completion threshold met (for MVP: 90% watched).
  - `pass_quiz`: latest attempt passes configured mark.
  - `submit_document`: upload exists and, if review required, status `approved`.
  - `read_attachment`: explicit learner acknowledgment.
- Instance becomes `completed` when all required items completed.
- Instance becomes `overdue` if required items pending after `target_end_at`.

## Dependency Rules

- Stages run in order by `order_index`.
- Default behavior: next stage unlocks when prior stage required items are completed.
- Optional relaxed mode can unlock by schedule; leave for post-MVP if complexity rises.

## SLA and Reminder Rules (MVP)

- Reminder cadence: D-3, D-1, D+1 relative to due date.
- Escalation at D+3 to manager and org admin for overdue required items.
- Daily digest for org admins summarizing overdue onboarding instances.

## Failure and Retry Handling

- Idempotency key: `organization_id + membership_id + template_id + trigger_event_id`.
- Duplicate trigger events must not create duplicate active instances.
- Failed job retries with exponential backoff; dead-letter after max retries.
- Dead-letter queue visible to `super_admin` operations dashboard.

## Observability Events

- `onboarding.instance_created`
- `onboarding.item_started`
- `onboarding.item_completed`
- `onboarding.item_failed`
- `onboarding.instance_completed`
- `onboarding.instance_overdue`

## MVP Out-of-Scope

- Dynamic branching workflows based on score/persona.
- Multi-manager approval chains.
- Automatic HRIS sync triggers.
