-- Allow org admins/trainers to void a credential; public verification and learner PDF respect this.

alter table public.certificates add column if not exists revoked_at timestamptz;

create index if not exists idx_certificates_org_revoked on public.certificates (organization_id, revoked_at)
  where revoked_at is not null;

comment on column public.certificates.revoked_at is 'When set, the credential is not valid for verification or PDF download.';
