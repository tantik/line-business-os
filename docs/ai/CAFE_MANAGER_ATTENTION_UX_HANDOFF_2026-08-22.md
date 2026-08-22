# Manager Attention UX — session handoff (2026-08-22)

**Read this first in a fresh session.** This mission is complete and merged.
Nothing here is pre-authorized to continue without a fresh Founder direction
-- if the Founder opens a new chat and says "what's next", the honest answer
is "ask them," not "resume this."

## 1. What this mission was

Founder-directed, iterative UX correction of the Manager Dashboard's "Needs
attention" block plus closely-adjacent polish the Founder requested in the
same thread (Staff/LINE linking, recipe popup latency, mobile page padding).
Ran as four sequential PRs in one long session, each with its own
audit/implementation/test/live-QA/merge cycle, Founder reviewing via
screenshots between rounds rather than a single upfront spec.

## 2. Repo / branch state (VERIFIED at handoff time)

- Repo: `D:\Dev\line-business-os`. Base branch: `dev`.
- All four PRs below are **merged into `dev`**. No open PR, no open branch
  from this session (each feature branch was deleted after merge).
- Local working tree was on ephemeral feature branches throughout; a fresh
  session should `git checkout dev && git pull` before starting anything new.
- One DB migration was applied to **Supabase Cloud dev** this session (see
  §4) -- already applied, nothing pending.
- Two untracked files exist in the working tree from before this session
  (`ORUWA_CAFE_V2_1_FINAL_INDEPENDENT_QA_2026-08-17.md`,
  `ORUWA_CAFE_V2_1_FULL_QA_AUDIT_2026-08-17.md`) -- pre-existing, not created
  or touched by this mission, left alone.

## 3. The four PRs, in order

| PR | Title | Merge commit | What it did |
|----|-------|-------------|-------------|
| #357 | Manager Attention UX reconciliation | `28a65a3` | First pass: Level 1/2/3 action queue, decision-oriented popup cards for corrections/exchanges, replaced plain scroll-link for conflicts. Superseded in look-and-feel by #358/#359 below but its underlying data model (`manager-attention.ts` pure functions) is still the foundation. |
| #358 | Manager Attention UX compactness correction | `abc237e` | Founder pushback: the #357 result was too tall (permanent item feed under the chips pushed Weekly Schedule far down). Removed the permanent feed; chips + "Review all"/conflicts popup became the only always-visible pieces, details on demand. |
| #359 | Attention polish (chips/breakdown/correction-history/entry-points) + Shift Exchange Manager Resolution UX | `8084c310` | Cosmetic round 2 (one-line chips, green right-aligned "Review all", full "N require action · M warnings" breakdown restored, Corrections popup's "Recently decided" table replaced by a "View history" popup) **plus** a real feature: Manager can now assign a replacement employee to a shift-exchange request directly (previously only self-service colleague-accept could set one, so "Approve" was permanently disabled with no real next action). Required one new DB migration -- see §4. |
| #360 | Final Attention/Staff polish | `fba6356` | Shift Exchange popup gets the same "View history" pattern Corrections got in #359. Help (?) text added to the two Attention popups that were missing it (Unavailable conflicts, Review all). Recipe-detail popup load latency cut by parallelizing DB reads that didn't need to be sequential. Staff popup: LINE user id is now a field next to Email (Add + Edit), linked in the same Save/Add submit instead of a separate "Bind" button. Shared page padding now 4px on mobile (was a flat 32px everywhere) via a `--page-padding` CSS custom property. Mobile Needs-Attention chips grid: 2 columns on phone / 4 on desktop via `--attention-chip-columns`, "Review all" always spans full width. |

## 4. Database change (already applied, Cloud dev)

**Migration**: `supabase/migrations/0079_manager_assign_shift_exchange_replacement.sql`
**pgTAP test**: `supabase/tests/0037_manager_assign_shift_exchange_replacement.sql` (17 assertions, all passing)

Adds exactly one new RPC, `api.manager_assign_shift_exchange_replacement(p_exchange_id, p_replacement_employee_id)`, modeled directly on the existing self-service `api.accept_workforce_shift_exchange` (same tenant/location/active-employee/schedule-conflict validation) but Manager-callable on a colleague's behalf. **No schema, table, or RLS-policy change** -- the table already granted `update` to `authenticated` and the existing `wf_shift_exchanges_manage` policy + the guard trigger's Manager bypass already permitted this at the DB layer; the new function just adds a safe, validated app-facing path to it.

Verified locally first (`supabase db reset` + `pnpm db:test`, full pgTAP suite 827/827 including this file's 17 new assertions), then pushed to Supabase Cloud dev (`supabase db push`) **with explicit Founder approval** before PR #359 was opened, per this repo's DB-change gate. Confirmed in sync afterward via `supabase migration list` (local == remote through 0079).

If a future session needs to touch shift-exchange assignment/approval again, read `0079_manager_assign_shift_exchange_replacement.sql`'s own doc comment first -- it explains exactly why no RLS/schema change was needed and what the function does/doesn't validate.

## 5. Key files changed across the whole mission

Frontend (all under `apps/web/src/`):
- `app/(protected)/manager/attention-panel.tsx` -- rewritten twice (compact summary+chips+popups model, then the mobile grid).
- `app/(protected)/manager/correction-requests-popup.tsx` -- pending section is cards not a table; "View history" popup added.
- `app/(protected)/manager/shift-exchange-requests-popup.tsx` -- same treatment, plus the whole Assign-replacement/candidate-selector UI (new).
- `app/(protected)/manager/manager-dashboard-client.tsx` -- wiring for all of the above (`handleAssignReplacement`, new props threaded to the exchange popup).
- `app/(protected)/manager/staff-form.tsx`, `line-link-form.tsx`, `manage-staff-popup.tsx` -- LINE-id-with-Save.
- `app/(protected)/_ui/entry-points-card.tsx` -- heading/subtitle dropped, buttons fill the row equally.
- `lib/workforce/manager-attention.ts` -- pure Attention data-model functions (severity, summary, queue items). Read this before changing Attention behavior again; it's the single source of truth for what counts as "requires action" vs "warning".
- `lib/workforce/shift-exchange-candidates.ts` -- new pure module for the Assign-replacement candidate list (schedule-conflict/unavailable warnings, mirrors the RPC's own check as a preview only).
- `lib/workforce/shift-exchanges.ts`, `shift-exchange-actions.ts` -- new `assignShiftExchangeReplacement` wrapper + Server Action.
- `lib/workforce/recipes.ts`, `recipe-actions.ts` -- parallelized reads for popup latency.
- `lib/ui/theme.ts`, `app/globals.css` -- `--page-padding` and `--attention-chip-columns` custom properties.
- `app/(protected)/manager/manager-dashboard-i18n.ts` (+ `.test.ts`) -- every new string, JA+EN. **All new JA copy is machine-translated and flagged `NEEDS_NATIVE_JAPANESE_REVIEW`** in the file's own existing top-of-file disclaimer; nothing in this mission changed that status.

## 6. Verification evidence (per PR, all four)

- `pnpm -F web typecheck && lint && test && build` -- green on every PR before merge (final full suite: 1176/1176 tests).
- Live Preview QA via chrome-devtools MCP on each PR's own Vercel deployment before merging -- desktop 1440px + mobile 390px, JA and EN, every new interaction actually clicked through (not just visually inspected): Assign-replacement → Approve full round trip confirmed end-to-end against real seed data (`oruwa-cafe` reference tenant), Attention count decremented correctly afterward.
- No console errors observed in any QA pass.
- Standing merge authority was used for all four PRs (Founder does not review each PR's own ephemeral preview -- see `feedback_merge_authority` memory). For PR #359 specifically (the one with a DB change), the Founder was looped in explicitly before the migration was pushed to Cloud, per this repo's non-negotiable DB-change gate -- that approval is recorded in this session's transcript, not in a repo file.

## 7. Known limitations / deferred items

- **JA copy needs native review.** Every new string added this session (all four PRs) is machine-translated, consistent with the rest of `manager-dashboard-i18n.ts`'s existing disclaimer. Not yet independently confirmed by a native speaker.
- **Recipe popup latency**: cut by removing ~2 unnecessary sequential DB round trips (parallelized reads that didn't actually depend on each other). Not independently timed with a stopwatch on the live Preview after the fix -- the fix is correctness-verified (tests, build) and architecturally sound (fewer round trips), but no before/after latency measurement was recorded. If the Founder still finds it slow, the next lever is the existing hover-prefetch cache in `recipes-popup.tsx` (already present, added in an earlier mission) -- check whether it's actually warming before investigating further.
- **Shift Exchange history popup, Corrections history popup**: both now use the same compact card pattern; neither has its own archive/pagination beyond showing every decided item in the popup. If a tenant accumulates very many decided requests over time, this may eventually want a cap + "load more," but no evidence of that being a real problem yet -- don't add it pre-emptively.
- **`bind`/`binding` i18n keys** (old separate "Bind" button copy) are now unused dead strings in `manager-dashboard-i18n.ts` -- left in place rather than removed, low priority, harmless.
- Nothing else from this session is a known open defect.

## 8. What is explicitly NOT authorized to start next

Per every one of this session's own mission briefs' scope-exclusion sections: no new Workforce module, no generic notification system, no Staff-surface follow-up, no unrelated i18n cleanup, no Platform Foundation work, no production deploy. A fresh session should ask the Founder what's next rather than assume continuation of any of the above.

## 9. Pointer

`docs/ai/current-task.md` §5 should be treated as stale for anything Cafe-Manager-Attention-related until it's updated to point here -- this file is the current source of truth for this specific thread of work as of 2026-08-22.
