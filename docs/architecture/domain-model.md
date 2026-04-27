# Domain Model (MVP)

This document defines the canonical entities for the MyAcademy MVP and their key relationships.

## Design Rules

- Every tenant-owned table includes `organization_id`.
- Soft-delete user-generated business records with `deleted_at` where history matters.
- Track lifecycle using `status` fields instead of hard deletes for operational objects.
- Use UUIDs for all primary keys.
- Store all timestamps in UTC.

## Core Entities

## 1) Organization

Represents one customer tenant.

**Fields**
- `id`
- `name`
- `slug`
- `plan_tier` (`free`, `growth`, `enterprise`)
- `status` (`trial`, `active`, `past_due`, `suspended`, `cancelled`)
- `branding_logo_url`
- `branding_primary_color`
- `custom_domain` (nullable)
- `created_at`, `updated_at`

## 2) Branch

Optional subdivision inside an organization (location, franchise unit, business unit).

**Fields**
- `id`
- `organization_id`
- `name`
- `code`
- `is_active`
- `created_at`, `updated_at`

## 3) User

Identity record at platform level.

**Fields**
- `id`
- `email` (unique)
- `full_name`
- `auth_provider` (`password`, `google`, `microsoft`)
- `is_active`
- `last_login_at`
- `created_at`, `updated_at`

## 4) Membership

Joins a user to an organization and role.

**Fields**
- `id`
- `organization_id`
- `user_id`
- `branch_id` (nullable)
- `role` (`org_admin`, `trainer`, `learner`)
- `employment_status` (`invited`, `active`, `inactive`, `terminated`)
- `job_title`
- `manager_membership_id` (nullable self reference)
- `joined_at`
- `created_at`, `updated_at`

## 5) Course

Top-level learning object.

**Fields**
- `id`
- `organization_id`
- `created_by_membership_id`
- `title`
- `description`
- `category` (`onboarding`, `compliance`, `skill`, `leadership`)
- `status` (`draft`, `published`, `archived`)
- `estimated_minutes`
- `version`
- `previous_version_id` (nullable self reference)
- `created_at`, `updated_at`

## 6) Course Content Item

Unit of content within a course.

**Fields**
- `id`
- `organization_id`
- `course_id`
- `order_index`
- `type` (`video`, `pdf`, `slide`, `attachment`, `quiz`)
- `title`
- `resource_url`
- `metadata_json` (duration, pages, etc.)
- `is_required`
- `created_at`, `updated_at`

## 7) Learning Path

Sequenced grouping of courses/checkpoints.

**Fields**
- `id`
- `organization_id`
- `name`
- `description`
- `path_type` (`onboarding`, `certification`, `custom`)
- `status` (`draft`, `published`, `archived`)
- `created_by_membership_id`
- `created_at`, `updated_at`

## 8) Learning Path Step

Ordered step inside a path.

**Fields**
- `id`
- `organization_id`
- `learning_path_id`
- `step_order`
- `step_type` (`course`, `quiz`, `document_submission`)
- `course_id` (nullable)
- `quiz_id` (nullable)
- `required`
- `due_offset_days` (nullable)
- `created_at`, `updated_at`

## 9) Enrollment

Assignment of a learner to course/path.

**Fields**
- `id`
- `organization_id`
- `membership_id` (learner)
- `assignment_type` (`course`, `learning_path`, `onboarding_template`)
- `course_id` (nullable)
- `learning_path_id` (nullable)
- `assigned_by_membership_id` (nullable for auto-assign)
- `source` (`manual`, `auto_on_role`, `auto_on_new_employee`)
- `status` (`assigned`, `in_progress`, `completed`, `overdue`, `expired`)
- `assigned_at`, `due_at`, `completed_at`
- `created_at`, `updated_at`

## 10) Quiz

Assessment definition.

**Fields**
- `id`
- `organization_id`
- `course_id` (nullable)
- `title`
- `description`
- `pass_mark_percent`
- `time_limit_minutes` (nullable)
- `shuffle_questions`
- `status` (`draft`, `published`, `archived`)
- `created_by_membership_id`
- `created_at`, `updated_at`

## 11) Quiz Question

Question item in quiz.

**Fields**
- `id`
- `organization_id`
- `quiz_id`
- `question_type` (`mcq`, `subjective`, `scenario`)
- `prompt`
- `options_json` (nullable)
- `correct_answer_json` (nullable for subjective)
- `points`
- `order_index`
- `created_at`, `updated_at`

## 12) Quiz Attempt

One learner attempt on one quiz.

**Fields**
- `id`
- `organization_id`
- `quiz_id`
- `membership_id`
- `attempt_number`
- `started_at`, `submitted_at`
- `score_percent`
- `result` (`pass`, `fail`, `pending_review`)
- `graded_by_membership_id` (nullable)
- `created_at`, `updated_at`

## 13) Certificate

Issued credential when requirements are met.

**Fields**
- `id`
- `organization_id`
- `membership_id`
- `source_type` (`course`, `learning_path`, `quiz`)
- `source_id`
- `certificate_no`
- `issued_at`
- `expires_at` (nullable)
- `pdf_url`
- `status` (`valid`, `expired`, `revoked`)
- `created_at`, `updated_at`

## 14) Subscription

Billing lifecycle for each organization.

**Fields**
- `id`
- `organization_id`
- `provider` (`stripe`, `toyyibpay`)
- `provider_customer_id`
- `provider_subscription_id`
- `plan_tier` (`free`, `growth`, `enterprise`)
- `billing_cycle` (`monthly`, `yearly`)
- `status` (`trialing`, `active`, `past_due`, `cancelled`)
- `current_period_start`, `current_period_end`
- `auto_renew`
- `created_at`, `updated_at`

## 15) Usage Meter

Stores billable usage snapshots.

**Fields**
- `id`
- `organization_id`
- `metric_key` (`active_users`, `assigned_courses`, `storage_mb`)
- `metric_value`
- `window_start`, `window_end`
- `recorded_at`

## Relationship Summary

- `Organization` 1..* `Branch`
- `Organization` 1..* `Membership`; `Membership` *..1 `User`
- `Organization` 1..* `Course`; `Course` 1..* `Course Content Item`
- `Organization` 1..* `Learning Path`; `Learning Path` 1..* `Learning Path Step`
- `Membership` 1..* `Enrollment`
- `Quiz` 1..* `Quiz Question`; `Membership` 1..* `Quiz Attempt`
- `Membership` 1..* `Certificate`
- `Organization` 1..* `Subscription` (single active at a time)

## Minimal Data Integrity Constraints

- Unique: (`organization_id`, `slug`) on tenant-facing slugs.
- Unique: (`organization_id`, `user_id`) on active memberships.
- Unique: (`organization_id`, `certificate_no`) for certificate tracking.
- Check: exactly one assignment target on `Enrollment` (`course_id` xor `learning_path_id` for MVP).
- Check: `pass_mark_percent` between 1 and 100.
