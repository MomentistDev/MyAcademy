# Remote Promotion Checklist

Use this sequence to move from local Supabase to hosted environment safely.

## 1) Authenticate and Link Project

```powershell
cd "C:\Users\Asus\Desktop\Momentist Project\MyAcademy"
supabase login
supabase link --project-ref <your-project-ref>
```

## 2) Validate Local State Before Push

```powershell
supabase db lint
supabase migration list
```

Expected migrations:
- `0001_phase0_foundation.sql`
- `0002_phase1_lms_onboarding.sql`

## 3) Push Schema to Remote

```powershell
supabase db push
```

## 4) Verify Remote Schema

Run in Supabase SQL Editor:

```sql
select tablename
from pg_tables
where schemaname = 'public'
order by tablename;

select tablename, policyname
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## 5) Configure Environment Variables

Backend:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Frontend:
- `NEXT_PUBLIC_SUPABASE_URL` (or equivalent)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Security rule:
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code.

## 6) Post-Push Validation

- Create two organizations and users in different tenants.
- Confirm same-tenant reads/writes succeed.
- Confirm cross-tenant requests fail.
- Confirm audit/event writes work from backend only.

## 7) Release Guardrails

- Require migration review in PR.
- Run `supabase db lint` in CI.
- Run migration before app deployment on production release.

## 8) Backend Deploy (Render)

- Use `render.yaml` blueprint in repo root for service bootstrap.
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Health check: `/health`
- Required env vars:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ALLOW_AUTH_DEV_HEADERS=0`
- Full guide: `docs/deployment/render-backend-deploy.md`
