# Render Backend Deploy (MyAcademy API)

Use this guide to deploy `src/server` API to Render Free.

## 1) Prerequisites

- GitHub repo connected to Render.
- Supabase remote project already linked and migrated.
- Backend uses `npm run build` and `npm run start` from repo root.

## 2) Create Service in Render

Option A (recommended): Blueprint

1. In Render, choose **New +** -> **Blueprint**.
2. Select this repository.
3. Render will detect `render.yaml` and propose service `myacademy-api`.
4. Continue and set secret env vars (below).

Option B: Manual Web Service

- Runtime: `Node`
- Root Directory: repo root
- Build Command: `npm install && npm run build`
- Start Command: `npm run start`
- Health Check Path: `/health`
- Plan: `Free`

## 3) Required Environment Variables (API)

Set these in Render service environment:

- `SUPABASE_URL` = your hosted Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` = service role key (server only)
- `ALLOW_AUTH_DEV_HEADERS` = `0`

Strongly recommended:

- `PUBLIC_WEB_APP_URL` = your frontend URL (used by billing redirects)
- `MAIL_FROM` and SMTP variables if transactional mail is enabled
- CHIP billing variables if payments are enabled

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to frontend or browser builds.

## 4) After First Deploy

Run these checks on deployed API base URL:

1. `GET /health` -> must return `200` with `{ "ok": true }`.
2. Call one protected endpoint with a valid bearer token:
   - `GET /api/me/memberships`
   - Expect `200`.
3. Call same endpoint without token:
   - Expect `401`.

## 5) Frontend Wiring (Vercel or other)

Set web app environment:

- `API_URL` = Render API URL (for server actions/proxy routes)
- `NEXT_PUBLIC_SUPABASE_URL` = Supabase hosted URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = publishable key

Keep web and API origins on HTTPS.

## 6) Production Safety Checklist

- `ALLOW_AUTH_DEV_HEADERS` is disabled (`0` or unset).
- `CHIP_COLLECT_WEBHOOK_SKIP_SIGNATURE_VERIFY` is `0`.
- Service role key only exists on backend host.
- TLS is enabled on API domain.
- Remote migrations are in sync:
  - `supabase migration list --linked`

