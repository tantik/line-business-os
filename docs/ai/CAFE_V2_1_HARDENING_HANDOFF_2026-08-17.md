# CAFE_V2_1_HARDENING_HANDOFF (2026-08-17)

Durable handoff for a **fresh** Claude Code session continuing this
workstream. This file, git, and the repository's own tests/docs are the
source of truth — not any prior chat's conversational memory. Everything
below is VERIFIED against tool output in the session that wrote this
handoff, unless explicitly marked INFERRED or UNKNOWN.

---

## 1. What this workstream is

Founder-directed mission (2026-08-17, superseding the "proceed to Platform
Foundation next" direction recorded in `docs/ai/current-task.md` §5 as of
that date — re-check that file's current content, don't assume it's still
current): bring ORUWA Cafe v2.1 to visual and functional parity with the
old **Mame To Cha** reference prototype, without regressing the canonical
architecture (real Supabase/RLS backend, tenant/location isolation,
role-based access). Full brief and acceptance criteria are in the original
Founder mission message (not a file — was pasted directly into chat); the
independent QA report that seeded the punch list is:

- `ORUWA_CAFE_V2_1_FINAL_INDEPENDENT_QA_2026-08-17.md` (repo root, still
  **untracked** — do not delete, it's the working reference for this
  mission, not disposable).
- `ORUWA_CAFE_V2_1_FULL_QA_AUDIT_2026-08-17.md` (repo root, also untracked,
  a companion/earlier audit — same rule).

Reference prototypes (visual/UX only, not a code source):
`https://preview.oruwa.jp/mame-to-cha/manager`,
`https://preview.oruwa.jp/mame-to-cha/`, `https://preview.oruwa.jp/mame-to-cha/recipes`.
Canonical implementation: `https://preview.oruwa.jp/manager`, `/staff`,
`/recipes`, `/inventory`.

Test accounts (Preview, tenant "Mame To Cha" — same DB the QA report used):
`manager@mame-to-cha.test`, `staff@mame-to-cha.test`,
`staff2@mame-to-cha.test`, password `LocalSmoke123!` for all three.
**This is a live, shared Preview DB with other people's disposable QA
fixtures already in it** (shift types named `QA-...`, staff rows like
`1111`/`222`/`55`/`eeee`/`wwww` etc.) — do not "clean up" pre-existing junk
that isn't yours; only clean up fixtures you personally create this
session.

Standing authority already granted by the Founder (see project memory, not
repeated here): commit/push/PR/merge for routine work without asking each
time; still hard-gate real risk (migrations against Cloud, prod deploys,
RLS changes, secrets, customer data/billing/LINE broadcast — see
`CLAUDE.md`'s four highest-risk constraints, unchanged by this mission).
Live Preview DB writes (creating/deleting disposable fixtures) were
explicitly confirmed in-scope for this mission by the Founder.

---

## 2. Repository / git state (VERIFIED)

- Repo: `D:\Dev\line-business-os`.
- Base branch: `dev`. `origin/dev` HEAD at handoff time: `cc9baa1` (merge of
  PR #288).
- Current local branch at handoff time: `fix/cafe-v21-wp-g-unavailable-conflict`
  (already merged as PR #288 — safe to delete or ignore; start any new work
  from a **fresh branch off `origin/dev`**, e.g.
  `git checkout -b fix/cafe-v21-wp-<next>-<slug> origin/dev`).
- Working tree at handoff time: clean except the two untracked QA report
  `.md` files listed in §1 above (not staged, not part of any merged PR).
- Merged this session, in order, all via `gh pr merge --merge --delete-branch`
  onto `dev`, each independently typecheck/lint/test/build green **and**
  live-Preview-QA verified before merge:
  - PR #285 — canonical `/recipes`/`/inventory` routes + Sign out
    everywhere (WP-B).
  - PR #286 — Shift Cell Editor focus restore on close (WP-C).
  - PR #287 — Staff sees their own real display name (WP-E, P2-7).
  - PR #288 — Manager warned of shift/Unavailable conflicts (WP-G, P2-10).
- A local worktree at `D:/Dev/line-business-os-founder-audit` also has
  `dev` checked out — this blocks plain `git checkout dev` (fails with
  "'dev' is already used by worktree"); use `git fetch origin dev` +
  branch off `origin/dev` instead, don't fight the worktree lock.

---

## 3. What is DONE and VERIFIED (do not re-do, do not re-litigate without new evidence)

Each item below was reproduced or fixed **live** on an authenticated Preview
deployment this session, not just by reading code or trusting the original
QA report.

1. **P1 — Recipe `Delete forever`**: independently re-attempted the exact
   QA repro (create → translate → archive → Delete forever, twice, once
   plain and once with EN-original + translated ingredients/steps) on
   `preview.oruwa.jp` against real Manager/Mame-To-Cha data. **Not
   reproducible** — both deletions completed cleanly, list/detail correctly
   show the recipe gone afterward (`Not found` on direct URL), zero console
   errors. **No code change was made or needed.** Either the QA report
   caught a transient/deploy-timing issue, or a prior PR already fixed it.
   Do not re-open this without a fresh, specific repro.
2. **P2-1 / P2-8 — canonical routes** (PR #285): `/recipes`,
   `/recipes/[recipeId]`, `/inventory` are now real top-level routes
   (moved from `/dashboard/workforce/recipes/**` and
   `/dashboard/inventory/**`, matching the existing `/manager`/`/staff`
   pattern from PR #246). Old paths now 302-redirect. Confirmed live:
   `/recipes` and `/inventory` load correctly for Manager and Staff; old
   paths redirect; role-aware Back link (`/manager` vs `/staff`).
3. **P2-6 — Sign out everywhere** (PR #285): `SignOutButton` added to
   Recipes list, Recipe detail, and Inventory pages. Confirmed live.
4. Manager/Staff dashboards previously had **zero link to Recipes** and
   Inventory's only link pointed at the old technical path — both fixed
   (PR #285), confirmed live (レシピ/在庫 nav links visible and working on
   both `/manager` and `/staff`).
5. **P2-4 — Shift Cell Editor focus restore** (PR #286): confirmed via live
   keyboard-only repro that **Add Staff's focus restore already worked**
   (the QA report's claim there was not reproducible — do not re-fix it).
   The Shift Cell Editor's was genuinely broken (Escape → focus landed on
   `<body>`); fixed with the same `closeXxxForm`-with-ref-map pattern the
   Add/Edit Staff forms already used; confirmed live post-fix (focus
   correctly returns to the Assign/Edit button).
6. **P2-7 — Staff sees their own name** (PR #287): root cause was that
   `api.workforce_my_staff_profile` deliberately carries no name, while a
   **separate, already-existing, unused** schema object —
   `api.workforce_staff_roster` (migration `0061`, real decrypted names,
   RLS-scoped to self + active coworkers in the caller's own
   tenant/location schedule scope) — had zero frontend callers anywhere in
   `apps/web` (confirmed by grep before starting). Added
   `listWorkforceStaffRoster()` (`apps/web/src/lib/workforce/employees.ts`)
   and wired it into `/staff`: header ("スタッフ — {name} さん" / "Staff —
   {name}"), profile card Name row, and the coworker schedule grid (real
   names instead of synthesized "Staff N"/"スタッフ N" placeholders).
   Confirmed live for both `staff@mame-to-cha.test` (田中 愛) and
   `staff2@mame-to-cha.test` (佐藤 健) — distinct real names, correct role
   isolation, zero console errors.
7. **P2-10 — Unavailable/shift conflict warning** (PR #288): added
   `computeUnavailableConflictCellKeys` (pure, from data the Manager
   dashboard already loads — no new query/schema change) and a new
   `unavailable_conflict` Attention category (ordered after
   correction/exchange, before inventory) plus a "⚠ Unavailable"/"⚠ 不可"
   badge directly on any conflicting schedule cell. **Fully live-tested
   end-to-end this session**: signed in as `staff2@mame-to-cha.test`,
   submitted a real Unavailable preference for 2026-08-20, signed in as
   Manager, assigned 佐藤健 a shift on that same date, confirmed both the
   Attention-panel line and the cell badge appeared, then **cleaned up the
   test shift assignment** (unassigned it) — the Unavailable preference
   *request* itself was deliberately left in place as a harmless disposable
   fixture, same as the many pre-existing QA fixtures already in this
   tenant (see §1).

All four merged PRs individually passed `pnpm --filter web typecheck`,
`pnpm --filter web lint`, `pnpm --filter web test` (1095–1101/1101,
varying slightly by branch base — always 0 fail), and
`pnpm --filter web build` before merge.

---

## 3a. Mobile-redesign progress (this continuation session, still 2026-08-17)

Parity audit performed live at 375px (chrome-devtools MCP, mobile viewport
emulation `375x812x2,mobile,touch` — plain window resize does **not**
change `window.innerWidth`/CSS media-query results on this Windows/Chrome
setup, only `emulate({viewport: ...})` does; don't rely on `resize_page`
alone for mobile QA) against the canonical `/manager` signed in as
`manager@mame-to-cha.test`. Root cause found and fixed for two of the
mobile items, in order:

1. **PR #290 (button/badge text-wrapping app-wide)** — merged. Every shared
   button/badge style in `apps/web/src/lib/ui/theme.ts`
   (`buttonPrimary`/`buttonSecondary`/`buttonDisabled`/`badgeStyle`) had no
   `whiteSpace`/`flexShrink` protection, so inside any `display:flex` row
   under space pressure (headers, the Attention panel, table action cells)
   labels shrank to min-content and wrapped one character per line — CJK
   labels (サインアウト, 確認する, 割り当て) collapsed into unreadable
   vertical stacks, and English ones ("Sign out") wrapped word-by-word too.
   Fixed at the shared theme source; live-confirmed on the Attention panel,
   header Sign-out, and schedule-grid assign/unassign buttons.
2. **PR #291 (Staff roster → card layout at <768px)** — merged. The Staff
   table was a fixed 7-column `<table>`; at 375px the auto table-layout
   squeezed `positionLabel`/`employmentType` columns to min-content and CJK
   text (no word boundaries) wrapped one character per line inside the
   cell -- same underlying class of bug as #1 but on plain `<td>` text, not
   buttons, so the theme fix alone didn't cover it. Added
   `apps/web/src/app/(protected)/manager/manager-dashboard.module.css` --
   **the first CSS file/CSS Module in this codebase** (everything else is
   inline `CSSProperties` via `theme.ts`, which cannot express a media
   query at all) -- with `.tableView`/`.cardView` classes toggled by a
   `max-width: 767px` query. Both the table and the new stacked-card markup
   render server-side for every request; only one is visible per viewport,
   so there's no JS `matchMedia` flash. Preserved the PR #286 Edit-button
   focus-restore pattern: since table and card variants both mount at once
   now, `editStaffButtonRefs` keys `{table, card}` per staffId and
   `closeEditStaffForm()` focuses whichever one has a non-null
   `offsetParent` (the actually-visible one) instead of whichever mounted
   last. Live-confirmed: cards render correctly, Edit opens the inline
   form, Cancel returns focus to the visible card's Edit button.
3. **PR #293 (schedule grid → day-grouped card layout at <768px)** —
   merged. The 週間スケジュール table was staff × date; at 375px only ~2 of
   7 day columns fit in the horizontally-scrollable wrapper. Extracted the
   per-cell assign/edit/unassign logic (previously inlined once inside the
   table's `<td>` map) into `renderScheduleCellContent(staff, date,
   variant)`, called from both the table (>=768px) and a new day-grouped
   card list (<768px, one card per date, staff as rows inside it -- same
   data, transposed) via the same `manager-dashboard.module.css` pattern
   PR #291 introduced. Applied the same table/card dual-ref-map fix to
   `cellButtonRefs` (keyed `{table, card}` per cell, `closeCellEditor()`
   focuses whichever has a non-null `offsetParent`). Live-confirmed: all 7
   day cards render, Assign opens `ShiftCellEditor` inline under the right
   staff row, Cancel returns focus to the visible card's button (verified
   via `document.activeElement`, not just visually).

**Not yet started, found live during the same audit, still open:**

- **Header/page-chrome layout** (`/manager`, likely `/staff` too): title →
  subtitle → nav links → Sign-out button → JA/EN toggle all stack
  vertically with inconsistent spacing/alignment at 375px, unlike the
  prototype's compact single-row-ish header with a circular avatar mark.
  Not started, not yet root-caused (may just need a `display:flex` header
  container with sensible wrap, unlike the button-wrap bug this wasn't
  investigated in code, only observed visually).
- **Staff surface (`/staff`) audited live at 375px this session, signed in
  as `staff@mame-to-cha.test`** (田中 愛) -- **found already in
  substantially better mobile shape than Manager was, no new blocking bug
  found.** Unlike Manager, `/staff` was never table-heavy to begin with: the
  profile card, shift-preference form, work-report form, and
  correction-request form are all already single-column native forms
  (native `<input type="date">`/`<input type="time">`, no custom
  date/time-picker component) that render cleanly at 375px with no
  overflow, and they benefit from PR #290's button/badge fix same as
  Manager (shared `theme.ts`). The one read-only "公開シフト" (published
  schedule) table stays a horizontally-scrollable table at 375px, same
  pattern the Mame To Cha prototype itself uses for its own read-only
  schedule view (confirmed acceptable in the §6-recommended parity audit
  earlier this session) -- it's read-only (dashes/shift codes only, no
  buttons), so the column-squeeze-causes-vertical-text bug that hit
  Manager's editable grid doesn't apply here. **Remaining Staff-surface gap
  is the same header/page-chrome issue already tracked above for Manager**
  (JA/EN toggle renders separately from the title/nav/Sign-out block, not
  in a single compact row like the prototype) -- not a new, Staff-specific
  finding, covered by the header item above. No code change made this pass
  for Staff; **the mission brief's original "WP-E" (Staff mobile,
  week-list/card layout + bottom nav) can likely be considered
  substantially already met** by the existing form-based design plus
  PR #290, but a native-Japanese/product-owner visual sign-off against the
  prototype side-by-side is still recommended before calling it fully
  closed -- this was an engineering-side audit, not a design-parity
  sign-off.

## 4. What is NOT done — the actual remaining scope

Ordered roughly by size, not necessarily by priority — the next session
should confirm priority with the Founder if unclear, per the mission's own
instruction that the agent picks the implementation but should not silently
assume scope beyond what's been asked.

1. **Mobile redesign, Manager (`WP-D`) and Staff (`WP-E` — a different
   "WP-E" than the Staff-name fix above; the QA report's WP lettering and
   this session's PR branch names diverged, see the "naming caveat" in §7)**.
   **Not started at all.** This is the single largest remaining item and
   was explicitly called out in both the QA report and the Founder's
   mission brief as needing a *deliberate* mobile structure (card layout
   for Manager staff/schedule at `<768px`, week-list/card layout + bottom
   nav for Staff), not a shrunk desktop table. Reference:
   `https://preview.oruwa.jp/mame-to-cha/manager` and
   `.../mame-to-cha/` at 375px viewport. QA report §5 "P2-2"/"P2-3" and §10
   "WP-D"/"WP-E" have the detailed acceptance criteria (no vertical
   Japanese-name columns, no cell taller than ~100px from wrapping, 44px
   touch targets, etc.). Budget multiple hours/PRs for this, not one.
2. **P2-9 — published-shift amendment/cancel workflow.** Currently a
   published shift is fully read-only in the Manager schedule grid ("公開済み
   -- 変更不可" / "Published -- read-only"). QA report wants a *safe*
   amendment path (reason required, audit before/after, staff notification,
   conflict recheck) — this needs a real design decision (a new RPC/status
   transition, not a quick UI patch) before implementation. Not started.
3. **P2-5 — Inventory content i18n.** QA report claimed item names (`コーヒー豆`,
   `牛乳`) stay Japanese even in EN UI mode. **Spot-checked live this
   session on the `/inventory` page in JA mode and item names were already
   in English** ("Coffee beans", "Matcha powder", "Water", "Ice", "Milk")
   — this may mean it's already fixed (the tenant's data was re-entered in
   English at some point) or that the QA report's claim was
   tenant-data-specific and not a code bug at all. **Not confirmed either
   way** — the next session should explicitly test switching JA→EN and
   back, and check whether there's a genuine source/translation model gap
   or whether this was already resolved by data, before doing any code
   work here.
4. **P3 minor items**, none started: 44px hit-target sweep for plain
   links/checkboxes; page `<title>` per route (currently generic "LINE
   Business OS" everywhere); Recipe list has no distinct "Published" badge
   (only Draft/Archived are shown); `Back to Workforce`/`Back to dashboard`
   inconsistency (already partially addressed by PR #285's role-aware Back
   link, but not audited end-to-end); explicit `noindex` policy for the
   authenticated app.
5. **Auto-distribution preview/undo contract** (QA report WP-G item,
   distinct from the P2-10 conflict-warning work also called "WP-G" in this
   session — see naming caveat below) — not started, not scoped in detail
   yet.
6. **Disposable acceptance-fixture manifest/cleanup script** (QA report's
   own "WP-H") — not started. Not urgent; this session's live QA cleaned up
   after itself manually each time instead.

---

## 5. Known false leads — do not re-attempt without new evidence

- **Recipe Delete forever is not broken** (see §3.1). Don't re-fix it on
  the strength of the QA report alone.
- **Add Staff focus restoration already works.** Only the Shift Cell Editor
  was actually broken. Don't re-"fix" Add Staff.
- Several QA-report P2 items may already be resolved by prior PRs merged
  before this session started (`#283`/`#284`, F1–F5, PR #246–#252 per
  `docs/ai/current-task.md`) — the QA report itself was written *after*
  some of those merges and still found gaps, but this session found at
  least two more items (P1 Delete-forever, Add-Staff-focus) where the
  report's claim didn't hold live. **Always re-verify live before
  implementing a fix for anything in the QA report** — don't trust the
  report as ground truth for current `dev` state.

---

## 6. How to continue (recommended immediate next step)

**Updated status (end of the 2026-08-17 continuation session):** Manager
mobile layout is substantially fixed -- PR #290 (button/badge text-wrap,
app-wide), PR #291 (Staff roster card layout), PR #293 (schedule-grid
day-grouped card layout) all merged to `dev` and live-verified at 375px
(including `document.activeElement` checks for focus-restore, not just
screenshots). §3a has the full detail per-PR; don't re-do this work.

1. Re-read `docs/ai/current-task.md` fresh (its "next gate" section is
   stale relative to this mission — this handoff supersedes it for Cafe
   work, but confirm nothing else changed).
2. Remaining Manager-surface mobile items, still open (see §3a for detail,
   this is just the pointer):
   - Header/page-chrome layout (title/subtitle/nav/Sign-out/JA-EN stacking)
     -- not root-caused yet, needs its own look at the JSX, not just theme.ts.
   - **Staff surface (`/staff`) itself has not been audited this session at
     all** -- sign in as `staff@mame-to-cha.test` (not the Manager account)
     and repeat the same live-375px-audit-then-fix loop before assuming any
     Manager fix above (theme.ts in particular, since it's shared) carried
     over. This is likely the next highest-value slice: the mission brief's
     original "WP-E" (Staff mobile) is explicitly still unconfirmed.
3. Follow the same per-PR discipline this session used: one bounded PR per
   WP, typecheck/lint/test/build every time, **live Preview QA before
   merge** (not just "tests pass" -- for focus-restore specifically, check
   `document.activeElement` via `evaluate_script`, don't just eyeball a
   screenshot), clean up any disposable test fixtures created during QA.
4. `gh pr checks <n>` then `gh pr view <n> --json comments -q
   '.comments[].body' | grep -oE "https://line-business-os[a-zA-Z0-9.-]*\.vercel\.app"`
   reliably gets the Vercel preview URL for live-testing a PR before merge.
5. **Mobile viewport gotcha** (cost real time this session): chrome-devtools
   MCP's `resize_page` changes the OS window size but **not**
   `window.innerWidth` / CSS media-query evaluation on this Windows/Chrome
   setup. Use `mcp__chrome-devtools__emulate` with
   `viewport: "375x812x2,mobile,touch"` (or similar) for real mobile
   emulation, then verify with `document.body.scrollWidth === 375` before
   trusting any 375px screenshot/audit finding.
6. If `gh pr merge --delete-branch` fails with `'dev' is already used by
   worktree at 'D:/Dev/line-business-os-founder-audit'` -- that's cosmetic,
   the merge itself already succeeded (`gh pr view <n> --json
   state,mergedAt` confirms); just delete the remote branch manually
   (`git push origin --delete <branch>`) and start the next branch fresh
   off `origin/dev`.

---

## 7. Naming caveat

The QA report's own WP lettering (§10: WP-A Delete-forever, WP-B
navigation, WP-C focus, WP-D Manager mobile, WP-E Staff mobile, WP-F
Inventory i18n, WP-G schedule operational completeness, WP-H disposable
fixtures) does **not** line up 1:1 with this session's git branch/PR names,
because two items (Delete-forever = "not actually broken", and a
Staff-real-name fix that wasn't in the report's WP lettering at all) got
folded in or reordered as work progressed. This session's actual branches
were: `fix/cafe-v21-wp-b-canonical-routes` (routes+signout),
`fix/cafe-v21-wp-c-shift-cell-focus` (focus), `fix/cafe-v21-wp-e-staff-name`
(Staff real name — **not** the QA report's "WP-E" mobile item),
`fix/cafe-v21-wp-g-unavailable-conflict` (conflict warning — **is** the QA
report's WP-G territory, but only the conflict-detection slice of it, not
auto-distribution). **When picking a branch name for mobile work, don't
reuse "wp-d"/"wp-e" assuming it matches an existing branch** — check `git
branch -a` / `gh pr list` first.
