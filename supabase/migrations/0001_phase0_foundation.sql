-- Phase 0 foundation migration
-- Multi-tenant baseline, RBAC primitives, event/audit scaffolding.

create extension if not exists pgcrypto;

create schema if not exists app;
grant usage on schema app to authenticated;

-- ===== ENUMS =====
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_tier') then
    create type public.plan_tier as enum ('free', 'growth', 'enterprise');
  end if;

  if not exists (select 1 from pg_type where typname = 'organization_status') then
    create type public.organization_status as enum ('trial', 'active', 'past_due', 'suspended', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'org_role') then
    create type public.org_role as enum ('org_admin', 'trainer', 'learner');
  end if;

  if not exists (select 1 from pg_type where typname = 'employment_status') then
    create type public.employment_status as enum ('invited', 'active', 'inactive', 'terminated');
  end if;
end
$$;

-- ===== TABLES =====
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan_tier public.plan_tier not null default 'free',
  status public.organization_status not null default 'trial',
  branding_logo_url text,
  branding_primary_color text,
  custom_domain text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  role public.org_role not null,
  employment_status public.employment_status not null default 'invited',
  job_title text,
  manager_membership_id uuid references public.memberships(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  action_key text not null,
  target_type text not null,
  target_id uuid,
  request_id text,
  ip_address inet,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.event_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_name text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_type text,
  target_id uuid,
  context_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_branches_org on public.branches (organization_id);
create index if not exists idx_memberships_org_user on public.memberships (organization_id, user_id);
create index if not exists idx_memberships_user on public.memberships (user_id);
create index if not exists idx_audit_org_created on public.audit_logs (organization_id, created_at desc);
create index if not exists idx_event_org_occurred on public.event_log (organization_id, occurred_at desc);
create index if not exists idx_event_name_org on public.event_log (event_name, organization_id);

-- ===== HELPERS =====
create or replace function app.jwt_claim(claim text)
returns text
language sql
stable
as $$
  select coalesce(
    nullif((auth.jwt() ->> claim), ''),
    nullif((auth.jwt() -> 'app_metadata' ->> claim), '')
  );
$$;

create or replace function app.current_org_id()
returns uuid
language sql
stable
as $$
  select nullif(app.jwt_claim('organization_id'), '')::uuid;
$$;

create or replace function app.current_role()
returns text
language sql
stable
as $$
  select coalesce(app.jwt_claim('role'), '');
$$;

create or replace function app.is_super_admin()
returns boolean
language sql
stable
as $$
  select app.current_role() = 'super_admin';
$$;

grant execute on function app.jwt_claim(text) to authenticated;
grant execute on function app.current_org_id() to authenticated;
grant execute on function app.current_role() to authenticated;
grant execute on function app.is_super_admin() to authenticated;

-- ===== RLS =====
alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_logs enable row level security;
alter table public.event_log enable row level security;

-- Organizations
drop policy if exists organizations_select on public.organizations;
create policy organizations_select
on public.organizations
for select
to authenticated
using (
  app.is_super_admin()
  or id = app.current_org_id()
);

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin
on public.organizations
for update
to authenticated
using (
  app.is_super_admin()
  or (id = app.current_org_id() and app.current_role() = 'org_admin')
)
with check (
  app.is_super_admin()
  or (id = app.current_org_id() and app.current_role() = 'org_admin')
);

-- Branches
drop policy if exists branches_rw on public.branches;
create policy branches_rw
on public.branches
for all
to authenticated
using (
  app.is_super_admin()
  or organization_id = app.current_org_id()
)
with check (
  app.is_super_admin()
  or (
    organization_id = app.current_org_id()
    and app.current_role() in ('org_admin')
  )
);

-- Memberships
drop policy if exists memberships_select on public.memberships;
create policy memberships_select
on public.memberships
for select
to authenticated
using (
  app.is_super_admin()
  or organization_id = app.current_org_id()
);

drop policy if exists memberships_insert_admin on public.memberships;
create policy memberships_insert_admin
on public.memberships
for insert
to authenticated
with check (
  app.is_super_admin()
  or (
    organization_id = app.current_org_id()
    and app.current_role() = 'org_admin'
  )
);

drop policy if exists memberships_update_admin on public.memberships;
create policy memberships_update_admin
on public.memberships
for update
to authenticated
using (
  app.is_super_admin()
  or (
    organization_id = app.current_org_id()
    and app.current_role() = 'org_admin'
  )
)
with check (
  app.is_super_admin()
  or (
    organization_id = app.current_org_id()
    and app.current_role() = 'org_admin'
  )
);

-- Audit and Events: readable by org admins and super admins, writable by backend/service role.
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select
on public.audit_logs
for select
to authenticated
using (
  app.is_super_admin()
  or (organization_id = app.current_org_id() and app.current_role() = 'org_admin')
);

drop policy if exists event_log_select on public.event_log;
create policy event_log_select
on public.event_log
for select
to authenticated
using (
  app.is_super_admin()
  or organization_id = app.current_org_id()
);

-- Restrict direct client writes; backend should use service role.
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.event_log from authenticated;

-- ===== TRIGGERS =====
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at
before update on public.organizations
for each row execute function app.set_updated_at();

drop trigger if exists trg_branches_updated_at on public.branches;
create trigger trg_branches_updated_at
before update on public.branches
for each row execute function app.set_updated_at();

drop trigger if exists trg_memberships_updated_at on public.memberships;
create trigger trg_memberships_updated_at
before update on public.memberships
for each row execute function app.set_updated_at();
