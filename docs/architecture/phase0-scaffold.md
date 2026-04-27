# Phase 0 Scaffold (Implemented)

This scaffold translates the roadmap's immediate next step into executable foundations.

## Delivered

- Database baseline migration: `supabase/migrations/0001_phase0_foundation.sql`
  - Multi-tenant core tables (`organizations`, `branches`, `memberships`)
  - Audit/event tables (`audit_logs`, `event_log`)
  - RLS enabled across tenant-facing tables
  - RBAC helper functions and role-aware policies
  - `updated_at` triggers
- App-layer RBAC contract: `src/contracts/rbac.ts`
- App-layer event contract: `src/contracts/events.ts`

## Notes

- JWT claims are expected to include tenant and role context used by RLS helpers:
  - `organization_id`
  - `role`
- Direct client writes to `audit_logs` and `event_log` are revoked; backend/service role should write these.
- Additional Phase 1 tables (courses, quizzes, enrollments, onboarding runtime) should be added in follow-up migrations.
