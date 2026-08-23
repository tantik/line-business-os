# Cafe Manager Final Completion — Phase B Handoff (2026-08-23, checkpoint)

Mission: **ORUWA CAFE v2.1 — MANAGER FINAL COMPLETION — PHASE B**, continuing
from `docs/ai/CAFE_MANAGER_FINAL_COMPLETION_HANDOFF_2026-08-23.md` (Phase A
done) and `docs/ai/CAFE_MANAGER_FOUNDER_QA_SCENARIO_HANDOFF_2026-08-23.md`
(QA dataset ready). **This is a checkpoint, not a close-out.**
`MANAGER_PHASE_B = PARTIAL`. Read this file first if continuing Phase B —
it is more current than the two above for "what's left."

## 1. What's DONE and VERIFIED this session (real live QA, not just code)

All live-tested via chrome-devtools MCP against `preview.oruwa.jp` (Manager:
`manager@oruwa-cafe.test` / `NewTestSmoke456!`; Staff 田中美咲:
`konstantin.a.chvykov@gmail.com` / `StaffAAnNChnHvHBXZ!2` — both documented
in `CAFE_MANAGER_PARITY_MISSION_COMPLETE_HANDOFF_2026-08-19.md` §5).

### §2 P0 — Shift Preference `CUSTOM_*` leak — FIXED, merged, live-verified
Root cause: NOT a data/write-path bug — `shift_type_id` was always written
correctly. `staff-dashboard-client.tsx` rendered a shift type's raw `code`
(internal id, `CUSTOM_<timestamp>` for any type ever created through the
create-shift-type form) instead of `shiftTypeDisplayLabel()`, in the
submitted-preferences table and the selected-day shift detail. Manager side
was already correct and already guarded by a regression test; Staff had
none. Fixed both render sites, added the missing test.
**PR #386, merged to `dev` (`1b4aa6d`). Live-verified**: 田中美咲's Staff
dashboard now shows "2" not `CUSTOM_1787307319277`; Manager popup's color
for that same type is consistent with the legend (the "stone" near-neutral
tone — one of 10 deliberate palette entries, not a bug).

### §4 Shift Types >6 scroll UX — DONE, merged, live-verified
Active-types list capped to 396px (6×60px rows + gaps), `overflowY: auto`.
No scrollbar at ≤6 (today's real count is 5). **PR #387, merged
(`7bdb353`)**. Live-verified by temporarily adding 2 shift types (6→no
scrollbar, 7→scrollbar appears, height capped), then deactivating both —
dataset restored to its original 5.

### §5 Shift Types visual hierarchy — DONE, merged, live-verified
Row now separates the color/identity chip (just the label) from the time
range (separate muted text), instead of one long colored pill containing
both. Same row height, no card-weight increase.

### §6 Button hover/focus reveal micro-interaction — DONE, merged, live-verified
Discovered the exact Founder reference ("Slider Revolution Effect #2") was
**already implemented** as `.staffNameCell` in `theme.module.css` (built in
an earlier mission, Weekly Schedule Round 3) — generalized it into a
reusable `.actionReveal` modifier class (white ☞ U+261E glyph, not emoji,
so `color:white` works; slides in from outside the button's own edge inside
`overflow:hidden`, no width change/CLS; `prefers-reduced-motion` respected).
Applied to exactly one button — Settings' "View requests" (the literal
Founder mockup target) — not spread to other buttons or any destructive
action. **PR #388, merged (`2c17741`)**. Independent review caught a real
bug (the new class's own `:focus-visible` outline silently overrode the
base button variant's outline color due to matching specificity + later
source order) — fixed in the same PR before merge. Live-verified: hover
computed style shows `right:-1px`, white color, accent bg, no button-width
change (100px before/during hover).

### §7 Weekly Schedule full CRUD — VERIFIED live, no code changes needed
All exercised on real future-week cells (2026-08-24 to 08-30, all-future to
avoid touching past-date semantics) then cleaned up immediately after each
step, restoring the QA dataset to its original state:
- **CREATE**: empty cell → assign predefined Shift Type 3 → cell updates
  instantly, no F5.
- **EDIT**: same cell, shift-type dropdown shows the new type selected;
  time fields editable.
- **REASSIGN**: "担当を変更" (Change assignee) swaps the shift to a
  different staff member — triggers a confirm dialog ("この日はすでにスタッフに
  表示されています" / already-visible-to-staff warning) before applying —
  good UX, not a bug. Applied instantly on confirm.
- **DELETE**: "シフトを削除" with its own confirm dialog, removes instantly.
- **Persistence**: reloaded the page after the full create→edit→reassign→
  delete cycle — final empty state persisted correctly.
- **Past-date semantics**: clicking a past-date cell shows an honest banner
  ("過去のスケジュールを修正しています -- この日付はすでに過ぎています"),
  distinct from the future/today "assign" flow — cancelled without saving
  (didn't want to touch historical QA data).
- **Cross-module reactivity**: created a temporary Shift Type ("QAX") →
  appeared immediately (no F5) in: the Weekly Schedule legend, and the Shift
  Editor's own type dropdown. Deactivated it immediately after (cleanup).
  **Known tooling limitation, not a product bug**: the `fill` tool could not
  reliably set values on the native compound `<input type="time">` controls
  used in the create-shift-type form and the assign/edit-cell dialogs (times
  silently stayed at their defaults despite `fill` reporting success) — if a
  future session needs to assign a *specific* custom time via automation,
  budget time to work around this (e.g. keyboard-driven spinbutton
  increments) rather than trusting `fill` on `InputTime`.

### §8 Week navigation performance — MEASURED, no fix needed
Real Chrome performance traces (not guesses), two independent samples of a
week-nav click (both directions):
- Sample 1 (current→next week): **LCP 131ms, INP 131ms, CLS 0.00**.
- Sample 2 (next→current week): **LCP 90ms, INP 90ms, CLS 0.00**.
- Exactly **one** `document` network request per navigation (plus unrelated
  Vercel Live preview-toolbar noise, not present in production) — no
  redundant/duplicate/sequential fetches.
- **Conclusion**: the Founder's original complaint about slow/janky week
  navigation was already fixed in an earlier mission (Weekly Schedule
  Founder Review Round 3, PRs #368-375, per `current-task.md`). This
  session's fresh measurement confirms it's still fast — no further
  optimization needed, no before/after delta to report since no change was
  made here.

### §11 Staff Management — spot-checked live, working
Full CRUD dialog confirmed: list with search/filter (有効/無効/すべて),
"+スタッフを追加", per-row Edit (name/kana/email/LINE id/role), Invite,
Deactivate, Permanently-delete, Save/Cancel. **Live-tested an actual EDIT**:
changed 山田花子's role field, saved, confirmed instant list-row update (no
F5), then reverted to the original value and re-saved — dataset restored.

### §13 Inventory — spot-checked live, working, shortage math re-confirmed
9 items, filters (すべて/要補充/OK), sort, inline-editable actual-quantity
with autosave ("Enterキーで保存"). **Live-tested a real state transition**:
lowered グラニュー糖 (target 5kg, reorder 1kg) from 3kg to 0.5kg — instantly
flipped to "不足" with correct deficit (−4.5kg = 5−0.5), and the **Manager
dashboard's own header counters updated live** (要確認 7→8, 要補充 3→4,
inventory-shortage Needs-Attention line updated) — cross-module reactivity
confirmed. Reverted to 3kg — counters and status returned to original
(要補充 3, OK 6). No F5 anywhere in this cycle.

### §12 Recipes — spot-checked live, form confirmed
Opened one recipe's edit form (type/status/title/description/photo/
ingredients/steps/note fields all present and pre-filled correctly with the
Founder QA dataset's realistic Japanese content) — cancelled without
changes (no mutation needed to prove the form renders/works).

### §16 Needs Attention — decision workflow VERIFIED live
Approved one of two pending attendance corrections (田中美咲, 08-18) via the
popup's "承認" button — **counter updated instantly in the dashboard header**
(要確認 8→7, 対応が必要 3→2, "1件の修正依頼..." line updated), item removed
from the still-open popup list, no F5. Deliberately left the other
correction and the one shift-exchange item untouched — both are explicitly
Founder-QA-scenario fixtures (`QA fixture (oruwa-cafe-fixture-v1)` in the
exchange's own reason text) meant to stay available for the Founder's own
demo; approving everything would have depleted the dataset's demo variety.

### Mobile (390px) + JA/EN — spot-checked on Manager dashboard only
- 390×844 mobile viewport: `document.documentElement.scrollWidth === window.innerWidth`
  (390===390) — no page-level horizontal overflow. Settings' Shift Types
  scroll container still correctly capped at that width.
- EN toggle: system chrome translates ("Manager" heading etc.), staff names
  (佐藤陽介, 山田花子, ...) correctly stay in Japanese (business content, not
  translated) — matches spec. Reverted to JA after.
- **Not yet done**: mobile pass on Staff/Recipes/Inventory/Shift-Preferences-
  popup individually, or JA/EN pass beyond the Manager dashboard shell.

## 2. What's NOT done — exact remaining Phase B scope

Per the original Founder Phase B prompt (full text in this mission's
conversation, not duplicated here — re-read it, don't guess):

- **§14 Attendance Corrections** — only the *approve* path was exercised
  once (§16 above). Reject path, candidate-present vs still-pending
  variants, and the planned-vs-actual distinction (§14's own explicit
  warning: "не переписывать historical schedule") not separately verified.
- **§15 Shift Exchange** — only viewed the popup's read state (nominate-
  candidate / reject buttons present, correct waiting-for-candidate copy).
  No decision (accept/reject/nominate) was actually exercised — the one
  live item is an explicit Founder-QA fixture, deliberately not consumed.
- **§17 Cross-module reactivity** — only the Shift-Type-creation and
  Inventory-shortage cases were exercised (both PASS). Staff-change →
  schedule/preferences propagation, and Shift-Exchange-decision →
  schedule+Needs-Attention consistency, not yet tested.
- **§18 Visual/UX consistency audit** — not done as its own systematic pass
  (buttons/inputs/modals/spacing/typography/hover/focus/disabled/loading/
  error/destructive states, table density) — only incidentally observed
  while doing functional QA above.
- **§19 Mobile** — only the Manager dashboard shell checked (see above);
  Staff, Recipes, Inventory, Shift-Preferences popup, and relevant modals
  each need their own 390px pass.
- **§20 JA/EN** — only the Manager dashboard shell + names-not-translated
  spot-check; full pass (all modules, plus native-JA-copy review — the
  latter explicitly flagged in `current-task.md` §2.4 as needing a human
  native speaker, not an AI session) not done.
- **§21 Loading/error/mutation UX** — not systematically checked (double-
  submit guards, error recovery) beyond what was incidentally observed.
- **§24 Adversarial review** — not run at all yet. Should be a dedicated
  fresh-context pass per the original mission's own instruction, looking
  specifically for: fake fixes, UI-only workarounds, stale data, race
  conditions, tenant leaks, RLS bypass, excessive refetch, `CUSTOM_*`
  leaks elsewhere, hidden regressions.
- **Final Manager Acceptance Matrix + `MANAGER_V2_1_READY_FOR_FOUNDER_ACCEPTANCE`
  verdict** — not produced yet; requires the above to close first.

## 3. PRs merged this session (all via `scripts/ai-dev-merge.sh`, DEV MERGE authority, `dev` only)

| PR | Title | Commit on `dev` |
|----|-------|------------------|
| #386 | fix(cafe-staff): stop leaking shift-type CUSTOM_<timestamp> code to Staff UI | `1b4aa6d` |
| #387 | feat(cafe-manager): cap Settings Shift Types list to ~6 rows with internal scroll | `7bdb353` |
| #388 | feat(cafe-manager): Shift Types row hierarchy + reusable button reveal micro-interaction (incl. focus-outline fix from review) | `2c17741` |

All three: typecheck/lint/test (1206/1206 after #386, unchanged after)/build
green, independent fresh-context review PASS before merge, live-verified on
Preview after merge. No RLS/migration/schema/secrets touched. `main`/
production untouched.

## 4. Repository state at checkpoint

`dev` HEAD after this session: `2c17741`. Local `dev-local` branch is
up to date with `origin/dev`, clean working tree (the 3 feature branches
from this session — `fix/cafe-manager-phase-b-shift-preference-custom-code-leak`,
`feat/cafe-manager-phase-b-shift-types-scroll-ux`,
`feat/cafe-manager-phase-b-shift-types-visual-hover` — are all merged and
can be deleted whenever convenient; not done automatically this session).

## 5. Bootstrap prompt for the next session

*"Read `docs/ai/CAFE_MANAGER_FINAL_COMPLETION_PHASE_B_HANDOFF_2026-08-23.md`
first — Phase B is IN PROGRESS, `MANAGER_PHASE_B = PARTIAL`, not done. §2
(P0 bug), §4-6 (Shift Types UX), §7-8 (Weekly Schedule + performance), and
spot-checks of §11-13/§16 (Staff/Recipes/Inventory/Needs Attention) are
verified done — don't repeat them without a reason. Continue with §14
(Attendance reject path), §15 (Shift Exchange decision — use a fresh
disposable fixture if the one live item must stay as Founder's demo
fixture), §17 (remaining cross-module cases), §18 (visual consistency
audit), §19-20 (mobile + JA/EN full pass across all modules, not just
Manager dashboard shell), §21 (loading/error UX), §24 (adversarial review),
then produce the Final Manager Acceptance Matrix and
`MANAGER_V2_1_READY_FOR_FOUNDER_ACCEPTANCE` verdict per the original Phase B
prompt's own format. Work autonomously per the standing DEV MERGE authority;
escalate only at genuine RED boundaries. Manager credentials:
`manager@oruwa-cafe.test` / `NewTestSmoke456!`; Staff (田中美咲):
`konstantin.a.chvykov@gmail.com` / `StaffAAnNChnHvHBXZ!2` (both already
documented in `CAFE_MANAGER_PARITY_MISSION_COMPLETE_HANDOFF_2026-08-19.md`
§5, repeated here for convenience)."*
