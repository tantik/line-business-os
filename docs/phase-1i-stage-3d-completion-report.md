# Phase 1I Stage 3D Completion Report — Auth Redirect Fix + Vercel Dev Auth Preview Smoke

## Executive summary

Stage 3D closed out two items on top of the Phase 1I admin dashboard work
(Stages 1-3C): a small app-layer fix for a redirect bug found after
`sign-in`/`sign-out`, and a manual smoke test of the auth flow against the
Vercel dev deployment (backed by Supabase Cloud dev). No database, RLS, or
schema changes were part of this stage.

## Status summary

- Phase 1I Stage 3D: **complete**.
- Branch: `dev`.
- Latest local `dev` commit: `dec2730` — merge of PR #61
  (`fix/phase-1i-stage-3d-auth-redirects`).
- Production/`main` was **not** updated as part of this stage. This is
  intentional — see "Production status" below.

Recent history (newest first):

- `dec2730` Merge PR #61 (`fix(web): refresh auth routes after session
  changes`)
- `1cbea8a` fix(web): refresh auth routes after session changes
- `fc5e00c` Merge PR #60 (`chore(claude): add minimal Claude Code guardrails`)
- `0b88554` chore(claude): add minimal Claude Code guardrails
- `6f44e94` Merge PR #59 (Stage 3C admin UI polish)

## What Stage 3D delivered

- **PR #60 — Claude Code guardrails.** Added `.claude/settings.json`, two
  project skills (pre-PR verification, tenant/RLS audit), and pointer updates
  in `AGENTS.md`/`CLAUDE.md` so AI-assisted work in this repo follows the same
  safety rules as human contributors. No app or database changes.
- **PR #61 — auth redirect fix.** Fixed a bug in `apps/web/src/lib/auth/actions.ts`
  where, after `sign-in` or `sign-out`, the client Router Cache could still
  serve pre-mutation page output, so the redirect to `/dashboard` (or back to
  `/sign-in`) appeared to do nothing until a manual reload. The fix calls
  `revalidatePath('/', 'layout')` before each post-mutation redirect. No
  database, RLS, or auth-provider changes.
- **Vercel dev deployment auth smoke test.** Manually verified the full
  sign-in/sign-out path on the Vercel dev deployment (Supabase Cloud dev
  backing it), confirming the redirect fix resolved the issue and that the
  admin dashboard route is reachable end-to-end for an authenticated tenant
  member.

## Manual smoke result (Vercel dev deployment)

Performed manually in the browser against the Vercel dev deployment. No
passwords, tokens, project URLs, or user UUIDs are recorded here.

1. `/api/health` returns status `ok` — PASS
2. `checks.app` — PASS
3. `checks.config` — PASS
4. `checks.supabase` — PASS
5. Valid login redirects immediately to `/dashboard` — PASS
6. `/dashboard` works — PASS
7. `/dashboard/admin` works — PASS
8. Logout redirects immediately to `/sign-in` — PASS
9. Invalid login shows a generic error only — PASS
10. No browser console or network errors observed — PASS

Cloud dev auth (sign-in, sign-out, and protected/admin route access) is
confirmed working end-to-end on the Vercel dev deployment. Credentials were
entered only in the browser and are not recorded anywhere in this repo.

## Production status

Production/`main` was **intentionally not updated** in this stage. Stage 3D
scope was limited to the `dev` branch and the Vercel dev deployment; promoting
to production requires a separate, explicitly approved deployment step per
[`operations/deployment-checklist.md`](./operations/deployment-checklist.md).

## Security confirmations

- No `service_role` usage anywhere in the Stage 3D changes.
- The redirect fix only affects client cache invalidation timing
  (`revalidatePath`); it does not change auth logic, session handling, or
  error messages.
- Auth outcomes remain generic (bad credentials still map to a single generic
  error state; no account enumeration).
- No migrations were created, edited, or applied. No Supabase Cloud settings
  were changed.
- No secrets, credentials, project URLs, JWTs, DB URLs, passwords, or user
  UUIDs are recorded in this report.

## Out of scope / not built

- Any Workforce, Booking, CRM, or other product-module functionality.
- Any database schema or RLS changes.
- Production/`main` deployment or promotion.
- Sign-up, password reset, OAuth, or LINE login.

## Recommended next phase

**Phase 1J-1 — Workforce MVP architecture plan.** Produce a plan-only design
for the first vertical module (Workforce) — schema shape, RLS boundaries,
Core permission wiring, and safe UI surface — before any migration or RLS
implementation work begins. No database or code changes should occur until
that plan is reviewed and approved.

## What was intentionally not done by this report

- Documentation only: no app code, tests, or migrations were modified in
  producing this report.
- No Cloud writes, Cloud setting changes, Supabase CLI commands, or Vercel env
  changes were performed.
- No production/`main` changes were made.
- No secrets, passwords, tokens, project URLs, JWTs, DB URLs, or user/auth IDs
  are included here.
