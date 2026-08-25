# Cafe Staff Shift Schedule v2 — Handoff (2026-08-25)

Read this first if anything about the real (protected) Staff page's Shift
Schedule module, its week-navigation, Planned-vs-Actual attendance display,
correction/exchange request flow, or the shared `ShiftTable`/`ShiftLegend`
components comes up.

## 1. What this mission was

Founder-directed rebuild of `apps/web/src/app/(protected)/staff/`'s "Shift
schedule" module, scoped by a detailed ТЗ (kept in this session's chat
history, not duplicated here) whose product model is:

```
PLANNED SHIFT -> Work Status -> ACTUAL ATTENDANCE -> worked hours / earnings
Actual wrong?  -> CORRECTION REQUEST -> Manager approve/reject -> authoritative actual updated
Future shift problem? -> SHIFT REQUEST (change/cancel/exchange) -> Manager approve/reject
```

Explicit non-goal: no new backend/workflow architecture. The mission's own
gap-report step found that almost everything needed (correction workflow,
shift-exchange workflow with `change`/`cancel`/`exchange` kinds, RLS,
attendance-vs-schedule separation) already existed and was already tested —
the actual gap was that the real Staff page never wired most of it in (only
the legacy `_client-preview`/`mame-to-cha` demo surface did).

**Founder-approved scope boundary**: no DB migration, no RLS change, no
schema change. Everything delivered fits inside that boundary. One item
(Manager-decision unread/seen badge in the header) was explicitly deferred
by the Founder specifically because it would need new persisted read-state
with no existing column to reuse — noted as a future platform-wide
notification-capability gap, not solved here.

## 2. What shipped (both merged to `dev`)

- **PR #438** — the main rebuild: compact Mon–Sun weekly grid at
  375px/390px/desktop (no page-level horizontal scroll), the caller's own
  real name shown even in their own row (never "Me"), the "All"/"Only me"
  toggle removed, the shift-cell modal split into a **future-shift "Shift
  Request"** flow (exchange/change/cancel — `change` newly exposed in the UI,
  reusing an already-backend-ready request kind) versus a **past/today
  "Shift Details"** view that keeps Planned (from the schedule) and Actual
  (from attendance) strictly separate with independent "—" fallbacks (never
  substituting one for the other), read-only Transport when reliably tied to
  that exact date, the existing-but-previously-unwired `CorrectionRequestForm`
  wired in with Pending/Approved/Rejected status display, a
  Worked-this-month/Hourly/Estimated-earnings line via the existing
  `estimatedEarningsSummary`, a fix for a literal untranslated `'Custom'`
  label leak on unresolved shift types, and keyboard operability (a real
  nested `<button>`, not `role="button"` on `<td>`, scoped to Staff mode only
  so Manager's own grid — every cell clickable there — doesn't gain hundreds
  of new tab stops).
- **PR #439** — Founder Preview QA round 4 follow-up: stretched the
  ‹/This week/› week-nav buttons to the card's full width (`flex: 1` per
  button, matching `EntryPointsCard`'s established pattern), since the
  compact icon-button version from round 2/3 read as small/secondary next
  to the full-width Recipes/Inventory/Purchases row above it.

Both PRs: typecheck/lint/test(1245)/build all green, merged via
`scripts/ai-dev-merge.sh` (mechanical guardrail, base=dev only). An
independent fresh-context review ran on PR #438 before merge (4 parallel
finder angles) and found real issues that were fixed before merge: the
`role="button"`-on-`<td>` accessibility regression (fixed to a real nested
button, later further scoped to Staff-only per a 4th finder's follow-up
finding that it would have added ~210 new tab stops to Manager's grid), a
locale-ambient `toLocaleString()` pinned to `'ja-JP'`, and a duplicated
future-shift boolean condition consolidated.

### Founder live-QA rounds (all via screenshots on the Vercel Preview + `preview.oruwa.jp/staff`, no browser-automation tool was available this session)

1. Round 1: mobile cells showed full time-range text instead of short
   labels; week-nav buttons wrong style; heading wrapped to 2 lines; week
   switching was a full page reload (slow + visible jump, same class of bug
   Manager's dashboard had already fixed in its own "Round 3", 2026-08-22 —
   ported the identical `activeWeekOffset` client-state +
   `window.history.replaceState` pattern from `manager-dashboard-client.tsx`);
   "Related work report" picker in the correction form was confusing with
   only one real option. All fixed same session.
2. Round 2: week-nav buttons too small (touch target); today's own cell
   showed a "!" attention indicator with no way to tap it (today's
   `isCellClickable` branch only checked a legacy `workReports` map Staff
   never populates, not the real `attentionCellKeys`); swipe gesture added
   for week navigation (Founder-clarified via AskUserQuestion: swipe
   left/right on the grid changes week, not table-internal scroll); a
   custom/unresolved shift's time-range fallback still overflowed even
   shortened.
3. Round 3: custom-shift cells still showed time text (visual noise) —
   changed to a short letter badge ("Cus"/"カス") instead, with the real
   time available via `title`/hover and the tap-through detail view; added a
   one-line legend caption explaining what "!" means (only shown when at
   least one cell actually carries it this week), since the existing
   `title` tooltip never surfaces on a touch device.
4. Round 4 (PR #439): week-nav buttons still read as small/secondary
   compared to the full-width entry-points row above — stretched full width.

### Explicitly deferred / known gaps (not bugs, not silently dropped)

- **Header Updates/unread badge for Manager decisions** — Founder-deferred,
  needs new persisted read-state (`seen_at`/`acknowledged_at` or
  equivalent) with no existing column to reuse; flagged as a future
  platform-wide notification-capability item, not a Staff-Schedule-specific
  one. Do not build a module-local notification mechanism for this later
  without re-checking `apps/web/src/lib/notifications/queue-line-notification.ts`
  first — it's an intentional no-op stub already earmarked for a
  platform-wide replacement, and its own doc comment warns against a second
  module-specific implementation.
- **Transport is not part of the Correction Request workflow** —
  Founder-explicit: correction stays limited to clock-in/clock-out/break;
  Transport display in Shift Details is read-only from `attendance`, its
  edit path remains the existing autosave-on-today form only.
  `decideCorrectionRequest`/`applyApprovedCorrection` were not touched.
- **`change`-kind Shift Exchange request** has a UI entry point now but
  wasn't independently live-QA'd beyond the Founder's general pass (the
  Founder's rounds focused mostly on the weekly grid and Shift Details;
  Shift Request/Exchange/Cancel flows should get a specific look in the
  Manager+Staff combined pass described in §3).
- **No browser-automation tool was available in this session** — every fix
  in this handoff was driven by the Founder's own screenshots + description,
  not independent Claude verification. If a future session has real browser
  tooling, a first re-verification pass over this module (not just trusting
  this handoff) would be worthwhile.

## 3. What's next (Founder-stated, 2026-08-25, this session)

The Founder is doing further live click-through QA of the real Staff page
himself right now (using the same screenshot-and-report loop) — **do not
assume that thread is closed; ask what was found before continuing it.**

Beyond that, the Founder's explicitly stated next step (2026-08-25,
superseding the older "Manager first, then Staff" ordering from this file's
2026-08-23 entries — Staff came first this time):

> После Staff делаем короткий финальный проход Manager + Staff вместе:
> переходы между модулями, реальные сценарии рабочего дня, mobile,
> ошибки/loading, JA-интерфейс, отсутствие очевидных UX-разрывов. Не
> добавляем бесконечно новые функции — задача получить законченную версию
> Cafe.

I.e.: a **short, bounded** combined Manager+Staff pass — cross-module
navigation, real workday scenarios, mobile, error/loading states, JA
copy, no obvious UX gaps — with the explicit goal of a *finished* Cafe,
not open-ended feature accumulation. This maps onto the already-existing
Cafe Commercial Launch Readiness sequencing (`current-task.md` §2.4 step 1's
"Cafe Hardening" category) but the Founder is directing it as its own short
pass now, not deferring it further.

**Constraint surfaced this session, worth restating to whoever picks this
up:** this "short final pass" fundamentally needs live interactive browser
QA (real clicks, real navigation, real mobile viewport, real error states)
to actually verify — a static code-only audit cannot substitute for it and
was explicitly discussed with the Founder as a lesser, complementary option,
not a replacement. Whether the next session has real browser-automation
tooling changes what's actually deliverable here; if not, the effective
workflow is the same screenshot-driven loop this whole mission used.

## 4. Verification commands (apps/web)

```
npx tsc --noEmit
npx eslint .
npm test          # 1245 passing as of this handoff
npm run build
bash scripts/ai-dev-merge.sh <PR_NUMBER>   # dev-only merge guardrail
```
