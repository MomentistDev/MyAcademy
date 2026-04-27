-- RLS helpers (app.current_org_id / app.current_role) read JWT app_metadata.
-- Seed inserts users before this runs on a fresh reset, so seed.sql must also
-- set raw_app_meta_data. This UPDATE repairs existing databases after memberships exist.
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'organization_id', m.organization_id::text,
    'role', m.role::text
  )
from (
  select distinct on (user_id)
    user_id,
    organization_id,
    role
  from public.memberships
  order by user_id, joined_at desc nulls last, created_at desc
) m
where m.user_id = u.id;
