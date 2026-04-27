-- In-app notifications (inserted by API service role; read by members via RLS + optional direct Supabase later).
create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  read_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_in_app_notifications_user_org_created
  on public.in_app_notifications (organization_id, user_id, created_at desc);

create index if not exists idx_in_app_notifications_user_unread
  on public.in_app_notifications (organization_id, user_id)
  where read_at is null;

alter table public.in_app_notifications enable row level security;

drop policy if exists in_app_notifications_select on public.in_app_notifications;
create policy in_app_notifications_select on public.in_app_notifications
  for select to authenticated
  using (user_id = auth.uid() and app.tenant_visible (organization_id));

drop policy if exists in_app_notifications_update on public.in_app_notifications;
create policy in_app_notifications_update on public.in_app_notifications
  for update to authenticated
  using (user_id = auth.uid() and app.tenant_visible (organization_id))
  with check (user_id = auth.uid() and app.tenant_visible (organization_id));
