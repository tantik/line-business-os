# Shift requests review popup (v2.1, UI only) — session handoff (2026-08-23)

**Read this first in a fresh session.** This work is **NOT merged** — PR #377
is open against `dev`, unverified in a live browser. Do not assume it's done;
check PR #377's status first. Nothing here is pre-authorized to continue
without fresh Founder direction.

## 1. What this session was

Founder asked how to compactly show, on the Manager dashboard, which staff
submitted a month's shift preferences and which didn't, with a way to review
a specific employee's submitted days and nudge non-submitters. The request
evolved through several rounds (plan-mode discussion, then a Founder-supplied
visual mockup, then a scope correction) into a single delivered slice:

1. Initial plan-mode design (grid popup, approve = real assignment write) —
   approved, then immediately superseded by a Founder-supplied mockup.
2. Mockup-driven redesign: entry point moved to **Settings** (not the Weekly
   Schedule header), popup paginates by **week within the current month**
   (not one giant month-wide grid), "Approve" reframed as a **priority flag**
   (`Manual assignment > Manager-approved preference > Employee preference >
   Algorithmic fallback`), with a persistent visual "approved" state and a
   "Remove approval" undo.
3. **Scope correction (the decision that actually shipped):** Founder gave
   the full v2.1 → v2.2 → platform-hardening → sales roadmap and stated this
   feature ships in **v2.1 as UI ONLY** — no backend writes, no
   `auto-distribute.ts` algorithm changes, no real notification delivery.
   Those are explicitly **v2.2** scope. "Approve"/"Remove approval" became
   **local component `useState`**, not persisted. This is documented in the
   `project_roadmap_v21_v22_provisioning_sales` and
   `project_shift_requests_review_popup_mission` auto-memory entries — read
   those for the full roadmap context, this file is repo-local detail only.

An early implementation attempt (adding a `locked` field to
`auto-distribute.ts` and starting on `shift_requests.status` writes) was
**reverted mid-session** once the scope correction landed — see git history
on this branch if curious, but the merged/pushed state never included it.

## 2. Repo / branch / PR state (VERIFIED at handoff time)

- Repo: `D:\Dev\line-business-os`. Base branch: `dev`.
- Feature branch: `feat/shift-requests-review-popup-v21-ui`, pushed to
  `origin`. **PR #377** open against `dev`:
  <https://github.com/tantik/line-business-os/pull/377>
- **Not merged.** PR description explicitly flags: no live browser QA this
  round (no manager login credentials available in the session — sign-in
  requires a real tenant login and `docs/QA_ACCESS.md` is not present in this
  local working copy).
- No Supabase migration, no schema change, no server action added. Everything
  is `apps/web` frontend-only.

## 3. Files changed

- `apps/web/src/lib/workforce/period.ts` (+`.test.ts`) — new
  `getMonthPeriod(nowIso, timeZone)` and `getWeeksInMonth(monthPrefix)` pure
  helpers, mirroring the existing `getWeekPeriod`/`mondayOf` style. 6 new
  test cases, all passing (including a leap-February case and a late-UTC
  month-boundary case).
- `apps/web/src/app/(protected)/manager/shift-requests-review-popup.tsx`
  (new) — the popup itself. Reuses `Modal`/`HelpIconButton` (design-kit),
  `shiftChipColors`/`shiftChipStyle`/`CUSTOM_CHIP_TONE`
  (`../_ui/workforce-theme`), `shiftTypeDisplayLabel`/`shiftTypesForWeekLegend`
  (`@/lib/workforce/shift-types`) — same chip/legend rendering as the main
  Weekly Schedule grid, not reinvented. Local state: `weekIndex` (clamped to
  `getWeeksInMonth` bounds — the pager cannot leave the current month),
  `approvedRequestIds: Set<string>` (the local-only "Approve" flag, keyed by
  `requestId`, resets on full page reload since it's plain `useState`, not
  persisted anywhere), `reminderStaffId`/`reminderCopied` (copy-to-clipboard
  reminder stub).
- `apps/web/src/app/(protected)/manager/settings-section.tsx` — new
  `shiftRequestsSummary`/`onOpenShiftRequests` props; a new subsection ("Shift
  requests" card, `{submitted}/{total} submitted, {missing} missing` +
  "View requests" button) rendered after the existing Automatic-schedule
  subsection.
- `apps/web/src/app/(protected)/manager/manager-dashboard-client.tsx` —
  `shiftRequestsPopupOpen` state, `shiftRequestsMonthPrefix`/
  `shiftRequestsMonthLabel`/`shiftRequestsSummary` memos (derived from the
  already-loaded `requests`/`staff` props — no new fetch), wiring into
  `<SettingsSection>` and a new `<ShiftRequestsReviewPopup>` render.
- `apps/web/src/app/(protected)/manager/manager-dashboard-i18n.ts` — ~19 new
  fixed keys + 4 new parameterized consts (`shiftRequestsHeadingValue`,
  `shiftRequestsSummaryLabel`, `weekRangeLabel`, `reminderMessageTemplate`),
  EN + JA (JA is machine-translated, same standing disclaimer as every other
  string in this file — needs native review eventually, not blocking).

## 4. Verification evidence

- `tsc --noEmit` (apps/web): clean.
- `eslint` on all changed files: clean.
- Unit tests green: `period.test.ts` (17→23 cases, all pass),
  `manager-dashboard-i18n.test.ts` (validates every key has non-empty,
  language-differentiated EN/JA copy — the new keys pass automatically),
  `manager-dashboard-client.test.ts` (unaffected existing cases still pass).
- **No live browser QA performed.** Dev server was started and a
  chrome-devtools MCP page reached `localhost:3000`, but the Manager
  dashboard requires a real authenticated tenant login this session had no
  credentials for (`docs/QA_ACCESS.md` referenced in
  `ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md` §"manager@mame-to-cha.test"
  is not present in this local checkout). This is the single open item before
  merge.

## 5. Known limitations / deferred items (all explicitly v2.2, not gaps)

- **No persistence.** "Approve"/"Remove approval" is decorative — it does not
  write `workforce.shift_requests.status`, and a page refresh silently
  forgets it. This is intentional for v2.1, not a bug — see §1.
- **No auto-distribute priority logic.** `auto-distribute.ts` is completely
  unchanged; the "Manual > Approved preference > Preference > Fallback"
  priority text shown in the Approve popup is copy only, describing a v2.2
  future state, not current behavior.
- **No real reminder delivery.** The "Send reminder" flow is copy-to-clipboard
  only (`navigator.clipboard.writeText`, best-effort, silently no-ops if
  unavailable). No email, no LINE push — `queue-line-notification.ts` is
  untouched and still the inert v0 stub it already was.
- **No month navigation.** The popup only ever shows the current calendar
  month (Founder-explicit: "тут истории нет"). `getMonthPeriod`/
  `getWeeksInMonth` don't take a month offset — add one only if the Founder
  actually asks for it later, don't pre-build it.
- **JA copy is machine-translated**, same standing disclaimer as the rest of
  `manager-dashboard-i18n.ts`.
- **Small unresolved detail from the Founder's mockup:** an orange numbered
  badge on one grid cell in the reference image was never explained and was
  deliberately excluded from this build. Only revisit if the Founder flags it
  as missing.

## 6. What is explicitly NOT authorized to start next

Per the Founder's own roadmap (`project_roadmap_v21_v22_provisioning_sales`
memory): no `shift_requests.status` persistence, no `auto-distribute.ts`
priority implementation, no real LINE/email notification service, no tenant
provisioning/platform-hardening work — all of that is **v2.2 and later**,
gated on v2.1 actually closing first. A fresh session should ask the Founder
what's next rather than assume continuation of any of the above, and should
specifically **not** interpret "finish the Shift requests feature" as license
to jump to the v2.2 backend without the Founder saying so explicitly.

## 7. Immediate next step for a fresh session

1. Check PR #377's current status (open/merged/closed) before doing anything.
2. If still open: the one blocking item is live browser QA — either the
   Founder does it on a preview deploy / local run, or a future session gets
   real manager credentials and does it via chrome-devtools MCP.
3. Do not start v2.2 backend work on this feature without explicit Founder
   direction, even if asked to "continue" — confirm scope first per §6.
