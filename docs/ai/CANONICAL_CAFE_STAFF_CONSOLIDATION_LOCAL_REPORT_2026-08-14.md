# CANONICAL_CAFE_STAFF_CONSOLIDATION_LOCAL_REPORT (2026-08-14, final)

Supersedes the earlier same-day version of this report. Local-only implementation, same branch. No Preview deploy, no Cloud DB migration, no `oruwa-cafe` tenant created, no Cafe v2.2 work. Production and Preview both untouched (§22/§23).

## Executive verdict

Both remaining gaps from the prior report — Inventory and JA/EN — are closed. `/dashboard/workforce/staff` now has an Inventory entry point (shortage-aware, linking to the already-real canonical `/dashboard/inventory` page rather than a duplicate write UI) and a working JA/EN toggle covering every string this consolidation added or touched (roster/schedule, All/Only-me, week nav, the shift-exchange modal/form, the Inventory card, loading/error/empty copy). Recipes/manuals parity was explicitly re-verified, not assumed. No essential Staff capability remains exclusive to `_client-preview`.

## 1. Exact Inventory architecture before/after

**Before**: Preview's Staff Inventory lived entirely in `_client-preview` — `PreviewInventoryStaffPanel` (autosave stock-count entry, search/filter, shortage badges) plus `PreviewInventorySessionPanel` (opening/closing check sessions). Both call preview-only server actions (`lib/preview/actions/inventory-staff-actions.ts`, `inventory-session-actions.ts`) that resolve identity through `resolvePreviewInventoryStaffContext()` → `resolvePreviewStaffContext()` (preview's own tenant-resolution path, not the dashboard's). The canonical dashboard had no Inventory presence inside `/dashboard/workforce/staff` at all.

**Discovery that changed the plan**: a real, already-canonical, non-preview Inventory implementation already exists at `/dashboard/inventory` (`app/(protected)/dashboard/inventory/{page,inventory-dashboard-client,count-form,item-form}.tsx` + `@/lib/inventory/count-actions.ts`), shared between Staff and Manager (`canManage` gates only catalog CRUD; count entry is open to both, RLS-enforced), using `requireTenantContext()` — the dashboard's own canonical identity path — not preview's. It was simply never linked from the Workforce Staff screen.

**After**: `/dashboard/workforce/staff` now reads `listInventoryItemStatus` (read-only, tenant/location-scoped, reusing the same `@/lib/inventory/items.ts` service function the canonical Inventory page already uses) to show a shortage-aware entry card, and links to `/dashboard/inventory` for the actual catalog/count-entry UI. **No new write path was created**; the existing `recordInventoryStockCountAction` (`requireTenantContext()`-based, RLS-enforced) remains the only Staff Inventory write action, unchanged.

**Explicitly not ported**: `PreviewInventorySessionPanel` (opening/closing check sessions) — confirmed gated off by `SHOW_OPENING_CLOSING_STOCK_CHECKS = false` in Preview's own `page.tsx`/`manager/page.tsx`, i.e. not an active Cafe v2.1 Staff capability today, so porting it would have added a feature rather than closed a parity gap (explicitly out of scope per the task brief).

## 2. Exact i18n architecture before/after

**Before**: `LangProvider`/`useLang()`/`makeTranslator` (`@/lib/demo/cafe/i18n`) is the real, existing JA/EN mechanism, used throughout `_client-preview`. The dashboard Staff page had no `LangProvider` ancestor and no toggle; the previous consolidation pass had wrapped only the schedule sub-tree in a `LangProvider` as internal plumbing (so the reused `ShiftTable`/`ShiftLegend`/`Modal` wouldn't throw), with every `lang` prop hardcoded to `"en"` and no visible toggle.

**After**: `StaffDashboardClient` now mounts one `LangProvider` around the whole page body (a thin outer wrapper delegates to an inner `StaffDashboardBody` that calls `useLang()`). A reused `PreviewLanguageToggle` (`variant="dark"`, already supports the dashboard's dark theme) sits next to the schedule heading. A new, page-scoped dictionary (`staff-dashboard-i18n.ts`, `tStaffDashboard` + three parameterized helpers + `describeExchangeError`) — built on the *same* `makeTranslator`/`Lang` factory, not a new i18n system — covers every string this consolidation added or touched: schedule heading, All/Only-me, week nav, the schedule-unavailable/loading state, the roster's "Me"/"Staff N" labels (now lang-aware, previously hardcoded English), the shift-detail/exchange-request Modal's field labels and copy, the shift-exchange form's own labels/errors, and the new Inventory card's title/description/shortage-count/button copy. `ShiftTable`/`ShiftLegend` now receive the live `lang` instead of a hardcoded `"en"` literal.

**Deliberately not translated** (documented scope boundary, matching "do not create a broad i18n refactor"): the pre-existing shift-preference/work-report/correction-request sections further down the same page — these predate this consolidation, already carried bilingual-looking labels in their headings (e.g. "My work reports this week / 勤務報告") as static bilingual text rather than a toggle, and were not part of what this task's two named gaps covered. Manager dashboard: untouched, as instructed.

## 3. Recipes/manuals parity — explicitly verified, not assumed

Re-checked directly this pass: `/dashboard/workforce/recipes` and `/dashboard/workforce/recipes/[recipeId]` are real `requireTenantContext()`-based pages (confirmed by reading `recipes/page.tsx`), reading `listWorkforceRecipeCategories`/`listWorkforceRecipes` — the same shared backend Preview's recipe views use, not a preview-only surface. The Workforce hub (`/dashboard/workforce/page.tsx`) links to it ("View recipes"). **RECIPES_PARITY = PASS**, confirmed by source inspection, not carried forward as an assumption from the prior report.

## 4. Files changed this pass

- `apps/web/src/app/(protected)/dashboard/workforce/staff/page.tsx` — added `inventory` module-enabled check (reusing the already-fetched `modulesResult`) and a read-only `listInventoryItemStatus` call; passes `inventoryEnabled`/`inventoryItems` to the client.
- `apps/web/src/app/(protected)/dashboard/workforce/staff/staff-dashboard-client.tsx` — restructured into an outer `LangProvider` wrapper + inner `StaffDashboardBody`; added the language toggle; translated the schedule/exchange-modal strings via the new dictionary; roster labels (`meLabel`/`colleaguePrefixLabel`) now lang-aware; added the Inventory entry-point card section.
- `apps/web/src/app/(protected)/dashboard/workforce/staff/shift-exchange-request-form.tsx` — now takes a required `lang` prop, uses the new `describeExchangeError` instead of the English-only `describeWriteError`.
- `apps/web/package.json` — registered the two new test files.

## 5. New files

- `apps/web/src/app/(protected)/dashboard/workforce/staff/staff-dashboard-i18n.ts` — the new dictionary + parameterized helpers + `describeExchangeError`.
- `apps/web/src/app/(protected)/dashboard/workforce/staff/staff-dashboard-i18n.test.ts` — 7 tests (non-empty/distinct copy for every key in both languages, correct interpolation for the three parameterized helpers, `describeExchangeError` coverage + fallback).
- `apps/web/src/app/(protected)/dashboard/workforce/staff/staff-dashboard-inventory-i18n-regression.test.ts` — 6 source-text regression tests locking in: (a) the Staff page reads Inventory status but never imports an Inventory write action, (b) the client links to `/dashboard/inventory` and never imports the canonical page's own write-form components, (c) `LangProvider`/`useLang()` wiring is present and `ShiftTable`/`ShiftLegend` never hardcode `lang="en"` again, (d) the exchange form requires a typed `lang` prop and uses the JA/EN error mapper, (e) no client-authoritative employee id is threaded into the inventory section.

## 6. Shared components/services reused (no duplication)

- `@/lib/inventory/items.ts` (`listInventoryItemStatus`) — read, already shared with `/dashboard/inventory`.
- `/dashboard/inventory` page itself — reused via navigation link, not forked.
- `@/lib/demo/cafe/i18n` (`LangProvider`, `useLang`, `makeTranslator`, `Lang`) — the existing JA/EN mechanism, extended with one new dictionary, not a new system.
- `@/lib/preview/preview-language-toggle.tsx` (`PreviewLanguageToggle`) — reused as-is (it is a pure presentational `useLang()` consumer with zero identity/tenant logic, the same category of reuse as `ShiftTable`/`ShiftLegend`/`Modal` already established in the prior pass), not re-implemented.

## 7. Any remaining preview-only Staff capability

None found to be essential and missing. `_client-preview`'s opening/closing stock-check session panel remains preview-exclusive but is itself feature-flagged off there (`SHOW_OPENING_CLOSING_STOCK_CHECKS = false`), so it is not a live Cafe v2.1 Staff capability today — not a parity gap. Cosmetic-only leftovers noted previously (Modal's aria-label language default, no touch-swipe week nav, light-theme seam around the schedule grid) are unchanged and still documented as non-blocking.

## 8. Authentication result

Unchanged from the prior pass; no auth code touched this pass. `requireTenantContext()` remains the sole identity path for every dashboard Staff read/write, including the new Inventory read.

## 9. Identity result

`getMyWorkforceStaffProfile()`-resolved `employeeId`/`locationId` remain the only source of identity for every new/changed action. The Inventory entry-point card sends no identity anywhere — it only reads (server-side, tenant/location-scoped) and links; the actual write path (`recordInventoryStockCountAction`) is unchanged, pre-existing, and already resolves `counted_by` server-side inside the RPC.

## 10. Schedule result

Unchanged from the prior pass (roster/self-pin/self-highlight/All-Only-me/week-nav all still real) — this pass only added translation of the same behavior, not new schedule logic.

## 11. Live polling result

Unchanged; not touched this pass.

## 12. Shift-action result

Unchanged behaviorally; the shift-exchange request form gained a required `lang` prop and JA/EN-aware error copy — no change to its request/RLS/identity logic.

## 13. Inventory result

**Closed.** Staff on `/dashboard/workforce/staff` now sees a shortage-count-aware Inventory card (JA/EN) and a working link into the canonical, real, RLS-scoped `/dashboard/inventory` page where the actual daily stock count is entered — the same real write action already used by both Staff and Manager. No duplicate third Inventory implementation was created.

## 14. Recipes/manuals result

**Confirmed PASS** (§3) — real, already-canonical, unchanged this pass.

## 15. JA/EN result

**Closed** for the scope this task named (§2): every string added/touched by the consolidation (roster/schedule, All, Only me, week navigation, shift-exchange actions, Inventory, loading, empty/error states, the exchange modal's confirmation copy) is now JA/EN via a working toggle. Pre-existing, out-of-scope sections (preferences/work-report/correction-request) remain as they were (static bilingual-looking headings, not toggle-driven) — an explicit, documented boundary, not an oversight.

## 16. Manager regression result

No file under `dashboard/workforce/manager/**` touched this pass either (confirmed via `git diff --stat` against that path — empty). `/dashboard/inventory` itself also untouched (confirmed the same way) — reused read-only via its own existing page, not modified.

## 17. Security regression result

- Grepped: no `service_role` in any file touched/added this pass.
- No client-authoritative `employeeId`/`locationId` introduced — the one new context resolver (`shift-exchange-actions.ts`, from the prior pass, unchanged this pass) and the new Inventory read both resolve identity/location server-side only.
- Tenant/location scope: the Inventory read is explicitly scoped to `activeTenant.tenantId` + the caller's own resolved `location.locationId` (same pattern the canonical `/dashboard/inventory` page itself uses).
- Deactivated-Staff protection, cross-employee identity confusion: unchanged, not touched this pass — no new regression surface introduced (the Inventory card is read+link only; the one write path it leads to is pre-existing and unmodified).
- No raw Auth user id or ciphertext newly exposed.

## 18. Full tests

`npm run test` (apps/web): **1006 passed, 0 failed** (993 prior + 13 new: 7 in `staff-dashboard-i18n.test.ts`, 6 in `staff-dashboard-inventory-i18n-regression.test.ts`).

## 19. Typecheck

`npx tsc --noEmit`: clean, 0 errors.

## 20. Lint

`npx eslint` on every changed/new file: clean, 0 errors/warnings.

## 21. Build

`npm run build` (Next.js production build): succeeded, 17 static pages generated; `/dashboard/workforce/staff` now 15.8 kB / 121 kB First Load JS (was 14.2 kB / 120 kB before this pass).

## 22. Git status

Still on `feature/cafe-v2-1-canonical-staff`. This pass's changes: 4 files modified, 5 files newly added (§4/§5), all still **uncommitted**, same as the prior pass — no commit was made (not requested). The unrelated pre-existing untracked docs/product-planning cluster was left untouched, confirmed by `git status`.

## 23. Confirmation Preview untouched

No `supabase` CLI command was run this session. No Preview deploy occurred. No Preview Auth user was created, modified, or read.

## 24. Confirmation Production untouched

No Supabase Cloud command of any kind was run. No production project was referenced or connected to.

## 25. Remaining risks

- Not manually verified in a running browser against real Preview data (no dev server run, no Preview deploy) — verification evidence is code review + the pure-function/source-text test suite + typecheck/lint/build, same caveat as the prior report. A manual QA pass toggling JA/EN and opening the Inventory link as both `staff@mame-to-cha.test` and `staff2@mame-to-cha.test` is the recommended next step.
- The Inventory entry-point card's shortage count is a point-in-time server-rendered snapshot (not live-polled like the schedule grid) — acceptable for an entry-point summary, but worth knowing it can go stale until the page is refreshed.
- Manager-side shift-exchange decide UI still only exists in Preview's Manager panel (unchanged from the prior report, not part of this task's two named gaps).

## 26. Exact next recommended step

1. Founder/QA manual pass on `/dashboard/workforce/staff`: toggle JA/EN and confirm every consolidation-added string switches; open the Inventory link and confirm it lands on `/dashboard/inventory` with the same shortage count; repeat for both `staff@mame-to-cha.test` and `staff2@mame-to-cha.test`.
2. Once that passes, this task's Definition of Done is met — proceed to Phase B (the clean `oruwa-cafe` reference tenant) per the roadmap, per Founder decision.

---

```
CANONICAL_STAFF_ARCHITECTURE = PASS
FUNCTIONAL_PARITY = PASS
IDENTITY_SECURITY = PASS
INVENTORY_PARITY = PASS
I18N_PARITY = PASS
RECIPES_PARITY = PASS
LOCAL_REGRESSION = PASS
READY_FOR_PREVIEW_CONSOLIDATION_QA = YES
ORUWA_CAFE_REFERENCE_TENANT_CREATION = READY
```
