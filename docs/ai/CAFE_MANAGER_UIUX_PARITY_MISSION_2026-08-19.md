# CAFE_MANAGER_UIUX_PARITY_MISSION (started 2026-08-19, updated 2026-08-20)

Durable handoff for a **fresh** Claude Code session continuing this
workstream. This file, git, and the repository's own tests/docs are the
source of truth — not any prior chat's conversational memory. Read this
file fully before doing anything. Everything below is VERIFIED against
tool output in the session that wrote/updated this handoff, unless
explicitly marked INFERRED/OPEN QUESTION.

**If you are a fresh session starting from this file: start at §7 ("Next
step for a fresh session"). Read §1–§6 first for full context, but §7 is
where you actually begin.**

---

## 1. Roles for this session (read before doing anything)

You are **AI CTO / Technical Orchestrator** (strategy, architecture,
security, review, priorities) **and Senior Software Engineer**
(implementation) in one session — this project does not run a literal
two-agent split; one session plays both roles. Full role definitions were
pasted into chat by the Founder as two system-prompt-style documents
("ROLE: AI CTO / TECHNICAL ORCHESTRATOR / ARCHITECT" and "ROLE: SENIOR
SOFTWARE ENGINEER / IMPLEMENTATION AGENT") — read the project memory
`project_user_operating_model` (in `MEMORY.md`'s index) for the condensed
version; the two full role docs are long or ask the Founder if you need the
verbatim text again, but the short version below is sufficient to operate:

- Founder gives direction → you (CTO) plan/architect/review → you
  (Engineer) implement → you (CTO) review your own work → you fix your own
  findings → you show the Founder the result. Founder is not looped into
  routine technical decisions.
- **Standing authority already granted** (see project memory
  `feedback_routine_approvals` and `feedback_merge_authority`): decide and
  execute routine commit/push/PR-open/**merge** for GREEN-tier work
  (local app code, tests, docs, non-destructive refactors, forward-only
  migrations) without asking each time. Still hard-gate: production
  deploys, destructive SQL, RLS/security-architecture changes, secrets,
  customer data/billing, LINE broadcast/mass-messaging, force-push,
  history rewrites — those need explicit Founder approval (RED tier).
  Schema changes (new migration) are YELLOW tier — do the extra internal
  DECISION/REASON/RISK/MITIGATION/ROLLBACK review before proceeding, don't
  automatically escalate to Founder unless the risk can't be bounded (WP-6
  did exactly this for a real Storage-RLS bug fix — see §5 — as the
  reference example of how a YELLOW-tier mid-mission fix should be handled:
  investigate, explain the finding precisely, ask before pushing to
  Supabase Cloud, then verify live afterward).
- **Live Preview QA process (clarified 2026-08-20, Founder verbatim)**:
  Founder does NOT do per-PR live QA on ephemeral Vercel PR-preview URLs.
  Founder only checks the persistent `https://preview.oruwa.jp/manager`
  deployment, once, as the **final acceptance gate after every WP in this
  mission is merged and deployed there** ("я финальная проверка"). For
  each individual WP/PR in between, **you do your own live Preview QA**
  (chrome-devtools MCP against that PR's own Vercel preview deployment URL
  — get it from `gh pr view <n> --json comments` or the Vercel GitHub-bot
  PR comment) before merging — desktop + mobile 375px, sign in as
  `manager@oruwa-cafe.test` / `NewTestSmoke456!`. The reference site
  (`mame-to-cha/manager`, account `manager@mame-to-cha.test` /
  `LocalSmoke123!`) is a visual guide only, never a data source — never
  write test data there, it's a shared Preview DB other work also depends
  on. Do not wait for Founder sign-off before merging an individual WP; do
  wait if something in live QA looks genuinely wrong.
- Respond to the Founder in Russian (their working language this session).

---

## 2. What this mission is

Founder did live QA of PR #324 (a small, already-merged hover-state
retrofit for the Manager surface) by comparing
`https://preview.oruwa.jp/manager` (canonical) side-by-side with the
legacy **Mame To Cha** reference prototype at
`https://preview.oruwa.jp/mame-to-cha/manager`, 10 screenshots. The hover
fix itself was fine, but the side-by-side comparison surfaced a much larger
design/functionality gap between canonical and the reference. **Founder's
instruction**: canonical Manager must look equal to or better than the
reference (better only if justified), Manager first — Founder personally
verifies live once everything is merged and deployed — then the identical
treatment gets applied to `/staff` afterward, **then Cafe v2.1 formally
closes**, then Platform Foundation per the plan already agreed 2026-08-16
(see `docs/ai/current-task.md` §5).

This grew from "finish a small hover fix" into a proper 13-Work-Package
redesign mission — planned via the full Explore → Plan → AskUserQuestion →
ExitPlanMode workflow (not ad-hoc), because of its size. **The full,
detailed plan — Founder's original verbatim QA report (§"Founder's report"
in that file — this is "the review the Founder did" that every WP traces
back to; re-read it before marking any WP done, don't rely on this
handoff's paraphrase alone), all research findings, and all 13 Work
Packages with exact files/line-numbers + Founder's locked decisions — lives
in the approved plan file**:

`C:\Users\User\.claude\plans\glittery-conjuring-beacon.md`

**Read that file in full before starting any new Work Package.** It is the
single most information-dense artifact from this mission — this handoff
summarizes status and adds current git/PR state, but does not repeat every
file/line-number detail already in the plan file. Do not re-derive the
Explore-phase findings by re-exploring the codebase; they are already
captured there. **Caveat**: some file/line-number citations in that plan
file may have drifted since WP-1–6 landed (e.g. WP-6 already fixed things
the plan's Explore phase flagged as gaps) — verify against current code
before assuming a citation is still accurate, per this project's own
memory-freshness discipline.

---

## 3. Mission scope note

**Manager surface only** this pass
(`apps/web/src/app/(protected)/manager/**` plus the shared recipe/inventory
route components it embeds). Staff gets an identical follow-up pass as a
**separate future mission** after the Founder approves the Manager result
in full — several pieces built during this mission (full-width
`RecipeForm`, `LightboxTrigger` wiring, `ConfirmDialog` retrofits) are
shared components, so Staff's future pass reuses them for free and should
be scoped much smaller.

Do not restore `%5Fclient-preview/mame-to-cha/**` or `mame-to-cha/**` route
trees as production backend — they are read-only visual/pattern references
only (settled architecture decision, unrelated to this mission). The real
reference code to study lives in `apps/web/src/lib/preview/*.tsx` (the
DB-backed components those routes render) plus shared visual chrome in
`apps/web/src/components/demo/cafe/*` — see plan file for exact files.

---

## 4. The 13 Work Packages (see plan file for full detail per WP)

Ordered cheap/safe/high-value first; WP-13 is the one YELLOW-tier
(schema-change) item and stays last/separate with its own extra review.

| WP | Title | Status |
|----|-------|--------|
| WP-1 | Header brand badge + language-toggle contrast fix | **MERGED — PR #325 (2026-08-19)** |
| WP-2 | Recipes/Inventory nav buttons: real buttons + hover | **MERGED — PR #325, same PR as WP-1** |
| WP-3 | Manage Staff: ConfirmDialog everywhere + permanent-delete UI | **MERGED — PR #326 (2026-08-19)** |
| WP-4 | Recipes: full-width form + remove "Original language" field | **MERGED — PR #327 (2026-08-20)** |
| WP-5 | Recipes: "Delete" (replacing "Archive") + ConfirmDialog | **MERGED — PR #328 (2026-08-20)** |
| WP-6 | Recipe photo upload + Lightbox (built fresh on `LightboxTrigger`) | **MERGED — PR #329 (2026-08-20).** Included migration `0074_recipe_media_tenant_wide_fix.sql` — see §5 for the full story. |
| WP-7 | Inventory: autosave + ConfirmDialog + permanent-delete | **MERGED — PR #331 (2026-08-20).** `CountForm` autosave (600ms debounce, matches `settings-section.tsx`'s convention); `ConfirmDialog` added to Deactivate only (Reactivate stays a direct action — verified against the reference `preview-inventory-manager-panel.tsx`, which does the same); permanent-Delete wired to the previously-unused `permanentlyDeleteInventoryItem` RPC, offered regardless of active/inactive state (matches reference). Claude live-QA'd end-to-end including the RPC's `blocked_by_history` guard on an item with real stock-count history (desktop + 375px). |
| WP-8 | Schedule grid: understaffed "!" marker, per-cell correction "!", remove Estimated-labour-cost section | **MERGED — PR #333 (2026-08-20).** `computeUnderstaffedDateKeys`/`computePendingCorrectionCellKeys` added to `manager-attention.ts` (pure, reuses `scheduleSettings`/`localAssignments`/`pendingCorrections`, no new fetch). Live-QA'd (desktop + 375px): understaffed marker confirmed correct against real data. Per-cell correction marker's live verification was deferred at merge time (no pending-correction fixture existed yet) — **closed out 2026-08-20 once WP-10 landed**: created a real past-day pending correction (田中美咲, 2026-08-18) + a matching draft assignment via the live Manager UI on `preview.oruwa.jp/manager`, confirmed the "!" marker renders correctly next to the Draft badge, and confirmed the understaffed marker correctly disappeared from that date once the assignment existed. Week-nav "jankiness" root-caused (full RSC page navigation remounts the whole page on every Prev/Next click, not a slow query) but NOT fixed -- flagged as a future follow-up, not folded into WP-8. |
| WP-9 | Cross-cutting: loading indicators (`PendingOverlay`/`LoadingButton`) + shared `HelpIconButton` + popup-speed instrumentation | **MERGED — PR #335 (2026-08-20).** New shared `HelpIconButton` (`components/shared/design-kit`) unifies schedule's bordered-circle vs Settings' transparent "?" styles; `Modal` gained a `titleAdornment` slot to host it; wired into Manage Staff/Recipes/Inventory popups, which previously had no help affordance at all (each got a new small help Modal, JA/EN copy). `PendingOverlay`/`LoadingButton` wired into `StaffForm`/`RecipeForm`/`ItemForm` (the three Add/Edit forms still using a bare `isPending` ternary); `CountForm`'s inline autosave indicator left as-is (different, already-visible pending pattern). New temporary `lib/ui/popup-timing.ts` instrumentation measured real popup-open times live on Preview: Manage Staff 16ms, Recipes 5ms, Inventory 12ms -- all well under 100ms, confirming these three popups are NOT the source of the Founder's "slow to open" complaint (matches the Explore-phase prediction). Live-QA'd desktop 1440px + mobile 375px, all three popups + their new help modals + nested-modal-in-modal rendering, no regressions. |
| WP-10 | QA seed-data script for `oruwa-cafe` tenant | **MERGED — PRs #337/#338/#339 (2026-08-20).** New `packages/db/scripts/oruwa-cafe-fixture.ts` (pure typed manifest + plan builder, 10 unit tests) + `oruwa-cafe-fixture-write.ts` (dry-run-by-default executor, `--confirm-apply` to write for real, rerun-safe via per-item ownership markers). Required four small additive grant-only migrations (`0075`-`0078`) discovered live: `service_role` had never been granted any access to this codebase's custom schemas before (schema `api` USAGE, underlying base-table SELECT/INSERT, two SECURITY DEFINER function EXECUTE grants, schema `core` USAGE) — this fixture tool was the first thing to ever call `.schema('api')` as `service_role`. Also fixed two bugs found live: `api.workforce_staff_directory`'s own `WHERE core.has_permission(...)` clause always returns zero rows for a service-role caller (no acting user) regardless of grants, so employee-roster reads (and the stock-count RPC) go through an authenticated manager-test-account session instead; and the `pendingShiftExchange` fixture's `reason` text used the wrong marker constant, breaking rerun-idempotency for that one item (now fixed + regression-tested — but a harmless duplicate shift-exchange pair from before the fix is still live in `oruwa-cafe`, left as-is). **Fully executed against the linked Cloud dev project** (with Founder approval at each schema-change step) — the full fixture set is live: 2 shift assignments, 3 shift requests, 1(+1 duplicate) shift exchange, 2 inventory items. Used immediately to close out WP-8's deferred per-cell-marker verification (see WP-8 row). Execution note for a future session: this AI sandbox cannot read `.env.cloud.local`/`.env.local` (blocked by permission settings) — running `--confirm-apply` requires the Founder to source real Cloud credentials into their own PowerShell session and run the `pnpm` command themselves; see PR #337's body for the exact commands. |
| WP-11 | Correction/Exchange requests: convert always-visible sections to popups triggered from `AttentionPanel` | **MERGED — PR #341 (2026-08-20).** New `CorrectionRequestsPopup`/`ShiftExchangeRequestsPopup`, triggered from `AttentionPanel`'s correction/exchange cards (now buttons, not anchor links) instead of the previous always-visible `#correction-requests`/`#shift-exchange-requests` sections (removed). `unavailable_conflict`/`inventory` cards unchanged. `.slice(0,10)` cap on decided items replaced with a real "Show/Hide archive" toggle. Both popups get WP-9's `HelpIconButton`/help-Modal pattern + popup-timing instrumentation. Live-QA'd desktop + 375px against WP-10's real seed data (2 pending corrections, 2 pending shift-exchanges); confirmed no regression to WP-8's understaffed/per-cell-correction markers. |
| WP-12 | Settings section: side-by-side diff pass vs. reference | **MERGED — PR #343 (2026-08-20).** Structure/copy/autosave already matched the reference (confirmed live). Three real visual/UX gaps fixed: shift-type rows (active/editing/inactive) had no background, now `colors.surfaceElevated` like the reference; Edit/Deactivate/Reactivate/Show-deactivated buttons were bare text links, now bordered secondary-style buttons (Deactivate additionally gets `dangerText`); a failed deactivation's error only surfaced in the section's bottom bar (invisible behind the open dialog), now also shown inline inside the `ConfirmDialog`. Live-QA'd desktop 1440px + mobile 375px on the PR's own Vercel preview (added a real `QA Test Shift` shift type, exercised add/edit/deactivate/confirm-dialog/show-deactivated, then deactivated it as cleanup — a harmless deactivated leftover, same category as WP-10's fixture leftovers). No console errors. Note: PR was accidentally opened with base `main` (gh's default), corrected via `gh pr edit --base dev` before merge — a fresh session opening a PR in this repo should double check the base branch, `gh pr create` does not infer it from the local branch's tracked upstream. |
| WP-13 | Shift-preference deadline/reminder (YELLOW-tier, schema change, last, separate Founder approval) | **DEFERRED — Founder decision 2026-08-20: all LINE-related work (this WP's reminder-delivery half depends on the still-inert Track C2 LINE-notification stub) waits until Cafe v2.2 closes.** Not a rejection, not forgotten — explicitly out of scope until v2.2 is done. Do not start without a fresh Founder go-ahead even after v2.2 closes; the open deadline-semantics/in-app-only-for-v1 questions (see §7) still need answering first. |

**Locked decisions (Founder answered via AskUserQuestion during planning,
all chose the recommended option — do not re-ask these)**:
- WP-3: 再送信(resend)/アクセスを回復(recover-access) buttons stay in the
  staff list row (`InvitationCell`), not duplicated inside the edit form.
- WP-4: "Original language" field is fully removed; recipe source language
  locks at creation time (defaults JA), no UI path to change it after
  creation — this is a real behavior change, call it out in the PR body.
- WP-6: Lightbox is built fresh on top of the existing-but-unused
  `LightboxTrigger` component. "Remove image" is a soft delete (clears the
  form field; the Storage object is only actually removed on Save, so it's
  undoable pre-save).
- WP-7: Founder's stated preference — keep the current inline-quantity-
  in-card layout as-is (the reference's inline-quantity pattern Founder was
  picturing actually lives on the reference's *staff* panel, not the
  manager one — no layout change needed here, confirmed already liked).
- WP-9: Do **not** add Modal-open/close animation as a blind fix for the
  "popups open slowly" complaint — the reference has zero animation too,
  deliberately (its own `ConfirmDialog` comment says speed over polish).
  Measure the actual bottleneck per popup first (lightweight timing
  instrumentation), then fix whatever the measurement shows.

---

## 5. Repository / git / DB state (VERIFIED at handoff time, 2026-08-20)

- Repo: `D:\Dev\line-business-os`. Base branch: `dev`. WP-1 through WP-12
  are merged into `dev` (PRs #325–#329, #331, #333, #335, #337, #338, #339,
  #341, #343, all squash-merged, all feature branches deleted; PR #330, #334,
  #340 were docs-only handoff-doc updates, also merged). Local working tree
  was last on `fix/cafe-manager-settings-diff` (WP-12's branch, merged/
  deleted by the time you read this) — a fresh session should
  `git fetch origin dev && git checkout -B <new-branch> origin/dev` before
  starting WP-13, same pattern as every prior WP. **When opening the PR,
  verify `gh pr view <n> --json baseRefName` shows `dev`** — `gh pr create`
  defaults to the repo's default branch (`main`) rather than inferring from
  the local branch's tracked upstream; WP-12's PR #343 was opened against
  `main` by mistake and had to be corrected via `gh pr edit --base dev`
  before it was mergeable. Note: `gh pr merge
  --delete-branch` can fail locally with a git worktree error ("'dev' is
  already used by worktree at ...") if another local worktree elsewhere on
  disk has `dev` checked out (this repo has several sibling worktrees under
  `D:\Dev\line-business-os-*` from other missions/sessions) -- the merge on
  GitHub itself still succeeds despite the local error; verify with `gh pr
  view <n> --json state,mergedAt` and delete the remote branch manually
  (`git push origin --delete <branch>`) rather than assuming the merge
  failed.
- **Prior PR #324** (A10 hover-state retrofit, unrelated to this mission
  except that it's what triggered the Founder's side-by-side comparison
  that started this mission) — already merged to `dev` before this mission
  began.
- **Two untracked files sitting in the repo root**, unrelated to this
  mission, decision still pending from before this mission started:
  `ORUWA_CAFE_V2_1_FINAL_INDEPENDENT_QA_2026-08-17.md` and
  `ORUWA_CAFE_V2_1_FULL_QA_AUDIT_2026-08-17.md`. These are **not**
  disposable — they were the working reference for an earlier hardening
  mission (see `docs/ai/CAFE_V2_1_HARDENING_HANDOFF_2026-08-17.md`, which
  explicitly says "do not delete"). Founder was mid-decision on
  read/commit-to-docs/delete/leave-as-is when this UI/UX mission
  interrupted that conversation. **Do not `git add -A` on this repo** — a
  broad add will pick these up by accident (this happened once already
  during WP-6, caught and reverted before it reached `dev`). Stage files by
  explicit path only. Do not delete them; ask the Founder to resume that
  decision once this mission's more urgent work is further along.
- Test accounts: `manager@oruwa-cafe.test` / `NewTestSmoke456!` (canonical,
  read/write), `manager@mame-to-cha.test` / `LocalSmoke123!` (reference,
  read-only comparison use only).
- **WP-6's Storage RLS bug fix (migration `0074`)** — the full story, so a
  fresh session doesn't need to re-derive it: `0052`'s `recipe-media`
  Storage policies (`recipe_media_select/insert/delete`) gated on
  `r.location_id = (storage.foldername(name))[2]::uuid`, which is `NULL`
  (never true in Postgres) for a **tenant-wide recipe**
  (`workforce.recipes.location_id IS NULL` — a real, by-design case; see
  `0022`'s own RLS policies on `workforce.recipes`, which already branch on
  this explicitly). Every photo upload/read/delete on a tenant-wide recipe
  was silently denied by RLS regardless of the caller's actual permissions.
  Found live testing WP-6's upload flow against `カフェラテ` (an existing
  tenant-wide recipe). Fixed via migration `0074_recipe_media_tenant_wide_fix.sql`,
  mirroring `0022`'s tenant-wide branch pattern
  (`location_id is null` + `has_permission_in_tenant` vs `location_id is
  not null` + `has_permission(..., location_id)`). Founder approved the
  push explicitly (YELLOW tier); applied to the linked Supabase Cloud
  `line-business-os-dev` project; verified live end-to-end (upload,
  thumbnail, lightbox) afterward.
- **Migration/DB drift discovered while pushing `0074`** (see project
  memory `project_migration_drift_platform_foundation` for the full
  writeup — read it if you touch migrations again): the linked Supabase
  Cloud dev project already had migration versions **0060** and **0070–0073**
  applied with **no corresponding local file in this repo or in
  `origin/dev`**. Investigated read-only (`supabase db dump --schema
  supabase_migrations`): 0070–0073 are 5 legitimate, already-planned
  **"Platform Foundation critical path"** migrations (Module Registry,
  Shared Navigation + Shared Settings, Notifications engine, Event Bus —
  matches `docs/foundation/platform-foundation-roadmap.md`'s own sequencing
  exactly), pushed directly to Cloud from an unmerged branch/session,
  never committed to git. 0060 is an older, separately-known gap (see the
  earlier commit `fix(supabase): restore local 0061 migration file to
  match applied Preview state`, which fixed 0061 but apparently not 0060).
  **This is needed, legitimate, already-sanctioned work — not something to
  revert or worry about** — just not yet reconciled with git. To unblock
  WP-6's own push, ran `supabase migration repair --status reverted 0060
  0070 0071 0072 0073` — this **only** edits the migration-history tracking
  table; it does **not** touch the actual schema objects those migrations
  created (they still exist and still work — Module Registry tables,
  Notifications outbox, etc., are all live in the DB). **Whoever eventually
  merges the Platform Foundation branch must properly reconcile those 5
  versions** (their own files + `migration repair --status applied` once
  those files exist, not fresh `CREATE` statements that would collide with
  the already-existing objects) — this repair only unblocked WP-6, it does
  not fix Platform Foundation's own migration history. Not this mission's
  job to fix further; just flag it if you touch migrations again, and do
  not be alarmed if `supabase migration list` still shows this asymmetry.

---

## 6. Verification pattern to follow for every future WP

Matches the house style already used for every merged WP in this mission:
```
pnpm -F web typecheck && pnpm -F web lint && pnpm -F web test && pnpm -F web build
```
All four must pass locally before push. Every WP with a live UI surface
gets your own live Preview QA (desktop + mobile 375px) against that PR's
own Vercel preview deployment before merging — see §1's Live Preview QA
process note. WP-3/5/6/7's new destructive actions (permanent-delete
employee/recipe/inventory-item) need a dedicated manual QA pass confirming
`ConfirmDialog` actually blocks accidental clicks, and the
blocked-by-history case shows its inline warning *before* the click where
applicable, not only on failure (WP-3/WP-5 already did this — WP-7 needs
the same treatment for inventory items, RPC `permanentlyDeleteInventoryItem`
already exists/tested per the plan file). See plan file's "Verification"
section for the full checklist including WP-8/WP-10/WP-13 sequencing notes
(ship WP-10's seed data before or alongside WP-8's QA pass so the new "!"
markers have something to show).

**Git hygiene reminder** (from a real WP-6 slip, caught before it landed):
stage files by explicit path (`git add <path> <path>`), never `git add -A`
or `git add .` — this repo has untracked files in its root (§5) that must
stay untracked.

---

## 7. Next step for a fresh session

**WP-1 through WP-12 are all done and merged. WP-13 is DEFERRED** (Founder
decision 2026-08-20: all LINE-related work, including WP-13's reminder-
delivery half, waits until Cafe v2.2 closes — not a rejection, explicitly
out of scope for now). This mission has no more actionable WPs until v2.2
closes and the Founder re-opens WP-13.

1. **The real next step is the Founder's one-time final live-QA acceptance
   pass** against `https://preview.oruwa.jp/manager` (per §1/§2) — WP-1
   through WP-12 constitute the full Manager-surface visual/functional
   parity deliverable this mission was scoped to produce; WP-13 being
   deferred does not block this. Tell the Founder it's ready; do not assume
   silent approval — wait for their actual pass/fail.
2. Once the Founder accepts: per `docs/ai/current-task.md` §5's sequencing,
   move to the Staff-surface follow-up mission (identical treatment applied
   to `/staff`, reusing the shared components this mission already built —
   full-width `RecipeForm`, `LightboxTrigger` wiring, `ConfirmDialog`
   retrofits, design-kit `Modal`/`HelpIconButton`/`PendingOverlay` — so it
   should be scoped much smaller than this mission was). Do not start the
   Staff pass on your own initiative before the Founder has actually
   reviewed the Manager result.
3. Once Cafe v2.2 closes (separate track, not this mission's job — see
   project memory `project_v2_2_and_provisioning_plan`) and the Founder
   explicitly re-opens WP-13: read the plan file
   (`C:\Users\User\.claude\plans\glittery-conjuring-beacon.md`)'s WP-13
   section under "Final Plan" first (verify citations against current code,
   they may have drifted by then). It is YELLOW-tier (schema change) and
   needs a dedicated CTO extra-review pass (DECISION/REASON/RISK/
   MITIGATION/ROLLBACK write-up) before implementation. Explicit open
   questions needing fresh Founder sign-off before writing code: what
   "deadline" is measured relative to, and whether an in-app-only reminder
   is acceptable for v1 given LINE delivery still isn't live at that point
   either (v2.2 closing doesn't itself make LINE delivery live — that's a
   separate Track B/C milestone). Do not guess these — ask. Implement → run
   the 4-command verification (§6) → commit (explicit paths only) → push →
   open PR **against `dev`, and verify `gh pr view <n> --json baseRefName`
   confirms it** (`gh pr create` defaults to `main`, not the local branch's
   tracked upstream — WP-12's PR #343 and its own docs-follow-up PR #344
   both had to be corrected this way) → wait for CI green → do your own live
   Preview QA (§1) → merge (standing authority) → delete branch → update
   this handoff's §4 table and this §7 pointer. If it touches a migration,
   re-read §5's migration-drift note and project memory
   `project_migration_drift_platform_foundation` first, and run `supabase
   migration list` before `db push`.
4. Keep this handoff file and `docs/ai/current-task.md`'s pointer (§8
   below) updated as state changes, so a context-compaction or a fresh
   session never loses track of what's actually next.

---

## 8. Pointer added to `docs/ai/current-task.md`

A short pointer entry was added to that file's §5 directing any fresh
session to this handoff before treating the rest of that file's "Platform
Foundation next" text as current — same pattern used for the prior Cafe
Manager Parity mission's handoff. This mission does not change the
Founder's already-agreed sequencing (Manager UI/UX parity → Staff UI/UX
parity → Cafe v2.1 formally closes → Platform Foundation); it's a detour
the Founder explicitly authorized, same as the Manager Parity + Design-Kit
mission was before it.
