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

- branch: `dev` (menu/inventory branch merged and can be deleted)
- merged PRs: `#158`, `#159`, `#160`, `#161`, `#162`, `#163`, `#164`
- latest confirmed `dev` merge commit: `d8b7b7b7dbad12e4d86cf3d7200a1fba14135d4f` (PR `#164`)
- base: `dev`
- stage: OAES QA / Preview release gate — mobile UI polish round

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
  - Not yet done: live authenticated visual recheck on
    `preview.oruwa.jp/mame-to-cha` (mobile width, menu open, Inventory modal
    open with a shortage item). Full local screenshot verification was not
    possible in-session because the preview routes require an authenticated
    Supabase session with no local dev-login bypass; verification relies on
    the live Preview URL as in prior rounds — ask the user to check and report
    back if anything still looks off before closing this item.
  - Remaining known item from this same bug report, not yet started: other
    pages ("Recipes", "Manager") mentioned by the user as "доведём до финиша
    позже" — no scope defined yet, ask before starting.

## Next steps

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
