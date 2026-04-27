-- Remote seed script (hosted Supabase).
-- Safe to run multiple times: uses idempotent upserts/guards where possible.
--
-- HOW TO USE
-- 1) First create users in Supabase Auth dashboard (or your signup flow):
--      - admin@acme.test
--      - trainer@acme.test
--      - learner@acme.test
-- 2) Run this script in Supabase SQL Editor (remote), or via CLI:
--      supabase db query --linked --file supabase/seed.remote.sql
--
-- NOTE
-- This script intentionally does not insert into auth.users directly.
-- It maps existing auth users -> organization memberships and starter data.

begin;

-- 1) Organization
insert into public.organizations (name, slug, plan_tier)
values ('Acme Holdings', 'acme-holdings', 'growth')
on conflict (slug) do update
set
  name = excluded.name;

-- 2) Resolve IDs
with
  org as (
    select id as organization_id
    from public.organizations
    where slug = 'acme-holdings'
    limit 1
  ),
  users as (
    select id, email
    from auth.users
    where email in ('admin@acme.test', 'trainer@acme.test', 'learner@acme.test')
  ),
  desired_memberships as (
    select
      org.organization_id,
      users.id as user_id,
      case users.email
        when 'admin@acme.test' then 'org_admin'
        when 'trainer@acme.test' then 'trainer'
        when 'learner@acme.test' then 'learner'
      end::public.app_role as role,
      case users.email
        when 'admin@acme.test' then 'HR Manager'
        when 'trainer@acme.test' then 'Internal Trainer'
        when 'learner@acme.test' then 'Sales Executive'
      end as job_title
    from org
    join users on true
  )
insert into public.memberships (
  organization_id,
  user_id,
  role,
  employment_status,
  job_title,
  joined_at
)
select
  organization_id,
  user_id,
  role,
  'active'::public.employment_status,
  job_title,
  now()
from desired_memberships
on conflict (organization_id, user_id) do update
set
  role = excluded.role,
  employment_status = excluded.employment_status,
  job_title = excluded.job_title;

-- 3) Starter branches
with org as (
  select id as organization_id
  from public.organizations
  where slug = 'acme-holdings'
  limit 1
)
insert into public.branches (organization_id, name, code)
select org.organization_id, b.name, b.code
from org
join (
  values
    ('HQ', 'HQ'),
    ('South Branch', 'SB')
) as b(name, code) on true
on conflict (organization_id, code) do update
set
  name = excluded.name;

-- 4) Starter onboarding template
with org as (
  select id as organization_id
  from public.organizations
  where slug = 'acme-holdings'
  limit 1
)
insert into public.onboarding_templates (
  organization_id,
  name,
  target_roles,
  status,
  version
)
select
  org.organization_id,
  'Default New Joiner',
  array['learner']::public.app_role[],
  'published'::public.onboarding_template_status,
  1
from org
on conflict (organization_id, name, version) do nothing;

commit;

-- Post-run quick checks
select id, slug, name, plan_tier
from public.organizations
where slug = 'acme-holdings';

select m.id, u.email, m.role, m.employment_status
from public.memberships m
join auth.users u on u.id = m.user_id
join public.organizations o on o.id = m.organization_id
where o.slug = 'acme-holdings'
order by m.role, u.email;
