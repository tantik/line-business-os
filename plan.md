# ORUWA Cafe v2.1 — live execution plan

Updated: 2026-08-01 (Asia/Tokyo)

This is the short restart point for ChatGPT/Codex/Claude. Read it after
`AGENTS.md`, `docs/ai/oaes-project-profile.md`, and `docs/ai/current-task.md`.
Do not reconstruct the project from chat history before checking Git and this
file.

## Goal

Deliver a verified Cafe product on Preview:

- `https://preview.oruwa.jp/mame-to-cha`
- `https://preview.oruwa.jp/mame-to-cha/recipes`
- `https://preview.oruwa.jp/mame-to-cha/manager`

## Current Git state

- branch: `dev` (feature branches merged and can be deleted)
- merged PRs: `#158`-`#170` (see "Manager bug-report round" below for `#167`-`#170`)
- latest confirmed `dev` merge commit: `a751443fb13c8426c839547302e38982afea4212` (PR `#170`)
- Supabase Cloud (Preview) migration history: `0000`-`0053`, `supabase db push` applied and `supabase migration list` confirms local/remote both at `0053`
- base: `dev`
- stage: OAES QA / Preview release gate — Manager bug-report round

## Completed and pushed

1. OAES/project integration and v2.1 Product + Architecture Review.
2. Shared `MATCHA-tea` header/navigation, compact attention centre, week
   prefetch, pending correction markers, inventory search/filter/sticky UX.
3. Secure full staff profile management with encrypted PII (`0049`).
4. Future shift change/cancellation requests and manager decisions (`0050`).
5. Complete recipe create/edit dialog, transactional ingredients/steps/notes,
   draft/published lifecycle, private recipe images and signed display
   (`0051`, `0052`).
6. Preview Cloud Supabase migrations `0049`-`0052` applied and verified;
   Local and Remote migration history now align at `0000`-`0052`.

## Verified evidence

- clean local Supabase reset through `0052`: PASS;
- pgTAP: 628/628 PASS;
- web regression tests: 780/780 PASS;
- new recipe parser tests: 3/3 PASS;
- typecheck: PASS;
- lint: PASS;
- production build: PASS;
- compiled Preview Server Action allowlist: PASS;
- no frontend `service_role`; recipe media bucket is private and
  tenant/location/RLS scoped.

## Current step

Merged `dev` deployment `ad3ad27` is live on `preview.oruwa.jp`. Authenticated
browser acceptance is in progress. Manager, Staff, and Recipes load with their
intended test roles. The first observed defect was fixed and merged in PR
`#159`: a future Staff shift now opens the complete change/cancel/exchange form
immediately instead of an exchange-only intermediate button.

The repeated live Staff flow now passes: empty reason is blocked, a temporary
cancellation request submits, the cell receives `!`, Manager sees the correct
staff/date/reason, and rejecting the temporary request removes it from the
approval queue.

Observed live evidence:

- Manager shift edit for 2026-07-30 saves and closes without the old input error;
- Manage Staff exposes the full profile form;
- Manage Recipes exposes add/edit and the complete recipe form;
- Staff header/menu, pending markers, earnings summary, and removal of the
  bottom Shift exchange block are live;
- JA/EN Staff UI and Help popup switch together;
- Recipes JA/EN content is live with no machine-translation label;
- Staff Inventory has search/filter controls and a visible shortage state;
- Manager week navigation latency fix is implemented locally: remove automatic
  loading of both adjacent heavy pages, prefetch only on pointer/focus intent,
  and disable navigation at the supported `-8/+8` bounds. URL/searchParams
  remain the single period source for schedule mutations.
- Recipe photo acceptance defect is fixed locally: the private image is now
  loaded as a signed thumbnail only when Manage Recipes opens (so week
  navigation does not gain a Storage round trip), the editor uses a compact
  84x84 preview with choose/replace/remove buttons, and a newly selected file
  previews immediately. The recipe list now shows the saved image instead of
  the generic icon.
- Cafe Manage Staff no longer shows the unused Employment type field. Existing
  stored values are preserved invisibly during unrelated edits; the database
  field remains available for a future HR/employment-rules module.
- Current local verification after these changes: typecheck PASS, lint PASS,
  web tests 783/783 PASS, production build PASS.
- PR `#160` merged into `dev` as `0eafdbd72d3fa502c805bcc3008270ec11612369`;
  GitHub CI and the Vercel deployment both passed. The recipe-media/Staff-form
  correction is live on `preview.oruwa.jp` and awaits the final authenticated
  visual interaction check (thumbnail, replace/remove, Employment type absent).
- Acceptance round 2 fixes are implemented locally on
  `fix/cafe-v2-1-acceptance-round-2`:
  - normalized database shift times from `HH:MM:SS` to browser-safe `HH:MM`,
    fixing the false `Please check your input` failure on create/update;
  - targeted assignment lookup and parallel validation reads reduce shift
    write latency; successful writes update the table immediately while the
    heavier attention/summary refresh runs in the background;
  - week navigation keeps the existing table stable with a small progress
    indicator instead of replacing/jumping the schedule card;
  - Manage Staff and Manage Recipes now have confirmation-based, reversible
    Delete actions (staff deactivate / recipe archive), with restore paths;
  - recipe thumbnail loading no longer blocks opening/editing the gallery;
  - recipe images are limited to 2 MiB, 4096x4096 and 16 MP; the Server Action
    envelope is 3 MiB so oversized images return validation feedback instead
    of the observed server exception;
  - Staff/Recipes menu, Staff header spacing, staff wage field, and Inventory
    30/100-item responsive grid were polished.
- Round 2 local verification: typecheck PASS, lint PASS, web tests 785/785
  PASS, production build PASS, compiled Preview Server Action allowlist PASS,
  `git diff --check` PASS. No migration or RLS change was needed.
- PR `#161` passed GitHub CI and Vercel, merged, and is live on Preview.
  Authenticated Manager smoke confirmed the reported 2026-07-29 shift can now
  be changed and restored, and a new 2026-07-28 shift can be created. Temporary
  acceptance data was removed and the schedule was republished.
- Live timing exposed a remaining Cloud latency issue: a one-cell write still
  loaded whole staff/shift-type lists. Follow-up branch
  `fix/cafe-v2-1-shift-write-latency` replaces those with tenant-scoped reads
  by ID and makes unassign reuse the already-authorized assignment values.
- Follow-up local gate: typecheck PASS, lint PASS, web tests 788/788 PASS,
  production build PASS, compiled Preview Server Action allowlist PASS, and
  `git diff --check` PASS. Final self-review also caught and fixed the
  unassign-with-existing-shift-type branch before publication.
- PR `#162` passed GitHub CI and Vercel and was merged into `dev`. Live
  authenticated Manager acceptance on `preview.oruwa.jp` confirmed: the shift
  editor opens in about 0.3 s; a temporary 2026-07-28 assignment was created,
  rendered in the correct cell, then unassigned in about 2.8 s; the cell
  returned to empty and no phantom `Unpublished shifts` alert remained.
- Live Staff/Recipes acceptance after `#162`: Manager account is correctly
  denied the Staff route without a staff profile; the separate Staff account
  loads the dashboard, advisory earnings, responsive navigation, Recipes, and
  Inventory. A future assigned cell opens the correct change/cancel/exchange
  request dialog with a mandatory reason. Recipes navigation/gallery and the
  compact two-column desktop Inventory modal render correctly. Remaining
  measured issue: Staff `Next week` still took about 3.4 s and visibly waited.
  The follow-up found that week switching is already local; initial Staff RSC
  still loaded all tenant assignments plus hidden Inventory session data. The
  current branch bounds assignments to the visible `-8…+8` week window, skips
  hidden session/session-item reads, and adds a reduced-motion-safe stable week
  transition. Local gate: typecheck PASS, lint PASS, web tests 793/793 PASS,
  production build PASS, compiled Preview Server Action allowlist PASS, and
  `git diff --check` PASS. PR `#163` passed GitHub CI/Vercel and was merged.
  Live deployment acceptance: cold Staff load measured about 6.0 s and a warm
  repeat about 3.1 s; the correct week appeared and no server navigation is
  performed by the button. Browser automation still waited about 2.7 s for the
  button interaction, so perceived week-switch smoothness remains a manual
  visual recheck item rather than being declared fully closed.
- New round of user-reported mobile UI bugs on `preview.oruwa.jp/mame-to-cha`
  (screenshots reviewed 2026-08-01), fixed on branch
  `fix/cafe-v2-1-menu-inventory-mobile-ui`:
  1. Nav dropdown (`PreviewCafeMenu`,
     `apps/web/src/lib/preview/preview-cafe-menu.tsx`) was a narrow floating
     box (`right:16, top:72, width:min(272px,...)`) with no backdrop and no
     way to close it except tapping outside/Escape. Changed to edge-to-edge
     (`right:4, left:4, top:66`, no fixed `width`), added a semi-transparent
     fixed backdrop (`rgba(54,43,31,.32)`) behind the panel that closes on
     tap, and added a sticky `×` close button inside the panel header so it
     stays reachable if the menu's own content scrolls.
  2. Inventory check item cards (`PreviewInventoryStaffPanel` /
     `ItemCard`, `apps/web/src/lib/preview/preview-inventory-staff-panel.tsx`)
     squeezed the "Required/Current/Reorder point" text into the same flex
     row as the status badge, wrapping badly at mobile widths. Split into two
     full-width rows: title+badge on row 1, the Required/Current/Reorder text
     as its own row 2. Shortage cards now get a `demoColors.warning`
     (amber) card border instead of the default neutral border, and
     "Need to order: N unit" renders as a highlighted amber chip
     (`demoColors.alertWarningBg` background) instead of plain muted text.
  - Local gate on this branch: typecheck PASS, lint PASS, web tests 793/793
    PASS, production build PASS, compiled Preview Server Action allowlist
    PASS.
  - PR `#164` passed GitHub CI (typecheck/test/build/lint) and Vercel, and was
    merged into `dev` as `d8b7b7b7dbad12e4d86cf3d7200a1fba14135d4f`.
  - User feedback after `#164`: two stacked close controls on the nav menu
    (the hamburger-morphs-to-X trigger button, plus the "×" added inside the
    panel) looked bad, and the user shared a reference screenshot (a
    full-screen solid-color curtain-style mobile menu with a highlighted
    square icon button) asking for the same treatment in our colors.
    PR `#165` (`fix/cafe-v2-1-menu-single-close-control`,
    `apps/web/src/lib/preview/preview-cafe-menu.tsx`):
    - removed the inner "×" button — the trigger button is the only close
      control now, filling solid `demoColors.accent` and turning its bars
      into a white X when open (aria-label switches Menu/Close);
    - replaced the floating dropdown card with a full-screen panel
      (`demoColors.accentStrong` -> `demoColors.accent` gradient, white
      text) that slides down from behind the header
      (`translateY(-100%) -> 0`, 360ms) instead of a floating card;
    - nav rows / language-toggle row / logout row fade + rise in with a
      staggered delay (120/160/200/240/280ms) instead of appearing all at
      once.
    - Local gate: typecheck PASS, lint PASS, web tests 793/793 PASS,
      production build PASS. PR `#165` passed GitHub CI/Vercel and was
      merged into `dev` as `887a330fafefcdc4b4d318e0490d0e4261ce86e4`.
  - User live-checked `#165` on Preview (screenshot) and confirmed it looks
    good overall, but the inactive JA/EN letter in the Language toggle was
    nearly unreadable against the new green panel. Fixed in PR `#166`
    (`fix/cafe-v2-1-menu-language-contrast`): `PreviewLanguageToggle` gained
    an opt-in `variant="dark"` (translucent white text/border) passed only
    from the nav menu; its other call site (Manager header, light
    background) is untouched. Local gate: typecheck/lint/793 tests/build all
    PASS. PR `#166` passed GitHub CI/Vercel and was merged into `dev` as
    `a4c11f660b7b96f57eaec11c8e22967a4fd76221`.
  - Not yet done: live authenticated visual recheck on
    `preview.oruwa.jp/mame-to-cha` (mobile width) covering: JA/EN contrast
    fix, menu open/close animation, and the Inventory modal open with a
    shortage item. Full local screenshot verification was not possible
    in-session because the preview routes require an authenticated Supabase
    session with no local dev-login bypass; verification relies on the live
    Preview URL as in prior rounds — ask the user to check and report back if
    anything still looks off before closing this item.
  - Open question from the user, not yet investigated with a fix (diagnosis
    only so far): page-to-page navigation inside this preview shell (e.g.
    Staff -> Recipes via the nav menu) feels slow. Likely cause: every route
    here is `export const dynamic = 'force-dynamic'`, so each navigation is a
    fresh full server round trip with no caching -- `requirePreviewUser` ->
    `resolvePreviewTenantContext` -> `resolvePreviewWorkforceModule` run as
    three *sequential* Supabase round trips before any data query starts, and
    `.../mame-to-cha/recipes/page.tsx` additionally does an N+1-shaped fetch:
    for every recipe it sequentially awaits a translations lookup then (if it
    has a photo) a Storage `createSignedUrl` call, all inside one
    `Promise.all` across recipes but three round trips deep per recipe. No
    fix attempted yet -- ask the user whether they want this perf work
    scoped next, since it touches shared preview auth/tenant resolution used
    by every route, not just Recipes.
  - Remaining known item from this same bug report, not yet started: other
    pages ("Recipes", "Manager") mentioned by the user as "доведём до финиша
    позже" — no scope defined yet, ask before starting.

## Manager bug-report round (2026-08-01)

User tested `preview.oruwa.jp/mame-to-cha/manager` live and reported six
issues in one message: shift table scroll jank, slow/frozen popups
site-wide (shift-edit Save, staff Delete confirm, Shift Exchange approve),
a staff-delete bug, a recipe-delete permission error, and Inventory writes
silently failing. Ran 5 parallel Explore-agent investigations first (one per
symptom) before touching any code, per the user's "analysis first" request.
All 5 diagnoses were confirmed correct and fixed; see each PR below for the
file:line root cause. Fixes shipped as four separate PRs so each stayed
independently revertable:

- **PR `#167`** (perf, `fix/cafe-v2-1-manager-perf`) — table jank + Save/
  approve latency:
  - `ShiftTable.tsx` was calling `shiftChipColors` with a freshly-allocated
    `shiftTypes.map(...)` id array *inside* the per-cell (staff x date)
    render loop, which filtered that array again internally per cell —
    replaced with a `shiftTypeId -> chip color` `Map` precomputed once per
    table render; component wrapped in `React.memo`.
  - `PreviewShiftGrid` recreated the `staffList`/`assignments`/`shiftTypes`
    arrays passed to `ShiftTable` on every render regardless of whether the
    underlying data changed, defeating the new memo — wrapped each in
    `useMemo`, and `onCellClick` in `useCallback`.
  - `previewUpdateShiftAssignment` (schedule-actions.ts) read the target
    assignment, *then* read staff/shift-type sequentially even though
    neither depends on the other — merged into one `Promise.all`.
  - Manager page's Shift Exchange panel read `listShiftAssignments(supabase,
    tenantId)` with **no date bound at all** (whole tenant history, every
    page render/Save) — bounded it to the same -8..+8 week window the Staff
    page already uses (mirrors the PR `#163` Staff fix).
  - `previewDecideShiftExchange` did a redundant `listShiftExchanges` read
    purely to re-check an exchangeId already re-validated inside
    `decide_workforce_shift_exchange`'s own RPC transaction — removed.
  - Shift Exchange manager panel had zero visible pending feedback beyond
    disabled buttons (and the following `router.refresh()` full-page reload
    was completely invisible) — added a persistent "Updating..." status and
    per-button "Approving.../Rejecting..." labels.
  - Local gate: typecheck/lint PASS, web tests 793/793 PASS (one source-text
    regression test updated to match the equivalent memoized expression,
    same invariant), build PASS. Merged into `dev` as `9972fc19656f2c3b0b1e30de028e692b53917d23`.
- **PR `#168`** (`fix/cafe-v2-1-staff-delete-copy`) — staff "Delete" bug:
  confirmed this is *intended* reversible soft-deactivate (already
  documented above in this file: "reversible Delete actions ... with
  restore paths") — the write path correctly sets `isActive=false`
  (shifts/reports retained, restorable) and the confirm dialog body already
  explains this; the only real bug was the button/dialog *label* still
  saying "Delete"/"削除", setting the wrong expectation that the row would
  vanish. Relabeled to "Deactivate"/"無効化" everywhere (list button, dialog
  title, confirm button), no behavior change. Also dropped
  `ConfirmDialog`'s `backdropFilter: blur(3px)` on its full-viewport overlay
  — opening it is a synchronous state toggle with zero async gating, so the
  "slow to appear" feeling was very likely this blur's paint cost on
  lower-end mobile hardware, not a data fetch. Merged into `dev` as
  `968e2be6f6a86d4c14eb34b6a143cd90c30f831a`.
- **PR `#169`** (DB migration, `fix/cafe-v2-1-recipe-archive-grant`) —
  recipe delete/archive "You do not have permission to do this.": root
  cause was a missing Postgres GRANT, not RLS. `setWorkforceRecipeArchived`
  (`apps/web/src/lib/workforce/recipes.ts`) writes `update({ status })`
  directly against the `api.workforce_recipes` view. Migration `0051`
  granted `insert, update` on the underlying `workforce.recipes` *table*
  (needed by the separate `api.upsert_workforce_recipe` RPC) but never
  granted any `update` on the `api.workforce_recipes` *view* itself beyond
  the narrow `content_kind` column added by `0033` — so this write always
  failed at the Postgres privilege check (42501 insufficient_privilege)
  before RLS was ever evaluated. RLS (`wf_recipes_update`, `0022`) already
  correctly authorizes this write and remains the real authorization
  boundary. Added `supabase/migrations/0053_workforce_recipe_status_grant.sql`
  (`grant update (status) on api.workforce_recipes to authenticated;`), same
  shape as `0033`'s `content_kind` grant. Verified locally first: `supabase
  db reset` applied cleanly through `0053`, pgTAP 628/628 PASS, web tests
  793/793 PASS. Merged into `dev` as `69a5ff86455e8a7f951ba775e6c26cc55a2bf4f7`,
  then **applied to Preview Cloud via `supabase db push`** (explicit user
  approval obtained in-session for this specific Cloud DB write) —
  `supabase migration list` confirms local and remote both at `0053`.
- **PR `#170`** (`fix/cafe-v2-1-inventory-reorder-validation`) — Inventory
  "lost the ability to create/write" (manager-side, not the already-working
  Staff Inventory check): this was **not** a permissions/RLS/allowlist
  regression (all confirmed intact) — `parseUpsertInventoryItemInput`
  (`apps/web/src/lib/inventory/items-input.ts`, unchanged) rejects any
  submission where `reorderPoint > requiredQuantity`, a real intentional
  rule mirrored by the `inventory_items_reorder_point_check` DB constraint
  added in `0046`. Any edit lowering "Required" below the existing "Reorder
  point" (or vice versa) silently failed with the generic "Please check
  your input." message and no specific explanation — indistinguishable from
  a lost permission to a non-technical user. Added the identical check
  client-side in `ItemForm`'s submit handler (`preview-inventory-manager-
  panel.tsx`), shown instantly with a specific message ("Reorder point must
  be less than or equal to Required.") instead of a round trip. Merged into
  `dev` as `a751443fb13c8426c839547302e38982afea4212`.
- **Not yet done**: live authenticated visual/interaction recheck of all
  four fixes on `preview.oruwa.jp/mame-to-cha/manager` (table scroll, edit +
  Save a shift, approve a shift exchange, deactivate a staff member, archive
  a recipe, edit an inventory item's Required below its Reorder point) —
  same local-auth limitation as every prior round, verification relies on
  the live Preview URL. Ask the user to report back per-item if anything
  still looks or feels off.

## Next steps

0. DEFERRED BY USER REQUEST on 2026-08-01 — do not start until asked: fix
   page-to-page navigation latency in the Mame To Cha preview shell
   (`_client-preview/mame-to-cha/*`). User explicitly chose to finish the
   remaining page UI polish (Recipes/Manager "продаваемый вид") first and
   come back to this. Full diagnosis is already written up above under
   "Open question from the user" (search that phrase) — the short version:
   `requirePreviewUser` -> `resolvePreviewTenantContext` ->
   `resolvePreviewWorkforceModule` run as three sequential Supabase round
   trips on every route before any page data loads, and
   `.../mame-to-cha/recipes/page.tsx` additionally does a 2-3-deep sequential
   round trip per recipe (translations lookup, then Storage
   `createSignedUrl`) inside its `Promise.all`. Re-read that section before
   starting so the fix isn't re-derived from scratch.
1. Continue authenticated browser acceptance separately for Manager, Staff, and
   Recipes:
   - header/menu/logout and route boundaries;
   - week navigation and past/future shift behavior;
   - correction pending marker;
   - change/cancel request with required reason and manager decision;
   - Manage Staff full fields;
   - recipe add/edit, photo upload/replace/delete, draft/published display;
   - Inventory at 30 and 100 items;
   - Shift Types and Settings mutation latency;
   - JA/EN help and console/network errors.
2. Re-check the deployed recipe thumbnail/replace/remove controls and confirm
   the Manager week-navigation latency improvement without weakening
   authorization or changing the period used by schedule mutations.
3. Re-test recipe photo upload/replace/delete on Preview, Shift Types mutations, and
   Inventory with 30/100 temporary Preview items; remove temporary data after.
4. Write `docs/product/cafe-package-v2-1-acceptance-report.md` and freeze v2.1.
5. Start the separately reviewed subscription lifecycle/payment foundation;
   production purge execution remains disabled.

## Important boundaries

- Preview Cloud is approved; production customer data and destructive purge
  are not part of this acceptance step.
- Never stage or overwrite these user-owned local files unless separately
  requested:
  - `packages/db/scripts/mame-to-cha-fixture.ts`
  - `packages/db/scripts/mame-to-cha-write.ts`
  - `ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md`
  - `packages/db/src/types.generated.ts`
- Do not claim Cafe v2.1 complete before authenticated Preview acceptance.

## Update rule

After each major gate, update: timestamp, latest commit, completed work,
verification evidence, current step, and next steps. Keep facts concise; do not
paste chat transcripts here.
