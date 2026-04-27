-- Certificates issued when a learner passes a published quiz (MVP record + credential code).

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  quiz_attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  title text not null,
  credential_code text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, membership_id, quiz_id)
);

create unique index if not exists idx_certificates_credential_code on public.certificates (credential_code);

create index if not exists idx_certificates_org_member on public.certificates (organization_id, membership_id);
create index if not exists idx_certificates_org_issued on public.certificates (organization_id, issued_at desc);

alter table public.certificates enable row level security;

drop policy if exists certificates_select on public.certificates;
create policy certificates_select on public.certificates for select to authenticated using (app.tenant_visible(organization_id));

drop policy if exists certificates_write on public.certificates;
create policy certificates_write on public.certificates for all to authenticated using (app.tenant_manage(organization_id)) with check (app.tenant_manage(organization_id));

drop trigger if exists trg_certificates_updated_at on public.certificates;
create trigger trg_certificates_updated_at before update on public.certificates for each row execute function app.set_updated_at();
