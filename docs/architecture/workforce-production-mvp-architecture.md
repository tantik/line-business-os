# Workforce Production MVP Architecture

Status: **Architecture plan only. No SQL migrations are created in Phase 1K
and no production database behavior changes as part of this phase.** Phase
1L will create new, forward-only migrations after review; already-applied
migrations are never edited.
Phase: 1K. Read with: [`workforce-data-model.md`](./workforce-data-model.md),
[`workforce-rls-security-plan.md`](./workforce-rls-security-plan.md),
[`workforce-line-liff-entry-plan.md`](./workforce-line-liff-entry-plan.md),
[`overview.md`](./overview.md), [`multi-tenancy.md`](./multi-tenancy.md),
[`rbac.md`](./rbac.md),
[`../phase-1j-2-cafe-workforce-demo-closeout-report.md`](../phase-1j-2-cafe-workforce-demo-closeout-report.md).

## 1. Executive Summary

Phase 1J-2 shipped a public, unauthenticated cafe workforce demo
(`/demo/cafe*`) as a sales artifact. It intentionally has no backend, no
persistence, and no tenant model — every action is local React state that
resets on reload. Phase 1J-3 packaged that demo for a first real client
conversation. This document (Phase 1K) designs the real, persisted Workforce
module that a first paying cafe client can actually run on: tenant/location-
scoped data, RLS-enforced access, an `apps/api`-mediated write path, audit
logging, and a staff/manager role model — built as one module inside the
shared Core, not a bespoke per-client build.

This is a design document. It defines scope, data shape, security posture,
and phased delivery. It does not implement code, does not write SQL
migrations, and does not change any running app behavior. Implementation is
Phase 1L, informed by this document. Phase 1L will create new, forward-only
migrations after review; existing merged/applied migrations are never edited
in place.

`supabase/migrations/0009_workforce.sql` is historical context only: an
already-applied migration that created `workforce.employees`,
`workforce.shifts`, `workforce.shift_requests`, `workforce.leave_requests`,
and `workforce.attendance`, each tenant/location-scoped and RLS-gated via
`core.has_permission`. This plan does not propose editing that migration. It
follows the same tenant/location/RLS pattern it established, and Phase 1L
builds on it with new, forward-only migrations to add what the demo actually
promised a client — recipes, work reports with breaks, correction requests,
transportation cost, daily messages, and a monthly report.

## 2. Scope of the first production MVP

The first production MVP is the smallest real, persisted version of what the
demo showed a prospective client, restricted to a single tenant with a
single location (the first cafe client), built so a second tenant/location
can be added later without a schema rewrite:

- Tenant and location setup for the first real cafe client.
- Staff profiles (real, persisted, tenant/location-scoped).
- Manager users, distinguished from staff via Core RBAC.
- Recipe/manual CRUD (replacing the demo's hardcoded array).
- Staff recipe read access.
- Shift request persistence (the demo's shift-preference calendar, made
  real).
- Work report persistence (clock in/out, breaks — replacing local state).
- Transportation cost capture per work report.
- Daily message capture per work report.
- Correction request submission, persisted.
- Manager approval/rejection of correction requests, persisted and audited.
- A simple monthly report generated from real work-report data (not a CSV
  mock).

Everything in this list maps to a real, human-in-the-loop workflow the demo
already rehearsed. Nothing here requires payroll computation, legal
attendance certification, or LINE integration to be useful on its own.

## 3. What is intentionally excluded

Excluded from this MVP by deliberate scope decision, not oversight:

- Payroll calculation. The demo's 概算人件費合計 stays advisory-only; no
  production pay computation.
- Legal/statutory attendance compliance (Japanese labor law record-keeping
  guarantees). This system assists operations; it is not a certified
  attendance system.
- Full automatic shift optimization. The demo's auto-schedule concept may
  return later as an assist feature, not as this MVP's default behavior.
- POS integration.
- Accounting integration.
- Mass LINE broadcast messaging.
- Advanced AI automation (translation pipelines, anomaly detection, digest
  summaries) — plausible later, per the Phase 1J-2 closeout's AI review, but
  out of scope here.
- Complex billing automation.
- Complex multi-store rollout beyond the basic tenant/location model — the
  data model supports multiple locations per tenant from day one (§11), but
  this MVP's delivery target is one tenant, one location.

## 4. Module boundaries

Workforce remains a module inside the shared Core, following the layering in
[`overview.md`](./overview.md):

- **Core** (`core` schema, `packages/core`): tenants, locations, users,
  memberships, RBAC, LINE registry, audit. Workforce depends on Core; Core
  does not depend on Workforce.
- **Workforce module** (`workforce` schema, a future `packages/workforce`):
  staff profiles, recipes, shifts, work reports, corrections, transportation,
  daily messages, monthly reporting. Tenant-scoped and entitlement-gated via
  `core.tenant_modules`, same as Booking and any other module.
- **Apps**:
  - `apps/web` — adds authenticated Workforce routes (staff app, manager
    dashboard) alongside the existing unauthenticated `/demo/cafe*` routes,
    which stay as-is per §14. Uses the anon key + RLS; never holds
    `service_role`.
  - `apps/api` — adds Workforce service/controller code that derives tenant
    context from membership, enforces permissions, applies writes via the
    service-role client, and writes audit entries. Same request-flow pattern
    already documented in `overview.md`'s "Request flow (privileged write)."
  - `apps/worker` — candidate home for the monthly report generation job
    (§10), if it is scheduled rather than on-demand.

No new app, no new repo, no per-client fork. The first cafe client's data
lives in the same database as every other tenant, isolated by RLS.

## 5. User roles

Three Workforce-facing roles, matching the demo's staff/manager split and
mapping onto the existing Core RBAC roles in [`rbac.md`](./rbac.md):

| Workforce role | Maps to Core role                 | Summary |
| -------------- | ---------------------------------- | ------- |
| Owner          | Tenant Owner                       | Everything Manager can do, plus tenant/location/module settings and billing. Typically the cafe owner. |
| Manager        | Manager (tenant/location-scoped)   | Manage shifts, recipes, work reports, approve/reject correction requests, run monthly reports — within their assigned tenant/location. |
| Staff          | Employee (tenant/location-scoped)  | Read own shifts and recipes, submit own work reports and shift requests, submit own correction requests. Cannot see other staff's data. |

No new Core role is required — Owner/Manager/Staff are the Workforce-facing
names for Tenant Owner/Manager/Employee, kept distinct in this doc only
because that is the language the demo and sales materials already use with
the client. Platform Owner/Platform Support retain their existing
cross-tenant support role and are not part of normal Workforce operation.

## 6. Main user flows

1. **Tenant/location setup** (Owner, one-time): create tenant, create first
   location, invite Manager and Staff members, enable the `workforce` module
   for the tenant.
2. **Recipe onboarding** (Manager): create recipe categories and recipes so
   Staff have reference material from day one.
3. **Daily staff use** (Staff): open the staff app, clock in/out and log
   breaks, read shifts and recipes, log transportation cost and a daily
   message, submit a correction request if a past entry was wrong.
4. **Daily manager oversight** (Manager): review flagged/needs-review items,
   approve or reject correction requests, adjust shift assignments.
5. **Monthly reporting** (Manager/Owner): generate a monthly report from real
   work-report data per staff member.

## 7. Staff app production flows

Persisted equivalents of the demo's staff-facing behavior:

- **Clock in/out and breaks**: each action writes a `workforce.work_reports`
  row (clock in) and appends to `workforce.work_report_breaks`, updated on
  clock out — see [`workforce-data-model.md`](./workforce-data-model.md) §
  work_reports. Staff can only write their own rows, enforced by RLS keyed to
  their own `staff_profiles.id`, not a client-side constant like the demo's
  `CURRENT_STAFF_ID`.
- **Weekly shift view**: reads `workforce.shift_assignments` scoped to the
  staff member's own assignments within their tenant/location.
- **Recipe read**: reads `workforce.recipes` (and categories/ingredients/
  steps) scoped to the staff member's tenant, read-only.
- **Transportation cost and daily message**: captured as fields on the same
  `work_reports` row as the clock-in/out for that day (§ data model).
- **Shift preference / shift request**: writes a
  `workforce.shift_requests` row instead of flipping a local flag; visible to
  the submitting staff member and to Managers in their tenant/location.
- **Correction request**: writes a `workforce.work_report_corrections` row
  referencing the original `work_reports` row, with a `pending` status.
  Submission is the staff member's action only; approval is Manager-only
  (§8).

## 8. Manager dashboard production flows

Persisted equivalents of the demo's manager-facing behavior:

- **Weekly shift table / shift editing**: reads and writes
  `workforce.shift_assignments` for all staff within the Manager's
  tenant/location.
- **要確認 alerts**: computed from real data (missing clock-outs, pending
  correction requests, understaffed shift assignments) rather than the
  demo's fixed mock rule. Modeled as a view in the `api` schema, not a
  stored table — see [`workforce-data-model.md`](./workforce-data-model.md),
  `manager_alerts`.
- **Correction detail + approve/reject**: reads the correction request and
  the underlying work report, then writes an explicit decision (`approved`
  or `rejected`) back onto `workforce.work_report_corrections`, with
  `decided_by` and `decided_at` set and an `audit.audit_logs` entry written.
  This is the one flow the demo explicitly left as read-only (§8 of the
  Phase 1J-2 closeout) — production adds the actual decision action.
- **Recipe management**: create/update/archive `workforce.recipes` and
  related child rows within the Manager's tenant.
- **Staff management**: create/update/deactivate `workforce.staff_profiles`
  within the Manager's tenant/location. Role assignment itself (who is
  Manager vs. Staff) stays a Core RBAC action
  (`core.role_assignments`), not a Workforce-table field, so it is
  consistent with how every other module manages roles.
- **Monthly report**: see §10.

## 9. Recipe/manual production flows

- Manager-authored `workforce.recipe_categories` and `workforce.recipes`,
  with child `workforce.recipe_ingredients` and `workforce.recipe_steps`
  rows, plus an optional `workforce.recipe_notes` supplemental block (the
  demo's memo pattern, e.g. 抹茶液の作り方).
- Staff read their tenant's recipes only; no cross-tenant recipe visibility.
- JA/EN content fields carried over from the demo's manually authored
  parallel-language pattern — no automated translation in this MVP (AI
  translation assistance is a later, separate feature per the Phase 1J-2
  closeout's AI review).
- No public/anonymous recipe access in production — the demo's public
  `/demo/cafe/recipes` route stays a separate, unauthenticated marketing
  surface (§14); production recipe data requires tenant membership.

## 10. Monthly report production flow

- A monthly report is a read computed from real `workforce.work_reports`,
  `workforce.work_report_breaks`, and `workforce.transportation_expenses`
  rows for a given tenant/location and month — not a stored table.
- Exposed to Manager/Owner only, through an `api`-schema view or an
  `apps/api` endpoint (§12), scoped to their tenant/location.
- MVP output: a per-staff monthly summary (days worked, hours worked,
  transportation total) — the same shape as the demo's `MonthlyReportModal`
  table, now computed from real rows instead of mock data.
- CSV export, if built in this MVP, is generated server-side from the same
  query and is an audited action (who exported, when, for which
  tenant/location/period) — never a client-side-only confirmation flag like
  the demo's `CSVダウンロード（デモ）` button.
- Explicitly not payroll: this report states hours and cost inputs; it does
  not compute pay.

## 11. Tenant/location model

Follows [`multi-tenancy.md`](./multi-tenancy.md) exactly:

- Tenant = the cafe business (e.g. the first real client). Already modeled
  by `core.tenants`.
- Location = a physical cafe (e.g. the client's one shop today). Already
  modeled by `core.locations`.
- The first production MVP targets one tenant with one location, but every
  Workforce table carries both `tenant_id` and, where the data is physical
  (shifts, work reports, recipes tied to a specific kitchen, etc.),
  `location_id` from the first migration — not added later. This is what
  lets a second location, and eventually a second tenant, be added without a
  schema change.
- Staff and Manager membership in a tenant/location is a `core` schema
  concern (`core.tenant_memberships`, `core.role_assignments`), not
  duplicated inside `workforce` tables. A Workforce `staff_profiles` row
  references the underlying `core.users` row via `user_id`, the same
  pattern `workforce.employees` already uses in the historical
  `0009_workforce.sql` migration (referenced for precedent only).

## 12. API/view boundary

Follows the existing app-facing facade pattern from `overview.md` and
`supabase/migrations/0015_api_facade.sql`:

- `apps/web` never queries `workforce` tables directly with elevated
  privilege and never holds `service_role`. Reads either go through
  security-invoker views in the `api` schema (RLS still enforced as the
  caller) or through `apps/api` endpoints.
- All writes (clock in/out, correction requests, approvals, recipe/staff
  management, shift edits) go through `apps/api`, which:
  1. Derives `tenant_id`/`location_id` from the authenticated user's
     membership — never trusts a client-supplied tenant/location id.
  2. Calls `requirePermission(ctx, key)` for the relevant Workforce
     permission (e.g. a new `workforce.recipe.write`,
     `workforce.report.write`, `workforce.correction.approve` — extending
     `packages/core/src/permissions.ts`, itself an implementation-phase
     change, not part of this doc).
  3. Writes through the service-role client.
  4. Writes an `audit.audit_logs` entry.
- `manager_alerts` and the monthly report are read surfaces best modeled as
  `api`-schema views/functions rather than API-only logic, so RLS is the
  enforced boundary even if a view is queried directly — consistent with
  `api.my_tenant_memberships`'s security-invoker pattern.
- `anon` receives no grants on any `workforce` or Workforce-facing `api`
  object. The existing `/demo/cafe*` routes remain entirely separate, static,
  mock-data pages with no relationship to this API/view boundary (§14).

## 13. Audit requirements

Every real Workforce mutation writes an `audit.audit_logs` row (actor,
`actor_kind`, tenant, `module = 'workforce'`, entity, entity_id, action,
before/after where safe, metadata, timestamp), per
[`../security/security-requirements.md`](../security/security-requirements.md)
§6. At minimum:

- Work report create/update (clock in/out, break start/end).
- Correction request submission.
- Correction request approval/rejection (`decided_by`, decision, both
  before/after status).
- Shift request submission and decision.
- Shift assignment create/update.
- Recipe create/update/archive.
- Staff profile create/update/deactivate.
- Monthly report generation/export, including CSV export if built.

Before/after payloads must redact PII per the existing `redactPII` pattern —
never store raw staff names or free-text correction messages unredacted in
`audit.audit_logs.before`/`after` beyond what is already necessary to
understand the change (see
[`workforce-rls-security-plan.md`](./workforce-rls-security-plan.md) §13 for
detail).

## 14. Demo-to-production migration approach

This phase creates no SQL migrations. Phase 1L will create new,
forward-only migrations, reviewed before being applied to any environment.
Existing merged/applied migrations are never edited in place — the
historical schema is extended only by adding new migrations on top of it.

- The `/demo/cafe*` routes, `lib/demo/cafe/`, and `components/demo/cafe/`
  stay exactly as they are — a public, unauthenticated, static marketing
  surface. This document does not modify them, and Phase 1L implementation
  should not either.
- Production Workforce lives at new, authenticated routes (naming to be
  decided at implementation time, e.g. under the existing `(protected)`
  route group, distinct from both `/demo/cafe*` and `/dashboard`'s
  tenant-admin surface).
- Domain logic already drafted in `lib/demo/cafe/data.ts`
  (`generateAssignments`, `autoScheduleFutureAssignments`,
  `computeManagerAlerts`) is a useful first draft of business rules to
  reference during implementation, not code to lift wholesale — it has never
  been tenant-scoped or RLS-tested, per the Phase 1J-2 closeout's Backend
  review.
- Schema work happens entirely in new, forward-only migrations created in
  Phase 1L. `supabase/migrations/0009_workforce.sql` is referenced only as
  historical context for the tenant/location/RLS pattern it already
  established — it is not edited, and no new migration rewrites or replaces
  it. See [`workforce-data-model.md`](./workforce-data-model.md) for exactly
  which tables are proposed as new vs. built to be compatible with existing
  historical tables.
- No cutover risk exists yet because there is nothing to cut over from — the
  demo never persisted data. The migration is purely additive: new tables,
  new authenticated routes, new API endpoints, with the demo untouched as a
  sales artifact throughout.

## 15. MVP implementation phases

Recommended for Phase 1L (implementation), not committed here:

1. **Tenant/location + staff profiles + recipes.** The lowest-risk slice:
   read-heavy, no payroll-adjacent data, immediately useful (recipe sharing
   was already identified as an easy, low-risk sell in the Phase 1J-2
   closeout's Backend review).
2. **Shift requests + shift assignments.** A new, forward-only migration
   adds `shift_assignments` and any new `shift_requests` columns/values,
   built to be compatible with the historical `shifts`/`shift_requests`
   tables from `0009_workforce.sql` — that migration itself is not edited.
3. **Work reports + breaks + transportation + daily message.** The
   clock-in/out core loop.
4. **Correction requests + manager approval/rejection.** Requires the
   audited decision workflow (§8), so sequenced after the base work-report
   data exists.
5. **Monthly report.** A read over data produced by phase 3/4; sequenced
   last so it reports on real data, not placeholders.
6. **LINE/LIFF entry** (Phase 1M, per
   [`workforce-line-liff-entry-plan.md`](./workforce-line-liff-entry-plan.md)) —
   after the above is proven with direct authenticated web access.

Each phase should close with an own-tenant/cross-tenant/anon/no-JWT RLS
verification pass, per the existing platform pattern in
[`../product/mvp-roadmap.md`](../product/mvp-roadmap.md)'s First Client
Readiness Checklist.

## 16. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Treating this as a rebuild instead of building on the historical `0009_workforce.sql` schema | Phase 1L must add new, forward-only migrations compatible with existing tables/policies where they already fit (shifts, shift_requests) and add new tables for what is genuinely new (work reports, recipes, corrections, transportation, daily messages) — never edit an already-applied migration file. |
| Editing an already-merged/applied migration file directly (e.g. `0009_workforce.sql`) instead of adding a new one | Treat every historical migration as immutable. All Phase 1L schema changes ship as new, forward-only migration files, reviewed before being applied to any environment; no production database behavior changes in Phase 1K itself. |
| RLS gaps on new tables | Every new table ships with RLS enabled and a policy in the same migration that creates it, following the checklist in `multi-tenancy.md`; verified per §15 before each phase closes. |
| Correction approval becoming a rubber stamp instead of real manager review | Keep the approval action a distinct, explicit, audited decision (§8, §13) — never auto-approve, never batch-approve without individual review. |
| Scope creep re-adding demo-only features (auto-schedule, CSV mock) as "requirements" | §3's exclusions stand until a real client need is validated; auto-schedule in particular is explicitly deferred, not implicitly required. |
| PII exposure in staff names, correction messages, LINE user ids | Follow the existing encrypted + blind-index pattern (`workforce.employees.name_encrypted`/`name_hash` in `0009_workforce.sql`; `core.line_accounts` for LINE ids) for every new PII-bearing column — detailed in [`workforce-data-model.md`](./workforce-data-model.md) and [`workforce-rls-security-plan.md`](./workforce-rls-security-plan.md). |
| Confusing the demo with production in a client conversation | The demo stays untouched and separately routed (§14); sales materials from Phase 1J-3 already carry the disclaimer language distinguishing the two. |
| Building LINE integration before the core loop is proven | LINE/LIFF entry is sequenced last (§15, Phase 1M) and is designed as an entry layer only, per [`workforce-line-liff-entry-plan.md`](./workforce-line-liff-entry-plan.md) — never a prerequisite for the base Workforce loop to work over authenticated web access. |
