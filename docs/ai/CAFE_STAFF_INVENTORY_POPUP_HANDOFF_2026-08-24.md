# CAFE_STAFF_INVENTORY_POPUP_HANDOFF (2026-08-24)

Durable handoff for a **fresh** Claude Code session. This file, git, and the
repository's own tests/docs are the source of truth — not any prior chat's
conversational memory. Everything below is VERIFIED against tool output in
the session that wrote this handoff, unless explicitly marked INFERRED or
UNKNOWN (Operating Model §6).

## 1. Repository / git state (VERIFIED)

- Base branch: `dev`. `origin/dev` tip at close of this session:
  `3d27b7e` — `fix(inventory): mobile popup polish -- footer/status-line/
  bottom-sheet spacing (#430)`.
- This repo's working copy (`d:\Dev\line-business-os`) was left in
  **detached HEAD at `origin/dev`'s tip**, working tree clean, no
  uncommitted changes. (Local branch name `dev` is already taken by a
  separate worktree at `D:/Dev/line-business-os-founder-audit` — do not
  create a second local branch literally named `dev` in this checkout; cut
  any new work from `origin/dev` under a new branch name instead, same
  pattern this session used.)
- Session-scoped branches created and used this session were all deleted
  (locally and on `origin`) after merge, as part of this handoff's cleanup:
  `feat/staff-inventory-popup` (superseded, closed unmerged — see §2),
  `feat/staff-inventory-popup-v2` (merged as #429), `feat/staff-inventory-
  popup-polish` (merged as #430). The prior session's own handoff branch,
  `docs/staff-session-handoff-2026-08-24` (PR #418, already merged), was
  also deleted this session as routine cleanup — its content is fully in
  `dev`.
- No DB migrations this session. No `service_role`/secret material touched.

## 2. Relevant merged/open PRs

- **#428 — CLOSED, unmerged (superseded).** First attempt at this feature,
  built against a `dev` tip that moved out from under it mid-session (the
  Staff-page redesign — Recipes popup, Purchases entry, layout changes —
  landed on `dev` while this branch was in flight, producing a real merge
  conflict, not a false one). Closed with a comment pointing to #429;
  historical only, no code from it survives independently (superseded by
  #429's from-scratch rebuild).
- **#429 — MERGED into `dev`.** `feat(staff): Inventory as a popup,
  matching Manager's and Staff Recipes' pattern`. Rebuilt from scratch
  against current `dev` after #428's conflict. Changes:
  - `InventoryPopup` moved from `manager/inventory-popup.tsx` to
    `_ui/inventory-popup.tsx` (mirrors `RecipesPopup`'s own earlier move to
    `_ui/`) and is now reused as-is by both Manager's and Staff's dashboard
    clients, instead of Staff having a full-page `/inventory` link.
    `canManage` is now an explicit prop on `InventoryPopup` (was hardcoded
    `true`) — Manager's call site passes `canManage` (shorthand for
    `true`, unchanged behavior); Staff's passes the real
    `hasInventoryPermission(..., 'inventory.item.manage', ...)` result.
  - `staff/page.tsx` fetches `inventoryCanManage` / `inventoryMediaUrlByItemId`
    / `inventoryStaffNameById` (same pattern `/inventory/page.tsx` already
    used for Manager) and parses `?popup=inventory`; `/inventory/page.tsx`
    now also redirects a staff-profile caller straight to
    `/staff?popup=inventory`, mirroring its existing manager redirect to
    `/manager?popup=inventory`.
  - `inventory-dashboard-client.tsx` (shared by Manager popup, Staff popup,
    and the standalone `/inventory` page — one component, three call
    sites): the "Deactivated" filter tab is now gated by `canManage` (was
    unconditionally shown to everyone before — a real gap this closed, not
    just a Staff-specific hide). Filter buttons (All/Need reorder/OK/
    Deactivated) now fill their row edge-to-edge in equal-width flex
    segments instead of shrink-wrapping to their labels. `ItemCard`'s
    layout changed: the Target/Reorder-at/Current info line now spans the
    full card width (previously squeezed into a column beside the
    thumbnail, wrapping awkwardly on narrow screens) with the
    status-badge/edit/actions row above it instead of beside it.
  - `count-form.tsx`: the quantity input is now a fixed 90px wide instead
    of `flex: 1` (which stretched it to fill the whole card width) — the
    unit-suffix span now sits directly against it instead of far to the
    right.
- **#430 — MERGED into `dev`.** `fix(inventory): mobile popup polish --
  footer/status-line/bottom-sheet spacing`. Founder live-QA follow-up on
  #429's Preview deployment, same session:
  - The footer summary card (`X Total items` / `Y Need restocking` /
    `Z Sufficient` + an autosave tip line) duplicated the filter tabs'
    own counts on mobile, where the tabs sit immediately above it — now
    hidden under 768px via a new `inventory-footer.module.css`
    (`display:flex` desktop / `display:none` ≤767px), unchanged on
    desktop. The tip text itself (was `footerTip` i18n key, still exists,
    still rendered on desktop) was additionally folded into the popup's
    own `popupHelpBody` ("?" help dialog) JA/EN strings so mobile users
    don't lose that information entirely.
  - `count-form.tsx`: the saving/saved/error status text now renders in
    the same row as the input (to its right) instead of stacked on its
    own line below it — shorter card height.
  - `components/shared/design-kit/Modal.tsx`: the shared mobile
    bottom-sheet overlay now has a `padding-bottom: 2px` (mobile only,
    `!important` to beat the panel's own inline sizing) instead of sitting
    perfectly flush against the screen's bottom edge. **This is the one
    change in this session that is not Inventory-specific** — `Modal` is
    the shared design-kit shell used by every popup in the app (Recipes,
    Manage Staff, Shift-cell editors, etc.), so this 2px gap now applies
    everywhere, not just the Inventory popup. Low-risk (2px, cosmetic),
    but worth knowing if a future visual diff shows an unexpected 2px
    shift on some other popup's mobile bottom edge — it's this change, not
    a regression.
- Both #429 and #430 passed `tsc --noEmit`, `eslint`, `next build`, and the
  full `npm test` suite (1218/1218) before merge, merged via
  `scripts/ai-dev-merge.sh` (mechanical gates: base=dev, OPEN, MERGEABLE,
  all CI checks pass, no RED-operation paths touched) with explicit
  Founder go-ahead for each ("мержи я буду проверять после мержа" /
  same instruction implicitly continued for #430).

## 3. Verified results (CLOSED — do not reopen without new evidence)

- **Founder confirmed the Inventory popup live on `preview.oruwa.jp/staff`
  is working well**, across three checkpoints in this session: after #429
  merged ("попап Inventory все отлично" + two specific polish asks — the
  footer duplication and the status-line/input-row layout, both closed by
  #430), and a final "отлично молодец" after #430 merged. Treat the
  Staff-Inventory-popup feature as **Founder-accepted and closed** for
  this scope; do not re-open or "improve" it further without a fresh,
  specific Founder ask.
- Lightbox-on-photo-thumbnail (click a mini-photo → large photo overlay)
  was **already implemented** before this session (PR #417, "matching the
  Recipes photo feature") and required no changes here — confirmed by
  reading `components/shared/design-kit/Lightbox.tsx` and its existing
  wiring in `inventory-dashboard-client.tsx`'s `ItemThumbnail`. Do not
  re-implement it if a future request mentions "add a lightbox to
  Inventory photos" — check whether it's actually about something else
  first (e.g. sizing/positioning), since the base feature already exists.

## 4. Known defects / open issues

None found or left open by this session. No regressions detected in
`tsc`/`eslint`/`next build`/`npm test` across either PR.

## 5. Relevant existing documentation

- `docs/ai/CAFE_STAFF_PAGE_REDESIGN_HANDOFF_2026-08-24.md` — the
  **immediately preceding** session's handoff (merged via PR #418, `dev`
  tip `45cb50d` before this session's work started). Explains the current
  Staff-page structure this session built on top of: the `EntryPointsCard`
  Recipes/Inventory/Purchases row, the `RecipesPopup` move to `_ui/`
  (this session's `InventoryPopup` move directly mirrors that precedent),
  and why several older sections (My staff profile, shift-preferences,
  work-reports, correction-requests) are no longer rendered on
  `staff-dashboard-client.tsx` (deferred to a future "the table" redesign,
  not deleted from the codebase — check before assuming they're gone for
  good). Re-verify currency before citing — written before this session's
  #429/#430.
- `apps/web/src/app/(protected)/_ui/recipes-popup.tsx` — the shared-popup
  pattern `InventoryPopup` now mirrors exactly (list+detail-in-one-Modal
  for Recipes; single-view-in-one-Modal for Inventory). Read this first if
  extending either popup's shell behavior, so both stay consistent.
- `apps/web/src/app/(protected)/inventory/inventory-dashboard-client.tsx`
  — the one shared component behind all three Inventory entry points
  (Manager popup, Staff popup, standalone `/inventory` page for anyone
  with inventory access but no staff/manager profile). Any future
  Inventory UI change should go here, not be duplicated per-caller.

## 6. State believed relevant but not fully verified

- **Manager's own Inventory popup was not independently re-verified live
  this session** (only Staff's was, per the Founder's own QA screenshots).
  The Manager-side code change was minimal — an import-path change
  (`./inventory-popup` → `../_ui/inventory-popup`) and one explicit
  `canManage` prop (`canManage` shorthand for `true`, functionally
  identical to the prior hardcoded `canManage`) — and `tsc`/`eslint`/
  `next build`/`npm test` all passed with no Manager-specific test
  failures, but a live Preview check on `preview.oruwa.jp/manager` →
  Inventory popup was **not performed**. TO VERIFY if anything about the
  Manager Inventory popup is reported as broken.
- The `footerTip` i18n key still exists and is still rendered on desktop
  (the footer card itself is only hidden ≤767px) — this session did not
  verify live on an actual desktop-width Preview viewport that the footer
  still renders correctly there (verified only via code reading + the
  responsive CSS module's stated breakpoint, not a live screenshot at
  ≥768px). TO VERIFY if a future session touches this area.

## 7. Architecture / security constraints (binding)

- `canManage` (on `InventoryDashboardClientProps`, `InventoryPopupProps`,
  and now threaded through `StaffDashboardClientProps` as
  `inventoryCanManage`) is a **pure UX affordance** — it gates which
  controls render, nothing more. The real authorization boundary is RLS
  on `api.inventory_*` views plus the `hasInventoryPermission(...,
  'inventory.item.manage', ...)` RPC check itself; this was true before
  this session and is unchanged by it. Do not treat a client-side
  `canManage={false}` as a security control on its own.
- No new DB migration, no RLS change, no new permission key — this
  session was UI/routing-layer only (popup shell, one component's layout,
  one shared component's cosmetic CSS, i18n string additions).

## 8. Explicit prohibitions for the next session

- Do not restart or "polish further" the Staff Inventory popup without a
  new, specific Founder ask — see §3, this is Founder-closed.
- Do not assume the 2px `Modal` bottom-sheet gap (§2, #430) was requested
  for any popup other than as a general shared-shell cosmetic fix; it was
  not scoped narrowly to Inventory by the Founder, but also was not an
  explicit "apply this everywhere" request — it followed naturally from
  editing the one shared `Modal` component. If it turns out to look wrong
  on some other popup, that's a legitimate follow-up bug, not a
  contradiction of this session's intent.

## 9. New workstream — full objective

None defined. This handoff closes a bounded, Founder-accepted feature
(Staff Inventory popup + mobile polish). **The next session should ask the
Founder what to work on next** rather than assume continuation of Staff-page
work, Manager work, or any other thread — consistent with how every prior
same-day pointer in `docs/ai/current-task.md` §5 has handled this.

## 10. Required deliverable

None — no open deliverable from this thread.

## 11. Mission-specific approval boundaries / deviations

- Founder granted an explicit **merge-now, QA-after** instruction for both
  #429 and #430 in this session ("мержи я буду проверять после мержа") —
  this is a same-session, same-thread instruction, not a standing
  deviation from the normal "green checks + live Preview QA before merge"
  rule recorded in memory (`feedback_merge_authority`). Do not treat it as
  blanket authorization to merge future UI PRs before Preview QA without
  the Founder saying so again for that specific PR/thread.
- PR #428 → #429 was closed and reopened as a fresh branch/PR (not
  force-pushed) specifically to avoid discarding another session's
  concurrent `dev` work — see §1/§2. This is the correct pattern to repeat
  if a future PR's base moves out from under it mid-session: never force
  the old branch to overwrite what landed on `dev` in the meantime;
  rebuild fresh from the new `dev` tip instead.

## 12. What must NOT be accidentally modified

Nothing specific beyond the standing repo-wide rules in `CLAUDE.md` /
`AGENTS.md` (no `service_role` exposure, no unapproved Cloud writes/prod
deploys, no customer-data/billing/LINE-broadcast changes without explicit
approval). No specific record, tenant, or branch needs special protection
from this thread's work.

---

No secrets, passwords, tokens, or service_role values are recorded anywhere
in this handoff.
