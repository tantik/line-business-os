# Phase 1J-2 — Cafe Workforce Public Demo (to Production Plan)

Status: **Implemented as a public UI demo. Not production.**
Branch: `feature/phase-1j-2-cafe-workforce-demo`
Scope of this document: what was built, why it is safe, and what has to change
before any of it becomes real product behavior.

Read with: [`product/modules.md`](./product/modules.md),
[`product/demo-vs-client-template.md`](./product/demo-vs-client-template.md),
[`architecture/multi-tenancy.md`](./architecture/multi-tenancy.md),
[`phase-1j-1-workforce-mvp-architecture-plan.md`](./phase-1j-1-workforce-mvp-architecture-plan.md).

---

## 1. What this is

A public, unauthenticated, sales-facing demo of a cafe workforce mini-OS
("LINEで使えるカフェ運営ミニOS"), built directly inside `apps/web` under
`/demo/cafe*`. It is meant to be shown to prospective cafe clients to
demonstrate shift management, clock-in/out, recipe sharing, auto-scheduling,
and a manager dashboard — before any of that is backed by real data.

**This is UI and mock data only.** There is no new schema, no new API, and no
change to how the existing authenticated product (`/dashboard`,
`/workforce`, `/booking`) works.

## 2. Relationship to `tantik/cafe-shift`

`tantik/cafe-shift` was **not read, copied, or modified** for this work. Per
`.cursor/rules/05-legacy-migration-boundaries.mdc` it remains a UI/UX
reference only for the Workforce module. This demo was designed fresh against
the feature list in the task brief and this repo's existing UI conventions
(`apps/web/src/lib/ui/theme.ts`), not against cafe-shift's implementation.
If a future contributor wants to compare UX decisions against cafe-shift,
that is a separate, deliberate task — not an implicit dependency of this one.

## 3. Routes shipped

| Route | Audience | Layout priority | Purpose |
| --- | --- | --- | --- |
| `/demo/cafe` | Staff | Mobile-first | Two-button clock state UI (出勤/退勤, 休憩開始/休憩終了), a mobile-width weekly shift table paged by a scrollbar-free, gallery-style week carousel (whole week — title, header, body, legend — moves together as one slide; swipe or 前の週/今日/次の週 buttons both change weeks), a shift legend, transport + message, and a next-month calendar shift-preference modal. There is no standalone "勤務時間の修正を依頼" button — correction requests are reached by tapping an eligible own past cell, which opens the 勤務記録 (work report) modal; that modal's own 修正を依頼 action opens the correction form |
| `/demo/cafe/recipes` | Staff | Mobile-first | Compact header with a small brand-mark link back to `/demo/cafe` (no nav menu), a 2-row scannable recipe thumbnail grid with ~20 sample recipes sized so a 375px-wide screen shows about 3.5 cards per row (an intentional "this scrolls" affordance), popular (人気) recipes sorted first with a single small star, New/Seasonal shown only as a compact top-right badge pair, and inline recipe detail that is text/instruction-focused (no product photo, no checkboxes) — title, badges, category, description, ingredient pills, numbered steps, optional titled memo block |
| `/demo/cafe/manager` | Manager | PC-first | 要確認 alerts, then the main shift table (week controls + auto-schedule + compact 概算人件費合計) as the primary/most-used block, then the スタッフ管理/レシピ管理 demo-management section, then settings — ordered by frequency of use. The table's "!" cells open a シフト編集 modal showing the actual concrete demo message (e.g. the staff member's own correction-request note), not a generic placeholder |

**These three routes are separate direct-entry screens and share no
internal navigation.** There is no shared nav bar listing all three, and
no link from staff/recipes to the manager dashboard. This is deliberate:
in the real LINE flow, `/demo/cafe` and `/demo/cafe/recipes` are opened
from two separate LINE Rich Menu buttons (勤務アプリ / レシピ, see §7), and
the manager dashboard is opened from a separate manager-only link. The
recipes page's header brand mark links back to `/demo/cafe` as a small
convenience (matching the two Rich Menu entry points being closely
related staff-facing screens), but this is a single logo-tap shortcut,
not a navigation menu — there is still no `<nav>` and no manager link
anywhere under `demo/cafe`.

There is intentionally **no visible "this is a demo" disclaimer banner**
in the UI (`apps/web/src/app/demo/cafe/layout.tsx` only provides the
shared warm page background). The demo/testing explanation for whoever
is shown these screens is handled outside the UI (e.g. verbally, in an
email, or in a separate document) rather than as an on-page banner.

All three sit under `apps/web/src/app/demo/cafe/` and live **outside** the
`(protected)` route group — so they inherit no auth requirement. The global
`middleware.ts` only refreshes the Supabase session cookie; it does not gate
these routes, and they make no Supabase calls, so they render identically
for a signed-in or signed-out visitor.

Shared demo code lives in `apps/web/src/lib/demo/cafe/` (types, mock data,
date/currency formatting, scheduling helpers, style tokens) and
`apps/web/src/components/demo/cafe/` (Modal, ShiftTable, ShiftLegend,
WeekCarousel, ClockPanel, BrandMark, RecipeCard/RecipeDetail, the work-report/
shift-edit/auto-schedule/shift-preference/correction-request modals, labor
cost summary, settings panel, and the StaffManagementModal/
RecipeManagementModal demo-only management modals). Nothing under either
path is imported by the authenticated app, and nothing in the authenticated
app was changed.

## 4. Demo data vs. production data

Everything is generated client-side, deterministically, from
`apps/web/src/lib/demo/cafe/data.ts`:

- 6 fictional staff (incl. one manager), fictional Japanese names, no real
  PII.
- Shift cells only ever show one of six values: `1` / `2` / `3` / `通` /
  `休暇` / `－`. `SHIFT_TYPES` in `data.ts` is deliberately kept to exactly
  those five real types (three numbered shifts, a 通し full-day shift, and
  休暇) plus `null` (rendered as `－`, meaning "not yet assigned" — the
  manager may still assign a shift later). `休暇` means approved/requested
  time off (staff is unavailable); `－` means simply unscheduled. Both the
  staff-screen `ShiftLegend` and the manager's シフト種別 settings list read
  their times directly off `SHIFT_TYPES`, so the legend can never drift out
  of sync with the actual demo shift definitions.
- Both the staff and manager shift tables page one Mon–Sun week at a time
  (前の週/今日/次の週), computed by `buildWeekDateRange(weekOffset, today)`
  in `data.ts` — the manager screen gained its own 前の週/今日/次の週
  navigation in this pass so it behaves like a calendar rather than a fixed
  14-day window. The staff table is rendered in a compact mode
  (`ShiftTable`'s `compact` prop, in `apps/web/src/components/demo/cafe/ShiftTable.tsx`)
  so the full 7-day week fits an iPhone-width screen with no inner
  horizontal scroll, and the previous/current/next week are laid out as
  scroll-snap cards (`WeekCarousel.tsx`) so a visitor can hand-swipe
  between weeks in addition to using the 前の週/今日/次の週 buttons — both
  input methods keep the same `weekOffset` state in sync. Each slide is the
  *whole* week card (title/range + table header + table body + legend)
  moving together, not just the table body, and the carousel's native
  scrollbar is hidden via CSS (`scrollbar-width: none` /
  `::-webkit-scrollbar { display: none }`) so it reads as a gallery rather
  than a scrollable table. The manager table keeps its original
  (non-compact) sizing since it is PC-first, and relies on its own
  `overflowX: auto` wrapper for hand-scroll on tablet widths instead of the
  staff screen's swipe-card treatment; it also gets a very subtle
  alternating row tint (`demoColors.zebraRowBg`) to make wider rows easier
  to scan, layered under (never replacing) the existing today/self-row
  highlights.
- The staff screen has no standalone "勤務時間の修正を依頼" button. A
  correction request is reached only by tapping an eligible own past cell,
  which opens the 勤務記録 (`WorkReportModal`) work-report modal; that modal's
  own action button opens `CorrectionRequestModal`. This removes a duplicate
  entry point into the same flow.
- On the manager screen, clicking a cell that shows a "!" indicator opens
  the existing シフト編集 modal with an explanatory "「!」の内容" block above
  the shift picker. This block now shows the actual concrete demo text (the
  staff member's own correction-request message, e.g. 開店準備で少し遅れま
  した。, or 必要人数に対して人員が不足しています for a staffing shortage) instead
  of a generic "修正依頼があります"/"メッセージがあります" placeholder — a
  visitor sees real content, not just that *something* needs attention.
- スタッフ管理 and レシピ管理 are demo-only management modals opened from a
  section on the manager dashboard, positioned **below** the main shift
  table (the table is the most-used block; management is secondary) —
  `StaffManagementModal.tsx`, `RecipeManagementModal.tsx`. Both open as a
  clean list view (widened to 720px on desktop) with a top-level スタッフを
  追加/レシピを追加 button; add/edit swaps the same modal into a dedicated
  form view (表示名/時給/LINE連携状態/ステータス/メモ for staff;
  レシピ名/短い説明/写真/材料/作り方/ステータス(公開/下書き) for recipes) with
  保存/キャンセル actions, rather than an inline block appended to the list.
  The recipe list also shows each item's thumbnail image (or a fallback
  icon) next to its name/description. Both seed their list from the
  existing mock `STAFF`/`RECIPES` arrays but keep all add/edit/delete state
  local to the modal component — nothing here mutates the shared demo data
  or the actual shift table/recipes screen, and there is still no public
  navigation link from the manager dashboard to `/demo/cafe/recipes`.
- Past/today shifts are fully scheduled by a fixed weekly pattern. **Future
  days are intentionally left unscheduled for non-managers**, which is what
  produces the 人手不足 alert and gives 自動シフト作成 something real to do
  when clicked.
- One past shift is pre-flagged with a correction request so 要確認 has a
  non-empty example on first load; staff can also raise a new one from the
  work-report modal, which is reflected immediately in that same browser
  tab's manager alerts.
- The staff clock UI (`ClockPanel.tsx`) is exactly two state-changing
  buttons — 出勤/退勤 and 休憩開始/休憩終了 — not four separate buttons; each
  button's own label and enabled/disabled state reflect the current
  `ClockState`.
- The shift-preference request (`ShiftPreferenceModal.tsx`) renders a
  full next-month calendar grid; tapping a date cycles it through the same
  `SHIFT_TYPES` choices the shift table uses (`－`, `1`, `2`, `3`, `通`,
  `休暇`), with a live legend (chip + time range) above the calendar, a
  gray helper line under it (日付をタップして希望するシフトを選択してください。)
  plus a short explanation of `－`/休暇, and an optional message field. Still
  no scheduling backend — submission just flips a local "提出済み" flag.
- All mutations (clock state, shift edits, auto-schedule, settings incl.
  shift-type add/edit/delete, and the demo-only スタッフ管理/レシピ管理 modals)
  live in React state for that page load only. Recipes are read-only
  content on the staff-facing recipes screen (cards + inline detail, no
  per-step checklist — that UI was removed as part of the visual redesign
  since it made recipes look like a task list rather than reference
  content). **Staff and
  manager views do not share state** — this is a single-tab demo, not a
  multi-user system. That is an acceptable and expected limitation of a
  mock-only demo; production replaces this with the real API (§6).
- Branding: **"Mirawi Cafe"** (Japanese: ミラウィ カフェ). No real client
  logos, names, or photos — icons are emoji placeholders.

  Note: `product/demo-vs-client-template.md` already lists *Mame To Cha
  Tokyo* as the example seeded demo **tenant** for the Workforce module, and
  *Mirawi Demo Salon* for Booking. This PR's "Mirawi Cafe" is a **marketing
  demo brand**, not a tenant row — it is not seeded via `supabase/seed` and
  does not touch `core.tenants`. Before production seeding (§6), a human
  should decide whether the production demo tenant reuses "Mirawi Cafe",
  keeps "Mame To Cha Tokyo", or the two get reconciled into one name. This
  PR does not make that call.

## 5. Architecture boundaries kept in this PR

Confirmed, not just intended:

- No `supabase/migrations/*` changes.
- No `apps/api` changes.
- No Supabase client created or called anywhere under `demo/cafe` (no
  `createClient`, no `service_role`, no env var reads).
- No new npm dependencies — built with React state and inline styles,
  matching how the rest of `apps/web` (e.g. `/dashboard`, `/workforce`,
  `/booking`) is already built. The demo's visual theme
  (`apps/web/src/lib/demo/cafe/theme.ts`) is **fully self-contained** — a
  warm/light, cafe-appropriate palette (cream background, white cards,
  matcha-green primary, soft gold accent) that no longer spreads or depends
  on `@/lib/ui/theme` (the shared dark palette `/dashboard` uses). This keeps
  the sales-demo redesign from touching, or being coupled to, the
  authenticated app's look.
- No env files touched.
- No real LINE integration (see §7 for the documented-only Rich Menu note).
- No billing.
- Existing `/dashboard` auth boundary, middleware, and protected layout are
  untouched — verified by full-repo typecheck/lint/build (§8) and by reading
  `middleware.ts` / `(protected)/layout.tsx` before starting.

## 6. What production needs that this demo deliberately skips

This section is the actual migration checklist, following the order in
`AGENTS.md` ("preserve UI/UX → extract domain logic → replace mock data with
Core API → add tenant_id/location_id → add RLS/RBAC → add audit logs → add
demo + client-template seed → test module isolation"):

1. **Domain logic extraction.** The scheduling helpers in
   `lib/demo/cafe/data.ts` (`generateAssignments`, `autoScheduleFutureAssignments`,
   `computeManagerAlerts`, `scheduledHoursForStaff`) encode real product
   rules (staffing requirements per weekday, shortage detection, labor cost
   formula). They are a reasonable first draft of the domain logic, but they
   currently read/write in-memory mock arrays — they need to be rewritten
   against real persisted shift/attendance records, not lifted as-is.
2. **Replace mock data with the Core API.** Every mutation currently done via
   `useState` (shift edits, auto-schedule, clock in/out, correction
   requests, shift-preference submission, settings changes) needs a real
   `apps/api` endpoint. Per the existing Workforce architecture plan
   (`phase-1j-1-workforce-mvp-architecture-plan.md`), PII-bearing reads
   (employee names) must go through an authorized server-side service, never
   a generic decrypt-by-id call.
3. **`tenant_id` / `location_id`.** Every table this eventually writes to
   (staff, shifts, attendance, shift requests, recipes, settings) must carry
   `tenant_id uuid not null`, and `location_id` where the data is
   branch-scoped, per `AGENTS.md` rule 1. `supabase/migrations/0009_workforce.sql`
   already scaffolds tenant/location-scoped tables for shifts, employees,
   attendance, and requests — production work should extend that schema
   rather than invent a parallel one.
4. **RLS.** Tenant isolation must live in the database (`AGENTS.md` rule 2),
   not be re-derived from the demo's client-side `CURRENT_STAFF_ID` constant.
5. **RBAC.** "Staff must not see other employees' private work reports" is
   currently enforced only by which cells the UI makes clickable
   (`ShiftTable`'s `isCellClickable`). Production must enforce this
   server-side via `packages/core/src/permissions.ts`, not just hide it in
   the client.
6. **Audit logging.** Shift edits, auto-schedule runs, correction requests,
   and settings changes all need `writeAudit` calls (actor, tenant, module,
   entity, action, before/after) once they're real mutations.
7. **Recipes as a content model.** `RECIPES` is a hardcoded array of ~20
   sample items (`description`, `ingredients`, `steps`, `badges`, and an
   optional titled `memo`/`memoTitle` block for extra prep detail);
   production needs a real tenant-scoped recipe table (or a lightweight CMS
   pattern) so a manager can add/edit recipes — and upload real photos to
   replace the emoji/placeholder-image cards — without a code change. The
   manager-side レシピ管理 modal in this PR is a mock list (name, thumbnail,
   short description, ingredients, steps, and a 公開/下書き status, local
   state only) that previews the eventual management UI shape but is not
   wired to the real `RECIPES` content shown on `/demo/cafe/recipes`.
8. **Labor cost summary stays advisory and stays compact.** The manager
   screen intentionally shows only a single 概算人件費合計 line (with an
   info icon disclaimer), not a per-staff cost table — that is a product
   decision from this redesign, not a temporary simplification. Production
   must keep the disclaimer behavior (info icon → non-payroll disclaimer, no
   use of 給与計算書/給与明細 as a section label) even once it reads real
   attendance data. If a per-staff breakdown is ever needed, it belongs on a
   separate, deliberately-designed screen, not folded back into this line.
9. **Staff management as a content model.** The manager-side スタッフ管理
   modal (`StaffManagementModal.tsx`) is a mock roster (表示名, 時給,
   LINE連携状態, ステータス, メモ) held in local component state — it previews
   the management UI shape but does not touch `STAFF`, the shift table, or
   any persisted staff record. Production needs a real tenant-scoped staff/
   employee table wired through the Core API (with the same PII-handling
   constraint as item 2), not this local-state mock.
10. **Demo + client-template seed.** Per `demo-vs-client-template.md`, the
    eventual production cafe workforce feature needs both a `kind = 'demo'`
    tenant (fake but realistic, for sales) and a clean `kind = 'client_template'`
    tenant — this public marketing demo is neither; it's a third,
    pre-tenant surface meant purely for outbound sales conversations before a
    prospect has an account.
11. **Module isolation test.** Once wired to the Core API, this needs the
    same cross-module isolation check any other module gets before ship.

## 7. LINE Rich Menu (future, not implemented)

No real LINE integration exists in this PR. For when the tenant-facing app
gets a LINE Rich Menu, it should carry exactly two buttons:

- **勤務アプリ** → opens `/demo/cafe` today; opens the future LINE-facing
  tenant staff app in production.
- **レシピ** → opens `/demo/cafe/recipes` today; opens the future tenant
  recipes app in production.

This mirrors the existing "only two buttons" LINE-UX constraint referenced
in the task brief and should not grow additional entries without a product
decision.

## 8. Verification run for this PR

- `npx tsc --noEmit` (apps/web) — pass.
- `npx eslint` over the `demo` paths (`src/app/demo/cafe`,
  `src/components/demo/cafe`, `src/lib/demo/cafe`) — pass, no lint errors.
- `npm run build` (apps/web, i.e. `next build`) — pass; `/demo/cafe`,
  `/demo/cafe/recipes`, `/demo/cafe/manager` all prerender as static (○),
  confirming no session/auth dependency.
- Manual pass in a running dev server (Playwright, headless Chromium)
  covering a 375px/iPhone-SE-width viewport for `/demo/cafe` and
  `/demo/cafe/recipes`, a 1280px desktop viewport for `/demo/cafe/manager`,
  and a 390px mobile-fallback viewport for `/demo/cafe/manager`. Confirmed:
  no page-level horizontal overflow at any of the above widths
  (`document.documentElement.scrollWidth === clientWidth`, checked via a
  script, not just eyeballed); the staff shift table renders full-width
  with clean borders and no clipping (verified cell-by-cell via
  `getBoundingClientRect`, not just a screenshot — small compact-mode text
  is easy to misread in a shrunk screenshot); the recipe grid renders
  exactly 20 cards (`RECIPES.length`, counted via DOM query) with larger
  top-of-card images and a text-only detail pane (`section
  querySelector('img') === null` after selecting a recipe); the 抹茶ラテ
  detail shows the exact requested copy including the titled 抹茶液の作り方
  memo block; the shift-preference modal's legend/time rows and its two
  helper lines render under the calendar; the manager's 前の週/今日/次の週
  buttons page the week and the "!" indicator opens a シフト編集 modal with
  an explanatory 「!」の内容 block; the 必要人数（曜日ごと） grid no longer
  overflows its columns (root cause was `apps/web/src/lib/demo/cafe/theme.ts`'s
  shared `input` style using content-box sizing with padding, now fixed to
  `boxSizing: 'border-box'`); and the new スタッフ管理/レシピ管理 modals open,
  list, add, edit, and delete correctly as local-state-only mocks. Also
  confirmed no dark-theme colors remain, no in-page "this is a demo" banner
  is shown, and no internal navigation exists between the three routes
  beyond the recipes page's brand-mark link back to `/demo/cafe`.

### 8.1 Follow-up UI/UX polish pass

A later pass on this same branch tightened the visual design without
changing scope or architecture: `npx tsc --noEmit`, `npx eslint` (same demo
paths), and `npm run build` all still pass, and all three routes still
prerender as static. Manual verification (Playwright, headless Chromium)
re-covered 375px for `/demo/cafe` and `/demo/cafe/recipes`, 1280px and 375px
for `/demo/cafe/manager` — no horizontal overflow at any width
(`document.documentElement.scrollWidth === clientWidth`), no console errors.
Specifically confirmed: the shared corner radius was brought down to 8px
across cards/tables/modals/inputs/buttons (`RADIUS` token in `theme.ts`);
the recipe grid shows ~3.5 cards per row at 375px with no stripe/clipping
artifact on the first card; the recipe detail pane still has no image and
no checkboxes; the standalone staff-page correction button is gone (the
work-report modal opened from a day cell is the only entry point, verified
by clicking a past cell end-to-end); the staff week carousel now renders
exactly one week at a time (no native scroll/scroll-snap, so no visible
scrollbar and no risk of landing mid-transition between two adjacent weeks
— an actual instance of that split-column glitch was caught in this pass
and is why the carousel was rewritten away from `scrollLeft`/scroll-snap to
a single keyed slide with a CSS keyframe transition); the manager
スタッフ・レシピ管理 section now renders after the main shift table; and
clicking a manager "!" cell was verified to show the real flagged staff
message (e.g. 開店準備で少し遅れました。) instead of a generic placeholder.
Both management modals were driven end-to-end (list → 追加 → form → list)
via automated clicks, not just a static screenshot.

## 9. Explicitly out of scope for this PR

Real LINE integration, billing, Supabase Cloud/local migrations, `apps/api`
endpoints, persisted state across page loads or across the staff/manager
views, real payroll calculation, and any change to `/dashboard`,
`/workforce`, or `/booking` behavior.

## 10. Pre-client-demo fixes (later pass on this same branch)

A follow-up pass addressed a UI/UX/Product/CTO review ahead of the first
client demo. Still UI + mock data only — no new package, no `apps/api`,
`apps/worker`, or migration changes, no env changes, no real backend/
Supabase/LINE/translation integration. Everything below stays inside the
same four demo paths listed in §3.

- **JA/EN language switch, staff and recipes only.** `/demo/cafe` and
  `/demo/cafe/recipes` each gained a small JA/EN segmented toggle
  (`LangToggle.tsx`) backed by `apps/web/src/lib/demo/cafe/i18n.tsx`
  (`LangProvider`/`useLang`, localStorage key `demo-cafe-lang`, default
  `ja`) and two flat dictionaries, `i18n.staff.ts` and `i18n.recipes.ts`
  (`makeTranslator` — a two-line `t(lang, key)` lookup, not a generic i18n
  framework; no ICU/plural/interpolation). **This is static, manually
  authored demo copy only — there is no auto-translation, no external
  translation API call, and no API key anywhere in this pass.** All 20
  `RECIPES` entries gained parallel `nameEn`/`descriptionEn`/
  `ingredientsEn`/`stepsEn`/`memoTitleEn`/`memoEn` fields (manually
  written, not machine-translated) so the recipes screen fully switches
  content, not just UI chrome. `/demo/cafe/manager` intentionally has no
  language switch and stays Japanese-first, per the task brief — `ShiftTable`
  (shared by both staff and manager) accepts an optional `lang` prop
  (default `'ja'`) rather than reading `useLang()` itself, since it is
  rendered both inside and outside a `LangProvider`.
  **Production TODO:** real translation (machine or human-reviewed) would
  be a backend/CMS concern, not a client-side dictionary swap.

- **Demo translation UX for staff messages.** `WorkReport` gained an
  optional `messageTranslated` field. `generateWorkReports` (now built
  across *all* staff, not just the single demo staff member, so the
  manager can open any staff member's past-day report) seeds exactly three
  concrete demo scenarios: one EN message with a JA `messageTranslated`
  pair (staff forgot to clock out), one JA-only correction message, and
  one JA-only plain message — see the function body for the literal copy.
  **Static/seeded pairs only — nothing is translated dynamically, and nothing
  calls an external API.** The manager's past-day report view
  (`ManagerReportModal.tsx`) shows 原文 (original) and, when present,
  自動翻訳（デモ） (auto-translation (demo)) as two distinct rows so it is
  visually obvious this is a canned demo translation, not a live service.
  On the staff side, saving 本日のメッセージ writes straight into that
  date's `WorkReport` in local state (no translation attached, since it is
  live-authored input) and shows a small "!" indicator on that date's own
  cell only (`ShiftTable`'s per-cell indicator now also fires for the
  staff's own row in staff mode, not just manager mode); opening that cell
  shows the message via the existing `WorkReportModal`.
  **Production TODO:** real auto-translation is a backend integration
  (e.g. a translation API called server-side, with the result persisted),
  not something to add to the client bundle.

- **Manager monthly report.** A `月間レポートCSV` button sits directly
  under the existing compact 概算人件費合計 line inside the shift-table
  card. It opens `MonthlyReportModal.tsx`: a demo per-staff monthly
  summary table (スタッフ / 実働時間 / 時給 / 交通費 / 概算支給額, using
  実働時間 × 時給 + 交通費 = 概算支給額) computed over the calendar month
  containing today (`buildMonthDateRange`, new in `data.ts`) — independent
  of whichever week is currently paged in the shift table above it. It
  reuses `generateAssignments` + `autoScheduleFutureAssignments` +
  `generateWorkReports` + `scheduledHoursForStaff` (falling back to
  scheduled hours for any date without an actual work report, per the task
  brief) and keeps the same non-payroll disclaimer pattern as
  `LaborCostSummary` (info icon → modal, identical disclaimer copy). Its
  `CSVダウンロード（デモ）` button only flips a local "downloaded (demo)"
  confirmation message — **it does not generate a real CSV/XLSX file and
  calls no backend endpoint.**
  **Production TODO:** a real CSV/XLSX export needs a server-side endpoint,
  and a real monthly report needs persisted attendance data (see §6) rather
  than the demo's client-generated mock month.
  **Note:** the demo's per-staff monthly hours are demo-normalized
  (`demoCredibleMonthlyHours` in `MonthlyReportModal.tsx`) so the report
  reads as a believable cafe schedule instead of the raw per-day shift math,
  which would otherwise sum to an implausible 200–380h/month. The real
  monthly report will calculate hours from persisted attendance data instead
  of this demo normalization.

- **Manager table UX fixes.**
  - Week controls now read date range on the left, 前の週/今日/次の週 on
    the right (previously centered as one row).
  - `ShiftTable` gained very light vertical column separators
    (`demoColors.columnDivider`, a low-opacity tint of the text color — not
    a heavy grid) in both staff and manager modes.
  - Each day header now always reserves a fixed-height slot for the "!"
    shortage indicator (rendered as a non-breaking space when absent)
    instead of conditionally adding a line, so header height no longer
    shifts week to week depending on which days have a shortage.
  - **Past vs. future manager cell behavior is now enforced**: clicking a
    past-day cell opens a new read-only `ManagerReportModal` (planned
    shift, actual clock-in/out, break, worked time, transport, staff
    message with 原文/自動翻訳（デモ）, correction-request flag, and the
    staffing-shortage note when applicable) — never the shift editor.
    Clicking a future-day (or today's) cell keeps the existing
    `ShiftEditModal` shift-editing flow. Shift editing for past days is no
    longer possible.
  - Clicking a "!" indicator now always resolves to one of the four
    concrete demo messages from `generateWorkReports`/shortage detection
    (never a generic placeholder).

- **Staff page UX fixes.** Header now shows the staff member's name
  (鈴木 舞 さん) prominently instead of the previous
  "スタッフ用アプリ（デモ）・鈴木 舞 さん" line, with `LangToggle` on the
  right. The week title/range and its 前の週/今日/次の週 controls were
  moved into `WeekCarousel` itself (one row: title left, buttons right)
  so the whole week card — title, controls, and table — animates together
  as a single unit instead of two separately laid-out control rows.

- **Recipe card badges.** Cards now show only the 人気 star (New/季節限定
  letter badges were removed from the card face only; the recipe detail
  view still shows all badges). Popular recipes continue to sort first.

- **Staff/recipe management modal field refinements.**
  `StaffManagementModal`'s add/edit form fields are now exactly Family
  name / Given name / Display name / 時給 / LINE User ID / Status
  (Active / Paused) / Memo — the previous 表示名-only name field and the
  LINE連携状態 linked/unlinked toggle were replaced. `RecipeManagementModal`
  was widened (760px list / 640px form) and the shared `Modal` panel now
  sets `overflowX: hidden` so every demo modal, including this one, can
  only ever scroll vertically.

- **Cross-route state stays intentionally non-live.** As before (§4), the
  staff app, recipes app, and manager dashboard do not share state — this
  demo should not be presented as having cross-tab or cross-device
  real-time sync. A message saved on the staff screen becomes visible in
  the manager dashboard only because both read from the same in-memory
  demo generator in that same browser tab's session, not because of any
  live sync mechanism.

### 10.1 Verification for this pass

- `npx tsc --noEmit` (apps/web) — pass.
- `npx eslint src/app/demo/cafe src/components/demo/cafe src/lib/demo/cafe` — pass, no errors.
- `npm run build` (apps/web) — pass; `/demo/cafe`, `/demo/cafe/recipes`,
  `/demo/cafe/manager` all still prerender as static (○).
- Manual checks: JA/EN toggle switches UI chrome and recipe content on
  both staff-facing screens with no layout break at 375px; a saved staff
  message shows an indicator on today's own cell and opens to show the
  message; the manager's monthly report button opens a per-staff summary
  modal with a working (confirmation-only) CSV button; a past manager cell
  opens the read-only report view and a future cell opens the shift
  editor; the manager week header no longer shifts height between weeks
  with and without a shortage day; no `apps/api`, `apps/worker`, Supabase
  migration, env, `package.json`, or lockfile changes were made.

### 10.2 Follow-up: manager recipe memo fields + レシピ管理 overflow fix

A small targeted fix, still on the same branch:

- **`RecipeManagementModal`'s add/edit form now exposes the optional
  memo/how-to block** that the public recipe detail already rendered for
  抹茶ラテ (`Recipe.memoTitle`/`memo`) but the manager form had no fields
  for. New form fields — 補足タイトル / 補足内容, plus minimal, clearly
  labeled demo-translation fields 補足タイトル（英語） / 補足内容（英語）
  mapping to `memoTitleEn`/`memoEn` — are grouped in their own bordered
  sub-section with a caption explaining the block is optional and reusable
  for any drink/food recipe, and that the English fields are static
  hand-authored demo copy, not auto-translation. `Recipe`/`ManagedRecipe`
  already carried all four fields from an earlier pass; only the edit form
  (and `seedRecipes`/`recipeToForm`/`formToRecipe`) needed to read/write
  them. Editing and saving 抹茶ラテ here is still local-state-only, per §6
  item 7 — it does not write back to the public `RECIPES` data or route.
- **レシピ管理 no longer risks a horizontal scrollbar.** The list rows and
  the add/edit form now use `minWidth: 0` on the flex/grid containers that
  hold recipe name/description text (rather than relying on `flex: 1`
  alone), explicit `overflow: hidden` + ellipsis on the name and
  description text, `flexShrink: 0` on the thumbnail/status badge/action
  buttons, and `overflowX: hidden` on the list's own scroll container (on
  top of the shared `Modal` panel's existing `overflowX: hidden`). Verified
  end-to-end (Playwright, headless Chromium) at 1280px and 375px: no
  `scrollWidth > clientWidth` on the dialog in either the list or the
  edit/add form, and edit/delete buttons never clip past the dialog's
  right edge even with a long recipe name.
- Public `/demo/cafe/recipes` (JA/EN toggle, 抹茶液の作り方 memo
  rendering, star-only popular badge, 3.5-card affordance) was not
  touched and was re-verified, not just assumed unaffected.
