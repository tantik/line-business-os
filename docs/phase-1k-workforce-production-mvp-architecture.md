# Phase 1K — Workforce Production MVP Architecture

Status: **Phase complete. Architecture/design docs only — no code, schema,
or config changed. No SQL migrations are created in Phase 1K, and no
production database behavior changes as part of this phase.** Phase 1L will
create new, forward-only migrations after review; already-applied
migrations (e.g. `supabase/migrations/0009_workforce.sql`) are never edited.
Branch: `docs/phase-1k-workforce-production-mvp-architecture`.

Read with:
[`architecture/workforce-production-mvp-architecture.md`](./architecture/workforce-production-mvp-architecture.md),
[`architecture/workforce-data-model.md`](./architecture/workforce-data-model.md),
[`architecture/workforce-rls-security-plan.md`](./architecture/workforce-rls-security-plan.md),
[`architecture/workforce-line-liff-entry-plan.md`](./architecture/workforce-line-liff-entry-plan.md),
[`phase-1j-3-sales-validation-package.md`](./phase-1j-3-sales-validation-package.md),
[`phase-1j-2-cafe-workforce-demo-closeout-report.md`](./phase-1j-2-cafe-workforce-demo-closeout-report.md).

## What Phase 1K delivers

Four architecture documents designing the real, persisted, production
Workforce module — as opposed to the existing `/demo/cafe*` public demo,
which stays untouched, static, and mock-data-only:

1. **Production MVP architecture** — scope, exclusions, module boundaries,
   roles, user flows (staff/manager/recipe/monthly-report), tenant/location
   model, API/view boundary, audit requirements, demo-to-production
   migration approach, implementation phasing, and risks.
2. **Data model** — proposed `workforce` schema tables (staff profiles,
   recipes, shift assignments/requests, work reports/breaks/corrections,
   transportation, daily messages, manager alerts, location settings),
   designed to build on the historical `supabase/migrations/0009_workforce.sql`
   via new, forward-only migrations in Phase 1L rather than editing or
   replacing it, with `tenant_id`/`location_id` rules, relationships,
   indexes, and an explicit MVP-vs-later split.
3. **RLS and security plan** — security goals, threat model, a
   roles/permissions matrix (Owner/Manager/Staff), tenant and location
   isolation rules, per-role access rules, the app-facing API/view strategy,
   the `service_role` prohibition, audit requirements, a pgTAP/RLS test
   plan, sensitive-data handling, and backup/recovery notes.
4. **LINE/LIFF entry plan** — what LINE is (and is not) used for, the
   browser-demo-vs-production-entry distinction, LINE Official Account and
   Rich Menu concepts, the staff identity-linking flow, tenant/location
   routing, security concerns, and an explicit list of what requires manual
   human approval before it can happen.

All four documents are design-only: no SQL migrations, no RLS policies, no
API/route code, and no changes to `apps/web`, `apps/api`, `apps/worker`,
Supabase migrations, env files, or dependencies.

## Why it exists

Phase 1J-2 produced a sales-ready public demo with zero persistence, zero
tenant model, and zero real security boundary — appropriate for a sales
conversation, not for a paying client to actually run their cafe on. Phase
1J-3 packaged that demo for a first real client conversation but explicitly
did not design the production system. Once that conversation happens (or
while it is happening), the platform needs a concrete, reviewable
architecture for what the *real* Workforce module looks like — so
implementation (Phase 1L) can proceed against a plan instead of improvising
the tenant/RLS/audit model while writing migrations under time pressure.

## How it connects to Phase 1J-3

Phase 1J-3's sales validation package explicitly named Phase 1K as its next
step: "design the real, persisted Workforce module architecture (tenant/
location model, RLS policies, `apps/api` service boundary, audit event
shapes, migration plan)." This phase fulfills that scope. It also honors the
Phase 1J-2 closeout report's Backend/Database review, which was explicit
that production work should build on
`supabase/migrations/0009_workforce.sql`'s existing tenant/location-scoped
scaffolding — referenced only as historical context, never edited — rather
than starting a parallel schema. Every table proposed in
[`architecture/workforce-data-model.md`](./architecture/workforce-data-model.md)
is framed as either a new migration compatible with an existing historical
table or a clearly-scoped new one, with the reasoning stated inline; no SQL
migrations are created by Phase 1K itself.

## What docs were created

| Document | Purpose |
| --- | --- |
| [`architecture/workforce-production-mvp-architecture.md`](./architecture/workforce-production-mvp-architecture.md) | The production MVP's scope, flows, roles, and phasing. |
| [`architecture/workforce-data-model.md`](./architecture/workforce-data-model.md) | Proposed tables, fields, relationships, indexes — design only, no SQL. |
| [`architecture/workforce-rls-security-plan.md`](./architecture/workforce-rls-security-plan.md) | Security goals, threat model, permissions matrix, RLS rules, audit and test plan. |
| [`architecture/workforce-line-liff-entry-plan.md`](./architecture/workforce-line-liff-entry-plan.md) | LINE/LIFF as an entry and notification layer, explicitly not the database and not active yet. |
| This document | Phase closeout tying the four architecture docs together and recommending the next phase. |

[`product/mvp-roadmap.md`](./product/mvp-roadmap.md) was also updated
minimally to record Phase 1K as complete and link to these documents.

## Next phase recommendation

### Phase 1L — First Real Workforce MVP Slice

Goal: implement the smallest real, persisted Workforce slice, informed by
the Phase 1K documents rather than by improvising schema/RLS decisions
during implementation.

Suggested sequencing (detailed further in
[`architecture/workforce-production-mvp-architecture.md`](./architecture/workforce-production-mvp-architecture.md)
§15, not finalized here):

1. Create new, forward-only migrations for the safest first slice:
   tenant/location-aware staff profiles, plus recipes/manuals (read-heavy,
   no payroll-adjacent data, already identified as an easy, low-risk first
   sell).
2. Then shift requests: a new, forward-only migration that builds on the
   historical `0009_workforce.sql`'s existing `shift_requests`/`shifts`
   tables (that migration itself is not edited or replaced).
3. Then work reports and correction requests, including the real
   manager approve/reject action the demo never had.
4. Then LINE/LIFF entry, once the base authenticated web flow is proven —
   per [`architecture/workforce-line-liff-entry-plan.md`](./architecture/workforce-line-liff-entry-plan.md).

The exact migration order, RLS policy text, and `apps/api` endpoint shapes
are to be decided during Phase 1L itself, after reviewing these Phase 1K
documents — this phase deliberately stops at the design boundary and does
not pre-write implementation.
