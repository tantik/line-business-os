# Phase 1N-4D — Fast Demo-to-Preview Staff Parity Plan

Status: implementation plan
Target: `/demo/cafe/staff` → DB-backed `/mame-to-cha/staff`
Branch: `fix/cafe-v2-staff-exact-parity`

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
