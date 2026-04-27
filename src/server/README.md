# Server Skeleton (Phase 1)

This folder provides an application-layer API scaffold running on Express with real Supabase writes/reads for Phase 1 workflows.

## Included

- `lib/auth-context.ts`: resolves request identity/tenant context.
- `lib/guards.ts`: RBAC permission and tenant guard helpers.
- `lib/event-publisher.ts`: pluggable event publisher (console stub for now).
- `lib/mailer.ts`: optional SMTP (nodemailer); skipped when `SMTP_HOST` is unset.
- `lib/supabase-admin.ts`: server-side Supabase client bootstrap.
- `routes/phase1-handlers.ts`: Phase 1 handlers:
  - invite membership
  - create course
  - assign onboarding
  - learner assignments

## Environment

Copy `.env.example` to `.env` and set:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT` (optional)

### Email (optional)

When `SMTP_HOST` is set, the server sends transactional mail for onboarding document events (staff when a submission is pending review; learner when a submission is approved or needs changes). If `SMTP_HOST` is unset, behavior is unchanged: in-app notifications only.

With this repo’s `supabase start`, Inbucket SMTP is on **`127.0.0.1:54325`** (see `supabase/config.toml`); set `SMTP_HOST` / `SMTP_PORT` accordingly so API mail lands next to Auth invite mail in the inbox UI (usually `http://127.0.0.1:54324`). For a standalone Mailpit instance, **`1025`** is common. Set optional `SMTP_USER` / `SMTP_PASS`, `SMTP_SECURE` for real SMTP, and `MAIL_FROM` for the visible sender.

## Run (Express scaffold)

```bash
npm run dev
```

Default server URL:
- `http://localhost:4000`

Endpoints:
- `GET /health`
- `GET /api/me/memberships`
- `GET /api/me/notifications/unread-count`
- `GET /api/me/notifications?organizationId=&limit=&unreadOnly=true|false`
- `POST /api/me/notifications/read` (`{ organizationId, notificationIds }`)
- `POST /api/me/notifications/read-all` (`{ organizationId }` — marks all unread in that org for the current user)
- `POST /api/memberships/invite`
- `POST /api/courses`
- `POST /api/courses/publish` (`{ organizationId, courseId }`)
- `GET /api/org/courses?organizationId=`
- `GET /api/org/quizzes?organizationId=&courseId=` (trainer/org admin quiz list for a course)
- `POST /api/org/quizzes` (`{ organizationId, courseId, title, passMarkPercent?, description? }` — draft MCQ quiz)
- `POST /api/org/quizzes/mcq` (`{ organizationId, quizId, prompt, options[], correctIndex }`)
- `POST /api/org/quizzes/publish` (`{ organizationId, quizId }` — requires ≥1 MCQ with valid correct answer)
- `GET /api/org/course-content?organizationId=&courseId=` (ordered materials for trainers)
- `POST /api/org/course-content` (`{ organizationId, courseId, type, title, resourceUrl, isRequired? }` — video/pdf/slide/attachment link)
- `GET /api/org/learning-paths?organizationId=`
- `POST /api/org/learning-paths` (`{ organizationId, name, description? }` — draft path)
- `GET /api/org/learning-path-steps?organizationId=&learningPathId=`
- `POST /api/org/learning-path-steps` (`{ organizationId, learningPathId, courseId, required?, dueOffsetDays? }` — course step; path must be draft)
- `POST /api/org/learning-paths/publish` (`{ organizationId, learningPathId }`)
- `POST /api/enrollments/assign-learning-path` (`{ organizationId, membershipId, learningPathId }` — creates course enrollments for ordered distinct course steps; skips active duplicates)
- `POST /api/enrollments/assign-course` (`{ organizationId, membershipId, courseId }` — learner target, published course)
- `POST /api/onboarding/assign`
- `GET /api/assignments/me`
- `GET /api/me/certificates?organizationId=&membershipId=` (learner — quiz pass certificates)
- `GET /api/org/certificates?organizationId=&limit=` (trainer/org admin — `certificate.manage`)
- `GET /api/onboarding/progress/me`
- `POST /api/onboarding/progress/complete`
- `POST /api/onboarding/progress/document-upload-url` (learner signed upload URL for `submit_document` items)
- `GET /api/onboarding/progress/document-evidence-url` (short-lived signed download; learner with `membershipId`, or trainer/org admin)
- `POST /api/onboarding/progress/review`
- `GET /api/onboarding/progress/team`
- `POST /api/onboarding/sync-status`
- `GET /api/org/memberships?organizationId=`
- `GET /api/org/onboarding-templates?organizationId=`
- `GET /api/org/audit-logs?organizationId=&limit=` (org admin + trainer; `audit.read`)

### Onboarding due dates and overdue

- On assign, `started_at` is set to the assignment time and `target_end_at` is computed from:
  - the maximum `end_offset_days` on template stages, else
  - the maximum `due_offset_days` on checklist items, else
  - **30 days** as a default window.
- After learner completion or trainer review, instance `status` becomes `completed`, or `overdue` if required work remains and `target_end_at` is in the past, otherwise `in_progress`.
- Team list rows include `effectiveStatus` and `isOverdue` (derived when `target_end_at` has passed and the instance is not completed or cancelled). Use `?status=overdue` to list instances past `target_end_at` with incomplete required checklist work (post-filtered to `effectiveStatus === overdue`).
- Call `POST /api/onboarding/sync-status` with `{ "organizationId": "<uuid>", "maxRows": 500 }` (optional `maxRows`, default 500, max 2000) to align stored `onboarding_instances.status` with checklist + due date rules. Intended for cron or manual ops; requires org admin, trainer, or super admin.

## Auth Contract

Production requests should include:
- `Authorization: Bearer <supabase_access_token>`

Optional local-only shortcut:
- Set `ALLOW_AUTH_DEV_HEADERS=1`
- Send `x-user-id` only (role + org are still loaded from `public.memberships`)
