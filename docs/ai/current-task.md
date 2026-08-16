# LINE Business OS — Current Task

Canonical current-state file per `documentation-and-decision-hierarchy.md` §2
and `docs/ai/oaes-project-profile.md` "Context continuity". This is not a
changelog — historical execution detail lives in git history and in the dated
mission reports/handoffs under `docs/ai/`; this file states only the current
verified stage, active constraints, and the next gate.

## 1. Governance state

- `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` is the canonical
  definition of how a Claude Code session runs a mission here (autonomy
  boundaries, evidence discipline, mission/handoff/completion-report formats).
- **ORUWA AI Governance Consolidation** — complete across phases:
  - Phase 1 (read-only audit) — complete:
    `docs/ai/ORUWA_AI_GOVERNANCE_CONSOLIDATION_AUDIT.md`.
  - Phase 2A (approval-authority reconciliation between
    `oaes-project-profile.md`/`oruwa-engineering-principles-and-governance.md`
    §7.5 and the Operating Model) — complete, merged via PR #236.
  - Phase 2B (unique-information consolidation — migrated still-valid content
    out of `docs/project/*` and the stale `docs/ai/` standing docs into
    `docs/ai/current-task.md`, `docs/ai/review-checklists.md`, and
    `docs/operations/risk-register.md`) — complete, merged via PR #237.
  - Phase 2C (deletion of the superseded governance/state/history files
    Phase 2B marked SAFE_TO_DELETE, plus §4–6 of `docs/AI_PLAYBOOK.md`
    migrated to `docs/architecture/frontend-engineering-standards.md`) —
    complete, merged via PR #238.
- `docs/project/*`, `scripts/project-handoff.ps1`, `docs/ai/project-context.md`,
  `docs/ai/agent-roles.md`, `docs/ai/oaes-integration-acceptance-report.md`,
  have been deleted (Phase 2C, 2026-08-15). Their
  still-valid content survives in `docs/ai/current-task.md` (this file),
  `docs/ai/review-checklists.md`, `docs/operations/risk-register.md`, and
  `docs/architecture/frontend-engineering-standards.md`. `docs/ai/current-task.md`
  is the single canonical mission-state mechanism going forward. Do not
  recreate any of the deleted files under new names. `docs/AI_PLAYBOOK.md`
  remains tracked but is non-canonical and superseded/migrated; do not use it
  as current mission or route authority.

## 2. Cafe product state

Cafe Package v2.0 remains frozen (bug/security/accessibility/localization
fixes and bounded release polish only; new features require a new Product
Review). **Cafe Package v2.1 is CLOSED** (Final Founder Acceptance recorded
2026-08-16, see §2.3). This is not a Commercial Release — production remains
separately gated and was not enabled (see "Verified baseline" below).

Verified baseline:

- Base branch: `dev`. Local migrations extend through `0068` (committed);
  pgTAP test files extend through `0036` (directory listing, VERIFIED
  2026-08-15 — pass/fail counts NOT re-run this session, do not assume a
  prior session's numbers still apply without re-running).
- v2.0 authenticated acceptance: `docs/product/cafe-package-v2-acceptance-report.md`.
- v2.1 evidence of record: `docs/product/cafe-package-v2-1-acceptance-report.md`,
  `docs/product/cafe-package-v2-1-founder-acceptance-audit.md`,
  `docs/product/cafe-package-v2-1-final-live-founder-acceptance.md` (2026-08-10,
  stale/superseded — see that file and §2.3),
  `docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md`, and the closing
  record `docs/product/cafe-package-v2-1-final-founder-acceptance-2026-08-16.md`.
  Do not reuse v2.0 PASS results as proof of changed v2.1 surfaces.
- Production remains separately gated and was not enabled.

### 2.1 Canonical Staff surface (settled)

`(protected)/dashboard/workforce/**` ("Surface B") is the canonical Cafe
Staff/Manager product surface — Founder decision, PR #228 (2026-08-14),
ratified with no contradicting evidence by
`docs/ai/CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_AUDIT_2026-08-15.md`. The
`%5Fclient-preview/mame-to-cha/**` surface ("Surface A", preview-host-only)
served as the client-acceptance/UX-reference environment during Cafe v2.1
development; **retired and deleted 2026-08-16, PR #266** (see §2.4 step 1
for detail), once Surface B had closed the gaps that motivated keeping it.
The unauthenticated `mame-to-cha/**` / `demo/cafe/**` surfaces are
intentional public marketing demos, out of scope for "real Staff product
experience," and were not touched by that removal.

### 2.2 Staff onboarding (proven end-to-end)

The invite → email → password-setup → `api.accept_employee_invitation`
onboarding chain is proven working for a genuine first-time hire with zero
manual Admin-API recovery, via the server-side `token_hash`/`verifyOtp`
callback fix (PR #233, merged) plus a Founder-applied Supabase Invite email
template change. Verified live end-to-end for Staff C on the `oruwa-cafe`
reference tenant (`docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md`
§33, `docs/ai/CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_HANDOFF_2026-08-15.md`
§3). Do not reopen this result without new contradicting evidence.

### 2.3 Whole-Product Gate and Final Bounded Closure

The Whole-Product Integrity & Completeness Gate completed after PR #240 with
verdict `CAFE_V2_1_READY_AFTER_BOUNDED_FIXES`: **P0 = 0, P1 = 2**. Full
evidence and the durable P2/P3 register are in
`docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md`.

The only authorized implementation closure scope is:

1. **F1** — localize the Manager Add/Edit Staff modal.
2. **F2** — localize the Manager Shift Cell Editor.

Implementation merged into `dev` through PR #241 (`ed1de927`); CI and Vercel
passed. **Authenticated Preview QA, independent review, and Final Founder
Acceptance have since completed** (2026-08-16): both F1 and F2 verified
PASS live on `preview.oruwa.jp` (JA rendering confirmed in the Add/Edit
Staff modal and the shift-assignment editor, persisted across reload), no
P0/P1 regression found. Full evidence:
`docs/product/cafe-package-v2-1-final-founder-acceptance-2026-08-16.md`.
**Cafe v2.1 is CLOSED on this basis.**

Known P2/P3 findings remain durable **Cafe Hardening / Deferred Debt**. They
are not fixed, forgotten, or release blockers, and they are not automatically
authorized as the next mission. Cafe Product Growth (Checklists, Manuals
integration, report/problem lifecycle, lightweight Training, Weekly Review,
Inventory improvements) is a separate post-v2.1 candidate category. The IA/
navigation and visual/UX reconciliation of the canonical surface against the
Surface A reference (route naming, mobile styling, presentation polish) is
also not started by this closure — it is planned future work
(`docs/strategy/go-to-market-roadmap.md` §3; `../ORUWA-info.md` §15 Horizon
B) and requires its own bounded Product/Founder decision to begin, same as
any other post-v2.1 category.

### 2.4 Cafe Commercial Launch Readiness (separate, higher gate — step 1 in progress)

**"Cafe v2.1 CLOSED" (§2.3) is a bounded, code-scoped closure — F1/F2 only,
against the frozen Whole-Product Gate backlog.** It is not the same claim as
"Cafe is ready to sell." Founder decision 2026-08-16: a distinct, higher gate
— **Cafe Commercial Launch Readiness** — must pass before Cafe is treated as
commercially launch-ready. This gate is intentionally **not** folded back
into "Cafe v2.1," because it bundles two different kinds of work with
different owners and timelines:

- **Cafe-specific work** (belongs to this product, no other vertical depends
  on it): IA/route reconciliation (`/dashboard/workforce/manager` is
  internal/technical, not decided customer-facing IA) and visual/UX
  reconciliation of the canonical surface against the Surface A reference,
  plus the remaining Cafe Hardening / Deferred Debt items above.
- **Platform-wide work** (not Cafe-specific — required by any future
  vertical, tracked at Horizon C / `docs/foundation/platform-foundation-roadmap.md`,
  not owned by a Cafe mission): the accepted critical path Entitlements
  engine → Module Registry → Shared Navigation/Settings → Notifications →
  Event Bus.

Recording both under a single "Cafe v2.1" label would conflate one
product's versioning with platform-wide infrastructure completion — this
gate exists precisely to avoid that conflation while still giving the
Founder the single "is it actually ready to launch" answer they asked for.

Sequence (recommended):

1. Cafe IA/visual reconciliation + remaining Cafe Hardening items (one
   focused pass, same surface). **In progress, partially complete as of
   2026-08-16:**
   - **Done, merged to `dev`:** IA/route reconciliation
     (`/dashboard/workforce/{manager,staff}` → `/manager`, `/staff`, old
     paths redirect, PR #246); `ORPHAN-1` (dead `/workforce` stub deleted,
     PR #246); `STAFF-I18N-1` expanded (whole Workforce landing hub now
     JA/EN, not just the profile card, PR #246); `F3` (Manager LINE-link
     form localized, PR #246); `I18N-DOC-1` (stale comment fixed, PR #246);
     `F5` (Admin member table `tenantKind`/`membershipStatus` localized, PR
     #247); `MOB-1` (wide tables on Manager/Staff contained to their own
     horizontal scroll instead of moving the whole page at 390px, PR #248).
     Each PR passed typecheck/lint/1089–1091 tests/build plus live
     authenticated Preview QA before merge.
   - **Also done, merged, and deployed** (Founder-approved 2026-08-16,
     each decision item resolved individually rather than deferred as a
     block):
     - Visual/brand reconciliation: `@/lib/ui/theme.ts`'s palette replaced
       1:1 with `@/lib/demo/cafe/theme.ts`'s warm/light tokens (the Surface
       A reference), PR #250. No call-site changes needed; repaints the
       whole canonical dashboard. Live-confirmed against the reference
       tenant.
     - `LOC-1`: Manager/Staff location resolution now fails closed (exactly
       one active location for Manager; the employee's own active location
       for Staff), matching the Surface A reference's existing behavior,
       PR #251. Live-confirmed no behavior change on the single-location
       reference tenant.
     - Defect C (onboarding-interruption half): new Manager-triggered
       "アクセスを回復" action sends a real Supabase password-recovery
       email to a first-time hire whose Auth identity was confirmed but
       who never finished password setup — closes the gap the normal
       resend path cannot (it deliberately sends nothing to an
       already-registered Auth user, Founder decision 8). Code in PR #252;
       the required `supabase functions deploy invite-employee` to the
       Cloud dev project (`pehcoenozjtsjdvjietj`) was run and separately
       approved 2026-08-16. Live-confirmed end-to-end on the reference
       tenant: clicking the action against the now-deployed function
       returns the `recovery_email_sent` outcome (actual email delivery
       not independently verified — no test-inbox access — but the server
       round-trip proves the deployed function recognizes
       `action: 'recover'`).
   - **Still open, no code change yet, but both now have a Founder decision
     recorded (2026-08-16)**: full visual/brand reconciliation is done (see
     above); the remaining items are:
     - `I18N-JA-1` (native Japanese copy review): Founder will review it
       personally once the whole Commercial Launch Readiness gate (§2.4
       steps 1–4) is complete — not an engineering task, not something an
       AI agent session closes. Do not start this proactively; wait for the
       Founder.
     - Surface A retain-vs-retire (`%5Fclient-preview/mame-to-cha/**`) —
       **done, 2026-08-16, merged via PR #266.** Removed the whole route
       tree, its `next.config.mjs` host-based rewrite, the
       `verify-preview-server-actions` build guard, and ~90 exclusive
       files under `apps/web/src/lib/preview/` (confirmed zero importers
       outside the deleted tree via a full import-graph check, not just
       the route directory). Kept `preview-language-toggle.tsx`/
       `return-to.ts`/`write-result.ts` (real consumers: canonical
       dashboard + sign-in flow) and `module-guard.ts`/`location.ts`/
       `tenant-select.ts` (reused by the standalone operator CLI
       `apps/web/scripts/generate-recipe-translations.ts`, unrelated to
       the preview route — caught by a typecheck failure after an
       initial alias-only grep missed it). Public marketing-demo routes
       (`apps/web/src/app/mame-to-cha/**`, `apps/web/src/app/demo/cafe/**`)
       untouched, confirmed different directories. Verified: typecheck/
       lint/test (626/626)/build all green, plus live Preview QA on the
       Vercel deploy (`/mame-to-cha` and `/demo/cafe` 200, deleted
       `/_client-preview/mame-to-cha` 404, `/dashboard` redirects to
       sign-in as expected).
     `F4` (`InvitationCell` JA-only) is intentional per Founder direction,
     no action needed.
2. Platform Foundation critical path (per the already-accepted document;
   this work is not blocked by step 1 and could run in parallel, but
   sequential is preferred here to avoid re-creating the "audit → fix →
   next audit finds a neighbor problem" context-blur pattern this project
   has already hit more than once). **All 5 steps done, 2026-08-16** — see
   §5 for full detail. Schema + `packages/core` engine only; no UI/worker
   consumer wired up by design; pushed to Supabase Cloud dev 2026-08-16
   (Founder-run, PR #264 fixed a pre-existing migration-ledger gap first).
3. New-Tenant / One-Hour Provisioning Test (`docs/strategy/go-to-market-roadmap.md`
   §7) — creating a genuinely new tenant with zero application-code changes
   is the actual evidence this gate exists to produce, not a formality. Not
   started.
4. A single combined QA + Founder acceptance pass over the result of 1–3,
   not a re-run of the narrow F1/F2-style acceptance from §2.3. Not started.

None of the still-open items in step 1, or steps 2–4, is authorized to
start by this entry alone — the Founder selects which one begins next (see
§5).

## 3. Founder decisions in force (not fully restated elsewhere)

Staff identity/auth architecture (`docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md`
§3; the identity-shape invariants are also enforced in schema by migrations
`0062`–`0064`):

- One Auth user → at most one `workforce.employees` row **per tenant**
  (`unique (tenant_id, user_id) where user_id is not null`); the same person
  may be an employee in a different tenant.
- An employee's contact email may double as their invite/login email
  initially; changing the employee's contact email later must never silently
  mutate their Supabase Auth login email.
- For an invite to an email that already belongs to an existing Supabase Auth
  user, no new email is sent — the person accepts via the in-app
  `PendingInvitationBanner` on their next authenticated session. This is a
  deliberate architecture choice, not a gap (it does not, however, cover a
  first-time hire stuck mid-onboarding — see Defect C in the Whole-Product
  Gate §21).
- No LINE Login in the Staff-auth-provisioning scope.

Product/business (originally recorded in the now-deleted `docs/project/03_DECISIONS.md`;
Founder-provided, evidence still pending — carried forward here as still-open
constraints, not yet formal ADRs):

- Platform subscription billing and merchant payments are treated as separate
  domains; do not mix SaaS entitlement with customer commerce without a
  formal source.
- Do not make a public "one-hour onboarding" commercial claim before a
  successful rehearsal.
- Cafe v2.2 scope selection prioritizes purchase probability and onboarding
  impact; no heavy ERP-style scope.

## 4. Safety boundaries

See `CLAUDE.md`'s four highest-risk constraints and
`docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §8–§9 for the full,
canonical approval-boundary rules. Restated only as a pointer, not
duplicated here.

## 5. Exact next gate

**Cafe v2.1 (bounded, §2.3) is closed.** Preview QA, independent review, and
Final Founder Acceptance for F1/F2 all complete as of 2026-08-16. **Cafe
Commercial Launch Readiness (§2.4) step 1 is complete as of 2026-08-16**:
every mechanical item (IA reconciliation, ORPHAN-1, STAFF-I18N-1, F3,
I18N-DOC-1, F5, MOB-1) and every decision-dependent item the Founder chose
to resolve now (visual/brand reconciliation, LOC-1, Defect C) is done,
merged, and — for Defect C's Edge Function — deployed. Only two step-1
items remain genuinely open, and neither blocks moving on: `I18N-JA-1`
(needs a native Japanese speaker, not an engineering task) and Surface A
retain-vs-retire timing (a product decision with no forcing function yet).

1. **Founder direction 2026-08-16: proceed to step 2, Platform Foundation
   critical path, once step 1 is confirmed complete** (this entry). Do not
   also silently start Cafe Hardening / Deferred Debt, Cafe Product Growth,
   or Cafe v2.2 as a side effect — those remain separate, not yet
   requested.
2. Platform Foundation critical path (already-accepted sequencing,
   `docs/foundation/platform-foundation-roadmap.md` §7/§10): Entitlements
   engine → Module Registry → Shared Navigation/Settings → Notifications →
   Event Bus.
   - **Entitlements engine — done, 2026-08-16, merged to `main` via PR #254.**
     Re-verified the roadmap's characterization of
     `core.tenant_modules`/`core.module_code` against the actual repo before
     starting (still accurate — pure boolean toggle, no plan/limit/lifecycle
     model, no prior entitlements code anywhere). Added
     `supabase/migrations/0069_core_entitlements_engine.sql`: a plan catalog
     (`core.entitlement_plans`: trial/standard/custom), per-tenant lifecycle
     (`core.tenant_plans`: trial/active/past_due/suspended/canceled, with a
     backfill for all 4 existing tenants incl. `oruwa-cafe` and an
     on-insert trigger for future tenants), generic limits
     (`core.plan_default_limits` + `core.tenant_entitlement_limits`), and
     enforcement functions `core.has_module_access` /
     `core.check_entitlement_limit` / `core.get_entitlement_limit`. Layered
     strictly on top of the existing `tenant_modules.is_enabled` boolean —
     nothing that reads it today changed. Plan/limit writes are
     platform-staff-only by design (stricter than `tenant_modules`'s
     `core.billing.manage` gate — no Customer Portal/Billing yet to make a
     tenant-visible plan change commercially honest). App wrapper added at
     `packages/core/src/entitlements.ts`
     (`hasModuleAccess`/`requireModuleAccess`/`checkEntitlementLimit`/
     `requireEntitlementLimit`). New pgTAP coverage:
     `supabase/tests/0037_core_entitlements_engine.sql` (21 assertions);
     full suite verified green locally (830/830,
     `pnpm exec supabase db reset && pnpm exec supabase test db`), plus
     `pnpm --filter @line-os/core typecheck`/`lint` clean. Explicitly out of
     scope for this step (deferred to Module Registry or later): wiring
     `has_module_access`/limits into any `apps/web` nav/guard/UI, an admin
     surface for assigning plans, actual pricing/Stripe. Per `CLAUDE.md`,
     this migration has NOT yet been pushed to Supabase Cloud — that
     requires separate explicit human approval, same as every prior
     migration; it is merged to `main` locally/in GitHub only.
   - **Module Registry — done, 2026-08-16, merged to `main` via PR #256.**
     Added `supabase/migrations/0070_core_module_registry.sql`: module
     metadata (`core.module_registry`: name/description/version/
     lifecycle_status/min_plan_code) and a dependency graph
     (`core.module_dependencies`), keyed by the existing `core.module_code`
     enum rather than replacing it — confirmed `logistics`/`crm` are pure
     placeholders (enum values only, zero schema/routes anywhere), so
     generalizing the module identifier isn't needed yet. Seeded from actual
     shipped state: `core`/`workforce`/`booking` = `ga`, `inventory`/`ai` =
     `beta`, `logistics`/`crm` = `planned`. `core.can_enable_module(tenant,
     module)` pre-checks lifecycle status (not deprecated/retired), the
     tenant's plan against `min_plan_code` (exact match —
     `core.entitlement_plans` has no tier ordering yet), and that every
     direct dependency is already enabled; not wired to any consumer yet.
     Registry writes are platform-staff-only (same convention as `0069`).
     App wrapper: `packages/core/src/module-registry.ts`
     (`getModuleRegistry`/`canEnableModule`). New pgTAP coverage:
     `supabase/tests/0038_core_module_registry.sql`; full suite verified
     green locally (845/845), plus typecheck/lint clean. Out of scope:
     wiring this into `apps/web` nav/dashboard (Shared Navigation/Settings,
     the next critical-path step), an admin UI for editing registry rows.
     Not pushed to Supabase Cloud (same pending-approval status as `0069`).
   - **Shared Navigation + Shared Settings — done, 2026-08-16, merged to
     `main` via PR #258.** Added
     `supabase/migrations/0071_core_shared_navigation_and_settings.sql`:
     `core.module_registry` gained `nav_route`/`icon_key`/`nav_sort_order`
     (only `workforce`/`inventory` have a real route today — `booking`/`ai`/
     `core`/`logistics`/`crm` have no dashboard entry point yet, confirmed
     by research before writing this, not an oversight); a new generic
     `core.tenant_settings` key/value table (new `core.settings.manage`
     permission, granted to `tenant_owner`/`tenant_admin`) gives any module
     a settings store without its own migration —
     `workforce.schedule_settings` (0034) keeps its own dedicated table for
     structured settings, not migrated into this. Unlike `0069`/`0070`'s
     platform-staff-only writes, `tenant_settings` has a real
     `authenticated`-role grant (settings are ordinary tenant-admin
     territory, no Commercial-Honesty concern). **Deliberately did NOT**
     refactor `apps/web`'s hard-coded dashboard cards to consume the
     registry or add a `/dashboard/settings` route — both are live
     production-UI changes needing their own focused session with live
     Preview QA, not something to bundle into a backend/schema step; this
     is the next concrete actionable item whenever UI adoption of the
     Platform Foundation contracts becomes the task. App wrappers:
     `packages/core/src/navigation.ts` (`getTenantNavigation`),
     `packages/core/src/settings.ts`. New pgTAP coverage:
     `supabase/tests/0039_core_shared_navigation_and_settings.sql`; full
     suite green locally (855/855), typecheck/lint clean. Not pushed to
     Supabase Cloud.
   - **Notifications — done, 2026-08-16, merged to `main` via PR #260.**
     Added `supabase/migrations/0072_core_notifications_engine.sql`: a
     generic cross-module notification outbox (`core.notifications`:
     tenant/module/channel/`recipient_line_account_id`/idempotency_key/
     template_key/template_params/status/attempt_count). Research before
     writing this found the roadmap's "extract duplicated LINE logic from
     Workforce and Booking" premise partly stale —
     `apps/worker/src/jobs/booking-reminders.ts` doesn't actually send
     anything today (a documented skeleton whose own TODO already cited
     this future service) and Workforce has no shift-notification send code
     at all; the value delivered is the shared engine existing *before* a
     module writes its own send+idempotency logic. The real duplication
     that already happened is schema-level —
     `workforce.employee_line_links` re-implements `core.line_accounts`'
     identical encrypted+blind-index-hash pattern — flagged in the
     migration header as durable debt, **not fixed here** (a real data
     migration on an existing, reference-tenant-bearing table needs its own
     bounded, separately-approved pass; do not silently start it as a side
     effect of a later step). Recipient is `recipient_line_account_id`
     (→ `core.line_accounts.id`, matching `booking.bookings
     .line_account_id`'s existing shape), not a generic polymorphic
     recipient — no second channel exists yet to design that
     generalization against. **Deliberately did NOT** wire
     `booking-reminders.ts` to actually enqueue/send (only updated its TODO
     to point at `enqueueNotification`) and did NOT add a dispatch worker
     to `apps/worker`'s cron loop — actually causing LINE messages to go
     out to real customers is `CLAUDE.md`'s "LINE broadcast/mass messaging"
     safety boundary, a separate, later, explicitly-approved step from
     building this engine, distinct from and in addition to the
     Supabase-Cloud-push approval every migration in this critical path
     still needs. Writes are system-generated only (no
     INSERT/UPDATE/DELETE grant to `authenticated`, same convention as
     `audit.audit_logs`). App wrapper: `packages/core/src/notifications.ts`
     (`enqueueNotification`/`listPendingNotifications`/
     `markNotificationSent`/`markNotificationFailed`). New pgTAP coverage:
     `supabase/tests/0040_core_notifications_engine.sql`; full suite green
     locally (860/860), typecheck/lint clean. Not pushed to Supabase Cloud.
   - **Event Bus — done, 2026-08-16, merged to `main` via PR #262. This
     completes all 5 steps of the Platform Foundation critical path.**
     Added `supabase/migrations/0073_core_event_bus.sql`: an append-only
     cross-module event log (`core.events`), modeled like
     `audit.audit_logs` (immutable via a prevent-mutation trigger), not
     like `core.notifications`' mutable status — an event is a fact that
     happened, not a task with a lifecycle. Research before writing this
     (same discipline as all 4 prior steps) found no live cross-module
     coupling to fix today: no module reads/writes another module's
     schema, no package imports another module's package, and
     `ai.proposals` (the roadmap's own cited precedent) has zero callers
     anywhere. Matches the roadmap's own explicit permission (§8): Event
     Bus can wait for the first real decoupled scenario, no later than the
     3rd vertical — this migration builds the primitive ahead of need, not
     as a coupling-removal refactor. Deliberately did NOT add a
     `core.event_subscriptions`/delivery-tracking table (zero current
     producers/consumers — that would design fan-out bookkeeping against a
     hypothetical). App wrapper: `packages/core/src/events.ts`
     (`publishEvent`/`listEventsSince`). New pgTAP coverage:
     `supabase/tests/0041_core_event_bus.sql`; full suite green locally
     (866/866), typecheck/lint clean. Not pushed to Supabase Cloud.

   **Platform Foundation critical path status: all 5 steps done AND pushed
   to Supabase Cloud dev (2026-08-16).** Every step (`0069`-`0073`)
   deliberately built schema + a reusable `packages/core` engine only —
   none wired a live `apps/web`/`apps/worker` consumer, by design (each
   migration's own header documents why: UI-regression risk for Shared
   Navigation, the LINE-broadcast-messaging safety boundary for
   Notifications, "no real consumer yet" for Module Registry/Event Bus).

   Cloud dev push (2026-08-16, Founder-run per the CLAUDE.md hard gate —
   `supabase link`/`db push` are permission-denied for the agent by
   `.claude/settings.json`, by design, so the Founder ran them): before the
   push, `supabase db push` failed with "0060 not found locally" —
   `supabase migration list` showed `0060` already applied on the remote
   ledger with no matching local file, the same class of issue previously
   fixed once for `0061` (commit `4d58aec`, 2026-08-14). Root-caused and
   fixed first, PR #264: the missing file
   (`0060_workforce_recipe_tenant_wide_update_fix.sql`, a forward-only
   `create or replace function` fix so a Manager can edit/publish a
   tenant-wide recipe) was found preserved only in an untracked `git
   stash` object, restored byte-identical, verified via a fresh local
   `db reset` + full pgTAP suite (866/866) before retrying. That PR also
   closed a real gap in `.claude/settings.json`'s deny list: it blocked
   `supabase link`/`db push`/`db pull`/`migration repair` but not the
   `pnpm exec supabase ...` variants actually used in this repo — `pnpm
   exec supabase link` slipped through once (low-risk, no Cloud write) before
   being caught and closed. After that fix, `supabase db push` succeeded
   cleanly; `supabase migration list` confirms remote now matches local
   through `0073` exactly. Every step's own migration header still applies
   for what's now NOT true even in Cloud: no UI/worker wired up, no LINE
   messages sent, no consumer of `core.events` exists.

   One concrete, not-yet-started follow-on item this leaves on the table,
   not authorized to start by this entry alone:
   - UI/worker adoption of the 5 new contracts (dashboard nav driven by
     `core.module_registry`, a `/dashboard/settings` route, an actual LINE
     dispatch worker consuming `core.notifications`, any real producer/
     consumer of `core.events`) — each is its own bounded, separately
     scoped task, not a single follow-up PR.
3. New-Tenant / One-Hour Provisioning Test and step 4 (combined final QA)
   remain correctly sequenced after Platform Foundation, per §2.4's
   original ordering. **Attempted 2026-08-16, then deliberately paused —
   not abandoned, re-scoped.** Findings, so a future session doesn't
   re-investigate from scratch:
   - `packages/db/scripts/onboard-tenant.ts`'s committed onboarding path
     (`onboard-commit.ts`) is real, tested (682 lines of tests), but
     hard-locked local-only by 4 independent layers (CLI `--target local`
     gate, `assertLocalDatabaseUrl`, `onboard-preflight.ts`'s own target
     check, the `--i-understand-this-writes-local-db` confirmation flag)
     — deliberately, per multiple docs saying Cloud onboarding "requires a
     separate, explicit go-ahead." Left untouched; do not weaken it.
   - A SEPARATE, already-built, gate-by-gate Cloud onboarding system
     already exists: `packages/db/scripts/mame-to-cha-cloud-{gates,d1..d7}
     .ts(+cli)`, targeting Cloud dev (`pehcoenozjtsjdvjietj`) for an
     "acceptance" tenant slug `mame-to-cha` (distinct from the seeded
     demo `mame-to-cha-tokyo` and from `oruwa-cafe`). Governing doc
     `docs/phase-1n-4c-slice-d-cloud-acceptance-preflight-plan.md` states
     "preparation only, no Cloud write is authorized." D7 (verification)
     is read-only DB checks only — nothing in D1-D7 drives a real browser
     login, so even a fully executed D1-D7 run would still need a manual
     live-login step to satisfy roadmap §7's "first login" pass condition.
   - **D1 was actually run against Cloud dev this session** (Founder-run,
     with the AI agent's guidance — direct `db.<ref>.supabase.co:5432`
     failed, connection required the Session Pooler
     `aws-1-ap-southeast-1.pooler.supabase.com:5432` +
     `sslmode=require&uselibpqcompat=true` to work around a client-side
     TLS chain-verification issue). Result: `committed:false, noop:true`
     — **the `mame-to-cha` tenant already existed**, created
     `2026-07-24T23:43:23Z` (three weeks before this session), with 2
     modules already enabled (`workforce`, `inventory` — inventory isn't
     covered by any D1-D7 gate) and 3 active memberships/role assignments
     already present. Founder confirmed by memory: `mame-to-cha` was an
     earlier, problem-hitting first attempt at a test café tenant;
     `oruwa-cafe` was later built as the "clean version" based on it
     (matches the timeline: `mame-to-cha` 2026-07-24, `oruwa-cafe` via
     migration `0068`, 2026-08-14). D1 made no write (pure verification;
     nothing to roll back). No further gates (D2-D7) were run.
   - **Decision (2026-08-16): paused, not continued.** The Founder's
     actual immediate goal is `oruwa-cafe` correct/safe and ready for
     Cafe v2.2, not closing this Commercial-Launch-Readiness sub-gate —
     the Provisioning Test is a prerequisite for selling to real future
     customers, not for continuing feature work on the reference tenant.
     Continuing to adapt the `mame-to-cha` D1-D7 system (or starting a
     genuinely fresh tenant slug instead, given `mame-to-cha`'s
     pre-existing partial state arguably undercuts "genuinely new") was
     assessed as not worth the context/time cost right now. Resume this
     only when Commercial Launch Readiness (not just `oruwa-cafe`/v2.2)
     is actually the active goal — re-verify `mame-to-cha`'s state first
     (it may have drifted further) before resuming D2.
   - Housekeeping: no files were left behind (two scratch diagnostic
     scripts used to debug the Cloud connection were deleted after use);
     `git status` clean.
