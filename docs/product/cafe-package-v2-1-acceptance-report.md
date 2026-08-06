# Cafe Package v2.1 — acceptance report

Date: 2026-08-05
Status: **Preview Baseline — Cafe Freeze not yet declared**

## Scope

This report records the engineer-executable portion of the Cafe Package v2.1
Preview Baseline closeout defined in
`docs/product/cafe-package-v2-1-baseline-and-acceptance-plan.md` (the
"baseline plan"). It does not re-derive the baseline definition, the
acceptance checklists, or the Definition of Done — those live in the baseline
plan and are referenced here by section number. Evidence levels used below
match the baseline plan, Section 3: **Implemented**, **Automated-test
verified**, **Manually verified**, **Founder accepted**.

This report covers three prior units of work plus the current task
(`cafe-freeze`):

1. `cafe-sprint-0` — merged to `dev` (PR #182, commit `505a539`).
2. `cafe-sprint-a-shift-schedule` — merged to `dev` (PR #183, commit
   `199f44a`). Not reopened, duplicated, or re-scoped by this task.
3. This task (`cafe-freeze`) — fixes baseline-plan finding P1-1 and produces
   this document.

## `cafe-freeze` — P1-1 fix (this task)

**Finding**: baseline plan Section 12/13, P1-1 — Manager recipe list resolved
`recipe.titleJa` unconditionally regardless of the active language toggle,
confirmed by static code read at
`apps/web/src/lib/preview/preview-recipe-kind-manager.tsx:251` (line 226 at
the time the baseline plan was written; the file has since moved).

**Fix**: the list-row title now resolves by active language — Japanese when
`lang === 'ja'`, English when `lang === 'en'` (falling back to the Japanese
title when `titleEn` is null, undefined, empty, or whitespace-only) —
matching the resolution pattern already used elsewhere in Recipes
(`recipe-view-model.ts`), without pulling in that module's
machine-translation path, which this list view does not need. No other row
content (badge, thumbnail, edit/delete/restore/archive controls) changed.

**Follow-up, same day**: Codex flagged the original regression test as a
source-text/regex check rather than a behavioral test. Remediated by
extracting the title-resolution logic into a standalone pure function,
`resolveRecipeListTitle`, in a new file (`recipe-list-title.ts`) with no
`'use server'`/Server Action imports of its own — the component imports and
renders through this exact function, and the test now imports the same
function and asserts real return values for JA mode, EN mode with a real
`titleEn`, and EN-mode fallback for `null`, `undefined`, `''`, and
whitespace-only `titleEn`. Isolating the resolver from
`preview-recipe-kind-manager.tsx` (a `'use client'` component that imports
`'use server'` recipe actions) is what makes it importable directly in the
`node:test` suite without pulling in the full server-action module graph.
The test retains two narrow source-text assertions only as an integration
guard confirming the row still imports and calls this exact function — the
behavioral proof itself is the direct function-call assertions, not the
source check.

Changed files:

- `apps/web/src/lib/preview/recipe-list-title.ts` — new file; exports the
  canonical `resolveRecipeListTitle(recipe, lang)` pure function.
- `apps/web/src/lib/preview/preview-recipe-kind-manager.tsx` — list-row title
  render now calls `resolveRecipeListTitle(recipe, lang)` instead of an
  inline conditional.
- `apps/web/src/lib/preview/preview-language-toggle.test.ts` — replaced the
  source-regex regression test with behavioral subtests against
  `resolveRecipeListTitle`, plus the integration guard described above.

**Automated-test verified** (2026-08-05, this task, local run):

- `pnpm --filter web test`: **834/834 passed** (831 baseline + 3 new
  behavioral subtests for the recipe-list title resolver).
- `pnpm --filter web lint`: passed, no findings.
- `pnpm --filter web typecheck`: passed, no errors.
- `pnpm --filter web build`: passed.
- `pnpm --filter web run verify:preview-actions`: passed, all three checks.

This resolves baseline plan checklist row **M20** ("Recipe list titles
resolve to the active language") and **R6** ("JA/EN display in the Manager
list view") at the **Implemented** and **Automated-test verified** levels
only. Live-Preview confirmation of M20/R6 (**Manually verified**) has not
been performed by this task — see "Not done" below.

## Prior work: `cafe-sprint-0`

**Status**: merged to `dev`, PR #182, commit `505a539`. Fixed three confirmed
Sprint 0 defects (a correction-request decision race, an unwired CI
verification script, leftover production debug instrumentation) plus a
test-coverage gap and stale `stale_reference` copy correction (commit
`6e62e1b`). Recorded here as **Implemented** and merged; not re-verified by
this task, which did not touch that code.

## Prior work: `cafe-sprint-a-shift-schedule`

**Status**: merged to `dev`, PR #183, commit `199f44a`. Fixed AM/PM
auto-distribution windows, a real staffing-shortage indicator, a week-cache
race, and EN alert localization (commit `a8eef9a`). Recorded here as
**Implemented** and merged; not reopened, duplicated, re-scoped, or
re-verified by this task, per this task's explicit instruction.

## Outstanding founder decision: P1-4, audit-logging conflict

Baseline plan Section 12/13, **P1-4**: `AGENTS.md` rule 7 requires
`writeAudit` on every mutation; no Cafe/Inventory mutation calls it today —
the module instead relies on DB-trigger-stamped `created_by`/`updated_by`
columns (documented in `supabase/migrations/0035_inventory_stock_check.sql`
as an intentional substitute, since `apps/web` has no service-role client to
write `audit.audit_logs` directly). This is a real conflict against a written
non-negotiable rule, not an oversight.

This task does not resolve P1-4. It remains an outstanding founder decision
between two options recorded in the baseline plan:

1. formally except Cafe/Inventory from `AGENTS.md` rule 7, or
2. scope a lightweight `writeAudit` path for these modules.

Resolving this is out of scope for `cafe-freeze` (documentation/decision
scope only, per this task's `allowed_scope`, which does not include
`AGENTS.md` or `supabase/migrations/**`).

## Not done — explicitly outstanding, not fabricated

The following items from the baseline plan's Definition of Done (Section 16)
are **not** completed by this task and are not claimed as PASS/FAIL here:

- **Sections 5-8 acceptance checklists** (Manager, Staff, Recipes, Inventory)
  — require a live, Supabase-authenticated Preview session with no local
  dev-login bypass (baseline plan Section 3, "Known constraint on evidence
  collection"). Cannot be executed by an unattended agent against a local
  environment. Remain fully unexecuted except for the single P1-1/M20/R6
  code-level finding recorded above.
- **Section 9 destructive-action confirmation review** — most rows remain
  "to verify" against live Preview; not resolved by this task.
- **Section 10 performance baseline** — no measurement was taken by this
  task. No committed benchmark tooling exists in the repository (baseline
  plan Section 10). All prior narrative timings in `plan.md` remain
  unverified per the baseline plan's own evidence rules.
- **Section 11 performance investigation checklist** — untouched by this
  task; each item remains a hypothesis, not a scheduled fix.
- **P1-2** (destructive-action gaps) and **P1-3** (measured performance
  regression) — both explicitly "pending verification" in the baseline plan
  and not resolved here.
- **P1-4** (audit-logging conflict) — outstanding founder decision, see
  above.
- **Section 15 regression plan** — the minimum critical smoke list (M1,
  M7-M10, S1, S4, S8, R1-R3, I1-I2) requires the same live-Preview access as
  Sections 5-8 and has not been executed by this task.

None of the above is claimed as PASS, FAIL, or otherwise verified by this
report. They are recorded as outstanding per the baseline plan's evidence
rules (Section 3): absence of evidence is not treated as a passing result.

## Founder Freeze acceptance

**Not recorded.** Per the baseline plan Definition of Done (Section 16) and
Deliverables (Section 17), Cafe Package v2.1 Preview Baseline cannot be
marked complete, and Cafe Freeze cannot be declared, until:

- the Sections 5-8 checklists are executed against live Preview with
  recorded evidence (requires founder or delegated-QA action — see baseline
  plan Section 18, "Exact Next Action");
- the Section 10 performance baseline is measured;
- P1-2, P1-3, and P1-4 are resolved or explicitly accepted by the founder;
- the Section 15 regression plan is run;
- founder approval is recorded against the release as a whole.

This report closes the engineer-executable gap identified for this task
(P1-1 fix and this document) and does not itself constitute, request, or
imply founder acceptance of the release.

## Live Preview evidence reconciliation — 2026-08-06

This section supersedes the earlier statement that live Preview acceptance was
fully unexecuted. Evidence was collected against the canonical
`https://preview.oruwa.jp/mame-to-cha/*` routes with Supabase authentication.
Browser timings below are user-observed wall-clock timings; they are not DB,
server-response, or query profiling.

### Environment and release evidence

- Code fix: PR #189, commit `fceb8b0`, merged to `dev` as `a9d1fc7`.
- PR CI and Vercel: PASS. Post-merge `dev` CI run `31072581990`: PASS.
- Local web gate: typecheck PASS; tests **837/837 PASS**; lint PASS;
  production build PASS; `verify:preview-actions` PASS.
- Canonical Manager post-merge load: **7.7 s**, EN active, no console errors.
- Earlier same-session observations: Manager cold load **10.2 s**; Recipes cold
  load **7.0 s**; recipe detail open **2.5 s**; language switch **2.6 s**;
  previous-week navigation completed but took about **12 s**.

### Checklist reconciliation

Statuses are deliberately fail-closed. A compound row is BLOCKED when only
part of it was observed, and mutation rows remain BLOCKED when no disposable
fixture was available.

| Area | PASS | BLOCKED | N/A |
|---|---|---|---|
| Manager M1-M35 | M1 authenticated route load; M4 attention centre renders; M5 previous week completes; M19 recipe list opens; M20 active-language title; M34 automated server-action role separation | M2 requires Staff identity; M3; M6 `+8/-8` bound not fully exercised; M7-M18; M21-M33; M35 full-matrix console claim (observed subset had zero errors) | None |
| Staff S1-S23 | S1 authenticated Staff route; S2 Manager without Staff profile fails closed; S4 published schedule renders with caller shown as `Me`/`自分` and other names pseudonymized; S5/S6 week navigation; S18 list/detail; S19 JA/EN and JA-original fallback; S22 Staff direct Manager URL denied; S23 zero console errors on observed read paths | S3 menu double-close detail not exhaustively checked; S7 unpublished fixture unavailable; S8-S17 and S20-S21 require safe interaction/write fixtures | None |
| Recipes R1-R15 | R1 Manager list; R4 Staff read-only UI; R5 detail JA/EN resolution; R6 Manager list JA/EN; R7 JA-original fallback marker | R2 Manager edit-detail half not completed; R3; R8-R9; R11-R15 | R10 automatic-generation UI is not an implemented user feature |
| Inventory I1-I14 | I7 Staff search; I8 Staff no-results state after PR #193; I13 observed with four-item Cafe fixture; Staff shortage state visually distinct (supports S16) | I1-I6 and I9-I12 require Manager execution and/or safe count/item fixtures; I14 is a known Manager consistency finding | None |

### M20 / R6 post-merge manual proof

- Manager EN list displayed `Matcha Latte` and did not display `抹茶ラテ`.
- Manager JA list displayed `抹茶ラテ` and did not display `Matcha Latte`.
- The Manage Recipes panel opened in about **0.3 s** after the Manager page had
  loaded; no browser console errors were captured.
- The current translation is loaded through the existing tenant-scoped
  `api.content_translations` facade. No migration, RLS, role, permission,
  secret, or persisted recipe-model change was made.

### Remaining blockers

1. Mutation and high-impact rows require disposable acceptance fixtures; no
   Cloud data write was performed during this evidence pass.
2. P1-4 still requires an explicit Founder decision. The recommended bounded
   v2.1 choice is to document the existing DB-trigger actor/timestamp stamping
   as a temporary exception, keep full business audit events as a mandatory
   pre-commercial Platform Foundation task, and not weaken the global rule
   silently. A new audit RPC/migration is a separate security/DB design task.
3. The observed Manager and week-navigation timings warrant a later measured
   performance investigation, but do not prove a DB or server regression.

### Staff-session evidence — 2026-08-06

- Authenticated Staff cold reload: **10.3 s**; functional PASS, performance
  follow-up retained. Other employee names were pseudonymized while the caller
  was labelled `Me`/`自分`.
- Direct `/mame-to-cha/manager`: denied with the localized no-access screen in
  **5.9 s**; no Manager data rendered and no console errors were captured.
- Next week: **0.15 s**; previous week: **3.2 s**; both returned the expected
  date ranges with no console errors.
- Recipes list reload: **5.3 s**; Matcha Latte detail open: **0.3 s**. The Staff
  surface exposed no edit/save/archive/delete affordances. JA/EN switched the
  full detail and displayed `JA original` for untranslated content.
- Staff Inventory opened in **0.9 s**. Search filtering and shortage styling
  worked. A missing no-results message was found, fixed in PR #193, merged as
  `49981f5`, and manually reverified on canonical Preview in English with zero
  console errors.
