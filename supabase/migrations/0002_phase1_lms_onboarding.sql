-- Phase 1 starter migration
-- LMS core + onboarding runtime tables with tenant-aware RLS.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'course_category') then
    create type public.course_category as enum ('onboarding', 'compliance', 'skill', 'leadership');
  end if;

  if not exists (select 1 from pg_type where typname = 'course_status') then
    create type public.course_status as enum ('draft', 'published', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'content_type') then
    create type public.content_type as enum ('video', 'pdf', 'slide', 'attachment', 'quiz');
  end if;

  if not exists (select 1 from pg_type where typname = 'learning_path_status') then
    create type public.learning_path_status as enum ('draft', 'published', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'learning_path_type') then
    create type public.learning_path_type as enum ('onboarding', 'certification', 'custom');
  end if;

  if not exists (select 1 from pg_type where typname = 'step_type') then
    create type public.step_type as enum ('course', 'quiz', 'document_submission');
  end if;

  if not exists (select 1 from pg_type where typname = 'assignment_type') then
    create type public.assignment_type as enum ('course', 'learning_path', 'onboarding_template');
  end if;

  if not exists (select 1 from pg_type where typname = 'assignment_source') then
    create type public.assignment_source as enum ('manual', 'auto_on_role', 'auto_on_new_employee');
  end if;

  if not exists (select 1 from pg_type where typname = 'enrollment_status') then
    create type public.enrollment_status as enum ('assigned', 'in_progress', 'completed', 'overdue', 'expired');
  end if;

  if not exists (select 1 from pg_type where typname = 'quiz_status') then
    create type public.quiz_status as enum ('draft', 'published', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'question_type') then
    create type public.question_type as enum ('mcq', 'subjective', 'scenario');
  end if;

  if not exists (select 1 from pg_type where typname = 'attempt_result') then
    create type public.attempt_result as enum ('pass', 'fail', 'pending_review');
  end if;

  if not exists (select 1 from pg_type where typname = 'onboarding_template_status') then
    create type public.onboarding_template_status as enum ('draft', 'published', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'onboarding_instance_status') then
    create type public.onboarding_instance_status as enum ('assigned', 'in_progress', 'completed', 'overdue', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'onboarding_item_type') then
    create type public.onboarding_item_type as enum ('watch_video', 'pass_quiz', 'submit_document', 'read_attachment');
  end if;

  if not exists (select 1 from pg_type where typname = 'checklist_status') then
    create type public.checklist_status as enum ('not_started', 'in_progress', 'completed', 'failed', 'waived');
  end if;
end
$$;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_membership_id uuid references public.memberships(id) on delete set null,
  title text not null,
  description text,
  category public.course_category not null default 'skill',
  status public.course_status not null default 'draft',
  estimated_minutes integer,
  version integer not null default 1,
  previous_version_id uuid references public.courses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  order_index integer not null,
  type public.content_type not null,
  title text not null,
  resource_url text,
  metadata_json jsonb not null default '{}'::jsonb,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  path_type public.learning_path_type not null default 'custom',
  status public.learning_path_status not null default 'draft',
  created_by_membership_id uuid references public.memberships(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_path_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  learning_path_id uuid not null references public.learning_paths(id) on delete cascade,
  step_order integer not null,
  step_type public.step_type not null,
  course_id uuid references public.courses(id) on delete set null,
  quiz_id uuid,
  required boolean not null default true,
  due_offset_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (learning_path_id, step_order)
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  description text,
  pass_mark_percent integer not null default 70 check (pass_mark_percent between 1 and 100),
  time_limit_minutes integer,
  shuffle_questions boolean not null default false,
  status public.quiz_status not null default 'draft',
  created_by_membership_id uuid references public.memberships(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_type public.question_type not null,
  prompt text not null,
  options_json jsonb,
  correct_answer_json jsonb,
  points integer not null default 1,
  order_index integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  attempt_number integer not null default 1,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score_percent integer,
  result public.attempt_result,
  graded_by_membership_id uuid references public.memberships(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  assignment_type public.assignment_type not null,
  course_id uuid references public.courses(id) on delete cascade,
  learning_path_id uuid references public.learning_paths(id) on delete cascade,
  assigned_by_membership_id uuid references public.memberships(id) on delete set null,
  source public.assignment_source not null default 'manual',
  status public.enrollment_status not null default 'assigned',
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (course_id is not null and learning_path_id is null)
    or (course_id is null and learning_path_id is not null)
  )
);

create table if not exists public.onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  target_roles text[] not null default '{}'::text[],
  status public.onboarding_template_status not null default 'draft',
  version integer not null default 1,
  created_by_membership_id uuid references public.memberships(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  onboarding_template_id uuid not null references public.onboarding_templates(id) on delete cascade,
  name text not null,
  order_index integer not null,
  start_offset_days integer not null default 0,
  end_offset_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (onboarding_template_id, order_index)
);

create table if not exists public.onboarding_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  onboarding_stage_id uuid not null references public.onboarding_stages(id) on delete cascade,
  item_type public.onboarding_item_type not null,
  title text not null,
  required boolean not null default true,
  course_id uuid references public.courses(id) on delete set null,
  quiz_id uuid references public.quizzes(id) on delete set null,
  document_schema_json jsonb,
  due_offset_days integer,
  completion_rule_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  onboarding_template_id uuid not null references public.onboarding_templates(id) on delete cascade,
  status public.onboarding_instance_status not null default 'assigned',
  started_at timestamptz,
  target_end_at timestamptz,
  completed_at timestamptz,
  trigger_source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  onboarding_instance_id uuid not null references public.onboarding_instances(id) on delete cascade,
  checklist_item_id uuid not null references public.onboarding_checklist_items(id) on delete cascade,
  status public.checklist_status not null default 'not_started',
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  evidence_url text,
  review_status text not null default 'not_required',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (onboarding_instance_id, checklist_item_id)
);

create index if not exists idx_courses_org on public.courses (organization_id);
create index if not exists idx_learning_paths_org on public.learning_paths (organization_id);
create index if not exists idx_quizzes_org on public.quizzes (organization_id);
create index if not exists idx_enrollments_org_member on public.enrollments (organization_id, membership_id);
create index if not exists idx_onboarding_templates_org on public.onboarding_templates (organization_id);
create index if not exists idx_onboarding_instances_org_member on public.onboarding_instances (organization_id, membership_id);
create index if not exists idx_checklist_progress_org on public.checklist_progress (organization_id);

alter table public.courses enable row level security;
alter table public.course_content_items enable row level security;
alter table public.learning_paths enable row level security;
alter table public.learning_path_steps enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.enrollments enable row level security;
alter table public.onboarding_templates enable row level security;
alter table public.onboarding_stages enable row level security;
alter table public.onboarding_checklist_items enable row level security;
alter table public.onboarding_instances enable row level security;
alter table public.checklist_progress enable row level security;

create or replace function app.tenant_visible(org_id uuid)
returns boolean
language sql
stable
as $$
  select app.is_super_admin() or org_id = app.current_org_id();
$$;

create or replace function app.tenant_manage(org_id uuid)
returns boolean
language sql
stable
as $$
  select app.is_super_admin() or (org_id = app.current_org_id() and app.current_role() in ('org_admin', 'trainer'));
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'courses',
    'course_content_items',
    'learning_paths',
    'learning_path_steps',
    'quizzes',
    'quiz_questions',
    'quiz_attempts',
    'enrollments',
    'onboarding_templates',
    'onboarding_stages',
    'onboarding_checklist_items',
    'onboarding_instances',
    'checklist_progress'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', tbl, tbl);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (app.tenant_visible(organization_id))',
      tbl, tbl
    );

    execute format('drop policy if exists %I_write on public.%I', tbl, tbl);
    execute format(
      'create policy %I_write on public.%I for all to authenticated using (app.tenant_manage(organization_id)) with check (app.tenant_manage(organization_id))',
      tbl, tbl
    );
  end loop;
end
$$;

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at before update on public.courses for each row execute function app.set_updated_at();

drop trigger if exists trg_course_content_items_updated_at on public.course_content_items;
create trigger trg_course_content_items_updated_at before update on public.course_content_items for each row execute function app.set_updated_at();

drop trigger if exists trg_learning_paths_updated_at on public.learning_paths;
create trigger trg_learning_paths_updated_at before update on public.learning_paths for each row execute function app.set_updated_at();

drop trigger if exists trg_learning_path_steps_updated_at on public.learning_path_steps;
create trigger trg_learning_path_steps_updated_at before update on public.learning_path_steps for each row execute function app.set_updated_at();

drop trigger if exists trg_quizzes_updated_at on public.quizzes;
create trigger trg_quizzes_updated_at before update on public.quizzes for each row execute function app.set_updated_at();

drop trigger if exists trg_quiz_questions_updated_at on public.quiz_questions;
create trigger trg_quiz_questions_updated_at before update on public.quiz_questions for each row execute function app.set_updated_at();

drop trigger if exists trg_quiz_attempts_updated_at on public.quiz_attempts;
create trigger trg_quiz_attempts_updated_at before update on public.quiz_attempts for each row execute function app.set_updated_at();

drop trigger if exists trg_enrollments_updated_at on public.enrollments;
create trigger trg_enrollments_updated_at before update on public.enrollments for each row execute function app.set_updated_at();

drop trigger if exists trg_onboarding_templates_updated_at on public.onboarding_templates;
create trigger trg_onboarding_templates_updated_at before update on public.onboarding_templates for each row execute function app.set_updated_at();

drop trigger if exists trg_onboarding_stages_updated_at on public.onboarding_stages;
create trigger trg_onboarding_stages_updated_at before update on public.onboarding_stages for each row execute function app.set_updated_at();

drop trigger if exists trg_onboarding_checklist_items_updated_at on public.onboarding_checklist_items;
create trigger trg_onboarding_checklist_items_updated_at before update on public.onboarding_checklist_items for each row execute function app.set_updated_at();

drop trigger if exists trg_onboarding_instances_updated_at on public.onboarding_instances;
create trigger trg_onboarding_instances_updated_at before update on public.onboarding_instances for each row execute function app.set_updated_at();

drop trigger if exists trg_checklist_progress_updated_at on public.checklist_progress;
create trigger trg_checklist_progress_updated_at before update on public.checklist_progress for each row execute function app.set_updated_at();
