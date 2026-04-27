create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  provider text not null default 'chip_collect',
  dedupe_key text not null,
  event_type text,
  reference text,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, dedupe_key)
);

create index if not exists idx_billing_webhook_events_org_created
  on public.billing_webhook_events (organization_id, created_at desc);

create index if not exists idx_billing_webhook_events_provider_created
  on public.billing_webhook_events (provider, created_at desc);

alter table public.billing_webhook_events enable row level security;

drop policy if exists billing_webhook_events_select on public.billing_webhook_events;
create policy billing_webhook_events_select
on public.billing_webhook_events
for select
to authenticated
using (
  app.is_super_admin()
  or (
    organization_id = app.current_org_id()
    and app.current_role() in ('org_admin', 'trainer')
  )
);
