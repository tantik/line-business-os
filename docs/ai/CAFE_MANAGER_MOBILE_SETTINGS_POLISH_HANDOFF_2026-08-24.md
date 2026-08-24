# Cafe Manager Mobile/Settings Polish — Handoff (2026-08-24)

Founder-directed live iteration session on `https://preview.oruwa.jp/manager`,
following up on the earlier 2026-08-23 Manager Final Completion Phase B
closure (`docs/ai/CAFE_MANAGER_FINAL_COMPLETION_PHASE_B_HANDOFF_2026-08-23.md`).
**Closed by the Founder 2026-08-24** ("пока с менеджером закончили" — done
with Manager for now); next is a Staff-page review session. This is a
snapshot of exactly what changed and why, not a new open mission.

## What changed (6 PRs, all merged to `dev`)

1. **PR #404** — Settings/Shift-preferences visual parity + mobile pass:
   - Shift-requests review popup table now matches the Weekly Schedule
     grid's look (rounded outer corners, green staff-name pill for every
     row), wider week prev/next buttons, tooltips explaining "+"/"—" cells.
   - Settings > Deactivated shift types: capped to a scrollable list (was
     unbounded), added a Delete action (confirm dialog).
   - Removed the "Platform dashboard" link from the bottom of the Manager
     page (Founder: no value).
   - Mobile header collapsed to one row (avatar/title/lang toggle/sign out),
     tenant subtitle below, instead of stacking into three rows.
   - Weekly Schedule grid stays a real (horizontally-scrollable) table at
     every width instead of switching to a per-day card layout below 768px.
   - New migration `0083_workforce_shift_types_delete_grant.sql` (base-table
     DELETE grant only — turned out incomplete, see PR #405).

2. **PR #405** — migration `0084_workforce_shift_types_api_view_delete_grant.sql`:
   0083 granted DELETE on `workforce.shift_types` but missed the matching
   grant on the `api.workforce_shift_types` view PostgREST actually queries
   through (this project grants base table and view separately, per 0031's
   precedent) — a live Delete click returned `{"status":"unauthorized"}`
   after 0083 alone. Both 0083 and 0084 applied to Supabase Cloud dev
   (`pehcoenozjtsjdvjietj`) with Founder approval; the full delete flow
   (success path + FK-history-blocked path) is live-verified working.

3. **PR #406** — first mobile-polish pass (deactivated-type row single-line
   ellipsis, Weekly Schedule table bleed below 767px, Settings footer
   divider swap) — the ellipsis part had a real bug, fixed by #408 below.

4. **PR #407** — governance docs only: made the `dev`/`main` branch-authority
   split (Founder restated it unprompted 2026-08-24) explicit in `AGENTS.md`
   and `.cursor/rules/03-git-workflow.mdc`, pointing at the already-canonical
   `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §9 "DEV MERGE" tier and
   `scripts/ai-dev-merge.sh`. No behavior change, just visibility — this was
   already the live policy since 2026-08-23.

5. **PR #408** — fixed #406's overflow bug: the deactivated-type row lived in
   a `display: grid` container with no `grid-template-columns`, so the
   implicit column sized to the row's max-content width regardless of
   `text-overflow: ellipsis` on the text span — a long name pushed the whole
   row (and the page) wider, producing a real horizontal scrollbar (caught
   from a Founder screenshot). Fixed with `grid-template-columns: 100%` +
   `min-width: 0` down the flex chain so the text span is what truncates,
   never the row. Live-verified with a synthetic long-name DOM test at both
   desktop and 375px — no page overflow in either case.

6. **PR #409** — centered the "+"/"—" empty-cell placeholders in the Shift
   preferences popup grid (`gridCellStyle` now has `text-align: center`) —
   they previously sat left-aligned while filled shift cells were already
   centered.

## Verification

Every PR: `tsc --noEmit` + `eslint` + full `npm test` (1218/1218) clean,
`npm run build` clean, CI green. All 6 merged to `dev` — #404/#405 by the
Founder directly (both touched `supabase/migrations/**`, a RED path per the
DEV MERGE gate, so Founder approval was required regardless of CI); #407/
#408/#409 merged autonomously by the Lead Agent via
`bash scripts/ai-dev-merge.sh` (no migrations touched, all mechanical gates
passed). Every change live-verified on `preview.oruwa.jp/manager` via
chrome-devtools MCP, both desktop (~1280px) and mobile (375px) — not just
code review. One transient `ChunkLoadError` was observed immediately after
the #409 deploy (stale chunk hash right after a new build replaced the old
one) and resolved with a hard reload — not a real regression, noted here
only so a future session doesn't mistake it for one if it recurs elsewhere.

## Known non-blockers / not done

- Deleted two disposable QA fixtures during live testing of the Delete
  button ("QA Test Shift", "早番" — both had zero schedule history, so the
  delete succeeded cleanly). Several other QA fixtures remain deactivated on
  the reference tenant (`QA-TEMP-6`, `QA-TEMP-7`, `QAX`, `6`, `6`, `7`) —
  untouched, not this session's scope to clean up.
- No further Manager-surface work is authorized by this closure. The
  Founder's own next step is a Staff-page review session — do not assume
  Manager work continues without a fresh Founder direction.

## Process note for future sessions

This session's own early mistake, corrected mid-session and now fixed at
the rule level (see PR #407): for a `dev`-targeting PR that doesn't touch a
RED path, use `bash scripts/ai-dev-merge.sh <PR_NUMBER>` directly — do not
call raw `gh pr merge` (denied by `.claude/settings.json`) and do not ask
the Founder to merge manually. Only stop and ask when the script itself
would block (RED path, CI not green, not mergeable) or the mission-risk
tier mandates Independent Reviewer first.
