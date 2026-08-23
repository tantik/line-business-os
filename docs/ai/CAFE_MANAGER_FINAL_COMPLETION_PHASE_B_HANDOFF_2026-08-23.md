# Cafe Manager Final Completion — Phase B Handoff (2026-08-23, checkpoint 2)

Mission: **ORUWA CAFE v2.1 — MANAGER FINAL COMPLETION — PHASE B**. This is
checkpoint 2, continuing directly from the checkpoint-1 version of this same
file (git history has it, `2220f99` and later). **Still not a close-out.**
`MANAGER_PHASE_B = PARTIAL`. Read this file first if continuing Phase B.

## 1. What's newly DONE and VERIFIED this continuation (real live QA + one real fix)

All live-tested via chrome-devtools MCP against `preview.oruwa.jp` (Manager:
`manager@oruwa-cafe.test` / `NewTestSmoke456!`; Staff 田中美咲:
`konstantin.a.chvykov@gmail.com` / `StaffAAnNChnHvHBXZ!2`).

### §15 Shift Exchange decision workflow — CLOSED, full live workflow verified

Root-caused and resolved the prior session's open question ("modal not
opening" for 田中美咲's own-shift cell): it was never a tooling/modal bug —
her only shift in the dataset was *today's*, and `canRequestExchange` /
`isCellClickable` (`staff-dashboard-client.tsx:246-250`,
`ShiftTable.tsx:81-89`) correctly gate exchange requests to future shifts
only. Confirmed by giving her a real future shift via Manager
(2026-08-24 10:00-14:00, Shift Type 1) then retrying from Staff — the own-
shift-cell `<td onClick>` (not exposed as an accessible button/role in the
snapshot tree, which is why the previous session's `click`-tool attempts
landed on the wrong target) opened the exchange modal correctly on the first
try with a real future shift.

Full disposable-request cycle exercised, all live, no shortcuts:
1. **Staff**: submitted a real exchange request on the future shift via the
   modal's own "交換希望" form.
2. **Manager**: opened the Shift Exchange popup — saw the request as 対応が必要.
   First nominate attempt (佐藤陽介) correctly **failed server-side**
   (`shift_exchange_schedule_conflict` — 佐藤陽介 already had an overlapping
   13:00-18:00 shift that day; overlap math confirmed by hand). See §2a below
   for the real (documented, not fixed) UX gap this surfaced.
3. **Manager**: second nominate attempt (高橋直人, genuinely free that day)
   succeeded — "交換相手を指名しました。"
4. **Manager**: approved the now-nominated exchange — "シフト交換を承認しました。"
5. **Verified the actual effect**: reloaded the Weekly Schedule for that
   week — 田中美咲's Mon 08-24 shift is gone, 高橋直人 now has it
   (1・10:00-14:00). The exchange decision correctly mutated the real
   assignment, not just the exchange record's own status.
6. **Needs Attention count** dropped instantly after the decision (対応が必要
   3→2 immediately after nominate/approve, matching the pattern already
   proven for corrections in checkpoint 1).

No Founder-QA-fixture data touched — this used a disposable shift +
disposable exchange request created and fully consumed within this session,
never the pre-existing `oruwa-cafe-fixture-v1` exchange item (still
untouched, still available for Founder demo).

### §2a Real (documented) finding: candidate-conflict preview is week-scoped

`ShiftExchangeRequestsPopup`'s candidate list (`shift-exchange-candidates.ts`)
previews schedule conflicts using `allAssignments` = whatever week the
Manager currently has loaded on the dashboard (`manager-dashboard-client.tsx:1290`,
`assignments` prop scoped by `weekOffset`) — documented in the code's own
comment as an intentional "preview only, server RPC re-checks authoritatively"
tradeoff. In practice this means: if the Manager decides an exchange for a
shift in a *different* week than the one currently on screen, a candidate
with a real conflict in that other week is shown as "対応可能" (available)
with no warning, and clicking them produces the server's correct rejection
but surfaced through a **generic, unhelpful message** — `error-copy.ts`'s
`stale_reference` bucket ("This request is no longer up to date... Refresh
to see the latest state") rather than the purpose-built
`candidateScheduleConflict` string ("この時間帯は既に予定あり") that exists in
`manager-dashboard-i18n.ts` for exactly this case but never fires here. Not
fixed this session — server-side enforcement is correct and no wrong
assignment can ever actually happen, so this is a UX/message-quality gap, not
a data-integrity bug. Recorded as a durable P2 finding for a future Cafe
Hardening pass, not blocking Phase B closure by itself.

### §17 Cross-module reactivity — one more case exercised

Staff Management → Weekly Schedule/Staff-list propagation: edited 高橋直人's
役職 (role) field live (Barista → "Senior Barista" → reverted), confirmed the
Staff list row updated instantly with no F5 both times. Confirms Staff-edit
writes propagate immediately, same pattern already proven for Inventory and
Attendance in checkpoint 1.

### §19-20 Modals at 390px — Staff edit + Correction popup checked

- Staff list modal and individual Staff-edit form: both render cleanly at
  390px, no overflow, no squeezed inputs (screenshots taken, not just DOM
  checks).
- Correction-requests popup: renders cleanly at 390px. **Found and fixed a
  real i18n bug here** (see §2 below) — the "requested change" line showed
  raw English "60min break" even with the dashboard set to JA.
- Still not checked: Shift Exchange popup, Recipe edit modal at 390px
  specifically (page shells for Recipes were checked in checkpoint 1, not
  its edit modal).

### §2 Real bug found, fixed, tested, reviewed, merged: correction break-text i18n

`formatRequestedCorrectionChange` (`apps/web/src/app/(protected)/_ui/workforce-theme.ts`)
had no `lang` parameter at all — every Manager view of a correction request's
"希望する変更" (requested change) line rendered the break-time part as literal
English `"60min break"` regardless of the JA/EN toggle, in both the
Correction Requests popup and the Weekly Schedule cell editor's inline
correction view. Fixed by adding `lang: Lang = 'en'` (same
backward-compatible-default pattern as `correctionStatusLabel`/
`exchangeStatusLabel` in the same file, which already had this treatment) and
threading the already-in-scope `lang` through both call sites.

- 4 new regression tests added (`workforce-theme.test.ts`): English default,
  JA translation (`休憩60分`), break-only case, empty-details `-` fallback.
- `tsc --noEmit`, `eslint`, and the full test suite (1210/1210) all pass.
- Independent fresh-context review (`/code-review high`) — zero findings.
- **PR #393**, merged to `dev` via `scripts/ai-dev-merge.sh` (all mechanical
  gates green: CI pass, MERGEABLE, no RED-operation paths).
- **Live-verified on `preview.oruwa.jp` after merge**: correction popup at
  390px now shows "09:00 - 17:00, 休憩60分" — fully Japanese, screenshot
  confirmed.

## 2. Founder-provided design input this session (saved, not yet started)

Mid-session the Founder sent a design mockup for a **different, later**
piece of work — see `[[project_shift_requests_popup_redesign_hand_icon_queued]]`
memory file for the full description (repeated here for a session without
memory access):

1. Move/redesign the existing Shift Requests popup (PR #377) into a compact
   Settings block next to "自動スケジュール" (status summary + "View
   requests" button opening the month-scoped popup), matching the mockup's
   grid/priority-order/reminder-email+LINE flow — **and verify the existing
   popup's real functionality against that target**, not just restyle.
2. Apply the existing green-button/white-hand-icon hover reveal
   (`.actionReveal`, already built for Settings' "View requests" button, PR
   #388) to **every** button that shows a staff member's name across the
   Manager surface (currently only in Weekly Schedule's own staff-name
   buttons, e.g. "佐藤 陽介 👍").

**Explicitly deferred until after Phase B closes** — do not start either
item without a fresh Founder go-ahead, per this project's normal
authorization gating.

## 3. What's STILL not done — remaining Phase B scope

- **§18 Visual/UX consistency audit** — still not run as its own dedicated,
  systematic pass across every state (hover/focus/disabled/loading/error,
  spacing, typography, table density) for every module. Only incidentally
  observed while doing functional QA (all incidental observations this
  session were clean, no visual regression noticed).
- **§21 Loading/error/mutation UX** — still not a dedicated pass. This
  session incidentally exercised one real error path (the schedule-conflict
  nominate rejection, §2a above) and confirmed instant-update UX on every
  successful mutation tried (Staff edit, exchange nominate/approve) — no
  double-submit or stuck-loading issue observed, but not adversarially
  probed (e.g., rapid double-click, network-slow simulation).
- **§19-20 remaining modals** — Shift Exchange popup and Recipe edit modal
  at 390px not yet checked individually.
- **§24 Adversarial review** — still not run as its own dedicated
  fresh-context pass. This session's own work was independently reviewed
  (`/code-review high` on PR #393, zero findings) but that is scoped to the
  one PR's diff, not a whole-Phase-B adversarial sweep for fake fixes,
  stale data, race conditions, tenant leaks, RLS bypass, excessive refetch,
  `CUSTOM_*` leaks elsewhere, or hidden regressions across the *entire*
  Acceptance Matrix.
- **Final Manager Acceptance Matrix + `MANAGER_V2_1_READY_FOR_FOUNDER_ACCEPTANCE`
  verdict** — see updated interim matrix below. Still not the final one.

## 3a. Interim Manager Acceptance Matrix (checkpoint 2, still NOT final)

`MANAGER_V2_1_READY_FOR_FOUNDER_ACCEPTANCE = NO` (not yet — §18/§21/§24 and
the two remaining §19-20 modals still need to close first).

| Component | Status | Evidence |
|---|---|---|
| Shift Preference identity (P0) | **PASS** | PR #386, checkpoint 1 |
| Shift Types CRUD / scroll UX / visual hierarchy / button reveal | **PASS** | PRs #387-388, checkpoint 1 |
| Weekly Schedule CRUD + past/today/future + cross-module reactivity + perf | **PASS** | Checkpoint 1 |
| Staff Management CRUD | **PARTIAL → improving** | Edit verified live twice now (checkpoint 1 + this session's role-field test); create/deactivate/invite still not exercised |
| Recipes CRUD | **PARTIAL** | Unchanged from checkpoint 1 — form read/rendered only |
| Inventory CRUD + shortage math | **PASS** | Checkpoint 1 |
| Attendance Corrections (approve + reject) | **PASS** | Checkpoint 1 |
| **Shift Exchange decision (nominate/approve/reject)** | **PASS** | **Full live workflow this session — was NOT VERIFIED before** |
| Needs Attention resolve flow | **PASS** | Checkpoint 1 + reconfirmed this session |
| Cross-module reactivity (broader) | **PARTIAL → improving** | 3 of ~5 named scenarios now exercised (Shift-Type-creation, Inventory-shortage, Staff-edit; exchange-decision→schedule+attention also now proven as part of §15) |
| Visual/UX consistency | **NOT VERIFIED** | Still no dedicated systematic pass |
| Mobile (390px) | **PARTIAL → improving** | Page shells (checkpoint 1) + Staff-edit modal + Correction popup (this session) clean; Shift Exchange popup + Recipe edit modal still unchecked |
| JA/EN | **PARTIAL → improving** | Page shells clean (checkpoint 1); **one real bug found and fixed this session** (correction break-text); native-copy review still out of AI scope |
| Loading/error/mutation UX | **NOT VERIFIED (partial evidence)** | One real error path observed cleanly (exchange schedule-conflict rejection); no dedicated adversarial pass |
| Adversarial review | **NOT VERIFIED** | Still not run as its own pass |
| Security/RLS/tenant boundary | **PASS (by omission)** | No RLS/migration/schema/secrets touched this session either — every diff reviewed |

## 4. PRs merged this continuation

| PR | Title | Commit on `dev` |
|----|-------|------------------|
| #393 | fix(cafe-manager): translate correction-request break text in JA mode | `69c8445` |

All gates green: typecheck/lint/1210 tests/build, independent fresh-context
review PASS, live-verified on Preview after merge. No RLS/migration/schema/
secrets touched. `main`/production untouched.

## 5. Repository state at checkpoint 2

`dev` HEAD after this continuation: `69c8445` (after PR #393; check `git log`
rather than trusting this number blindly in a future session). `dev-local`
is fast-forwarded to match. The disposable QA shift assignment and exchange
request created during §15 are now in a natural terminal state (shift
reassigned to 高橋直人, exchange status `approved`) — nothing further to
clean up, this is a real, intentional product outcome, not stray test data.

## 6. Bootstrap prompt for the next session

*"Read `docs/ai/CAFE_MANAGER_FINAL_COMPLETION_PHASE_B_HANDOFF_2026-08-23.md`
first (this is checkpoint 2, git history has checkpoint 1) — Phase B is IN
PROGRESS, `MANAGER_PHASE_B = PARTIAL`. §15 Shift Exchange decision is now
CLOSED (full nominate→approve workflow verified live, PR #393 fixed a real
JA/EN bug found along the way) — don't repeat it without a reason. A real,
documented (not yet fixed) UX gap remains in the candidate-conflict preview
being week-scoped (§2a) — durable P2, not a Phase B blocker by itself.
Remaining Phase B scope: §18 (dedicated visual/UX consistency audit, not yet
run), §21 (dedicated loading/error/mutation UX pass), the Shift Exchange
popup + Recipe edit modal at 390px (§19-20), and §24 (dedicated fresh-context
adversarial review of the whole Acceptance Matrix, not just this session's
own PR diff). Only after those close does the Final Manager Acceptance
Matrix and `MANAGER_V2_1_READY_FOR_FOUNDER_ACCEPTANCE` verdict get produced,
per the original Phase B prompt's own format — do not declare YES with any
of those still open. Separately, the Founder sent a design mockup mid-session
for a **later, explicitly deferred** piece of work (Shift Requests popup
redesign in Settings + hand-icon hover on all staff-name buttons) — see the
`project_shift_requests_popup_redesign_hand_icon_queued` memory file; do not
start it without a fresh Founder go-ahead after Phase B closes. Work
autonomously per the standing DEV MERGE authority; escalate only at genuine
RED boundaries. Credentials unchanged from checkpoint 1 (see §1's header
above or `CAFE_MANAGER_PARITY_MISSION_COMPLETE_HANDOFF_2026-08-19.md` §5).
Manager and Staff sessions share the same cookie jar on `preview.oruwa.jp` —
re-authenticate each time you switch roles."*
