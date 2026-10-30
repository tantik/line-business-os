# Session handoff 2026-10-29C — DEBT-124 + DEBT-135 in progress

## 1. State

- #666 (pgTAP in CI) merged to `dev` by the Founder (10:04 UTC).
- **Branch protection is NOT set.** `dev` has no protection at all (no rules, no rulesets); `main` has PR-required, no required checks. The agent cannot set it: project `.claude/settings.json` denies every mutating `gh api` call (`-X`, `--input`, …) — deny beats any approval. Founder must click it: Settings → Branches → rule `dev`: require checks `pgTAP (supabase test db)` + `typecheck / test / build / lint` (no "up to date"); same two checks on the `main` rule. Founder said "да" to both in chat.
- Work branch **`perf/debt-124-135-request-fanout`** (pushed, no PR yet), 2 commits on top of `dev`:
  1. `perf(auth)` (DEBT-124) — DB/security review **PASS WITH FIXES** (no blocker/major).
  2. `WIP perf` — review fixes 1, 2, 4 applied + 0143 page context (**not reviewed yet**).
- Local evidence: `supabase db reset` + full `supabase test db` 79 files / 2445 PASS (before 0143); 0081 17/17, 0082 27/27; web tests 1215/1215; tsc + eslint clean (eslint not re-run after commit 2).
- Nothing applied to Cloud DEV. **0142 and 0143 must be `db push`ed to Cloud DEV BEFORE the branch is merged** — the pages call `api.my_access` / `api.my_page_context`; without them `/manager` fails closed to Unauthorized and memberships fail.

## 2. What the branch does

| Change | Requests saved per view |
|---|---|
| `getClaims()` instead of network `getUser()` in middleware, `(protected)` layout (`requireUserId`), tenant context. Cloud DEV JWTs are **ES256** (checked from a live session header), JWKS cached per process. Account page, admin console (`requireUser` added), sign-in, password reset, invitation actions keep network `getUser()` | 2 (`auth/v1/user`) |
| 0142 `api.my_access(tenant, location, location[], tenant[], anyLocation[])` → jsonb; delegates to `core.has_permission` / `has_permission_in_tenant` / `caller_is_tenant_owner`. `lib/auth/my-access.ts` `loadMyAccess` (fail closed). `/manager` 5 → 1, `/staff` 2 → 1 | 4 / 1 |
| `/staff` Operations item responses: one paged `in(...)` read instead of one per task (`listItemResponsesForInstances`) | N−1 |
| 0143 `api.my_page_context()` → memberships, navigation, locations, active packages, both pending-invitation lists. `lib/tenant/page-context.ts` `loadPageContext` (React `cache`, request-scoped) used by tenant context, both layout banners, `/manager`, `/staff`. Row mappers extracted (`mapMembershipRows`, `mapTenantLocationRows`, `mapTenantNavigationRows`, `mapTenantPackageCodes`, `mapPendingTenantInvitationRows`, `mapMyPendingWorkforceInvitationRows`) | 5 |

Estimate after the branch: `/manager` ≈ 45 → ≈ 33. Still above the ≤ 10 target.

## 3. Next (order)

1. Remaining review items (commit 1): pgTAP 0081 extra cases — Manager limited to L2 asked at L1; platform staff (`has_permission` true, `isTenantOwner` false); null arrays / null elements; null tenant; 64 entries accepted; Employee with location-scoped permission vs `tenant` group. NITs: move the new `export const …_PERMISSION` lines above the JSDoc (weekly-review/access.ts, manager-access.ts, manager-role.ts, recipes.ts); export `INVENTORY_MANAGE_PERMISSION` from `lib/inventory/items.ts` instead of the local const in `staff/page.tsx`.
2. `oruwa-db-security-reviewer` on 0143 + page-context wiring (commit 2). Then eslint, full pgTAP, PR to `dev`.
3. `db push` 0142 + 0143 to Cloud DEV → merge via `scripts/ai-dev-merge.sh` → live check `/manager`, `/staff`, banners, admin console on preview.oruwa.jp → measure with `scripts/load/manager-page-views.mjs` (short run, e.g. 10 min) + Supabase Logs Explorer grouped by path for the window; record in DEBT-097/124/135.
4. To reach ≤ 10: `api.manager_dashboard(...)` bundle — one invoker RPC returning the rows of the ~18 core reads (staff manage, line links, shift types, requests ×2, assignments ×2, attendance, invitations, exchanges, messages, inventory status, purchases needed, schedule settings, auto runs, my profile, open exceptions, open issues) with the SAME filters/order as the TS functions and `LBO_ROW_CAP`-style limits (RPC output is not capped by max_rows). Same for `/staff`. Then lazy-load popup-only data (purchase history/awaiting, recipes + translations + media, operations templates/items/schedules/today tasks, all issues, inventory media) — UX-visible → UX review + live check. Consider folding `operations_flag_missed_critical` (a write on every Manager view) into a cron.
5. Then DEBT-128 (B-0) → DEBT-103 (b)(c) → 4D → production pack (as in SESSION_HANDOFF_2026-10-29.md §3).

Untracked files in the repo root not created by this session (left alone): `ORUWA_FOUNDER_COMMERCIAL_LEGAL_DECISIONS_2026-10-29_RU.md`, `NEW_CHAT_PROMPT_ORUWA_COMMERCIAL_LEGAL_2026-10-29_RU.md`, `qa121026-evidence/`.

## 4. Bootstrap prompt

```
Продолжи по docs/ai/SESSION_HANDOFF_2026-10-29C.md §3 и памяти.
Ветка perf/debt-124-135-request-fanout (запушена, PR нет). 0142/0143 на Cloud DEV ещё НЕ применены —
db push до слияния, иначе /manager покажет Unauthorized.
Chrome — личный профиль, только свои новые вкладки, закрывать после работы.
QA только на preview.oruwa.jp; учётки в .claude/qa-accounts.local.md.

Кто решает: ты — CTO, все решения по разработке, слияния в dev, миграции и деплой на Cloud DEV — твои.
Ко мне — только продакшн, сообщения реальным людям, деньги/аккаунты/юридическое, .github/workflows, main
и защита веток (gh api на запись запрещён настройками). Одним списком.

Правила: dev-слияния через scripts/ai-dev-merge.sh; миграции/RLS — oruwa-db-security-reviewer;
видимый UI — oruwa-ux-i18n-reviewer + живая проверка; одна команда на вызов Bash. Общение на русском.
```
