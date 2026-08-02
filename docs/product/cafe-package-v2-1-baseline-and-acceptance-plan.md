# Cafe Package v2.1 Preview Baseline and Acceptance Plan

Status: Draft — planning document only, no fixes implemented by this document.
Date: 2026-08-01
Base branch: `dev`
Scope repository: `tantik/line-business-os` only. IAOS and OAES are not modified.

## 1. Purpose

The objective for closing out the current Cafe Preview cycle is:

`Freeze -> Verify -> Fix confirmed problems -> Measure and improve performance -> Reverify -> Founder acceptance`

This document defines the frozen baseline, the acceptance checklists, the destructive-action
inventory, the performance measurement plan, and the Definition of Done that together let the
founder accept **Cafe Package v2.1 Preview Baseline**. It does not implement any fix. It is the
plan that later remediation PRs and the acceptance report must follow.

## 2. Baseline Definition

**Routes covered:**

- `https://preview.oruwa.jp/mame-to-cha/manager`
- `https://preview.oruwa.jp/mame-to-cha/`
- `https://preview.oruwa.jp/mame-to-cha/recipes`

**Baseline date:** 2026-08-01, corresponding to `dev` at commit `e9c21d4` (PRs merged through
`#170`), Preview Cloud migration history reported at `0000`-`0053` (per `plan.md`; not
independently re-queried against Cloud by this document).

**Accepted visual/product state:** the current structure, visual design, navigation model
(header, curtain-style nav menu, attention centre, modal-based CRUD), information hierarchy, and
currently implemented product workflows for Manager, Staff, Recipes, and Inventory are the
accepted baseline. This is a founder decision recorded here, not a technical judgment.

**Frozen scope:** everything user-visible in the three routes above, as currently implemented on
`dev` at the baseline commit.

**Allowed changes after freeze** (see also Section 5 above, restated as the operative rule for
every future PR against this baseline):

1. Confirmed functional defect fixes.
2. Security, authorization, tenant-isolation, or location-isolation fixes.
3. Prevention of accidental data loss or destructive actions.
4. Measured performance improvements.
5. Loading, error, or feedback fixes required for reliable operation.
6. Localization defects that produce incorrect user-visible output.
7. Documentation required for acceptance.

**Prohibited changes:**

- redesign;
- cosmetic refactoring;
- navigation replacement;
- new product features;
- speculative architecture;
- Platform Foundation work;
- subscription-lifecycle work;
- new modules;
- generalized cleanup;
- refactoring without measurable acceptance value;
- replacing accepted UI patterns because another template looks newer.

Any PR against this baseline must state, in its description, which of the seven allowed
categories it belongs to. A PR that does not fit one of the seven categories does not belong in
this closeout cycle.

## 3. Source of Truth and Evidence

Evidence for this closeout is layered by confidence, and every claim in this plan and in the
resulting acceptance report must be labeled with exactly one of these levels:

- **Implemented** — present in `dev` at the baseline commit, confirmed by reading the source
  (file:line citation required). Says nothing about correctness or verification.
- **Automated-test verified** — covered by a passing, currently-running check: `pnpm typecheck`,
  `pnpm lint`, `pnpm test` (workspace unit/component tests), or `supabase test db` (pgTAP). CI
  (`.github/workflows/ci.yml`) runs typecheck/test/build/lint on every PR and push to `dev`; it
  does **not** run pgTAP. Local pgTAP is a separate, manually-run gate.
- **Manually verified** — a human (founder or delegated reviewer) actually exercised the
  behavior on live Preview and recorded PASS/FAIL/BLOCKED with a timestamp, and ideally a
  screenshot or measured time. Self-reported narrative in `plan.md` describing an agent's own
  Preview session counts as manually verified only if it names the concrete scenario and
  observed result — general claims of "acceptance passed" without a scenario-level record do not
  qualify and must be re-verified under Section 5/6/7/8 below.
- **Founder accepted** — the founder has explicitly signed off on a specific checklist item,
  the performance baseline, or the release as a whole. Nothing below counts as founder
  acceptance unless the founder recorded it.

Preview screenshots and measured timings referenced by this plan or the eventual acceptance
report must be attached as files or pasted values with a date; a timing claim with no method or
date is not evidence.

Known constraint on evidence collection: Preview routes require a real Supabase-authenticated
session with no local dev-login bypass (documented in `plan.md`). This means Section 5-8
checklists cannot be executed by an unattended agent against a local environment — they require
either a live Preview session (human or credentialed automation) or a seeded local environment
with a working authenticated login flow, which does not currently exist. This is recorded as a
prerequisite gap, not resolved by this document.

## 4. Acceptance Roles

- **Founder** — owns the baseline decision (Section 2), owns final acceptance (Section 16), owns
  any decision that touches security, auth, production data, billing, or scope. Approval must be
  explicit and recorded (in the PR, the session log, or the acceptance report); silence is not
  approval, per `D:\Dev\oaes\engineering\session-authority.md`.
- **AI reviewer** — verifies claims against repository evidence, classifies findings (P0/P1/P2,
  Section 13), and flags anything requiring founder approval before it proceeds. Does not decide
  product scope or accept risk on the founder's behalf.
- **Implementation agent** — implements only fixes within the seven allowed categories
  (Section 2), in small separate PRs (Section 14), each with its own local verification gate and
  Acceptance Report per `D:\Dev\oaes\engineering\definition-of-done.md`.
- **QA/reviewer** — executes the acceptance checklists (Sections 5-8) against live Preview,
  records PASS/FAIL/BLOCKED/NOT APPLICABLE with evidence, and re-runs the regression plan
  (Section 15) after each remediation PR.

Any action classified under `D:\Dev\oaes\engineering\session-authority.md` as requiring explicit
human approval (security/auth changes, production data, migrations, destructive operations,
anything visible outside the session) must stop at the founder regardless of which role
identifies the need.

## 5. Manager Acceptance Checklist

Route: `https://preview.oruwa.jp/mame-to-cha/manager`

Every row is unexecuted until a QA/reviewer pass records a result. Status legend: `PASS` /
`FAIL` / `BLOCKED` / `N/A`.

| # | Scenario | Status | Evidence | Observed time | Notes |
|---|---|---|---|---|---|
| M1 | Manager route loads for an authenticated manager | | | | |
| M2 | Manager route is denied for an authenticated staff-only user | | | | |
| M3 | Header/nav menu open and close (no double close-control) | | | | |
| M4 | Attention centre renders with current pending items | | | | |
| M5 | Week navigation: previous week | | | | |
| M6 | Week navigation: next week, including the documented `-8/+8` bound | | | | |
| M7 | Create a new shift assignment | | | | |
| M8 | Edit an existing shift assignment and Save | | | | |
| M9 | Unassign/remove a shift assignment | | | | |
| M10 | Publish a draft schedule | | | | |
| M11 | Shift-change/cancellation request appears in the approval queue | | | | |
| M12 | Approve a shift-change/cancellation request | | | | |
| M13 | Reject a shift-change/cancellation request | | | | |
| M14 | Open Manage Staff and view the full staff list | | | | |
| M15 | Create a new staff member | | | | |
| M16 | Edit an existing staff member's profile fields | | | | |
| M17 | Deactivate a staff member (confirm label reads "Deactivate," not "Delete") | | | | |
| M18 | Deactivated staff member's history (shifts/reports) remains intact | | | | |
| M19 | Open Manage Recipes and view the recipe list | | | | |
| M20 | Recipe list titles resolve to the active language (known defect — see Section 12) | | | | |
| M21 | Create a new recipe (fields, ingredients, steps, notes) | | | | |
| M22 | Edit an existing recipe | | | | |
| M23 | Upload/replace/remove a recipe photo | | | | |
| M24 | Archive a recipe | | | | |
| M25 | Restore an archived recipe, where supported | | | | |
| M26 | Manager Inventory: view item list | | | | |
| M27 | Manager Inventory: create/edit an item | | | | |
| M28 | Manager Inventory: search/filter | | | | |
| M29 | Manager Inventory: reorder-point validation message is specific, not generic | | | | |
| M30 | Manager Settings: shift types create/edit, inactive types excluded from new scheduling | | | | |
| M31 | JA/EN toggle updates every Manager surface consistently | | | | |
| M32 | Loading feedback is visible during a mutation (Save/approve/deactivate/archive) | | | | |
| M33 | An intentionally invalid input (e.g. empty required field) shows a specific error, not a generic failure | | | | |
| M34 | Manager cannot invoke a Staff-only action | | | | |
| M35 | Browser console/network free of new errors across M1-M34 | | | | |

## 6. Staff Acceptance Checklist

Route: `https://preview.oruwa.jp/mame-to-cha/`

| # | Scenario | Status | Evidence | Observed time | Notes |
|---|---|---|---|---|---|
| S1 | Staff route loads for an authenticated staff user with a profile | | | | |
| S2 | Staff route is denied/redirected for a manager account with no staff profile | | | | |
| S3 | Header/nav menu, logo returns to Staff, menu contains Recipes/Staff/Log out | | | | |
| S4 | Published schedule is visible and self-scoped (no other staff's private data) | | | | |
| S5 | Week navigation: previous week | | | | |
| S6 | Week navigation: next week | | | | |
| S7 | Unpublished/draft shifts are not shown to Staff | | | | |
| S8 | Future own shift opens the change/cancel/exchange request dialog | | | | |
| S9 | Empty reason is blocked on a change/cancel request | | | | |
| S10 | Submitted request shows a pending marker (`!`) on the originating cell | | | | |
| S11 | Past own shift is visually read-only | | | | |
| S12 | Correction submission on a past shift closes the dialog and marks the day pending | | | | |
| S13 | Work report submission | | | | |
| S14 | Advisory earnings/monthly hours summary displays correctly for the signed-in staff only | | | | |
| S15 | Staff Inventory: search/filter | | | | |
| S16 | Staff Inventory: shortage state is visually distinct | | | | |
| S17 | Staff Inventory: submit a stock count | | | | |
| S18 | Staff Recipes: list and detail view load | | | | |
| S19 | Staff Recipes: JA/EN toggle switches recipe content, falling back to JA original with a marker when no translation exists | | | | |
| S20 | JA/EN toggle updates every Staff surface consistently, including Help popup | | | | |
| S21 | Loading feedback visible during a mutation (request submit/report submit/stock count) | | | | |
| S22 | Staff cannot reach any Manager-only route or action (URL entry, not just hidden UI) | | | | |
| S23 | Browser console/network free of new errors across S1-S22 | | | | |

## 7. Recipes Acceptance Checklist

Applies across `/manager` (Manage Recipes) and `/recipes` (Staff read view).

| # | Scenario | Status | Evidence | Observed time | Notes |
|---|---|---|---|---|---|
| R1 | Recipe list (Manager) | | | | |
| R2 | Recipe detail (Manager and Staff) | | | | |
| R3 | Manager create/edit workflow (ingredients, steps, notes, draft/published) | | | | |
| R4 | Staff read-only workflow, no edit affordances visible | | | | |
| R5 | JA/EN display in the detail view resolves correctly (confirmed implemented in `recipe-view-model.ts`) | | | | |
| R6 | JA/EN display in the Manager **list** view (known defect: currently always shows the Japanese title regardless of active language — `apps/web/src/lib/preview/preview-recipe-kind-manager.tsx:226`) | FAIL | Repository code read, 2026-08-01 | | Confirmed by direct code inspection; not yet fixed. See Section 12/13, item P1-1. |
| R7 | Fallback to Japanese original when no translation exists, with an explicit `'original'` marker (`apps/web/src/lib/content/recipe-display.ts:8-44`) | | | | |
| R8 | Archive a recipe (migration `0053` grants `update(status)` on `api.workforce_recipes`; confirmed present) | | | | |
| R9 | Restore an archived recipe, where the UI supports it | | | | |
| R10 | Automatic translation "generate" workflow — **do not assume this exists in the Manager UI.** Repository evidence: the translation orchestrator and provider factory (`translation-orchestrator.ts`, `translation-provider-factory.ts`) and a dedicated i18n dictionary (`i18n.recipe-translation.ts`) exist and are unit-tested, but have no production caller and are not wired into any Manager component. Treat as **not implemented from a user's perspective** until this is re-verified against current code, and do not add it as an acceptance blocker — building or wiring this UI is a new feature, prohibited under Section 2. | N/A | Repository code read, 2026-08-01 | | Backend-only, unreachable from UI. |
| R11 | Photo upload/replace/remove | | | | |
| R12 | Recipe image size/dimension validation surfaces a specific client-side message | | | | |
| R13 | Manager-only recipe mutations are denied server-side for a staff session, not just hidden in UI | | | | |
| R14 | Empty state (no recipes yet) | | | | |
| R15 | Error state on a failed save/archive | | | | |

## 8. Inventory Acceptance Checklist

| # | Scenario | Status | Evidence | Observed time | Notes |
|---|---|---|---|---|---|
| I1 | Manager item management: create/edit/list | | | | |
| I2 | Staff stock count entry | | | | |
| I3 | Minimum stock (required quantity) field behaves correctly | | | | |
| I4 | Target/reorder point field behaves correctly, including the reorder-point-must-be-<=-required rule and its now-specific error message (PR `#170`) | | | | |
| I5 | Shortage calculation is correct for a known item/quantity fixture | | | | |
| I6 | Recommended purchase quantity, if implemented, is correct — verify against current code before treating this as an existing feature | | | | |
| I7 | Search (both Manager and Staff panels; both confirmed client-side `Array.filter`, not server pagination) | | | | |
| I8 | Empty state / no-search-results state (both panels) | | | | |
| I9 | Validation: submitting an internally inconsistent item shows a specific message | | | | |
| I10 | Permissions: Staff cannot edit item definitions (required/reorder point, item creation), only submit counts | | | | |
| I11 | Location isolation: items and counts are scoped to the correct location where the tenant has more than one | | | | |
| I12 | Destructive actions on inventory items (delete/deactivate) — see Section 9 for required confirmation behavior | | | | |
| I13 | Performance with realistic Cafe data (not thousands of items) — see Section 10; do not pre-optimize for scale that has not been measured or requested | | | | |
| I14 | Manager panel lacks shortage-first sort and sticky controls present on the Staff panel (known inconsistency — see Section 12) | | | | |

## 9. Destructive and High-Impact Action Inventory

| Entity | Route/Component | Current action type | Reversible? | Current confirmation | Required confirmation | JA copy | EN copy | Severity | Reusable-dialog usage |
|---|---|---|---|---|---|---|---|---|---|
| Staff member | Manage Staff, `preview-staff-*` | Deactivate (`isActive=false`); relabeled from "Delete" to "Deactivate" in PR `#168` | Reversible (record retained, restorable) | Confirm dialog, blur removed in PR `#168` | Verify current dialog explicitly states reversibility and what happens to existing shifts/reports; confirm button label matches action ("Deactivate," not "Delete") | To verify against current strings | To verify against current strings | P1 if copy still implies permanent deletion anywhere; otherwise P2 | Candidate for `ConfirmActionDialog` (Section 9 direction) |
| Recipe | Manage Recipes | Archive (`status` change via migration `0053`-granted view update) | Reversible where restore UI exists (verify R9) | To verify | Must state "archived, not deleted" and whether it remains visible to Staff while archived | To verify | To verify | P1 if the current dialog implies permanent deletion; otherwise P2 | Candidate for `ConfirmActionDialog` |
| Shift assignment | Manager schedule grid | Unassign/remove from a cell | Reversible (can be recreated; historical audit trail limited — see the audit-logging conflict in Section 12) | To verify | Should distinguish "remove from draft" (low severity) from "remove from a published, staff-visible schedule" (higher severity, may need explicit confirmation) | To verify | To verify | P1 for published-schedule removal without confirmation; P2 otherwise | Candidate for `ConfirmActionDialog` |
| Shift-change/cancellation request | Staff request dialog / Manager decision | Approve/reject (state transition on `workforce.shift_exchanges`) | Not reversible once decided (a new request must be filed) | To verify | Manager decision should be a deliberate action, not a single accidental click, given it affects a published shift | To verify | To verify | P1 if approve/reject are single-click with no confirmation on a published shift | Candidate for `ConfirmActionDialog` |
| Inventory item | Manager Inventory panel | To verify: does a delete/deactivate action exist at all today, or only create/edit? | To verify | To verify | If a delete exists, it must not be a hard delete of an item with historical stock-count data without an explicit, specific warning | To verify | To verify | P0 if a hard, irreversible delete of an item with history exists with no confirmation; P1 otherwise | Candidate for `ConfirmActionDialog` |
| Schedule publish | Manager schedule grid | Publish (makes draft assignments visible/binding to Staff) | Not itself destructive, but changes visibility for Staff and is hard to fully "unpublish" cleanly | To verify | Should require a deliberate action given downstream Staff-visible effect | To verify | To verify | P2 unless publish silently overwrites something | Candidate for `ConfirmActionDialog` |

Every "To verify" cell must be resolved by direct code and live-Preview inspection before any
remediation PR is scoped — this table is the inventory of what to check, not a claim that a gap
exists everywhere it says "to verify."

Implementation direction for any confirmation-dialog fix identified here: `shadcn/ui AlertDialog`
wrapped in a reusable `ConfirmActionDialog` component, one shared implementation reused across
all rows above rather than one-off dialogs per entity. Not implemented by this document. Copy for
every dialog must state the actual consequence and actual reversibility — archive/deactivate must
never be worded as "delete."

## 10. Performance Acceptance Plan

No numeric targets are set here. This section defines what to measure; thresholds may only be
proposed after a first measured baseline exists (Section 10, closing note).

### Route loads

| Scenario | Total user-observed time | Server response time | DB/query time | # DB calls | Sequential vs parallel | Duplicate requests | Payload size | Client render/hydration | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Manager cold load | | | | | | | | | |
| Manager warm load | | | | | | | | | |
| Staff cold load | | | | | | | | | |
| Staff warm load | | | | | | | | | |
| Recipes cold load | | | | | | | | | |
| Recipes warm load | | | | | | | | | |

### Navigation

| Scenario | Total time | Notes |
|---|---|---|
| Manager -> Staff | | |
| Staff -> Recipes | | |
| Recipes -> Manager | | |
| Previous week | | |
| Next week | | |

### Key actions

| Scenario | Total time | Notes |
|---|---|---|
| Open shift editor | | |
| Save shift | | |
| Publish shift | | |
| Open Inventory | | |
| Save stock count | | |
| Open recipe | | |
| Switch language | | |

Prior narrative timings exist in `plan.md` (e.g. "shift editor opens in about 0.3 s," "cold Staff
load measured about 6.0 s and a warm repeat about 3.1 s") from earlier rounds of manual live
checking. These are **not** re-verified by this document, are not backed by any committed
benchmark tooling, and must be re-measured under this section's format (with method and date)
before being relied on for a before/after performance comparison. Repository search found no
committed performance-test harness (no Lighthouse CI, k6, or equivalent) — all measurement here
is manual until such tooling is separately proposed and approved.

## 11. Performance Investigation Checklist

Treat every item below as a hypothesis until measured against the baseline in Section 10 — do
not fix any of these without a matching measurement showing it is a real cost on this baseline.

- Sequential Supabase calls — already identified in `plan.md`: `requirePreviewUser` ->
  `resolvePreviewTenantContext` -> `resolvePreviewWorkforceModule` run as three sequential round
  trips on every route (`plan.md`, "Open question from the user" section). Deferred by explicit
  user request as of 2026-08-01; carried forward here as a hypothesis, not scheduled work.
- Duplicate data loads.
- Hidden module requests (e.g. Inventory session data loading on non-Inventory routes, previously
  found and fixed for Staff in PR `#163`; re-check Manager and Recipes for the same class of
  issue).
- Unnecessary history reads (previously found and fixed for the Shift Exchange manager panel in
  PR `#167` — unbounded `listShiftAssignments`; re-check for any remaining unbounded reads).
- Unlimited result sets.
- N+1 patterns — already identified in `plan.md` for the Recipes page: a sequential
  translations-lookup-then-signed-URL round trip per recipe inside one `Promise.all`.
- Large payloads.
- Unnecessary client hydration.
- Route-level blocking (`export const dynamic = 'force-dynamic'` on every preview route, per
  `plan.md`).
- Missing indexes.
- Slow views (e.g. `api.workforce_recipes`, `api.*` facades generally).
- RLS policy cost.
- Repeated reloads during week switching.
- Avoidable remounting.
- Missing transition/loading feedback (Section 10 of the prior audit found no route-level
  `loading.tsx`/`error.tsx` under the Preview app tree — a candidate loading-feedback gap, not
  yet a measured performance problem).

Any performance fix arising from this investigation must not weaken RLS, tenant isolation,
location isolation, authorization, or auditability, and must not introduce Redis, a
service-role-accessible frontend path, a new API layer, or broad caching without evidence that a
narrower fix is insufficient.

## 12. Known Findings to Carry into the Plan

Each finding below was re-verified against current repository code as part of this planning task
(or the immediately preceding audit session covering the same baseline) before being listed here.

- **Current Preview has not been fully manually acceptance-tested.** `plan.md` itself repeatedly
  marks specific rechecks as "not yet done" (e.g. the PR `#164`-`#166` mobile/contrast recheck,
  and the PR `#167`-`#170` Manager bug-report round recheck). Confirmed by reading `plan.md`
  directly; not a P0/P1 defect by itself, it is the reason Sections 5-8 exist.
- **Overall speed remains a founder-reported problem and requires measurement.** No committed
  benchmark tooling exists (verified: no Lighthouse CI/k6 config found in the repository); all
  prior timings are manual, ad hoc, and not reproducible from the repository alone.
- **Manager recipe list has a known JA/EN title-resolution defect.** Confirmed directly:
  `apps/web/src/lib/preview/preview-recipe-kind-manager.tsx:226` renders `recipe.titleJa`
  unconditionally regardless of the active language, while the separate recipe detail view
  correctly resolves language via `recipe-view-model.ts:54-55`. Real, reproducible from static
  code alone — does not require live Preview access to confirm.
- **Route-level loading/error boundaries may be incomplete.** Confirmed: no `loading.tsx` or
  `error.tsx` found under `apps/web/src/app/_client-preview/mame-to-cha/`. Expected failures use
  a bilingual `PreviewErrorState` checked manually in each `page.tsx`; an unexpected thrown
  exception would fall through to Next's default, non-localized error page. This has not been
  triggered/observed live — it is a code-level gap, not an observed incident.
- **Destructive/high-impact actions require systematic confirmation review.** See Section 9 — the
  inventory exists; most cells require live verification before being called a defect.
- **Audit-logging expectations conflict with the current implementation approach and require a
  separate explicit decision.** `AGENTS.md` rule 7 requires `writeAudit` on every mutation.
  Confirmed by repository-wide search: no Cafe/Inventory mutation calls `writeAudit`; the module
  instead relies on DB-trigger-stamped `created_by`/`updated_by` columns, documented as an
  intentional substitute in `supabase/migrations/0035_inventory_stock_check.sql` (comment
  explaining `apps/web` has no service-role client to write `audit.audit_logs` directly). This is
  a real conflict against a written non-negotiable rule, not an oversight, and needs a founder
  decision (formally except this module in `AGENTS.md`, or scope a lightweight audit path) —
  it is not resolved by, and should not be silently resolved by, any PR in this closeout.
- **Automatic recipe translation generation exists in backend modules but may not be exposed
  through Manager UI.** Confirmed: `translation-orchestrator.ts` and
  `translation-provider-factory.ts` are implemented and unit-tested; repository-wide search found
  no production (non-test) caller, and the paired `i18n.recipe-translation.ts` dictionary keys
  are not referenced by any UI component. Building or wiring this UI would be a new feature and
  is out of scope for this closeout (Section 2).
- **Current UI baseline must not be redesigned.** Recorded as a founder decision in Section 2, not
  re-derived here.

## 13. Defect and Remediation Classification

### P0

- Data loss.
- Cross-tenant or cross-location exposure.
- Permission escalation.
- Broken critical workflow.
- A destructive action without necessary protection where accidental execution is likely.

No P0 was identified by repository code reading in this planning pass. Section 5-9 execution may
surface one; if it does, it stops the closeout and requires immediate founder notification per
`session-authority.md`, ahead of any other remediation work in this plan.

### P1

- **P1-1**: Manager recipe list JA/EN title defect (Section 12), confirmed by static code read.
- **P1-2 (pending verification)**: Any destructive action in Section 9 whose "to verify" cells
  resolve to "irreversible, no confirmation, or misleading copy."
- **P1-3 (pending verification)**: A measured (not narrative) performance regression against
  practical usability once Section 10 baseline measurement exists.
- **P1-4 (pending decision, not a code defect)**: the audit-logging conflict (Section 12) —
  classified P1 because it is a conflict against a written non-negotiable rule, but its
  remediation is a founder decision first, implementation second.
- Missing essential loading/error handling proven to cause a user-visible failure (route-level
  `loading.tsx`/`error.tsx` absence is a candidate — confirm severity via Section 5-8 execution
  before treating it as more than a code-level gap).
- Serious workflow inconsistency surfaced by Section 5-8 execution.

### P2

- Manager Inventory panel lacking shortage-first sort/sticky controls present on Staff (Section
  12) — confirmed as an inconsistency, not a functional break.
- Two coexisting localization mechanisms (centralized dictionaries vs. inline ternaries) —
  confirmed present in 11+ files by the prior audit's research pass; no missing-translation
  defect found in either mechanism, so this is a maintainability item, not a P1.
- Any other minor UX inconsistency, non-blocking visual issue, or deferred improvement surfaced
  by Section 5-8 execution.

## 14. PR and Implementation Strategy

Small, separate PRs, each scoped to exactly one of the seven allowed categories in Section 2.
Provisional grouping, to be adjusted if Section 5-9 execution shows a safer split:

1. Confirmation-dialog foundation (`ConfirmActionDialog` on `shadcn/ui AlertDialog`) and coverage
   for whichever Section 9 rows resolve to a real gap.
2. Confirmed localization defects (starting with P1-1).
3. Performance instrumentation and diagnosis (measurement only — timing/logging added to reproduce
   Section 10 baseline; no behavior change).
4. Measured performance fixes, each tied to a specific Section 10/11 finding with a before/after
   number.
5. Loading/error-state reliability (route-level boundaries, if Section 5-8 execution confirms the
   gap is user-visible).
6. Acceptance documentation (`docs/product/cafe-package-v2-1-acceptance-report.md`, `docs/ai/current-task.md` update).

Do not combine unrelated database, UI, performance, and documentation work into one PR. Each PR
gets its own Definition-of-Done gate (`D:\Dev\oaes\engineering\definition-of-done.md`): typecheck,
lint, test, and — for anything touching `supabase/migrations` — local `supabase db reset` and
pgTAP, all passing locally before merge, matching the pattern already used in PRs `#158`-`#170`.

## 15. Regression and Reverification Plan

After each remediation PR:

- **Minimum critical smoke**: M1, M7-M10 (Manager core schedule flow), S1, S4, S8 (Staff core
  schedule/request flow), R1-R3 (Recipes core flow), I1-I2 (Inventory core flow).
- **Role checks**: M2, M34, S22, R13 — re-run whenever a server action or RLS-adjacent code path
  changes.
- **Localization checks**: M20/M31, S19/S20, R5-R7 — re-run whenever any i18n dictionary or
  language-resolution code changes.
- **Destructive-action checks**: the specific Section 9 row(s) touched by the PR.
- **Performance before/after**: the specific Section 10 scenario(s) targeted by the PR, using the
  same method as the pre-fix measurement.
- **Tests and CI**: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` must pass (matches
  `.github/workflows/ci.yml`); `supabase test db` (pgTAP) must pass locally for any migration
  change; CI must be green on the PR before merge.
- **Preview manual verification**: the PR's specific scenario(s) re-checked live on
  `preview.oruwa.jp/mame-to-cha` post-deploy, recorded with the same evidence format as Sections
  5-8.

Full re-execution of Sections 5-8 in their entirety is not required after every PR — only the
scenarios plausibly affected by that PR's change, plus the minimum critical smoke list above. A
full Section 5-8 pass is required once, immediately before the founder-acceptance decision
(Section 16).

## 16. Definition of Done

Cafe Package v2.1 Preview Baseline may be marked complete only when:

- the baseline (Section 2) is documented — done by this document;
- the acceptance checklists (Sections 5-8) are executed with recorded PASS/FAIL/BLOCKED/N/A and
  evidence for every row;
- all P0 issues are resolved;
- required P1 issues are resolved or explicitly accepted by the founder, including a recorded
  decision on the audit-logging conflict (P1-4);
- destructive actions (Section 9) have appropriate, accurately-worded confirmation;
- performance has been measured per Section 10, with method and date recorded for every scenario;
- required performance fixes (arising from measured, not narrative, findings) are verified
  before/after;
- security and isolation evidence (RLS, tenant/location scoping, no `service_role` in `apps/web`,
  server-side permission re-checks) remains valid — re-confirm rather than assume, since
  remediation PRs may touch adjacent code;
- the regression plan (Section 15) has been run and passes;
- `docs/product/cafe-package-v2-1-acceptance-report.md` is written, in the same evidence-graded
  style as Section 3;
- known limitations and deferred items (subscription-lifecycle foundation, page-navigation latency
  fix, recipe auto-translate UI wiring, and anything else deferred during this cycle) are recorded
  in that acceptance report, not silently dropped;
- founder approval is recorded against the release as a whole.

## 17. Deliverables

- This baseline and acceptance plan (`docs/product/cafe-package-v2-1-baseline-and-acceptance-plan.md`).
- Completed acceptance checklists/evidence (Sections 5-8, filled in).
- A performance baseline report (Section 10, filled in, plus any before/after comparisons from
  remediation PRs).
- Remediation PRs, one per Section 14 grouping, each with its own Acceptance Report.
- Regression evidence (Section 15, executed).
- `docs/product/cafe-package-v2-1-acceptance-report.md`.
- An IAOS status update after founder acceptance, reflecting the version/naming correction noted
  in Section 6 (`Finish and accept Cafe Package v2.1 Preview Baseline`) — to be made in the IAOS
  repository by whoever owns that repository; not made by this task.

## 18. Exact Next Action

Perform the full manual authenticated Preview acceptance pass and collect measured performance
evidence before starting broad fixes.

One small prerequisite comes first: **decide who/what will execute the Section 5-8 checklists**,
since repository evidence (`plan.md`) shows there is currently no local dev-login bypass for the
Preview-authenticated routes, so this cannot be done by an unattended agent against a local
environment today. Either the founder/a human QA reviewer runs the live Preview pass directly
against `preview.oruwa.jp`, or a scoped, approved exception (e.g. a temporary, non-production
credentialed test session) is set up first — that decision is the single prerequisite, and it
requires founder input, not an engineering default.
