# Phase 1N-4D — Fast Demo-to-Preview Staff Parity Plan

Status: implementation plan
Target: `/demo/cafe/staff` → DB-backed `/mame-to-cha/staff`
Branch: `fix/cafe-v2-staff-exact-parity`
PR: `#136` (draft, target `dev`)

## Execution model

Work proceeds in bounded, reviewable stages. Each stage contains one coherent
product result, its automated checks, and evidence. A passing stage
automatically unlocks the next stage; routine local work, commits, branch
pushes, PR updates, CI inspection, and Preview visual checks do not require a
new approval.

The following remain explicit stop gates because they change production,
cloud data, access policy, or recovery risk:

- merge to `dev` when it triggers a shared deployment;
- Production deployment or promotion;
- Supabase Cloud DB/Auth writes, migrations, or seed changes;
- Vercel Protection, domains, environment variables, or secret changes;
- widening Staff access from self-only data to coworkers' data.

Stages are deliberately neither micro-tasks nor one large batch: implementation
and verification stay close enough that a failure is attributable to one
change set.

## Current execution roadmap

### Stage 0 — Baseline and publication

Status: complete

- Branch from current `dev`.
- Record the root cause and fast-parity design.
- Implement and validate the first Preview schedule convergence.
- Push the branch and open draft PR `#136`.

Evidence: parity tests, typecheck, lint, and Preview Server Action allowlist
verification pass.

### Stage 1 — One shared Staff presentation

Status: complete

- Extract the approved Staff page geometry into presentation components:
  header, work-status card, schedule card, report card, and preference CTA.
- Keep Demo state in its adapter and Preview Supabase data/actions in its
  adapter.
- Remove composition-level differences rather than compensating with CSS.
- Preserve existing Demo behavior while making Preview use the same structure.

Exit check:

- both routes import the shared presentation;
- Preview imports no Demo data/store/localStorage;
- Demo imports no Preview loader/action;
- the Profile card and old Preview-only summary tables cannot return.

### Stage 2 — Real-data view model and action parity

Status: complete

- Map real published shifts and active shift types to the shared grid.
- Map current attendance to the shared clock-status presentation.
- Map transportation and daily message to the shared report card.
- Keep preference, report, clock, and correction writes on the existing
  allowlisted Preview Server Actions.
- Display only data actually available; do not invent a decrypted staff name.

Exit check:

- loading, empty, and error states are safe and understandable;
- all successful actions refresh and display the saved state;
- invalid or mismatched staff/location identity fails closed;
- no tenant, location, or employee authority comes from form fields.

### Stage 3 — Local regression gate

Status: complete

- Run focused unit and boundary tests after each implementation slice.
- At the completed stage run web typecheck, lint, test, build, and Preview
  Server Action verification.
- Review the complete diff for accidental unrelated files and security drift.

Exit check: every relevant check is green and the PR report includes scope,
files, security, migration, tenant-isolation, and rollback notes.

### Stage 4 — Authenticated Preview visual acceptance

Status: in progress

- Wait for the Vercel Preview deployment for the latest PR commit.
- Test a real Staff account and a Manager account separately.
- Capture Demo and Preview at desktop `1440×900` and mobile `390×844`.
- Compare header, status, grid, legend, report card, preference flow, modals,
  overflow, wrapping, and touch targets.
- Fix mismatches in bounded commits and repeat the automated gate.

Exit check: side-by-side evidence is accepted for both viewport sizes; Manager
correctly receives no-profile behavior on the Staff route; Staff actions work.

#### Stage 4A — Preserve the Manager settings contract

Status: in progress

The bottom Manager `設定` card is part of acceptance, not optional follow-up.
It must retain the approved Demo layout and real Preview behavior:

- seven weekday staffing requirements;
- maximum monthly staff hours;
- visible shift-type rows;
- edit and save an existing shift type;
- prevent deactivation while a shift type is used by assignments;
- add a new shift type;
- save schedule settings through the allowlisted manager action.

UI checks may open edit/add states without writing. Actual save/add/deactivate
checks mutate Supabase Cloud and therefore remain an explicit Cloud-write gate.

### Stage 5 — PR acceptance

Status: pending

- Confirm CI and Vercel checks on the final SHA.
- Confirm no unresolved review comments.
- Update the PR body with final evidence and rollback instructions.
- Mark PR ready for review.

Exit check: PR is Ready, green, visually accepted, and contains no Production
or Cloud-write changes.

### Stage 6 — Integration and production readiness

Status: blocked by explicit approval gate

- After approval, merge PR to `dev`.
- Smoke-test the resulting shared Preview deployment.
- Prepare the Production preflight: environment parity, rollback target,
  manager/staff accounts, routes, and action checklist.
- After separate Production approval, promote the exact accepted build and run
  the smoke checklist.

Exit check: Production behavior matches the accepted Preview and rollback
remains available.

## Goal

Make Demo and Preview render one Staff product screen. They may differ only in
data adapters, permitted actions, and loading/error states. They must not have
independently designed page composition.

## Why the previous transfer was slow

The Preview reused Cafe colors and selected components, but independently
implemented its page structure in `lib/preview/staff-view.tsx`. That created a
second UI containing Preview-only Profile, schedule, request, attendance, and
correction cards. Each visual correction therefore changed only one of two
screens and allowed them to drift again.

Source-text tests verified imports and security boundaries, but did not prove
that authenticated Demo and Preview screenshots matched.

## Fast implementation rule

Do not port the Demo screen element by element. Extract the already-approved
presentation once and inject two adapters:

```text
CafeStaffScreen
  ├─ Demo adapter: mock data + localStorage callbacks
  └─ Preview adapter: Supabase/RLS view model + allowlisted Server Actions
```

`CafeStaffScreen` and its presentation children must import neither the Demo
store nor Preview loaders/actions.

## Security boundary

Visual parity does not authorize wider data access.

- Preview remains membership-derived and RLS-scoped.
- Staff identity remains the authenticated user's employee binding.
- Preview never falls back to the first employee or another location.
- The current Preview contract exposes only the caller's own published shifts.
  Therefore the shared schedule presentation initially renders the same table
  structure with the caller's row only. Showing every coworker, as the sales
  Demo currently does under `全体`, requires a separately reviewed product/RLS
  decision and is not part of this UI refactor.
- Demo imports no Preview Server Actions.
- Preview imports no Demo fixtures/store/localStorage.

## Exact UI target for this slice

1. Shared header geometry and brand mark.
2. Shared work-status card.
3. Remove the Preview-only `プロフィール` card.
4. Shared compact seven-day shift-table presentation, week controls, legend,
   today highlight, and worked-hours summary.
5. Shared transportation/message card presentation.
6. Shared next-month-preference CTA and help affordances.
7. Preview forms continue to call only the existing allowlisted Server Actions.
8. Shared desktop/mobile spacing, typography, cards, and responsive behavior.

Preview-only content is allowed only inside the shared interaction slots:

- real clock state/actions;
- real attendance/work-report/correction data;
- real shift-preference submission;
- safe loading/error/empty states.

## Implementation sequence and timebox

### A. Presentation extraction — 60–90 minutes

- Extract `CafeStaffScreen` from the approved Demo composition.
- Define narrow display props and action slots.
- Keep existing Demo behavior unchanged through a Demo adapter.

### B. Preview view-model adapter — 60–90 minutes

- Map real profile, shift types, published assignments, attendance, and
  requests to the shared display contracts.
- Do not invent missing data or import Demo fixtures.
- Preserve strict self/location filtering.

### C. Preview actions in shared slots — 45–60 minutes

- Mount current Preview clock and submission forms through shared card/modal
  presentation.
- Keep the Preview Server Action allowlist unchanged.

### D. Regression and visual acceptance — 60–90 minutes

- Boundary tests: one shared screen, no cross-imported data sources.
- Run lint, typecheck, tests, build, and Preview action verification.
- Capture authenticated Demo/Preview screenshots at 1440×900 and 390×844.
- Compare header, cards, schedule, actions, modals, empty/error states, and
  page overflow.

Expected focused implementation: roughly 4–6 hours when the existing real-data
loaders/actions remain unchanged. Extra time is needed only for a newly
discovered data/RLS requirement, not for ordinary visual adjustments.

## Acceptance gates

Work is not accepted from CI or DOM/source checks alone.

- The Preview-only Profile card is absent.
- Demo and Preview import the same `CafeStaffScreen`.
- Preview shows real DB data with no mock fallback.
- Staff identity/location remain fail-closed.
- Desktop and mobile screenshots are reviewed side by side.
- A real staff session is used; a manager no-profile state is not treated as a
  successful Staff acceptance.

## Production promotion

After Preview acceptance, production promotion is the same build, not another
UI port. Expected elapsed time is 30–60 minutes for deployment plus 1–3 hours
for preflight, rollback readiness, and manager/staff smoke tests. Production
deployment remains separately approval-gated.
