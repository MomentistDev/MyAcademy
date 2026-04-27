# MyAcademy Web (Next.js)

## Setup

1. Copy environment file:

```bash
cp .env.local.example .env.local
```

2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from `supabase status` for local dev — use the **Publishable** key, not the secret).

3. Set `API_URL` (default in `.env.local.example` is `http://127.0.0.1:4000`) so server-rendered pages can call the Express API with your session token.

4. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dashboard calls `GET /api/me/memberships` on the API; keep the API running or you will see a warning there.

After pulling LMS seed changes, run **`supabase db reset`** once so `seed.sql` creates the demo course, enrollment, onboarding checklist, and a **published MCQ quiz** for `learner@acme.test`. Then open [**/dashboard/learning**](http://localhost:3000/dashboard/learning) to try assignments, **Start quiz**, and “Mark complete” against the Express API. Passing a quiz creates a **certificate** row (credential code) shown on Learning and on Team for trainers.

Trainers and org admins: [**/dashboard/team**](http://localhost:3000/dashboard/team) — team onboarding table, status sync, **learning paths** (ordered published courses → publish path → assign expands to course enrollments), **course list / publish / assign**, **quiz builder + course materials** via **Quizzes** on each course, onboarding template assign, course drafts, and (org admin only) invites. Learners see updates on [**/dashboard/learning**](http://localhost:3000/dashboard/learning).

## Local sign-in

If you use the repo seed data, try `learner@acme.test` with password `Pass1234!` (see root `supabase/seed.sql`).

### JWT `app_metadata` (custom access token hook)

Migrations define `public.custom_access_token_hook`, and `supabase/config.toml` enables **`[auth.hook.custom_access_token]`** so each new access token includes **`organization_id`** and **`role`** from `public.memberships` (same “primary membership” rule as migration `0004`).

After changing the hook or `config.toml` auth hooks, restart the local stack so GoTrue reloads config:

```bash
supabase stop && supabase start
```

Then sign out and sign in again so the browser receives a fresh JWT.

## Monorepo layout

- **This folder** — Next.js UI + Supabase browser/server clients and middleware.
- **Repository root** — Express API (`npm run dev`) on port 4000 by default.

Run both while developing:

```bash
# terminal 1 — API
npm run dev

# terminal 2 — web
npm run dev:web
```

(from the repository root, `npm run dev:web` runs the app in `web/`)

On **Learning**, learners can **Mark course complete** for a course enrollment (calls `POST /api/learn/enrollments/complete`).
