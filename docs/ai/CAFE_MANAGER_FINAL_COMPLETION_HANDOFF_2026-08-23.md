# Cafe Manager Final Completion — Handoff (2026-08-23)

Mission: **ORUWA CAFE v2.1 — MANAGER FINAL COMPLETION (Shift Preferences UI +
Full Manager QA)**, Founder-directed 2026-08-23, two phases. This handoff
covers **Phase A: DONE, merged, live-verified**. **Phase B: NOT STARTED** —
this is where the next session begins.

Read this file first if continuing Manager completion work. Do not start
Staff Completion QA or Manager↔Staff e2e QA yet — those are explicitly the
next two *separate* missions after this one closes (per the Founder's
instruction), not part of this handoff's scope.

## 1. Phase A — DONE

Target: bring the Shift Preferences popup (Settings → "Shift requests" →
"View requests") to the Founder-approved design (mockup image + detailed
text spec, both in this session's conversation, not duplicated here).

**Finding before implementing:** comparing the existing implementation
(`apps/web/src/app/(protected)/manager/shift-requests-review-popup.tsx`,
built in the earlier Shift Requests Review Popup mission, PR #377) against
the spec showed it was already ~90% correct — week nav, shift-type color
reuse from Weekly Schedule, honest approve/reminder stubs (no fake
email/LINE-sent claims), the 4-tier priority explainer text
(manual > approved preference > preference > algorithmic fallback), and
`APPROVED_PREFERENCE_PERSISTENCE` already correctly NOT_IMPLEMENTED (local
`useState` only, no server action, no migration). Only 5 concrete gaps were
found and fixed, PR #384 (merged `dev` commit `db17927`):

1. Day-header cells: weekday abbreviation + day number on two lines
   (matching Weekly Schedule's own `formatWeekday` convention, duplicated
   locally rather than shared/exported — verified byte-identical) plus a
   subtle today-column tint (`colors.accentMuted`), instead of a flat
   `MM-DD` slice.
2. A submitted employee's name no longer renders in success-green —
   ordinary text color (`colors.textPrimary`), so only a non-submitter's
   red name stands out (matches the mockup).
3. Added a `title` attribute (full label) on the preference-cell and
   staff-name buttons, for long/custom labels that get ellipsis-truncated.
4. Settings-card summary split into two independently-styled spans:
   submitted count in `colors.success`, missing count in `colors.warning`
   only when `missing > 0` (plain/muted when `missing === 0`, matching the
   spec's "no aggressive warning when nothing is missing"). Two new i18n
   functions (`shiftRequestsSubmittedLabel`, `shiftRequestsMissingLabel`);
   the popup's own footer keeps the original single-line
   `shiftRequestsSummaryLabel`, unchanged, per the agreed design (only the
   Settings card needed the two-tone split).
5. No persistence/backend/migration touched anywhere in this diff.

**Also done, Founder-approved separately mid-session (PR #382):** removed a
dead/duplicate inline "Submitted shift preferences" table on the Manager
dashboard that rendered the same data as this popup with no unique
capability — superseded since PR #377.

**Verification, all VERIFIED not just claimed:**
- `pnpm --filter @line-os/web typecheck/lint/test/build` — all clean,
  1205/1205 tests pass.
- Independent review (fresh-context agent, read-only): PASS on both PR #382
  and PR #384 — no regressions, no unrelated changes, all referenced theme
  tokens confirmed to exist.
- **Live QA on `preview.oruwa.jp/manager`** (this session, via
  chrome-devtools MCP, after PR #384 deployed): confirmed live —
  two-line weekday+day header with today-tint, ordinary-color submitted
  names, split-color Settings summary ("3/3 submitted" green / "0
  missing" plain since 0), popup header "Shift preferences — August 2026"
  / JA "シフト希望 — 2026年8月", footer text correct in both languages,
  legend below grid, no page-level horizontal overflow at 390px mobile
  width (`scrollWidth` ≤ `innerWidth`, checked via `evaluate_script`).

**NOT verified this round (honest gap, not a defect):** the current Preview
dataset (`oruwa-cafe` reference tenant) has no submitted preference with an
actual `shiftTypeId` in any of the three weeks checked (Aug 10–16, 17–23) —
only `isUnavailable` (`—`) and no-request (`+`) cells exist live. So the
colored preference chip and the Approve/Remove-approval click flow were
**not** interactively exercised against live data this round — only
verified by code reading (identical color-resolution path to Weekly
Schedule, `shiftChipColors`/`shiftTypeById`, already proven) and the
independent reviewer's diff check. If Phase B or a future session wants to
click-test that path live, either create a disposable QA preference row
with a real `shiftTypeId` (per the mission's own §27 allowance -- clean it
up after) or check further back/forward weeks/months for existing data
with one.

## 2. Phase B — NOT STARTED, begins here

Full scope is the Founder's original mission text (this session's
conversation) — do not re-derive it from memory, re-read the original
instruction if it is not still in context. Summary of what Phase B covers,
so a fresh session without that text can still orient:

**Environment:** `https://preview.oruwa.jp/manager`, live browser QA via
chrome-devtools MCP tools (already used successfully this session — see
§1). Do not touch `app.oruwa.jp` (production).

**Scope — full CRUD/workflow QA of the Manager surface**, not just visual
review:
- Shift Types: create, edit, deactivate, show-deactivated/reactivate,
  and confirm every change propagates immediately (no manual reload) to
  Weekly Schedule legend/editor, Shift Preferences legend/display, and any
  other consuming surface.
- Weekly Schedule: empty cell, assign, custom shift, predefined shift,
  edit, remove, reassign, current/future/past day, week nav, conflicts,
  unavailable, legend, long names, 4+ shift types, immediate UI update.
- Staff Management (Manage staff): list, create/edit/deactivate per actual
  domain capability, validation, error handling, JA/EN, and downstream
  propagation to Weekly Schedule/Shift Preferences/Attendance.
- Recipes: create/edit/save/deactivate per actual capability, translations,
  instructions, immediate sync.
- Inventory: list/create/edit item, minimum/target/actual, shortage
  calculation (compute and compare, don't guess), deactivate/delete,
  Manager↔Staff consistency.
- Needs Attention: each category (corrections, exchanges, unavailable
  conflicts, inventory shortage) — counter accuracy, click→content, actions
  work, post-resolve state updates without manual reload. Live data seen
  this session: 8 items total (2 correction requests, 1 shift exchange, 2
  unavailable-conflict shifts, 3 inventory shortages) — real, not
  fabricated, good starting point for Phase B's attention-workflow checks.
- Attendance Corrections and Shift Exchange: full Manager decision
  workflows (approve/reject, candidate-present vs waiting-for-candidate),
  state/counter updates.
- Cross-module reactivity audit: create/edit/deactivate in one place must
  reflect immediately everywhere else that data appears, no
  `window.location.reload()` as a normal solution.
- Performance: week-switching specifically (previously observed
  delay/layout-jump) — needs real measurement/evidence, not a guess;
  investigate RSC requests, duplicated fetches, translation-request
  waterfalls, cache invalidation, full-page rerenders.
- JA/EN full pass, mobile (~390px) full pass, error/loading/empty states,
  double-click/duplicate-mutation guard, security-boundary confirmation
  (no RLS/schema/secrets touched without separate approval).
- Issue classification: P0 (v2.1 blocker) / P1 (fix before Founder
  acceptance) / P2 (polish, can ship without) / V2.2 (deferred capability,
  not a defect).
- Implementation authority: ordinary P0/P1 bugs found during this QA may
  be fixed directly (investigate → fix → test → review → retest) without
  asking first — but do not expand scope into Platform Foundation,
  LINE/email infrastructure, scheduled automation backend, new
  notification subsystem, large DB redesign, or main↔dev reconciliation.
- Full git/PR/CI/merge/Preview workflow per the now-standing DEV MERGE
  authority (`scripts/ai-dev-merge.sh` — see
  `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §9 "DEV MERGE"): no
  need to stop and ask before merging a routine, green-CI, reviewed PR into
  `dev`. `main` and production deploy remain untouched, no exception.
- End deliverable: a Final Manager Acceptance Matrix (component ×
  PASS/PASS WITH KNOWN LIMITATION/FAIL/NOT VERIFIED, no PASS without
  evidence) and a final verdict `MANAGER_V2_1_READY_FOR_FOUNDER_ACCEPTANCE
  = YES/NO`.

## 3. What NOT to do in Phase B (explicit, from the Founder)

Platform Foundation implementation, LINE/email real delivery
infrastructure, scheduled-automation backend, new notification subsystem,
large DB redesign, `main`↔`dev` reconciliation, Staff Completion QA,
Manager↔Staff end-to-end QA (the latter two are separate future missions,
not this one). No Cloud DB schema/RLS/Auth/migration changes without
separate Founder approval — this mission works inside the existing,
already-approved Cafe v2.1 scope only.

## 4. Repository state at handoff time

`dev` HEAD: `db17927` (PR #384 merged). Branch `dev-local` (or fresh
`origin/dev` checkout) is clean. No uncommitted changes. Chrome DevTools
MCP session was already authenticated against `preview.oruwa.jp` as a
Manager this session (browser profile persists login) — a fresh session
should confirm this is still true before assuming it.

## 5. Bootstrap prompt for the next session

*"Read `docs/ai/CAFE_MANAGER_FINAL_COMPLETION_HANDOFF_2026-08-23.md`.
Phase A (Shift Preferences UI polish) is done and merged. Execute Phase B:
full Manager CRUD/workflow QA per this handoff's §2 summary (full original
spec was given by the Founder in the prior session's conversation — if not
recoverable, ask the Founder to re-paste the full Phase B text before
starting, rather than guessing at scope). Work autonomously per the DEV
MERGE authority already in place; escalate only at genuine RED
boundaries."*
