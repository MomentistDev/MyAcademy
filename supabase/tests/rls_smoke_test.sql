-- RLS smoke test for tenant isolation.
-- Run with:
--   supabase db reset
--   supabase db query --file supabase/tests/rls_smoke_test.sql --output table

begin;

-- Simulate authenticated learner in Acme org.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  (
    select json_build_object(
      'role', 'learner',
      'organization_id', id::text
    )::text
    from public.organizations
    where slug = 'acme-holdings'
    limit 1
  ),
  true
);

select auth.jwt() as jwt_payload;
select app.current_org_id() as derived_org_id, app.current_role() as derived_role;

-- Expected result: 1 if auth.jwt() picks up claims in your local setup.
select count(*) as visible_orgs from public.organizations;

-- Expected result: 2 (from seed data) if claims are active for RLS evaluation.
select count(*) as visible_branches from public.branches;

-- Expected result: 0 (cross-tenant update denied by RLS policy)
update public.branches
set name = 'Blocked by RLS'
where organization_id = (
  select id from public.organizations where slug = 'beta-retail-group' limit 1
);

select count(*) as cross_tenant_rows_updated
from public.branches
where name = 'Blocked by RLS';

rollback;
