# CAFE_PURCHASES_MODULE_HANDOFF (2026-08-24)

Durable handoff for a **fresh** Claude Code session. This file, git, and the
repository's own tests/docs are the source of truth — not any prior chat's
conversational memory. Everything below is VERIFIED against tool output in
the session that wrote this handoff, unless explicitly marked INFERRED or
UNKNOWN (Operating Model §6).

## 1. Repository / git state (VERIFIED)

- Base branch: `dev`. `origin/dev` tip at close of this session: `7689603`
  — `fix(inventory): tighten the purchased icon's corner offset to
  top:1px/right:1px (#436)`.
- **5 PRs merged to `dev` this session, in order: #432, #433, #434, #435,
  #436.** No PR touched `main`; no production deploy.
- **Local Supabase** (`supabase db reset`) and the linked **Supabase Cloud
  dev project** (`pehcoenozjtsjdvjietj`) are both current through migration
  `0089` — confirmed via `supabase migration list --linked` showing
  `0089 | 0089 | 0089` (Local/Remote/Time all present) after the push. No
  other Cloud write happened this session.
- The plan for this mission is saved at
  `C:\Users\User\.claude\plans\oruwa-cafe-swirling-lantern.md` (Claude Code
  plan-mode file, not part of the repo) — the full INSPECT+PLAN this session
  started from, including the Founder's original brief (Russian) and the two
  images referenced in it. Not required reading to continue, but has the
  full original requirements if a design question resurfaces.
- **Stray local branch, safe to ignore/delete:** `feat/purchases-module-ui`
  in this checkout (`d:\Dev\line-business-os`) has an accidental extra merge
  commit (`a15c278`) from a `git pull origin dev` that ran on the wrong
  branch mid-session (a `head -3 | tail` pipe masked a failed `git checkout
  dev`'s exit code, so a chained `&&` proceeded anyway — worth remembering
  as a shell gotcha). Harmless: nothing was lost, the actual PR (#433) had
  already been opened and was merged via GitHub's own merge button before
  this happened. That local branch was abandoned in favor of fresh branches
  cut from `origin/dev` for every subsequent PR. Do not build on it.

## 2. Relevant merged PRs (chronological)

- **#432 — MERGED into `dev` directly by the Founder** (not via
  `scripts/ai-dev-merge.sh` — it touches `supabase/migrations/**`, a RED
  path the script structurally refuses with no override flag; raw `gh pr
  merge` is also denied in `.claude/settings.json`). `feat(purchases):
  schema, RLS, and read/write lib layer for the Purchases module`.
  - New migration `supabase/migrations/0089_purchases_module.sql`:
    - `purchases.purchase_actions` — append-only "marked as bought" event
      log (mirrors `inventory.stock_counts`'s immutability: insert-only
      RLS, no UPDATE/DELETE policy ever).
    - `api.purchases_needed` — the entire read surface. Re-derives the
      exact same shortage rule `api.inventory_item_status` uses
      (`actual_quantity <= reorder_point` ⇒ shortage,
      `greatest(required_quantity - actual_quantity, 0)` ⇒ shortage
      amount), joined with the latest still-valid `purchase_actions` row
      per item to compute `purchase_status: 'pending' | 'bought'`.
    - `api.record_purchase_action` — SECURITY INVOKER RPC. Stamps
      `actioned_by := core.current_user_id()` and resolves
      `snapshot_stock_count_id` (the item's current latest
      `inventory.stock_counts` row) itself — neither is ever a client
      argument. Raises distinguishable errors
      (`purchases_item_not_found` / `purchases_item_never_counted` /
      `purchases_item_not_short`) as a pre-check convenience; RLS
      (`purchases_actions_insert`) remains the actual authorization
      boundary regardless.
    - New permissions `purchases.item.read` / `purchases.action.write`,
      tagged `module = 'inventory'` in `core.permissions` (that column is
      typed `core.module_code`, which has no `'purchases'` value — Founder
      decision this session: Purchases rides the existing `inventory`
      tenant-module flag, no new enum value). Granted to
      owner/admin/manager/employee — unlike Inventory's `item.manage`
      split, every role that can see the list can also act on it.
    - **Also adds `unique (tenant_id, id)` to `inventory.stock_counts`**
      (purely additive — `id` alone was already a PK, this just makes the
      pair usable as an FK target for `purchase_actions`'
      `snapshot_stock_count_id`). No other existing Inventory table/RLS
      touched.
  - `apps/web/src/lib/purchases/` (new): `items.ts`
    (`listPurchasesNeeded`), `mark-bought.ts`/`actions.ts`/
    `mark-bought-input.ts` (the write path, mirrors
    `lib/inventory/count-actions.ts`'s Server-Action→anon-key-RPC pattern
    exactly), `pg-error.ts`, `result-types.ts`, `validation.ts` (each a
    self-contained copy per Inventory's own established "no cross-module
    import" convention, not shared).
  - **New pgTAP suite `supabase/tests/0038_purchases_module.sql`** — 25/25
    green, run against the local stack via `supabase db reset && supabase
    test db`. Covers: permission catalog / role grants, RLS insert-only
    enforcement, cross-tenant isolation, `actioned_by` spoof-proofing, and
    **both staleness scenarios from the Founder's original brief**:
    Scenario A (restocked to sufficiency → item disappears from
    `api.purchases_needed` entirely, old `purchase_actions` row preserved
    in history) and Scenario B (still short after a new count → the prior
    Bought acknowledgement reverts to `pending` with the NEW shortage
    number, re-marking bought afterward creates a second, independent
    history row).
  - Confirmed pre-existing, unrelated pgTAP failures (`0002`, `0006`,
    `0008`, `0012`, `0023`) are present on baseline `dev` too (verified by
    temporarily removing this session's new files and re-running the
    suite) — not caused by this work, not fixed by it either; out of scope.

- **#433 — MERGED into `dev` directly by the Founder** (same RED-path
  reasoning as #432; this PR itself touches no migration, but its base
  branch still carried the migration commit in its own git history at
  merge time, which the guardrail script's naive "files changed in this
  PR" check flags conservatively even though GitHub's own `mergeable`
  computation showed `CLEAN`). `feat(purchases): Staff/Manager popup UI
  wired to the shortage list`.
  - `/purchases` converted from the placeholder page (see
    `project_staff_page_redesign_session` memory / its handoff doc — now
    superseded on this point) into a real popup, following
    `InventoryPopup`/`RecipesPopup`'s exact `_ui/` pattern:
    `apps/web/src/app/(protected)/_ui/purchases-popup.tsx` wraps
    `PurchasesDashboardBody` in the shared `Modal`; `?popup=purchases`
    deep-link parity on both `/staff` and `/manager`; standalone
    `/purchases` now redirects a Manager/Staff caller into their own
    dashboard's popup, exactly like `/inventory` does.
  - New `apps/web/src/app/(protected)/purchases/` module:
    `purchases-dashboard-client.tsx` (list UI — filter tabs
    All/Pending/Bought, one compact row per item), `mark-bought-button.tsx`
    (the "Bought" action — labeled that directly, no intermediate "Buy"
    step, per the Founder's explicit brief annotation), `purchases-i18n.ts`
    (ja/en dictionary), `error-copy.ts`, `purchases-footer.module.css`.
  - "Need to buy: N unit" is shown prominently; "Reorder at / Target" as
    secondary muted text — replaces the reference mockup's raw Min/Max with
    the real Inventory terms, per the Founder's own annotation on the
    brief. **No catalog editing anywhere in this module** —
    `required_quantity`/`reorder_point` stay Inventory-only.
  - The row's action cell renders purely off the server-computed
    `item.purchaseStatus` — no local "I just marked this bought" component
    state — so a staleness revert (server-side, see #432) is reflected
    automatically on the next `router.refresh()`, no special-casing in the
    UI layer.
  - **Manager dashboard gains a Purchases entry-point button** (previously
    Staff-only per the earlier placeholder session) — Founder decision
    this session (`AskUserQuestion`, both this and the module-gating
    question were answered "Recommended").
  - "Bought by" (manager-only real staff name) mirrors Inventory's own
    `inventoryCanManage`-gated `staffNameById` convention exactly.

- **#434 — MERGED autonomously via `scripts/ai-dev-merge.sh` (no migration
  touched, this branch was cut fresh from `origin/dev` after #432/#433
  landed).** `fix(inventory): mobile card shortage layout + purchased
  reminder icon`. Two live-Preview-driven fixes to Inventory's mobile
  `ItemCard` (`inventory-dashboard-client.tsx`), found via Founder
  screenshots on `preview.oruwa.jp/staff`:
  1. The shortage quantity (e.g. "−196 pcs") now renders stacked directly
     below the status badge, right-aligned — the mobile card previously
     showed no shortage number at all (only the desktop table's dedicated
     column did).
  2. **New 🛒 "purchased, needs recount" reminder icon** on any Inventory
     item currently `purchase_status = 'bought'` in Purchases (both mobile
     card and desktop table). Threaded through as
     `InventoryDashboardClientProps.boughtItemIds` — derived from
     `purchasesItems` the Staff/Manager dashboards already fetch for their
     own Purchases popup (no second query on those two surfaces); the
     standalone `/inventory` page gained one new small `listPurchasesNeeded`
     read, gated the same way `inventoryEnabled` already gates that page.
     **The icon clears itself automatically** — it is not a stored flag,
     just a live read of `api.purchases_needed`'s `purchase_status`; the
     moment *any* new stock count is recorded for that item (the existing
     `CountForm` already on the same row/card), the Purchases
     acknowledgement goes stale server-side and the item stops appearing in
     the bought-ids list on the next `router.refresh()`. No separate
     "clear" action exists or was added.

- **#435 — MERGED autonomously.** `fix(inventory): move the purchased
  reminder icon to the card's top-right corner`. Founder live-Preview
  follow-up: moved the 🛒 icon from inline-in-the-badge-row to an
  absolute-positioned overlap of the mobile card's top-right corner
  (`top: -10, right: -10` at this point), matching a position the Founder
  demonstrated live via Chrome devtools on the running Preview page.

- **#436 — MERGED autonomously.** `fix(inventory): tighten the purchased
  icon's corner offset to top:1px/right:1px`. Second Founder devtools
  iteration on the same icon: tightened the offset from overlapping the
  border to sitting just inside it (`top: 1, right: 1`). **This is the
  final, currently-live offset** — if a future session is asked to move
  this icon again, start from `top: 1, right: 1` in `ItemCard`
  (`inventory-dashboard-client.tsx`), not from the earlier `-10/-10` value.

## 3. Verified results

- **Local + Cloud dev schema verified consistent** (§1). Migration `0089`
  is the only new migration this session; no existing migration file was
  edited.
- **pgTAP**: `supabase/tests/0038_purchases_module.sql` 25/25 green,
  including both Scenario A/B staleness assertions from the brief.
- **Web build discipline** on every one of the 5 PRs: `npx tsc --noEmit`
  clean, `npx eslint` clean on every touched/new file, `npx next build`
  clean. `npm test` (full 1218-test vitest suite) re-verified green after
  #432/#433 (no new `*.test.ts` files were added this session for the
  `lib/purchases/*` layer — see §6 below for why that's an open item, not
  an oversight already closed).
- **Live Founder QA on `preview.oruwa.jp/staff`, mobile viewport** (their
  own screenshots, not this agent's browser session) drove 3 of the 5 PRs
  (#434/#435/#436) and surfaced one real deployment gap:
  - **Root cause found and fixed mid-session**: Purchases initially showed
    "temporarily unavailable" on Preview even though local
    tsc/eslint/build/tests were all clean and #432/#433 were merged. Cause:
    migration `0089` had only ever been applied to the **local** Supabase
    stack (per the local-first / no-autonomous-Cloud-write rule) — Preview
    connects to the **Cloud dev project**, which didn't have
    `purchases.*`/`api.purchases_needed`/`api.record_purchase_action` yet.
    Fixed via `supabase db push --linked` after explicit Founder approval
    (`AskUserQuestion`, confirmed "Да, примени миграцию"). **This is a
    reusable lesson**: merging a migration-touching PR into `dev` does
    *not* by itself make that schema available on Preview — a separate
    Cloud `db push` (with its own approval) is required, and the "is
    Purchases actually visible on Preview" check should specifically probe
    this instead of assuming a green PR is sufficient.
  - After the Cloud push, the Founder confirmed Inventory's shortage list
    and the Purchases popup's basic shopping-list rendering worked (their
    own screenshot showed a populated Purchases list with real shortage
    items and working filter tabs before the two icon-placement rounds
    began).

## 4. Known defects / open issues

None found or left open in the *reviewed* surfaces. See §6 for surfaces
that were **not** independently verified this session (not defects, just
unverified).

## 5. Relevant existing documentation

- `supabase/migrations/0046_inventory_reorder_levels.sql`,
  `0085_inventory_item_media.sql` — the exact Inventory shortage-formula
  precedent Purchases' `api.purchases_needed` deliberately re-derives
  rather than reusing a shared helper (no raw `stock_counts.id` was
  available through `api.inventory_item_status` to build the staleness
  check on, see #432's migration header comment for the full reasoning).
- `apps/web/src/app/(protected)/_ui/inventory-popup.tsx`,
  `recipes-popup.tsx` — the shared-popup pattern `purchases-popup.tsx` now
  mirrors exactly. Read these first if extending any popup's shell
  behavior so all three stay consistent.
- `apps/web/src/app/(protected)/inventory/inventory-dashboard-client.tsx`
  — now also the file that renders the 🛒 purchased-icon and the mobile
  card's shortage-amount line; any future Inventory *or* cross-module
  Purchases-signal UI change likely touches this file.
- `docs/ai/CAFE_STAFF_PAGE_REDESIGN_HANDOFF_2026-08-24.md` §3 — records
  the *prior* session's decision to add a Purchases placeholder button
  ahead of the real module. That decision is now fully superseded: the
  real module exists, is live on `dev`/Preview, and Manager also has the
  button now (that prior handoff explicitly flagged "Manager's entry-point
  row does not have a Purchases button" as open — now closed).
- `scripts/ai-dev-merge.sh` — confirmed this session to have **no override
  path** for a RED-path PR, by design (structural, not a missing flag).
  `.claude/settings.json` denies raw `gh pr merge*` outright. A PR touching
  `supabase/migrations/**` — or whose branch history still contains such a
  commit even after a real content-level rebase, per #433's case — must be
  merged directly by the Founder (GitHub UI or their own `gh pr merge`),
  every time, no exception discovered this session.

## 6. State believed relevant but not fully verified

- **No live browser QA of the Purchases popup by this agent** — every
  round of verification this session was either automated
  (tsc/eslint/build/pgTAP/vitest) or the Founder's own screenshots on
  Preview. The Founder's screenshots covered: Staff's Inventory popup
  (mobile, multiple rounds) and Staff's Purchases popup (mobile, one
  screenshot showing a populated, correctly-filtered list). **Not
  independently confirmed live**: Manager's Purchases popup (button was
  added, code reviewed, but no screenshot or agent browser session
  touched it), desktop-width Purchases popup for either role, and the full
  end-to-end Bought→recount→disappear-or-revert user flow *live* (the
  underlying logic is pgTAP-verified against real Postgres, but never
  driven through the actual UI by a human or an agent this session).
- **No new `*.test.ts` unit tests for `lib/purchases/*`** — the read/write
  helper layer mirrors `lib/inventory/*`'s already-tested shape 1:1, and
  the full business logic (staleness, RLS, shortage math) is covered by
  the new pgTAP suite, but the thin TS mapping/error-classification layer
  itself (`items.ts`'s row mapper, `pg-error.ts`'s message matching) has
  no unit test the way `lib/inventory/stock-count-input.test.ts` etc. do
  for the equivalent Inventory code. Not a known bug, just an untested
  layer — worth adding if this module gets touched again.
- **`packages/core/src/permissions.ts`** (the TS mirror of the DB
  permission catalog) was **not** updated to add `purchases.*` — this file
  was already out of sync before this session (missing every
  `inventory.*` key too, confirmed by an earlier inspection agent this
  session) and is not read by any runtime path currently exercised by
  Purchases (`hasInventoryPermission`-equivalent checks call `api.has_permission`
  directly with a raw string, not through this file's `PermissionKey`
  union). Cosmetic/documentation drift, pre-existing, not fixed here —
  flagged for whoever eventually reconciles it, not blocking.

## 7. Architecture / security constraints (binding)

- **Bought is never a permanent status and never mutates Inventory.**
  `purchases.purchase_actions` is append-only; `api.purchases_needed`
  computes "is this row currently Bought" fresh on every read by comparing
  `snapshot_stock_count_id` against the item's live latest
  `inventory.stock_counts` row. Do not add a stored `is_bought` boolean
  column to `inventory.items` or any denormalized cache of this — that
  would reintroduce exactly the drift risk the Founder's original brief
  explicitly warned against ("Purchases должен быть projection/workflow
  поверх Inventory... нельзя допустить второй source of truth").
- **Module gating rides `core.tenant_modules = 'inventory'`, on purpose,
  Founder-confirmed.** If Purchases is ever spun out as a genuinely
  separate billable product ("ORUWA Buy", per the brief's own §17), that
  requires a *new* migration adding a `core.module_code` enum value (enum
  `ADD VALUE` cannot be used in the same transaction it's added in — plan
  a two-step migration if this ever happens) plus updating every
  `inventoryEnabled ? ... : Promise.resolve(null)` gate across
  `staff/page.tsx`/`manager/page.tsx`/`purchases/page.tsx` to its own flag.
  Not authorized or scheduled — just documented as the known future seam.
- **`purchases.item.read`/`purchases.action.write` are tagged
  `module = 'inventory'`** in `core.permissions` (not a `'purchases'`
  value — that enum value doesn't exist, see #432 above). This is
  intentional, not a bug, for the same module-gating reason.
- No `service_role` anywhere in this module's frontend path — every
  `lib/purchases/*` write goes through the anon-key/session-bound Supabase
  client + `security invoker` RPC, matching every other module in this
  codebase. RLS (`purchases_actions_insert`) is the real authorization
  boundary, exactly as documented in the RPC's own SQL comment.

## 8. Explicit prohibitions for the next session

- Do not re-derive or "simplify" the staleness check by adding a stored
  boolean/timestamp on `inventory.items` — see §7.
- Do not assume a migration merged into `dev` is live on Preview without
  separately checking `supabase migration list --linked` (or just asking)
  — see §3's root-cause note. This bit the Founder's very first live check
  this session and is worth not repeating.
- Do not attempt to route around `scripts/ai-dev-merge.sh`'s RED-path
  block for a future migration-touching PR (e.g. by editing the script, or
  finding another `gh`/`git` incantation) — it is intentionally structural.
  Ask the Founder to merge it directly, same as #432/#433 this session.
- Do not move the 🛒 purchased-icon's position again without checking
  current live Preview state first — it moved 3 times in this session
  alone (inline → -10/-10 overlap → 1/1 tucked-in) and the *very last*
  Founder message before this handoff was written was "отлично" (great) on
  the `1px/1px` version, i.e. **that placement is Founder-accepted, not
  mid-iteration** — treat it as settled unless told otherwise.

## 9. New workstream — full objective

None defined for a *next* session. This handoff closes a complete,
Founder-directed feature build (Purchases module: DB schema through UI,
end to end, single session) that the Founder ended with "отлично"
("great") and "подготовь к переходу в новый чат" (prepare for handoff to a
new chat) — an explicit, satisfied close, not a paused mid-thread (compare
to `project_staff_page_redesign_session`'s "paused, not Founder-closed"
posture). **The next session should ask the Founder what to work on next**
rather than assume continuation of Purchases polish, Inventory work, or
any other thread.

## 10. Required deliverable

None — no open deliverable from this thread. §6's untested-layer and
unverified-surfaces notes are informational for risk awareness, not a
todo list this closure is blocked on.

## 11. Mission-specific approval boundaries / deviations

- Local Supabase Cloud `db push` was explicitly Founder-approved
  (`AskUserQuestion`, this session) for migration `0089` specifically —
  not a standing grant. Any future migration still needs its own fresh
  approval before a Cloud push, per `AGENTS.md`/`feedback_db_migration_approval`
  memory's existing scoping rule.
- PR #432 and #433 (RED-path / RED-adjacent) were merged by the **Founder
  directly**, not this agent — per the standing rule that
  `scripts/ai-dev-merge.sh` structurally refuses these and no override
  exists. PR #434/#435/#436 (pure UI, no migration in their own diff) were
  merged **autonomously** by this agent via the script, consistent with
  the existing DEV MERGE authority (no new deviation).
- The two `AskUserQuestion` decisions from the planning phase (module
  gating rides `'inventory'`; Manager also gets a Purchases button) were
  both answered "Recommended" — durable product decisions for this module,
  not one-off approvals; see §7 for the module-gating one specifically.

## 12. What must NOT be accidentally modified

Nothing specific beyond the standing repo-wide rules in `CLAUDE.md` /
`AGENTS.md` (no `service_role` exposure, no unapproved Cloud writes/prod
deploys, no customer-data/billing/LINE-broadcast changes without explicit
approval). No specific record, tenant, or branch needs special protection
from this thread's work. The stray `feat/purchases-module-ui` local branch
(§1) can be deleted by a future session if noticed — it carries no unique
content, everything in it is already in `dev` via #433.

---

No secrets, passwords, tokens, or service_role values are recorded anywhere
in this handoff.
