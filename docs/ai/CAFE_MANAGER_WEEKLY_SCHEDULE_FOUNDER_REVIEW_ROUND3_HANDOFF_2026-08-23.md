# Weekly Schedule Founder Review — Round 3 session handoff (2026-08-23)

**Read this first in a fresh session.** This thread is complete and merged.
Nothing here is pre-authorized to continue without fresh Founder direction —
if the Founder opens a new chat and says "what's next," the honest answer is
"ask them," not "resume this."

## 1. What this session was

Founder-directed continuation of the Weekly Schedule Founder Review (Rounds
1-2 closed 2026-08-22, see
`docs/ai/CAFE_MANAGER_WEEKLY_SCHEDULE_FOUNDER_REVIEW_HANDOFF_2026-08-22.md`).
The Founder live-tested `preview.oruwa.jp/manager` again and drove a fast
iteration loop across 8 small PRs (#368-#375), all merged to `dev` same
session. Unlike Rounds 1-2, **no live browser QA was performed by Claude**
this round — the local chrome-devtools MCP profile was locked by a Chrome
window the Founder already had open, so every PR's "before merge" QA step
was skipped in favor of the Founder checking `preview.oruwa.jp` themselves
and reporting back with fresh screenshots + follow-up fixes each time. This
is a deliberate deviation from the Round 1-2 verification bar — flagged
explicitly, not silently dropped.

## 2. Repo / branch state (VERIFIED at handoff time)

- Repo: `D:\Dev\line-business-os`. Base branch: `dev`. Current `dev` HEAD:
  `9e2e936`.
- All 8 PRs below are **merged into `dev`**, squash-merged via the GitHub
  API (`gh api .../merge`) rather than `gh pr merge`, because `dev` was
  checked out in another local worktree (`D:\Dev\line-business-os-founder-audit`
  per Round 1-2's handoff) for the whole session — `gh pr merge`'s local
  branch-switch step fails in that setup, the API merge doesn't need to.
- `work/dev-mirror` was used as the disposable local branch for this
  session, recreated fresh (`git checkout -b <branch> origin/dev`) before
  every PR to avoid the mistake described in §6.
- Migration `0080_workforce_schedule_settings_auto_create_day.sql` is
  **applied to Supabase Cloud dev** (`line-business-os-dev`,
  `pehcoenozjtsjdvjietj`) — confirmed via `supabase migration list`
  (Local/Remote both show `0080`) after explicit Founder approval for the
  `db push`. Nothing else in this session touched Supabase Cloud.

## 3. The eight PRs, in order

| PR | Title | Merge commit | What it did |
|----|-------|-------------|-------------|
| #368 | Grid sizing/gap, today highlight, day-header format, shift-type auto-fill, custom-shift color+legend, button redesign | `3df5d79` | Fixed cell width/height via `table-layout: fixed` + `<colgroup>`; today's date column highlighted; day-header trimmed to day-of-month only; shift-type `<select>` now auto-fills Start/End time on change (previously two uncontrolled fields); custom (no-`shiftTypeId`) shifts get a dedicated orange `CUSTOM_CHIP_TONE` + a per-time-range legend entry; Settings' shift-type Edit/Deactivate/Reactivate buttons switched from an ad hoc `smallButton` to the shared `buttonSecondary`/`buttonDanger` tokens. |
| #369 | Automatic-schedule cleanup | `319bbf5` | Removed the real, working Run now/Publish schedule buttons (Founder direction: feature is mid-development, no half-working action exposed), the placeholder intro paragraph, "Create for" dropdown, "preserved" note, and status line. Added a `(?)` info popover. Underlying `runAutoDistribution`/`publishSchedule` server actions untouched. |
| #370 | Week-navigation performance | `b719fde` | Prev/This-week/Next changed from `<Link href="?weekOffset=...">` (full server re-fetch of ~16 data sources) to a pure client-side filter over a preloaded ±8-week assignment window, reusing the page's existing `exchangeAssignments` fetch (no new query). Ports the pattern already proven on `_client-preview/mame-to-cha`'s `PreviewManagerViewChrome`. |
| #371 | Grid lines, labour-cost box, in-cell correction Approve/Reject, editable auto-create day | `6547e4c` | Full 1px cell borders + tighter `borderSpacing` (grid-line look); "Estimated labour cost" box (reused `estimatedEarningsSummary`, same calc as the reference table); Shift Cell Editor now renders a dedicated "Requested change" + Approve/Reject block for a pending correction on that exact cell (reuses `decideCorrectionRequest`), resolving in place with a greyed-out status after; Modal now remounts per cell (`key` prop) so this and Remove-shift state never leak between cells; Settings' "Create automatically on [day]" input became real/autosaved (**migration `0080`**, new `auto_create_day_of_month` column). |
| #372 | Grid polish | `1e501db` | Border radius restricted to the 4 true outer corners (not every today-cell individually); staff-name cell became a full-cell click target, centered text, no underline, sliding-fill hover; empty schedule cells get a visible hover tint (inset box-shadow, composes with the inline `background: transparent`); labour-cost box dropped its caption line, one line. |
| #373 | Day-header polish | `8acae2a` | Header cells got a background (`colors.surfaceElevated`) and `verticalAlign: middle`; inner row's shortage marker pushed to the cell's right edge via `justify-content: space-between`. |
| #374 | Header/name-cell polish | `6f564f9` | Labour-cost box centered; "Staff" header text centered; date-header text recentered independent of marker presence (marker moved to an absolute-positioned top-right overlay); staff-name cell became a **permanent** solid-green button (Founder reference: sliderrevolution.com's "Learn More" buttons) with a sliding arrow-reveal tab on hover, adapted from that site's "Effect #2". |
| #375 | Thumbs-up icon, restore space-between | `9e2e936` | Staff-name cell's hover-reveal icon changed from an arrow to a thumbs-up emoji (matches the reference site's own icon) since this app has no icon font loaded. Day-header inner row's `justify-content` set back to `space-between` per explicit Founder instruction (the now-absolute marker doesn't interact with it either way — single remaining flex child, so `space-between` visually packs the date text to the left). |

## 4. Key files changed across this session

Frontend (all under `apps/web/src/`):

- `app/(protected)/manager/manager-dashboard-client.tsx` — the bulk of the
  work: schedule-grid cell/header styling (`scheduleTableHeaderCellStyle`,
  `scheduleTableCellStyle`, `scheduleTodayTint`, corner-radius logic),
  `MIN_WEEK_OFFSET`/`MAX_WEEK_OFFSET` + `activeWeekOffset` state +
  `navigateToWeek`/`weekHref` (Round 3's perf fix), `scheduleWindowAssignments`
  state + sync `useEffect`, `localAssignments` now derived from the wide
  window filtered to `dates`, `estimatedLabourCost` calc + its box JSX,
  `handleViewShift` now calls `navigateToWeek` instead of `router.push`,
  `pendingCorrectionByCellKey` map, the dead `handleAutoDistribute`/
  `handleUndoAutoDistribute`/`handlePublish`/`lastAutoCreateResult`/
  `undoingAutoDistribute` removed entirely, `<ShiftCellEditorModal>` now
  keyed per cell.
- `app/(protected)/manager/shift-cell-editor.tsx` — controlled
  `shiftTypeId`/`startsAtLocal`/`endsAtLocal` state + `handleShiftTypeChange`
  (auto-fill bug fix); new `correctionRequest`/`onCorrectionDecided` props
  and the in-Modal Approve/Reject block.
- `app/(protected)/manager/settings-section.tsx` — Automatic-schedule
  subsection rewritten (removed buttons, added help popover); shift-type
  list buttons switched to shared tokens; `autoCreateDayOfMonth` wired into
  the existing debounced autosave alongside `requirements`/`maxHours`.
- `app/(protected)/_ui/workforce-theme.ts` — `CUSTOM_CHIP_TONE` added,
  `shiftChipColors` now returns it for a null `shiftTypeId` instead of the
  neutral `UNSET_CHIP_TONE`.
- `app/(protected)/manager/manager-dashboard-i18n.ts` (+`.test.ts`) — net
  removal of dead Run-now/Publish/auto-distribution keys and the
  `autoDistributionCreatedMessage`/`publishedCountMessage` functions;
  additions: `automationHelpAriaLabel/Title/Body`, `estimatedLabourCostLabel`
  (its `estimatedLabourCostCaption` sibling was added then removed same
  session per Founder direction — box is one line only).
- `lib/ui/theme.module.css` — `.scheduleCellButton:hover` gained an inset
  box-shadow tint; new `.staffNameCell` rule set (permanent green
  background, `::after` thumbs-up reveal tab).
- `lib/workforce/schedule-settings.ts` (+`schedule-settings-actions.ts`) —
  `WorkforceScheduleSettings.autoCreateDayOfMonth` (required on read);
  `UpsertWorkforceScheduleSettingsInput` (field optional on write, so the
  untouched `_client-preview/mame-to-cha` settings action — which has no
  concept of scheduled automation — didn't need updating).

Database:

- `supabase/migrations/0080_workforce_schedule_settings_auto_create_day.sql`
  — new `workforce.schedule_settings.auto_create_day_of_month` column
  (`not null default 20`, `check between 1 and 28`) + rebuilt
  `api.workforce_schedule_settings` view. Applied to Cloud dev.

## 5. Verification evidence

- `npm test` (apps/web): **1202/1202 passing** at final merge (down from
  1203 at the start of this session — one test removed along with the
  `autoDistributionCreatedMessage`/`publishedCountMessage` functions it
  covered, which no longer exist).
- `tsc --noEmit`, `eslint .`, `next build` — clean before every one of the 8
  PRs.
- **No live browser QA was performed by Claude this session** (see §1) —
  every PR's "Live Preview QA" checkbox in its own PR description was left
  unchecked at merge time. Verification instead came from the Founder's own
  live testing on `preview.oruwa.jp/manager` between each PR, via
  screenshots + follow-up correction requests in the same session. This is
  a real gap relative to the Round 1-2 bar, not an oversight to gloss over.
- One mid-session mistake, self-corrected: after PR #368 merged, an attempt
  to start PR #369 by running `git checkout <target-branch>` while Phase B's
  edits were still uncommitted on the previous branch silently discarded
  those edits (git's branch-switch safety check doesn't trigger when the
  target branch's committed content happens to match the current branch's
  last commit — only the dirty working-tree diff is lost). Caught after
  typecheck immediately failed with the old pre-edit code; all Phase B work
  was redone from scratch on a correctly-created branch. Every subsequent
  branch this session was created via `git checkout -b <new> origin/dev`
  from a clean tree, or via `git checkout -b <new>` (no target ref) to carry
  uncommitted changes forward safely — never a plain `git checkout
  <existing-branch>` while dirty.

## 6. Known limitations / deferred items

- **`SCHEDULE_CHANGE_HISTORY_GAP`** (unchanged from Round 1-2): still no
  audit/event-history mechanism for `workforce.shift_assignments`
  mutations. **Explicitly queued as the next Weekly Schedule work item**
  per Founder decision this session (see
  `[[project_schedule_history_deferred]]` memory / the auto-memory system,
  not this repo) — a future session should bring this up, not silently
  start it.
- **Scheduled automation is still not built.** The "Create automatically on
  [day]" value is now real/persisted (this session's actual feature work),
  but there is no cron/job that reads it — the `(?)` popover added in #369
  says so explicitly. The `SCHEDULED_AUTOMATION_IMPLEMENTATION_PLAN` sketch
  mentioned in the Round 1-2 handoff is still not durable-documented
  anywhere in this repo.
- **`EMPLOYEE_SCHEDULE_CHANGE_NOTIFICATION = NOT_IMPLEMENTED`** (unchanged).
- **JA copy needs native review** (unchanged, same standing disclaimer as
  every other string in `manager-dashboard-i18n.ts`) — this session added
  several new JA strings (automation help body, estimated-labour-cost
  label), all machine-translated.
- **The `.staffNameCell` permanent-green + thumbs-up-reveal design was
  driven directly by Founder-supplied reference screenshots
  (sliderrevolution.com's button-hover-effects page), not an independent
  design decision** — if it needs revisiting, that's the reference to
  re-check against, not this repo's own design-kit precedent (no other
  button in this app uses an emoji reveal or a permanent-color table-cell
  button).
- **Week-navigation performance was fixed via reuse, not measured.** No
  before/after latency number was captured (same caveat as Round 1-2's
  attempt at this) — the fix is architecture-verified (client-side filter,
  zero network calls on plain navigation) via code review, not a profiler
  run.

## 7. What is explicitly NOT authorized to start next

Per this session's own scope: no schedule-change history/audit system (see
§6 — queued, not started), no real scheduled-automation backend, no new
notification subsystem, no production release. A fresh session should ask
the Founder what's next rather than assume continuation of any of the
above.

## 8. Pointer

`docs/ai/current-task.md` §5 has a new pointer entry (2026-08-23, dated
after the Round 1-2 entry) pointing here — read that section's top entry
first if anything Weekly-Schedule/Shift-Editor/Manager-dashboard-styling
related comes up in a fresh session.
