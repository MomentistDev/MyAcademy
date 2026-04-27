-- Custom Access Token hook: inject organization_id + role into JWT app_metadata
-- from the user's primary membership (latest joined_at). GoTrue calls this before
-- issuing access and refresh tokens. Restart local stack after applying:
--   supabase stop && supabase start
-- (or `supabase db reset` applies migration then start if stack was down).

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claims jsonb;
  uid uuid;
  m_org text;
  m_role text;
begin
  begin
    uid := (event->>'user_id')::uuid;
  exception
    when others then
      return event;
  end;

  if uid is null then
    return event;
  end if;

  select m.organization_id::text, m.role::text
    into m_org, m_role
  from public.memberships m
  where m.user_id = uid
  order by m.joined_at desc nulls last, m.created_at desc
  limit 1;

  claims := coalesce(event->'claims', '{}'::jsonb);

  if m_org is not null and m_role is not null then
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      coalesce(claims->'app_metadata', '{}'::jsonb)
        || jsonb_build_object(
          'organization_id', m_org,
          'role', m_role
        ),
      true
    );
  end if;

  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Auth hook: sets JWT app_metadata.organization_id and app_metadata.role from memberships.';

grant usage on schema public to supabase_auth_admin;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
