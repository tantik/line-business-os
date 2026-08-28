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
Review). **Cafe Package v2.1 is CLOSED** (bounded F1/F2 code closure with
Final Founder Acceptance recorded 2026-08-16, see §2.3; the Founder then
closed the full v2.1 product-development phase — everything shipped since,
through this session's photo-optimization fix — with a second, broader
**Founder Acceptance = PASS on 2026-08-26**, see §5's newest pointer and
`docs/ai/CAFE_V2_1_FOUNDER_ACCEPTANCE_CLOSURE_2026-08-26.md`). This is not a
Commercial Release — production remains separately gated and was not
enabled (see "Verified baseline" below).

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
remains, for now, the client-acceptance/UX-reference environment; its
long-term retain-vs-retire status is still an open Founder decision (see
§2.3). The unauthenticated `mame-to-cha/**` / `demo/cafe/**` surfaces are
intentional public marketing demos, out of scope for "real Staff product
experience."

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

**Superseded ordering notice (2026-08-25):** the "Sequence (recommended)"
step 2 below ("Platform Foundation critical path" right after step 1's
Cafe IA/visual reconciliation, i.e. before any Cafe v2.2/Product-Growth
work) is **superseded** by `docs/strategy/oruwa-master-roadmap.md`
(Founder-approved 2026-08-25), which places Cafe v2.2 Product Research/
Implementation/Acceptance (its Phases 2-4) and SaaS Hardening (Phase 5)
*before* Platform Foundation Reconciliation (Phase 6). This also matches
the Founder's 2026-08-23-stated roadmap (see the
`project_roadmap_v21_v22_provisioning_sales` memory: v2.1 -> v2.2 ->
hardening -> ...). The step 1 content below (Cafe IA/visual reconciliation,
mechanical items, Hardening register) remains factually accurate and
still-relevant detail — only its position relative to Platform Foundation
in the "Sequence (recommended)" list is stale. Read
`docs/strategy/oruwa-master-roadmap.md` for the current phase order; this
section stays as a historical record of what step 1 actually contained.

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
   - **Still open, needs a Founder decision before any code change**: full
     visual/brand reconciliation is done (see above); the remaining
     decision items are `I18N-JA-1` (native Japanese copy review — needs a
     native speaker, not code, not something an AI agent session can
     close) and Surface A retain-vs-retire timing (whether/when to remove
     the `%5Fclient-preview/mame-to-cha/**` reference surface now that
     Surface B has closed the P1/P2 gaps that motivated keeping it as a
     UX/acceptance reference — a product decision, not a code change by
     itself). `F4` (`InvitationCell` JA-only) was intentional per an earlier
     Founder scope decision, but is now superseded: the Founder asked
     2026-08-21 (during the Cafe Manager UI/UX Parity mission's Manage
     Staff redesign) for `InvitationCell` to be localized like the rest of
     the now-bilingual Manage Staff popup, closed the same day.
2. Platform Foundation critical path (per the already-accepted document;
   this work is not blocked by step 1 and could run in parallel, but
   sequential is preferred here to avoid re-creating the "audit → fix →
   next audit finds a neighbor problem" context-blur pattern this project
   has already hit more than once). Not started.
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

**2026-08-28 pointer, WP1-A OPERATIONS FOUNDATION — PR OPEN, AWAITING
FOUNDER MERGE (newest — read this one first).** The separate WP1-A
implementation mission (authorized by D1 of the scope doc, on its own
explicit Founder prompt) has run its design + review + first-slice phases:

- **Technical design** produced and independently reviewed (fresh-context
  reviewer, 14 mandated challenge points): verdict **PASS WITH REQUIRED
  FIXES, zero P0**. Fixes folded in. Full design + review outcome:
  `docs/ai/CAFE_V2_2_WP1_A_OPERATIONS_TECHNICAL_DESIGN_2026-08-28.md`.
- **First implementation slice (foundation only)**: migration `0099`
  (`core.module_code += 'operations'`, dedicated file) + `0100`
  (`operations` schema, 4 enums, `checklist_templates` + `checklist_items`
  only, module-gated RLS via `core.has_module_access(tenant_id,
  'operations') AND core.has_permission[_in_tenant](...)`, 4 generic
  permission keys + owner/admin/manager/employee role seed, 2 `api.*`
  `security_invoker` read views, SELECT-only grants, anon revokes) + pgTAP
  `supabase/tests/0046` (tenant isolation incl. cross-tenant parent
  forgery, location isolation, permission enforcement, anon-deny, module
  ON→OFF→ON with historical-data preservation, fail-closed with no
  `tenant_modules` row).
- **No** `task_schedules`/`task_instances`/`item_responses`/
  `task_exceptions`, **no** recurrence view, **no** write RPCs, **no** UI,
  **no** Cafe HACCP presets — all designed on paper, deferred to later
  bounded slices (design §T).
- Verification (local): `supabase db reset` + `supabase test db` — `0046`
  passes; the only failures are the **11 known pre-existing** ones
  (`0002`×3, `0006`×1, `0008`×1, `0012`×2, `0023`×4) documented in the
  Module Access Security Remediation report §6 — **zero new failures**.
  `pnpm -w typecheck` / `lint` / `test` (1267 pass) / `build` all green
  (SQL-only change, no `apps/*`).
- **PR #459 opened against `dev`** (branch
  `feature/operations-foundation-wp1a`). **RED path** (`supabase/
  migrations/**`) → autonomous `dev` merge is structurally forbidden;
  **the PR is left for Founder merge.**
- **No `supabase db push`, no Supabase Cloud write, no production, `main`
  untouched.** Migrations `0099`/`0100` exist only on the feature branch.
  Cloud/remote apply is a separate explicit Founder approval later, with
  the evidence package the mission prompt §9 requires.

Next after Founder merges the PR: slice 2 (`0101` — scheduling/execution
model + recurrence-derivation view + write RPCs), still inside the fixed
WP1 product scope, its own bounded PR.

**2026-08-28 pointer, CAFE v2.2 WP1 OPERATIONS SCOPE AUTHORIZED (read after
the one above).** A docs-only product/governance mission recorded the
Founder-approved product scope for **Cafe v2.2 WP1 Operations** at
`docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md` — now the
source of truth for WP1 product scope. This **resolves the prior governance
contradiction**: the 2026-08-26 Founder Acceptance Closure and the pointers
below correctly said *"no Cafe v2.2 work authorized in this repo; v2.2
Product Research runs externally with ChatGPT"* — that remains true for
**everything except WP1 Operations**, for which the Founder has now
explicitly provided the gate. Those older pointers and
`docs/ai/CAFE_V2_1_FOUNDER_ACCEPTANCE_CLOSURE_2026-08-26.md` §3 are **not
deleted or rewritten** — they are true history; this entry is the explicit
later Founder decision that supersedes them for WP1 Operations only.

Founder decisions recorded (full text in the scope doc):
- **D1** — WP1 Operations authorized as the next product work package. A
  **separate WP1-A implementation mission** may then begin, but **only on a
  separate explicit Founder prompt** — this scope doc does NOT authorize
  writing code/SQL/migrations/RLS/tests.
- **D2** — photo/evidence NOT in the initial WP1 MVP (checkbox / numeric /
  text only); architecture must not block adding it later; no Storage/media
  infra built now.
- **D3** — HACCP is NOT a separate module/capability; Operations = generic
  reusable module, Cafe HACCP = presets/config on top. No `haccp` module
  code, no `has_capability('haccp')`.
- **D4** — normal overdue task → `warning`; critical operational condition →
  `action_required`. Exact derivation is an implementation decision.
- **D5** — Operations designed reusable from day one; no Cafe/HACCP hardcode
  in the generic domain.

Also fixed by the scope doc (product boundaries, not re-litigated elsewhere):
Operations must be a full backend-enforced ON/OFF module using the existing
`core.has_module_access` pattern (no frontend-only gating); NO capability
framework built in WP1; recurrence is "simple" (daily / weekdays / time
window) but the instance-generation mechanism is an un-fixed implementation
decision; a task must be considered expected in its period regardless of
whether Staff opened the app. Technical hypotheses from the prior
`CAFE_V2_2_WP1_OPERATIONS_RECOVERY_REPORT` (table count/names, jsonb shapes,
enums, RPC names, migration count, lazy generation) are explicitly **NOT**
promoted to Founder-approved decisions — they belong to WP1-A technical
design.

**Implementation authorization state: AUTHORIZED for a separate WP1-A
mission on its own explicit Founder prompt. WP1 implementation has NOT
started.** This docs-only PR changed no application code, SQL, migration, or
RLS; `main` untouched; no Cloud/DB write; production not applicable.

**2026-08-26 pointer, MODULE ACCESS SECURITY CLOUD/PREVIEW ROLLOUT COMPLETE
(read after the one above).** After the Module Access Security
Remediation mission closed on `dev` (see the pointer directly below), the
Founder manually applied migrations `0093`-`0098` to the linked Supabase
Cloud dev project (`pnpm exec supabase db push`, ledger verified
Local = Remote through `0098`) and live-verified the ON → OFF → ON module
lifecycle on Preview for Workforce and Inventory/Purchases (data preserved,
no browser console errors; Purchases confirmed to ride Inventory's own
module flag as designed). Booking and AI were not live-tested this rollout
(no reachable tenant-facing surface for either yet, per the REMEDIATION
report). Full facts, exact preflight state, and what is/isn't claimed as
verified are in
`docs/ai/MODULE_ACCESS_SECURITY_CLOUD_PREVIEW_ROLLOUT_COMPLETION_2026-08-26.md`
— read that file first if anything about the Cloud dev rollout, `db push`,
or live module-toggle verification comes up. One small UX-only follow-up
was spun out (Purchases' entry-point button stays visible on Staff's
dashboard when Inventory is OFF, even though opening it is correctly
blocked) — tracked separately in
`docs/ai/PURCHASES_VISIBILITY_INVENTORY_OFF_FOLLOWUP_2026-08-26.md`, not
fixed by this entry and not auto-authorized to start. No migration, RLS, or
`tenant_modules` change was made by this docs-only PR; `main` was not
touched; production remains not applicable (none exists). This entry does
not authorize any new product mission.

**2026-08-26 pointer, MODULE ACCESS SECURITY REMEDIATION CLOSED (older —
read after the one above).** A separate, security-focused mission (started
2026-08-26, run across this file's own governance model, not part of Cafe
product work) closed all six Work Packages of **Module Access Security
Remediation**: `core.has_module_access(tenant_id, module)` now gates every
tenant-facing RLS policy/RPC/view/SECURITY DEFINER function across
Purchases, Inventory, Booking, Workforce, and AI (plus the primitive itself,
WP-S1) — turning a module OFF now actually blocks tenant-facing access to
that domain's data, ANDed alongside existing permission checks (never
replacing them), with existing data preserved and access restored unchanged
when the module is turned back ON. **6 PRs merged to `dev`** (#448–#451,
#453, #454); `main` untouched; **no Supabase Cloud/remote DB write or
production deploy at any point** — every migration (`0093`–`0098`) exists
only on `dev` today. Full status matrix, deliberate exceptions needing
Founder awareness (a product-policy split on Workforce employee-invitation
gating; two pre-existing, out-of-scope permanent-delete quirks found but not
fixed in Inventory and Workforce), and what remains explicitly open (remote
apply, live verification) are in
`docs/ai/MODULE_ACCESS_SECURITY_REMEDIATION_COMPLETION_REPORT_2026-08-26.md`
— read that file first if anything about module gating, `tenant_modules`,
or `core.has_module_access` comes up. **This mission is CLOSED pending
Founder acceptance of that report; no further work under its name is
authorized, and this closure does not itself authorize Cafe v2.2 WP1
Foundation Prerequisite or any other next mission** — the next piece of work
is a separate Founder decision, same as every prior closure in this file.

**2026-08-26 pointer, FOUNDER ACCEPTANCE CLOSURE (older — read after the one
above).** **Founder Acceptance: Cafe v2.1 = PASS.** The Founder closed the
whole Cafe v2.1 product-development phase (not just the bounded F1/F2 code
closure from 2026-08-16, §2.3) — full detail, scope, and what carries
forward unchanged in
`docs/ai/CAFE_V2_1_FOUNDER_ACCEPTANCE_CLOSURE_2026-08-26.md`. **No new Cafe
features are authorized to start** against this phase. The next product
phase is **Cafe v2.2 Product Research**, currently being run separately,
outside this repo/session, with ChatGPT — not this session's job to start,
continue, or second-guess. A fresh session should not begin any v2.2 work
(implementation or research) until the Founder brings a concrete, scoped
v2.2 mission back into this repo. Production remains untouched and
separately gated, unaffected by this entry.

**2026-08-26 pointer (older — read after the one above).** A same-day session
(started as a "continue Manager+Staff combined QA pass" follow-on to the
2026-08-25 Staff Shift Schedule v2 entry below, using this project's first
working chrome-devtools MCP browser tool) found that Staff's "今日の
メッセージ" card was a dead end — a Manager could only ever see it by
accident — and the Founder expanded the fix into a full **Staff↔Manager
Mail module** (two-way messaging, per-employee threads, Manager sees all
staff via a persistent chip in "要確認", Staff gets a 4th entry-point
button replacing the deleted Daily-message card). **Merged to `dev`,
PR #444, commit `af5193f`.** 3 migrations (0090/0091/0092) pushed to
Supabase Cloud dev with Founder approval — 0092 fixed a real bug
(`sender_user_id` never stamped on INSERT) found only via live
chrome-devtools MCP QA against the real Cloud DB, not caught by pgTAP or
mocked unit tests. Live QA passed both directions (Staff send → Manager
reads/replies → Staff sees the reply) on the PR's own Vercel Preview.
Archive-only, no per-message Delete (Founder correction mid-build). A real
privacy-purge cascade for `permanently_delete_employee` (keep the
employee's name for historical records, strip everything else including
Mail, on a genuine offboarding) was surfaced as a separate, deferred,
not-yet-scoped future item with real Japan APPI/labor-record-retention
legal weight — do not improvise it, see the
`project_permanent_delete_privacy_purge_future` memory. Full state, the
exact 4-migration list, and the live-QA evidence are in
`docs/ai/CAFE_STAFF_MANAGER_MAIL_MODULE_HANDOFF_2026-08-26.md` — read that
file first if anything about the Mail module, `workforce.staff_messages`,
the "要確認" mail chip, or the deleted Daily-message card comes up. Not
independently re-verified on `preview.oruwa.jp` after the merge — a fresh
session should do a quick sanity check there before assuming it deployed
cleanly.

**2026-08-25 pointer, ROADMAP_SYNC (older — read after the one above).** The
Founder recorded a full **Master Roadmap** (Phases 1-14, Cafe v2.1
completion through Product #2 development) as the current Founder-approved
sequencing for the whole project, now at
`docs/strategy/oruwa-master-roadmap.md`. Reconciled against this
repository's authoritative docs same session:

- `docs/foundation/platform-foundation-roadmap.md` (Accepted, higher in the
  decision hierarchy) and `docs/strategy/go-to-market-roadmap.md` do
  **not** contradict the new roadmap — both were read in full; the
  Platform Foundation critical path's own gate ("close it before opening a
  *second* vertical") and the go-to-market doc's M1-M5 milestones map
  cleanly onto the new Phases 1-14 without needing edits.
- The one real, material contradiction found: **this file's own §2.4
  "Sequence (recommended)" step 2** placed "Platform Foundation critical
  path" immediately after step 1 (Cafe IA/visual reconciliation), i.e.
  before any Cafe v2.2 work — the new master roadmap places Cafe v2.2
  (Phases 2-4) and SaaS Hardening (Phase 5) *before* Platform Foundation
  Reconciliation (Phase 6). §2.4 now carries a superseded-ordering notice
  pointing here rather than being silently rewritten (its step-1 content
  stays factually accurate history).
- A minor terminology nuance (not edited): `CLAUDE.md`'s "Every product
  runs as a module inside one shared Core" phrasing could be misread as
  "Cafe = one domain module," which the master roadmap explicitly
  corrects (Cafe is a *vertical product/package* composed of several
  domain capabilities — Workforce, Inventory, Purchases, Recipes,
  Notifications, etc. — matching `platform-foundation-roadmap.md` §4.3's
  existing Vertical-Products tier exactly). `CLAUDE.md` is a pointer file
  whose rule changes belong in `AGENTS.md`/`.cursor/rules/*` first per its
  own text — flagged here, not silently edited.
- **Practical gap surfaced this session, load-bearing for Phase 1 step 4**
  ("AI CTO executes Final Integrated QA, Founder is not the QA engineer"):
  this session had **no browser-automation tool available** — the entire
  Staff Shift Schedule v2 QA loop (previous entry below) was
  Founder-screenshot-driven, not independent Claude browser verification.
  Whether a given future session can actually execute Phase 1 step 4 as
  specified depends on that session's actual tooling — check this before
  assuming it, don't assume either way from this note alone.
- No `main` touched, no migration, no Cloud write, no production activity.

Production remains untouched. The Master Roadmap document is the current
plan of record; treat `current-task.md`'s own §2.4/§5 as the tactical
execution log underneath it, not a competing plan. **Current authorized
work remains only Cafe v2.1 completion (Phase 1)** — nothing in Phases 2-14
is authorized to start by this entry.

**2026-08-25 pointer (older — read after the one above).** A full,
same-day session rebuilt the real (protected) Staff page's **Shift
Schedule module** (Staff Shift Schedule v2 mission): compact Mon–Sun
weekly grid at every viewport, real names (never "Me"), Planned-vs-Actual
attendance strictly separated in a new Shift Details view, the existing
but previously-unwired Correction Request and Shift Exchange/Change/Cancel
workflows wired into the real page, worked-hours/earnings summary, plus
four rounds of Founder live-Preview-QA fixes (button sizing/full-width
layout, client-side week navigation matching Manager's own earlier fix,
swipe-to-change-week, custom-shift display, the "!" attention indicator).
**2 PRs merged to `dev` (#438, #439)**, no DB migration/RLS/schema change
(explicitly out of scope per Founder decision), 1245 tests passing. An
independent fresh-context review ran before #438 merged and found real
issues (an accessibility regression, a locale bug) that were fixed before
merge. Full state, the exact fix-by-fix QA history, and explicitly
deferred items (header Manager-decision unread badge — needs new
persisted read-state with no column to reuse; Transport intentionally
excluded from the Correction workflow) are in
`docs/ai/CAFE_STAFF_SHIFT_SCHEDULE_V2_HANDOFF_2026-08-25.md` — read that
file first if anything about the Staff Shift Schedule, week-navigation, or
the shared `ShiftTable`/`ShiftLegend`/`CorrectionRequestForm`/
`ShiftExchangeRequestForm` components comes up. **The Founder is doing
further live click-through QA of this module himself as of this entry —
do not assume that thread is closed.** Founder-stated next step after
Staff QA concludes: a short, bounded combined Manager+Staff pass
(cross-module navigation, real workday scenarios, mobile, error/loading
states, JA copy, no obvious UX gaps) with the explicit goal of a finished
Cafe, not open-ended new features — see the handoff §3 for the exact
wording and a constraint note (this pass fundamentally needs live browser
QA; no browser-automation tool was available this session, so the workflow
was Founder-screenshot-driven throughout).

**2026-08-24 pointer #5 (read after the one above).** A full,
same-day, single-session build of the **Purchases module** (INSPECT+PLAN,
Founder approval, then DB-schema-through-UI implementation) closed the
placeholder button the pointer #4 session below had left in place. Purchases
is now a real projection/workflow layer over Inventory: staff/manager see a
shopping list of items at/below their reorder point ("Need to buy: N unit"),
mark them "Bought" (a lightweight, append-only acknowledgement that never
mutates Inventory quantities), and — the central design requirement — that
acknowledgement automatically goes stale the moment Inventory's own count
changes, reverting to Pending (if still short) or dropping the item from the
list entirely (if now sufficient). **5 PRs merged to `dev` (#432-#436)**:
#432 (schema: `purchases.purchase_actions`, `api.purchases_needed`,
`api.record_purchase_action`, new pgTAP suite) and #433 (Staff+Manager popup
UI, following the `InventoryPopup`/`RecipesPopup` `_ui/` pattern) were
merged **directly by the Founder** (RED path — `supabase/migrations/**` —
`scripts/ai-dev-merge.sh` structurally refuses these, no override exists);
#434-#436 (Inventory mobile-card polish: a shortage-amount line, and a 🛒
"purchased, needs recount" reminder icon whose position iterated across 3
PRs to its final Founder-accepted `top:1px/right:1px` corner placement) were
merged autonomously. Migration `0089` was applied to **both** local Supabase
and the linked Cloud dev project (`pehcoenozjtsjdvjietj`) — the Cloud push
was the fix for a real mid-session gap (Preview showed "Purchases is
temporarily unavailable" until the schema existed there too; a merged `dev`
PR does not by itself put a migration on Preview). Full state, exact file
list, the staleness-mechanism design rationale, and known unverified
surfaces (Manager's Purchases popup and desktop-width Purchases were never
independently browser-QA'd, only Staff's mobile view via the Founder's own
screenshots) are in `docs/ai/CAFE_PURCHASES_MODULE_HANDOFF_2026-08-24.md` —
read that file first if anything about Purchases, the Inventory
purchased-icon, or the `purchases.*` schema comes up. **The Founder closed
this thread explicitly** ("отлично" + asked for a new-chat handoff) — ask
what's next rather than assuming continuation.

**2026-08-24 pointer #4 (older — read after the one above).** A follow-on,
same-day session built the **Staff Inventory popup**: Staff's Inventory
entry point moved from a full-page `/inventory` link to a popup, matching
the pattern Manager's Inventory and Staff's own Recipes popup already used
(`InventoryPopup` moved from `manager/` to the shared `_ui/` and is now
reused by both dashboards). Also: the "Deactivated" filter tab is now
correctly gated by `canManage` (was unconditionally visible to everyone
before — a real gap this closed), filter buttons and the item card got a
compact-layout redesign, and a Founder live-QA follow-up polished mobile
spacing (footer summary hidden on mobile, its tip text moved into the "?"
help dialog, count-input status text moved inline, and the shared `Modal`
component's mobile bottom-sheet gained a 2px bottom gap — that last change
applies to every popup in the app, not just Inventory). **2 PRs merged to
`dev` (#429, #430)** — a first attempt (#428) was closed unmerged after
`dev` moved out from under it mid-session (a real conflict, not a false
one) and rebuilt fresh as #429; see the handoff for why that's the right
pattern to repeat if it happens again. No DB migrations this session.
**Founder confirmed the result live on `preview.oruwa.jp/staff` and closed
this thread** ("отлично молодец" after the final polish round) — full
state, the exact PR list, and one open TO VERIFY item (Manager's own
Inventory popup was not independently re-checked live, only Staff's) are
in `docs/ai/CAFE_STAFF_INVENTORY_POPUP_HANDOFF_2026-08-24.md` — read that
file first if anything about the Inventory popup, the shared `Modal`
component, or `InventoryPopup`/`RecipesPopup`'s `_ui/` location comes up.
**This thread is Founder-closed; ask what's next rather than continuing
it.**

**2026-08-24 pointer #3 (older — read after the one above).** A follow-on,
same-day Founder-directed live iteration session on `https://preview.oruwa.jp/staff`
(triggered by the pointer #2 entry below reaching a natural pause point)
did a full layout/UX redesign of the canonical Staff page: third
"Purchases" entry-point button (placeholder page, no module built), removed
the "My staff profile"/shift-preferences/work-reports/correction-request
sections (deferred to a later "the table" redesign, not deleted from the
codebase), added a compact autosave Transportation-cost module + a
compose-and-send Daily-message module, built a real "Submit next month's
shift preference" calendar modal wired to the production backend, and gave
Staff's Recipes button the same popup Manager's already had (plus made the
standalone `/recipes` list open a recipe in a `Modal` overlay instead of
navigating away). **8 PRs merged to `dev` (#419-#426)** — one (#420)
superseded before merge due to a stale-base false-conflict, not a real
defect; see the handoff's §5 process note before repeating that mistake.
No DB migrations this session. Two real bugs found and fixed via the
Founder's own live QA (a work-report field-clobber bug, and a
`box-sizing`/`height` bug that made a button-shrink change silently do
almost nothing) — both are general-purpose findings worth knowing even
outside the Staff page, see the handoff's §3. Full state, the exact 8-PR
list, decisions made (Purchases scope, Off/Unavailable removal,
`RecipesPopup` relocated to `_ui/`), and open items are in
`docs/ai/CAFE_STAFF_PAGE_REDESIGN_HANDOFF_2026-08-24.md` — read that file
first if anything about the Staff page's layout, Transport/Message,
monthly shift preference, or the Recipes popup comes up. **This thread is
paused for a context handoff, not confirmed closed by the Founder** — it
is a live iterative review loop (screenshot → fix → merge → re-check) with
no explicit "done" statement; ask what's next rather than assuming either
way.

**2026-08-24 pointer #2 (older — read after the one above).** The Staff-page
review session flagged by the pointer below as "not yet started" ran this
session: Staff header full redesign (mirrored to Manager too — tenant/
location left, account-menu right, matching a Founder mockup), the
previously-missing Work status (live Clock in/out) card built and verified
end-to-end against both the Staff and Manager tables, and a new Inventory
item-photo feature (matching Recipes' existing photo). **7 PRs merged to
`dev` (#411-#417)**, including 4 new DB migrations (0085-0088, already
applied to the linked Cloud project) and a real RLS bug found and fixed
live (0088). Full state, verification evidence, migration/tooling notes,
and open items are in
`docs/ai/CAFE_STAFF_HEADER_WORKSTATUS_INVENTORY_PHOTOS_HANDOFF_2026-08-24.md`
— read that file first if anything about the Staff or Manager header,
account menu, Work status/Clock in-out, or Inventory item photos comes up.
**This thread is paused for a context handoff, not confirmed closed by the
Founder** (unlike the Manager-polish session below, which the Founder
explicitly ended) — ask what's next rather than assuming either way.

**2026-08-24 pointer #1 (older — read after the one above).** A
Founder-directed live iteration session on `https://preview.oruwa.jp/manager` (Settings
visual parity with Weekly Schedule, shift-type Delete, mobile header/table
polish, two real bugs found from Founder screenshots and fixed) is
**CLOSED by the Founder** ("пока с менеджером закончили" — done with
Manager for now, 2026-08-24). Six PRs merged to `dev` (#404-#409); full
detail, verification evidence, and the process note about using
`scripts/ai-dev-merge.sh` for autonomous `dev` merges is in
`docs/ai/CAFE_MANAGER_MOBILE_SETTINGS_POLISH_HANDOFF_2026-08-24.md` — read
that file first if anything about Manager Settings, the Shift preferences
popup, shift-type Delete, or the `dev`/`main` merge-authority rules comes
up. **Next: the Founder is starting a Staff-page review session** (not yet
started as of this entry) — do not assume further Manager work is
authorized, and do not assume Staff-page findings without actually running
that review.

**2026-08-23 pointer (older, still current — read after the one above).**
Manager Final Completion Phase B (full Manager CRUD/workflow QA) is **CLOSED**:
**`MANAGER_PHASE_B = PASS`, `MANAGER_V2_1_READY_FOR_FOUNDER_ACCEPTANCE = YES`.**
Final session closed §18 (visual/UX consistency audit — clean at desktop,
found+fixed 2 real mobile-layout bugs), §19-20 (all remaining modals at
390px — Shift Exchange popup, Recipe edit, plus a real grid-overflow bug in
the Recipes list and Manage Staff list that hid Edit/Delete buttons
entirely at 390px, fixed in PR #396), §21 (loading/error UX — double-submit
guards confirmed codebase-wide, native validation + server-rejection paths
exercised live), and §24 (dedicated fresh-context adversarial review via an
independent subagent — zero new findings). Staff Deactivate/Reactivate was
also verified live and reversible, closing the last CRUD gap. Three real
bugs found and fixed this whole Phase B mission: PR #386 (P0, Staff
`CUSTOM_*` code leak), PR #393 (JA/EN, correction break-text untranslated),
PR #396 (mobile, Recipe/Staff list overflow). Full final Acceptance Matrix,
evidence, and known non-blocking issues are in
`docs/ai/CAFE_MANAGER_FINAL_COMPLETION_PHASE_B_HANDOFF_2026-08-23.md`
(final-closure content; git history has the two earlier checkpoints) — read
that file first. Do not re-run Phase B QA without a specific reason to
distrust this closure. Separately, a Founder design mockup for a later,
explicitly deferred mission (Shift Requests popup redesign + hand-icon
hover on staff-name buttons) remains saved and NOT started — see the
`project_shift_requests_popup_redesign_hand_icon_queued` memory file; not
authorized to start without a fresh Founder go-ahead. Next step after this
closure is a Founder decision, not an automatic continuation.

**2026-08-23 pointer (older, still current — read after the one above).**
Manager Final Completion mission (Shift Preferences UI + full Manager QA).
**Phase A (Shift Preferences popup UX polish) is DONE, merged (PR #384,
`dev` commit `db17927`), and live-verified on `preview.oruwa.jp/manager`**
(header/day-format, colors, i18n JA/EN, mobile — all confirmed via
chrome-devtools MCP, not just code review). Full original Phase A state is
in `docs/ai/CAFE_MANAGER_FINAL_COMPLETION_HANDOFF_2026-08-23.md`. Do not
start Staff Completion QA or Manager↔Staff e2e QA yet; those are separate
later missions per the Founder's own sequencing.

**2026-08-23 pointer (older, still current — read after the one above).**
Founder-revised priority order (superseded only in its "next" pointer by
the Manager Final Completion mission above; the sequence itself still
governs what comes after Manager/Staff completion closes):

1. **Platform Foundation Reconciliation/Triage — DONE (read-only, this
   entry).** A suspected migration/schema drift turned out to be a bigger
   finding than expected: `main` and `dev` have silently diverged since
   2026-08-16 (`main` got the full Platform Foundation critical path,
   `dev` got 131 commits of Cafe product work, neither branch knows about
   the other's history). No current drift between `dev`'s migration files
   and Supabase Cloud dev's ledger — that part of prior project memory was
   stale and is now corrected. Full findings, evidence, and the still-open
   questions (which branch is authoritative, is `main`'s Foundation code
   reusable, is `main`'s Surface-A-retirement decision the real one, is
   Cloud dev's schema fully clean) are in
   `docs/ai/PLATFORM_FOUNDATION_MAIN_DEV_RECONCILIATION_TRIAGE_2026-08-23.md`
   — read that file before touching Platform Foundation again. No Cloud DB
   write, no migration, no Foundation implementation happened.
2. **Next: Current Product Completion Audit**, Manager first
   (`https://preview.oruwa.jp/manager`), then Staff, then Manager↔Staff
   workflows, then remaining unfinished product parts. Verify against
   canonical docs, actual `dev`, real code, and — where possible — live
   Preview behavior; do not assume Manager/Staff are complete from old
   docs/PRs/commit messages alone. Deliverable: a Completion Roadmap
   (done / partial / broken / needs Browser QA / Manager-required /
   Staff-required / Manager↔Staff e2e scenarios / polish-deferrable).
3. **Then, in order:** Manager completion → Manager QA → Staff completion
   → Staff QA → Manager/Staff e2e QA → a general product completion gate.
4. **Only after that gate closes** does Platform Foundation implementation
   resume, using the triage doc above as the starting context (not a fresh
   investigation).

Platform Foundation is explicitly **not** the next implementation mission
— do not start it, and do not treat this entry as authorizing it.

**2026-08-23 pointer (older, superseded by the priority order above but
still factually current):** a separate, Founder-directed feature thread
built the **Shift requests review popup** (Settings-launched, month-scoped,
week-paginated view of staff shift-preference submissions) as **v2.1 UI
ONLY** — no backend persistence, no `auto-distribute.ts` priority logic, no
real notification delivery; that is explicit v2.2 scope per the Founder's
full roadmap. **Merged** — PR #377, merged into `dev` 2026-08-23 (commit
`d1c3c25`) by the Founder directly. Full state, file list, and what is/
isn't authorized to start next are in
`docs/ai/CAFE_MANAGER_SHIFT_REQUESTS_REVIEW_POPUP_V21_HANDOFF_2026-08-23.md`
-- read that file first if anything about this popup, Settings, or the
Cafe v2.1→v2.2 roadmap comes up. Note: a dead/duplicate inline "Submitted
shift preferences" table on the Manager dashboard (superseded by this
popup) was removed the same day, Founder-approved, PR #382.

**2026-08-23 pointer (older, still useful context):** the same Founder-directed **Weekly Schedule
Founder Review** thread continued into a **Round 3** (8 PRs, #368-#375, all
merged to `dev`) — visual/UX fixes, Automatic-schedule cleanup, a
week-navigation performance fix, and several fast Founder-driven polish
iterations (grid lines, labour-cost box, in-cell correction Approve/Reject,
an editable auto-create-day setting requiring migration `0080` -- applied
to Supabase Cloud dev with Founder approval). Full state, the 8-PR list,
verification evidence (including a self-corrected mid-session mistake and
an explicit note that live browser QA was skipped this round), and known
limitations are in
`docs/ai/CAFE_MANAGER_WEEKLY_SCHEDULE_FOUNDER_REVIEW_ROUND3_HANDOFF_2026-08-23.md`
-- read that file first if anything Weekly-Schedule/Shift-Editor/Manager-
dashboard-styling related comes up. Schedule-change history
(`SCHEDULE_CHANGE_HISTORY_GAP`) is explicitly queued as the next Weekly
Schedule work item, but is NOT pre-authorized to start -- a fresh session
should ask the Founder what's next.

**2026-08-22 pointer (older, still useful context):** a separate Founder-directed thread, **Weekly
Schedule Founder Review** (two rounds, PRs #365-#366, both merged to `dev`
and live-verified on `preview.oruwa.jp`), ran and closed after the entry
below. Full state, what changed, verification evidence, and known
limitations (a schedule-change audit-history gap, no employee-notification
mechanism, scheduled-automation is visual-only/not built) are in
`docs/ai/CAFE_MANAGER_WEEKLY_SCHEDULE_FOUNDER_REVIEW_HANDOFF_2026-08-22.md`
-- read that file first if anything Weekly-Schedule/Shift-Editor/shift-color-
palette related comes up. Nothing in that thread is pre-authorized to
continue; a fresh session should ask the Founder what's next.

**2026-08-22 pointer (older, still useful context):** a separate Founder-directed thread, **Manager
Attention UX** (four PRs: #357-#360, all merged to `dev`), ran and closed
in the session after the entry below. Full state, DB-migration note
(0079, already applied to Cloud dev), and known limitations are in
`docs/ai/CAFE_MANAGER_ATTENTION_UX_HANDOFF_2026-08-22.md` -- read that
file first if anything Attention/Shift-Exchange/Staff-LINE/recipe-latency
related comes up. Nothing in that thread is pre-authorized to continue;
a fresh session should ask the Founder what's next.

**2026-08-21 pointer (older, still useful context):** the Cafe Manager UI/UX Parity mission's post-
acceptance module-by-module redesign (Entry-points, Recipes, Inventory,
Manage Staff — 8 PRs, #346–#350 and #352–#355) is done and **Founder-
accepted "for now, for v2.1"** ("пока это принимаем для 2.1") as of
2026-08-21. See
`docs/ai/CAFE_MANAGER_UIUX_PARITY_MISSION_2026-08-19.md` §9.6 for the full
close-out note — in short: nothing further in that mission is pre-
authorized to start (not WP-13, not the Staff-surface follow-up, not
Platform Foundation) until the Founder directs the next piece of work in a
fresh session. Do not assume this acceptance by itself means "Cafe v2.1 is
formally closed" (§2.3/§2.4 below track that larger, separate claim) or
that Platform Foundation is now authorized to start — ask, don't guess.

**2026-08-19 pointer (older, still useful context):** immediately after the Cafe Manager Parity mission
below closed, Founder live-QA'd its result against the legacy Mame To Cha
reference and opened a new, larger **Cafe Manager UI/UX Parity mission**
(13 Work Packages, Manager surface first, Staff surface as a later follow-
up, then Cafe v2.1 formally closes, then Platform Foundation per the
already-agreed sequencing below) — see
`docs/ai/CAFE_MANAGER_UIUX_PARITY_MISSION_2026-08-19.md` for full state,
roles, the approved plan file location, and exactly which Work Package is
next. Read that handoff first; it supersedes this section's "what's next"
until it says otherwise.

**2026-08-19 pointer (older, still useful context):** the Founder-directed
**Cafe Manager Parity + Design-Kit mission** (started 2026-08-18, not
described anywhere in this file) ran to full completion across all three of
its tracks (A: visual/UX parity + design-kit, B: LINE LIFF login
architecture, C: live-sync + notification stub) — see
`docs/ai/CAFE_MANAGER_PARITY_MISSION_COMPLETE_HANDOFF_2026-08-19.md` for the
full, current state, what was deferred and why, and the genuinely open
"what's next" question this file's own §5 text below does not yet reflect.
A fresh session should read that handoff before treating the rest of this
section as the current plan of record.

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
   Event Bus. Not started. The next session should open by re-verifying
   this file and `docs/foundation/platform-foundation-roadmap.md` against
   the actual repo state (per that document's own hardening-only status
   for Core Platform) before beginning implementation, not assume this
   summary is still current without checking.
3. New-Tenant / One-Hour Provisioning Test and step 4 (combined final QA)
   remain correctly sequenced after Platform Foundation, per §2.4's
   original ordering — not started, not to be pulled forward.
