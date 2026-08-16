# Deployment Checklist

## Purpose

This checklist protects LINE Business OS from environment mistakes, Supabase
project mixups, unsafe migrations, RLS regressions, and accidental production
changes. It is intentionally practical: use it before deploying the web app or
applying database changes.

Read with:

- [`env-inventory.md`](./env-inventory.md)
- [`incident-response-runbook.md`](./incident-response-runbook.md)
- [`backup-dr-runbook.md`](./backup-dr-runbook.md)
- [`../supabase-cloud-dev-setup.md`](../supabase-cloud-dev-setup.md)
- [`../security/security-requirements.md`](../security/security-requirements.md)

## Environments

- **Local development** - local Supabase stack, local env files, safe for daily
  development and local resets.
- **Supabase Cloud dev** - hosted dev database for reviewed integration checks.
  Cloud writes remain approval-gated.
- **Future Supabase production** - separate project for real customer data. It
  must never share local/dev credentials or ad hoc migration flow.
- **Vercel preview** - deploy previews for branches/PRs. Use preview-scoped env
  values only.
- **Vercel production** - customer-facing deployment. Production deploys require
  human approval and post-deploy smoke tests.

Do not record real project IDs, URLs, tokens, credentials, or secrets in this
repo.

## Environment Variables

- `.env.example` is the public template for variable names and placeholder
  shapes.
- [`env-inventory.md`](./env-inventory.md) is the source of truth for what each
  env variable means, where it belongs, and whether it is public or secret.
- Real env values must stay in local ignored files, Vercel env settings, Supabase
  settings, or a password manager - never in Git, docs, chat, screenshots, or
  logs.
- `service_role` is server-only. It must never be exposed to frontend code,
  browser bundles, `NEXT_PUBLIC_*`, or Vercel client-side env.
- Vercel env values must be scoped correctly:
  - preview values for preview deployments
  - production values for production deployments
  - no production secrets in preview unless explicitly approved

## Pre-deploy Checklist

- [ ] `git status --short` is clean except for intentional deployment docs or
      code changes.
- [ ] Current branch is correct for the release or PR.
- [ ] CI is green for the commit to deploy.
- [ ] Local `typecheck`, `test`, `build`, and `lint` passed for affected
      packages.
- [ ] Env variable names in code match `.env.example` and
      [`env-inventory.md`](./env-inventory.md).
- [ ] Diff contains no secrets, credentials, private keys, JWTs, DB URLs, or
      customer PII.
- [ ] Frontend code does not import service clients or reference service-role
      env values.
- [ ] Supabase target is confirmed: local, Cloud dev, or production.
- [ ] If database changes exist, migration review and approval were completed.

## Supabase Migration Safety

- Test migrations locally first with a reset/test flow appropriate to the task.
- Do not run destructive SQL without explicit review.
- Production migrations require human approval. Agents never self-approve a
  production `db push`.
- Every new business table must include `tenant_id` and RLS in the same
  migration.
- Verify RLS behavior with database tests before exposing new data surfaces.
- Confirm app-facing API/Data API exposure uses the intended schemas only. Raw
  internal schemas such as `core`, `audit`, `workforce`, `booking`, and `ai`
  should not become browser-facing unless a reviewed ADR says otherwise.
- Cloud dev and production must not be confused. Check the target before every
  Cloud command.

## Vercel Deployment Checklist

- [ ] Create or import the Vercel project from the GitHub repo.
- [ ] Confirm framework, package manager, install command, and build command only
      if Vercel does not infer them correctly.
- [ ] Add env variables from the approved inventory only.
- [ ] Keep preview and production env values separate.
- [ ] Deploy preview first.
- [ ] Smoke test the preview before production promotion.
- [ ] Verify protected pages do not leak tenant data, user IDs, secrets, or raw
      errors.
- [ ] Deploy production only after preview smoke tests and human approval.

## Smoke Tests After Deploy

- [ ] App loads.
- [ ] `/api/health` returns the expected safe status shape.
- [ ] Auth flow behaves as expected.
- [ ] Dashboard and admin safe states render without raw error details.
- [ ] Anonymous access is denied where expected.
- [ ] Tenant data is not visible without authorization.
- [ ] Browser HTML, console output, and network responses do not show private env
      values.
- [ ] Server logs contain no secrets, credentials, PII, JWTs, or DB URLs.
- [ ] Obvious runtime errors are checked in browser console and Vercel logs.

## Rollback

- For bad app deploys, use Vercel rollback or redeploy the previous known-good
  deployment.
- Database rollback is not automatic.
- Database changes require a migration-specific rollback plan, restore plan, or
  forward-fix migration.
- If data exposure, tenant isolation failure, or security impact is suspected,
  use [`incident-response-runbook.md`](./incident-response-runbook.md).

## Human Approval Required

These actions require explicit manual approval:

- Production deploy.
- `supabase db push` to production.
- Destructive SQL or data repair.
- RLS/security policy changes.
- Billing changes.
- LINE broadcast or mass messaging.
- Any service-role usage path.
- Customer data export or delete.
