# MVP Roadmap

## Product Direction

LINE Business OS is one multi-tenant SaaS platform for Japanese SMBs, not a
separate project per client. Each client business is a tenant. Product modules
run on shared Core services: auth, tenant context, RBAC, audit, database access,
LINE integration, and future AI support.

The MVP should stay lean: strong tenant isolation, safe operations, practical
admin workflows, and one useful vertical module before broad automation.

Read with:

- [`../../PROJECT_BRIEF.md`](../../PROJECT_BRIEF.md)
- [`modules.md`](./modules.md)
- [`demo-vs-client-template.md`](./demo-vs-client-template.md)
- [`../architecture/overview.md`](../architecture/overview.md)
- [`../security/security-requirements.md`](../security/security-requirements.md)
- [`../operations/deployment-checklist.md`](../operations/deployment-checklist.md)

## Current Foundation

Based on the current repository docs, the platform already has:

- Monorepo structure for `apps/web`, `apps/api`, `apps/worker`, and shared
  packages.
- Supabase/PostgreSQL schema foundation with Core, audit, Workforce, Booking,
  and AI schemas.
- Multi-tenant direction based on `tenant_id`, `location_id`, RBAC, and RLS.
- Security requirements for service-role isolation, PII encryption, audit logs,
  LINE webhook verification, and AI human-in-the-loop changes.
- App-layer tenant/auth foundation and safe dashboard/admin read surfaces.
- Admin/member visibility foundation through app-facing `api` facades.
- AI/project rules and Cursor/agent guardrails for safe AI-assisted coding,
  including Claude Code guardrails (PR #60).
- Local onboarding, backup/DR, incident response, and env inventory runbooks.
- Phase 1I Stage 3D complete: an auth redirect fix (PR #61) plus a manual
  auth smoke test on the **Vercel dev deployment** (Supabase Cloud dev
  backing it) — health checks, sign-in, `/dashboard`, `/dashboard/admin`,
  sign-out, and invalid-login handling all verified working end-to-end. See
  [`../phase-1i-stage-3d-completion-report.md`](../phase-1i-stage-3d-completion-report.md).
  Production/`main` was **not** updated as part of this — dev/preview only.
- Phase 1J-1H complete: an `apps/api` auth-boundary check
  (`api.has_permission`) is now reachable end-to-end from `apps/web` and
  verified with a **local** Supabase E2E smoke test (local auth user, gated
  local onboarding commit, `/dashboard`, and a new
  `/dashboard/auth-boundary-smoke` page) — PR #70. A local-runtime fix for
  `apps/api` (Express 4 alignment, `tsx` as the workspace-TypeScript runtime
  loader, non-stale incremental build) was required to run it locally — PR
  #71. See
  [`../phase-1j-1h-completion-report.md`](../phase-1j-1h-completion-report.md).
  No Cloud Supabase and no production deployment were part of this phase.
  This phase also clarified that `/dashboard` is the tenant/customer
  dashboard, not the future internal platform/operator admin area (see
  [`../architecture/overview.md`](../architecture/overview.md)).
- Phase 1J-2 complete: a public, unauthenticated cafe workforce demo
  (`/demo/cafe`, `/demo/cafe/recipes`, `/demo/cafe/manager`,
  `/demo/cafe/guide`) shipped across PRs #73, #75, #76, #77 — staff/manager
  UI, recipe sharing, a manager correction-detail fix, help popovers, and a
  premium guide page. **UI and mock data only** — no schema, no `apps/api`,
  no LINE integration, and no change to `/dashboard`, `/workforce`, or
  `/booking`. This is a sales/demo-ready proof of concept, not the production
  Workforce module. See
  [`../phase-1j-2-cafe-workforce-demo-closeout-report.md`](../phase-1j-2-cafe-workforce-demo-closeout-report.md).
- Phase 1J-3 complete: a docs-only Cafe Workforce sales validation package —
  a first-client message, a demo script, an interview checklist, an 8-week
  free pilot definition (継続時 月額4,980円（税別）, 0円 setup for this first
  development partner), and internal pricing notes. No code, schema, or
  config changed. See
  [`../phase-1j-3-sales-validation-package.md`](../phase-1j-3-sales-validation-package.md).
- Phase 1K complete: a docs-only Workforce production MVP architecture —
  scope/flows/phasing, a proposed `workforce` data model designed to build
  on the historical `supabase/migrations/0009_workforce.sql` via new,
  forward-only migrations (that migration is not edited), an RLS/security
  plan (roles/permissions matrix, tenant/location isolation, audit, pgTAP
  test plan), and a LINE/LIFF entry plan (not yet implemented). No code,
  schema, or config changed, and no production database behavior changes.
  See
  [`../phase-1k-workforce-production-mvp-architecture.md`](../phase-1k-workforce-production-mvp-architecture.md)
  and [`../architecture/overview.md`](../architecture/overview.md).
- Phase 1L-0 complete: a docs-only Workforce first MVP slice implementation
  plan — inspected the current migrations/RBAC/audit/API-facade/pgTAP state,
  confirmed staff profiles (extending `workforce.employees`) + recipe/manual
  sharing as the first Phase 1L slice, and produced a concrete data-model/
  RLS/API/audit/test/migration plan for Phase 1L-1. Closed both open
  implementation decisions: recipe publish state is a `text` + `check`
  `status` column (`draft`/`published`/`archived`, not an enum, not an
  `is_active` overload), and Workforce adds five new explicit permissions
  (`workforce.staff.read`/`.manage`, `workforce.recipe.read`/`.manage`/
  `.publish`) rather than reusing `workforce.shift.*`. No code, schema, or
  config changed. See
  [`../phase-1l-0-workforce-mvp-slice-plan.md`](../phase-1l-0-workforce-mvp-slice-plan.md).
- Phase 1L-1 through 1L-3 complete: Workforce staff profiles + recipes DB
  foundation, RLS policies, and the `api.workforce_*` API facade views landed
  through local migrations `0020`–`0023` (PRs #82, #83, #84).
- Phase 1L-4 complete: the Supabase Cloud dev project (`line-business-os-dev`)
  was synced to local migrations `0019`–`0023` — this also applied the
  previously pending `0019_api_has_permission_facade.sql` — dry-run
  reviewed, then applied via `db push --linked`, then verified via
  `migration list --linked`
  (Local = Remote through `0023`). Anonymous REST checks confirmed the
  `workforce` schema and the new `api.workforce_*` facade views remain
  unreachable by anon requests; the Dashboard's exposed-schema config was
  manually confirmed as `public`, `graphql_public`, `api` only. Production
  was not touched. See
  [`../phase-1l-4-cloud-dev-sync-completion-report.md`](../phase-1l-4-cloud-dev-sync-completion-report.md).

This does not mean Workforce, Booking, CRM, analytics, billing, or production
customer onboarding are complete.

## Next Recommended Step

**Phase 1L-5 — app/API integration planning** for the Workforce staff
profile and recipe facade views now available in Cloud dev, per
[`../phase-1l-4-cloud-dev-sync-completion-report.md`](../phase-1l-4-cloud-dev-sync-completion-report.md)
(itself building on
[`../phase-1l-0-workforce-mvp-slice-plan.md`](../phase-1l-0-workforce-mvp-slice-plan.md)
and
[`../phase-1k-workforce-production-mvp-architecture.md`](../phase-1k-workforce-production-mvp-architecture.md)).
Production sync remains gated behind a separate production readiness review.
A plan-only design for a separate internal platform/operator admin area
(`/platform` or `/ops`) is a later, independent step — see
[`../phase-1j-1h-completion-report.md`](../phase-1j-1h-completion-report.md).

## MVP Build Order

1. **Core platform foundation** - schemas, RLS, RBAC, audit, env validation, CI,
   and local-first database workflow.
2. **Auth and tenant/member context** - sign-in, protected routes, tenant
   membership lookup, active tenant selection, safe unauthorized/error states.
3. **Admin dashboard foundation** - read-only tenant/admin summaries, locations,
   modules, member visibility, and no write actions until approved.
4. **First vertical module readiness** - choose the first module, wire it through
   Core permissions, tenant modules, RLS, audit, and safe UI.
5. **First real client onboarding** - controlled tenant setup, owner membership,
   module enablement, backup gate, verification, and redacted run report.
6. **Production deployment readiness** - Vercel/Supabase production separation,
   env review, migration approval, smoke tests, rollback plan.
7. **Pilot operation** - run one or a few customers, collect feedback, fix
   reliability and UX issues before scaling features.

## First Client Readiness Checklist

- [ ] Tenant creation/onboarding flow is reviewed and repeatable.
- [ ] Admin/member visibility works without exposing PII, user IDs, auth IDs, or
      role internals.
- [ ] Auth/session behavior is verified in the deployment target.
- [ ] RLS is verified for own-tenant, cross-tenant, anon, and no-JWT cases.
- [ ] Audit logs exist for any real business mutations.
- [ ] [`../operations/deployment-checklist.md`](../operations/deployment-checklist.md)
      is complete for the target environment.
- [ ] Backup/DR and incident runbooks are reviewed.
- [ ] Minimal support process is prepared: who responds, where incidents are
      recorded, and how customer-impacting issues are escalated.
- [ ] Japanese legal/privacy review is complete before broad sales or handling
      production customer PII at scale.

## Post-launch Priorities

- Improve onboarding and operator experience.
- Add customer-facing features in the first vertical module.
- Add analytics for tenant/admin insight after data boundaries are proven.
- Add AI support or RAG only after tenant-scoped retrieval and approval paths are
  safe.
- Add billing/subscriptions later, after pricing and operational support are
  clearer.
- Improve UI consistency and a small design system as screens multiply.
- Add automated QA/security tests around core tenant isolation and critical
  workflows.

## Sprint-style Breakdown

- **Sprint 0: production readiness docs + Vercel setup** - finish deployment
  checklist, env inventory review, preview/prod separation.
- **Sprint 1: deployment + smoke tests** - deploy preview, verify auth, health,
  dashboard/admin, and tenant isolation behavior. **Dev/preview auth smoke
  verified** (Phase 1I Stage 3D); production deployment and promotion are
  still pending and require explicit approval.
- **Sprint 2: first client onboarding hardening** - rehearse onboarding,
  backup/restore assumptions, support handoff, and redacted reporting.
- **Sprint 3: first module MVP** - ship the smallest useful Workforce or Booking
  workflow through Core permissions, RLS, and audit.
- **Sprint 4: pilot feedback + fixes** - stabilize UX, support, onboarding, and
  operational gaps found by the pilot.
- **Sprint 5+: scale/security/billing/analytics** - improve tests, monitoring,
  billing, analytics, and carefully scoped AI features.

## What Not To Build Yet

- Complex agent frameworks.
- Full enterprise design system.
- Unnecessary microservices.
- Premature multi-region infrastructure.
- Heavy workflow automation before the manual process is understood.
- Broad AI automation that writes business data directly.
- Per-client forks, per-client repos, or per-client app projects.

## Risks

- Tenant data leakage through RLS mistakes, broad grants, or raw internal schema
  exposure.
- Production migration mistakes or accidental Cloud target confusion.
- Env misconfiguration between local, Cloud dev, preview, and production.
- Unclear first-client process leading to manual, risky setup.
- Overbuilding before pilot feedback.
- Japanese legal/privacy gaps around PII, customer messaging, and operational
  records.
