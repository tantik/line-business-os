# Weekly Schedule Founder Review (Rounds 1-2) — session handoff (2026-08-22)

**Read this first in a fresh session.** This mission is complete and merged.
Nothing here is pre-authorized to continue without a fresh Founder direction
-- if the Founder opens a new chat and says "what's next", the honest answer
is "ask them," not "resume this."

## 1. What this mission was

Founder-directed, two-round redesign of the canonical Manager's Weekly
Schedule module (`(protected)/manager/**`), triggered by a live-QA session
against `preview.oruwa.jp/manager` and, for UX reference only (never copied
1:1), the `_client-preview/mame-to-cha/**` surface.

- **Round 1** (PR #365): compact click-to-edit grid, 10-tone stable shift-
  color system, `CUSTOM_<timestamp>` raw-id leak fix, controlled-edit
  confirmation for a Published shift.
- **Round 2** (PR #366), after Founder live review of Round 1's result: a
  bigger product-model change — Manager no longer manages Draft/Published at
  all — plus past/today/future editing semantics, a redesigned Shift Editor
  (read-only employee context + explicit Reassign, Remove-shift), real
  numbers on the day-shortage marker, legend repositioned, compact week
  navigator, and a **visual-only "Automatic schedule" foundation** in
  Settings for a future scheduled-automation capability (explicitly not
  built).

Three smaller, unrelated bug-fix PRs (#362-#364, View-shift navigation/Modal
scroll-jump) landed in the same session immediately before this mission
started — already merged, not part of this mission's scope, mentioned here
only because they're adjacent commits in `dev`'s history.

## 2. Repo / branch state (VERIFIED at handoff time)

- Repo: `D:\Dev\line-business-os`. Base branch: `dev`.
- Both PRs below are **merged into `dev`**. No open PR, no open branch from
  this mission (feature branches deleted after merge).
- A local branch `work/dev-mirror` was used throughout this session as a
  disposable mirror of `origin/dev` (the real `dev` branch was checked out
  in another worktree, `D:\Dev\line-business-os-founder-audit`, for the
  whole session) — safe to delete or leave; it tracks `origin/dev` and picks
  up nothing local. A fresh session should just `git fetch && git checkout
  dev && git pull` (or re-create a mirror branch the same way if `dev` is
  still checked out elsewhere).
- **No DB migration, no schema change, no RLS change** in either round —
  confirmed by reading `schedule-actions.ts`/`shift-assignments.ts`/RLS
  before implementing; the Published-edit lock was frontend-only.
- Two untracked files pre-exist the working tree from before this session
  (`ORUWA_CAFE_V2_1_FINAL_INDEPENDENT_QA_2026-08-17.md`,
  `ORUWA_CAFE_V2_1_FULL_QA_AUDIT_2026-08-17.md`) — not created or touched by
  this mission, left alone.

## 3. The two PRs, in order

| PR | Title | Merge commit | What it did |
|----|-------|-------------|-------------|
| #365 | Redesign Weekly Schedule grid — compact click-to-edit cells, controlled Published edit, 10-tone stable shift-color system | `1b019ab` | Whole-cell `<button>` (chip or "+"), removed the stacked badge/button cell; fixed the root cause of `CUSTOM_<timestamp>` leaking into the UI (`shiftTypeDisplayLabel`'s own last-resort fallback was `code` — changed to the shift's time range); shift-color palette raised 3→10 tones with a stable per-id hash (not array-position) mapping; Published shifts became click-to-edit again behind a "this is already published" confirm. |
| #366 | Weekly Schedule Founder Review Round 2 — remove Draft/Published from Manager UX, past/today/future semantics, richer cell editor, automation foundation | `d55e8c8` | Manager UX drops Draft/Published entirely (every manual save auto-publishes, hardcoded server-side for the canonical Manager's single-cell writes only); Publish schedule/Run auto-create relocated from the Weekly Schedule card into a new "Automatic schedule" subsection in Settings (day-of-month/period inputs disabled, "Not active yet", Run now/Publish schedule still real); past-dated empty cell shows "—" not "+" with a "Correct past schedule" affordance; Shift Editor redesigned (employee read-only + explicit Reassign, "Change scheduled shift?" confirm for a real future/today edit, "Correcting past schedule" notice for a past edit, "Remove shift" available for any existing assignment); day-header shortage marker now shows real required/scheduled/missing numbers; legend moved below the grid; compact `‹ This week ›` navigator; two unnecessary sequential round trips removed from `page.tsx`'s data load. |

## 4. Key files changed across both rounds

Frontend (all under `apps/web/src/`):

- `app/(protected)/manager/manager-dashboard-client.tsx` — `renderScheduleCellContent` rewritten twice (whole-cell button, then past/today/future + name+time); day-header shortage marker; legend moved; week navigator; Publish/Auto-create buttons removed from this file's own JSX (moved to Settings via props: `onRunAutoCreate`, `autoCreatePending`, `onPublishSchedule`, `publishPending`, `lastAutoCreateResult`).
- `app/(protected)/manager/shift-cell-editor.tsx` — `ShiftCellEditor`/`ShiftCellEditorModal` both substantially rewritten: `todayIso`/`problemNotice` props, past-notice, future/today change-confirm (`pendingChangeConfirm`), Reassign-employee toggle, "Remove shift" (renamed from Unassign, no longer draft-only).
- `app/(protected)/manager/settings-section.tsx` — new "Automatic schedule" subsection (visual-only day/period inputs, Run now/Publish schedule real buttons, Last-result stat row); also now resolves shift-type labels through `shiftTypeDisplayLabel` instead of an ad-hoc `labelJa || labelEn || code` chain.
- `app/(protected)/manager/page.tsx` — merged 2 sequential round trips (`listTenantModules`+`listTenantLocations`, and a post-batch `listContentTranslationsForField`) into the existing parallel `Promise.all` batch. **`loading.tsx` in this directory already existed before this mission (PR #282) — do not "fix" it again; an earlier attempt in this session mistakenly reinvented it and was reverted.**
- `app/(protected)/_ui/workforce-theme.ts` (+`.test.ts`) — `CHIP_TONES` 3→10, `shiftChipColors` rewritten (stable per-id hash + deterministic collision pass for the active set, not position-in-array). A small ad hoc Node script (not checked in) generated the actual hex values by maximizing minimum RGB distance against a hue/lightness search space excluding the `warning`/`danger` neighborhood — if the palette ever needs another tone, redo that search rather than picking a color by eye (the first attempt, picked by eye, still collided pairwise).
- `lib/workforce/shift-types.ts` (+`.test.ts`) — `shiftTypeDisplayLabel`'s fallback chain changed from `labelJa || labelEn || code` to `labelJa || labelEn || \`${startsAtLocal}-${endsAtLocal}\``. This is the actual root-cause fix for the `CUSTOM_*` leak the Founder saw live (it was blank-`labelJa` seed/fixture data, not a live create-flow bug).
- `lib/workforce/manager-attention.ts` (+`.test.ts`) — `computeUnderstaffedDateKeys` (boolean) replaced by `computeDailyStaffingCoverage` (`{workDate, required, scheduled, missing}[]`).
- `lib/workforce/schedule-actions.ts`, `lib/workforce/shift-assignments.ts` (+`.test.ts`) — canonical Manager's `createShiftAssignment`/`updateShiftAssignment` actions now hardcode `published: true`; `CreateShiftAssignmentInput` gained an optional `published?: boolean` (defaults `false`, so the `_client-preview` demo package's own separate write actions are untouched).
- `app/(protected)/staff/shift-preference-form.tsx` — one more direct `.code` render found and fixed (Staff's own shift-preference dropdown).
- `app/(protected)/manager/manager-dashboard-i18n.ts` (+`.test.ts`) — every new string, JA+EN, including a new parameterized `dailyStaffingShortageExplanation`. **All new JA copy is machine-translated**, same standing disclaimer as the rest of this file — not yet native-reviewed.
- `lib/ui/theme.module.css` — new `.scheduleCellButton` hover/focus rules (the shared `.buttonSecondary:hover` rule sets `background`, which an inline `background` style always beats regardless of pseudo-class — needed a `filter`-based hover instead).

## 5. Verification evidence

- `npm test` (apps/web): **1203/1203 passing** at final merge (both rounds), including new tests for: the `CUSTOM_*` regression guard, whole-cell click-to-edit, published/past/future change-detection and confirm/cancel behavior, the 10-tone palette's minimum-pairwise-RGB-distance + minimum-distance-from-`warning`/`danger` fixture checks, `computeDailyStaffingCoverage`, and several source-text guards (no Draft/Published dot, legend-after-grid, no Publish/Auto-create button in the Weekly Schedule card's own JSX).
- `tsc --noEmit`, `eslint .`, `next build` — clean on every PR before merge.
- **Live QA actually performed in a real browser** via chrome-devtools MCP against `https://preview.oruwa.jp/manager` (authenticated session, real `oruwa-cafe` reference-tenant data) after Round 2's merge — not just automated checks:
  - Desktop 1440px: no horizontal scroll, uniform cell contract, legend below grid, compact `‹ This week ›`, "Automatic schedule" subsection matches the designed mock exactly (disabled day/period inputs, "Not active yet", real Run now/Publish schedule buttons).
  - Mobile 390px: card-stack layout, no page-level horizontal overflow, `+`/`—` empty-cell distinction visible.
  - Opened the editor for a **past** empty cell → "Correcting past schedule — this date has already passed." notice confirmed.
  - Opened the editor for an **existing past** assignment → same past notice, plus "Reassign employee" (not a dropdown) and "Remove shift" both present.
  - Opened the editor for an **existing future** assignment, changed the shift type, clicked Save → "Change scheduled shift?" confirm fired with a real `09:00-13:00 → 09:00-13:00`-style before/after line; clicked its own Cancel → confirmed via a fresh a11y snapshot that the cell's value did **not** change (no accidental write).
  - Accessibility-tree snapshot confirmed the day-header shortage aria-label reads e.g. `"Staffing shortage — required 1, scheduled 0, missing 1"`, and a flagged cell's aria-label includes the actual reason (`"...Assigned while marked unavailable"` / `"...pending correction request..."`).
  - EN/JA toggle: full UI (including the new "Automatic schedule" copy and the parameterized shortage string) confirmed correctly localized in both languages via live snapshot, not just the i18n dictionary test.
  - No mutating action was actually submitted against live data (all confirm dialogs were clicked through to Cancel) — Run now, Publish schedule, and Reassign employee's own selector were not live-clicked, to avoid touching real reference-tenant data; those paths are covered by tests but not by a live click this session.
- Standing merge authority was used for both PRs — Founder did not review either PR's own ephemeral Vercel preview; the live QA above was performed by Claude directly against `preview.oruwa.jp` post-merge, consistent with `feedback_merge_authority` memory's per-PR delegation.

## 6. Known limitations / deferred items (stated explicitly to the Founder in the Round 2 mission report)

- **`SCHEDULE_CHANGE_HISTORY_GAP`**: no audit/event-history mechanism exists for `workforce.shift_assignments` mutations beyond the row's own `updated_at` — reassigning 佐藤→田中 on the same cell loses the fact that 佐藤 was there first. Identified, not built (explicitly out of scope for this visual mission per its own brief).
- **`EMPLOYEE_SCHEDULE_CHANGE_NOTIFICATION = NOT_IMPLEMENTED`**: `queueLineNotification` remains an intentionally inert stub (WP C2, no real LINE credentials yet). The new "this shift is already visible to the employee" confirm text never claims a notification was sent.
- **Scheduled automation is visual-only.** The "Automatic schedule" subsection's day-of-month/target-period inputs are `disabled`, status always reads "Not active yet" — there is no backend job. A `SCHEDULED_AUTOMATION_IMPLEMENTATION_PLAN` sketch (cron on day-of-month JST → target period → auto-distribute only into empty slots, manual assignments always win → auto-publish → idempotency key per (tenant, period) → retry/failure state → audit → notification once a real channel exists → concurrency lock against manual Run now) was handed to the Founder in the Round 2 mission report but is **not** durable-documented anywhere in this repo yet — if a future session picks this up, get that plan restated by the Founder or reconstructed from this session's transcript, don't assume it's written down elsewhere.
- **Week-navigation performance**: two unnecessary sequential round trips were removed from `page.tsx`. The deeper fix — not re-fetching entirely week-*independent* data (recipes, inventory, invitations, staff) on a plain week change — would require adopting the same client-side windowed-fetch architecture `_client-preview`'s `PreviewManagerViewChrome`/`WeekRefreshController` already proves in production. Not built this mission; flagged as the real next lever if Prev/Next still feels slow. No before/after latency number was measured (no profiler run) — the fix is correctness- and architecture-verified, not stopwatch-verified.
- **JA copy needs native review** — same standing disclaimer as every other file in `manager-dashboard-i18n.ts`; all new Round 1+2 strings are machine-translated.
- **Shift-color palette generation script is not checked in** — see §4's `workforce-theme.ts` note; redo the search rather than hand-picking a new color if the palette ever needs to grow past 10.

## 7. What is explicitly NOT authorized to start next

Per the Round 2 mission brief's own scope: no real scheduled-automation
backend, no new notification subsystem, no event-sourcing/audit-log system,
no week-nav architecture rewrite, no production release. A fresh session
should ask the Founder what's next rather than assume continuation of any of
the above — the Automatic-schedule UI's entire point was to make the *next*
mission's shape visible without pre-building it.

## 8. Pointer

`docs/ai/current-task.md` §5 has a new pointer entry (2026-08-22, dated
after this file) pointing here — read that section's top entry first if
anything Weekly-Schedule/Shift-Editor/Manager-Attention/color-palette
related comes up in a fresh session.
