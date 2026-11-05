# Session handoff 2026-11-05 — DEBT-139 L2 done, L3 (a DB + b cabinet) built, fixes pending

## 1. Done and live (dev + Cloud DEV)

| PR | What | Cloud DEV |
|---|---|---|
| #691, #692 | Inventory item-name machine translation + EN sentence case | 0153 |
| #693 | L2: one active store per request (`resolveActiveLocation`, cookie `oruwa_location`), store switcher on /manager (managed stores only, none on /staff), page context `myLocations` | 0154 |
| #694 | L2: Manager / Staff dashboards read one store | 0155 |

Live-checked at 375 px: qa-4c-cafe-1 (2 stores: 本店 + 駅前店) switches correctly; oruwa-cafe (1 store) unchanged. Carried L2 items: DEBT-139 (g)–(n) in the debt register.

## 2. In flight — DEBT-139 L3 (NOT merged, NOT on Cloud DEV)

Both branches are pushed (no PR yet):

- **`feat/debt-139-l3a-db`** @ `f019dee` — migration `0156_locations_l3_move_and_scope.sql` + pgTAP (0013, 0082, 0089). Local suite 3449 PASS.
  - `core.move_employee_location` cancels the person's pending shift_requests / leave_requests and open/accepted shift_exchanges (requester or replacement) at the OLD store; result `cancelled_requests`; audit counts.
  - preference unique index `wf_shift_requests_one_preference_per_day` now `where kind='preference' and status <> 'cancelled'` (approved by Lead).
  - `api.workforce_staff_manage.manager_scope` ('tenant'|'location'|null) via `core.employee_user_manager_scope` (same caller gate as 0152).
  - `api.my_locations.created_at` + page context `myLocations[].created_at` (main store = oldest).
  - **oruwa-db-security-reviewer: PASS** (no P0/P1).
- **`feat/debt-139-l3b-cabinet`** @ `9367f65` — web. 1315 tests PASS, typecheck + lint clean, `next build` not run.
  - Default store = strongest access → oldest `createdAt` → name; all store lists in that order.
  - /manager settings section 「店舗」 (Owner/Admin with `core.location.manage`): add, ••• rename / archive / restore, ConfirmDialog for archive; actions in `lib/tenant/location-manage-actions.ts`.
  - ManagerRoleSection always uses the 4-arg `set_employee_manager_role`; with 2+ stores radio 「この店舗のみ」/「全店舗」, current scope + change button.
  - Staff detail 「別の店舗へ移動」 (Owner, 2+ stores) with warnings (requests cancelled, future shifts block, store-manager rights move along).
  - Cancelled requests: corrections ignored in staff view, `activePreferenceRequestsByDate` in the preference modal, manager correction history labels キャンセル済み.
  - UX review NOT done yet.

## 3. Fixes to make before PRs (Lead decisions, already made)

DB (new commit on `feat/debt-139-l3a-db`, then re-run pgTAP + short re-review):
1. **`api.manager_dashboard` must return `manager_scope`** — the 0155 staff part selects columns explicitly (`s.has_account_access, s.is_manager, s.is_admin` at 0155:151). Replace the function in 0156 with the 0155 body + `s.manager_scope`. Without it the web never gets the scope.
2. **Move also cancels future preferences already marked reviewed**: preference rows of the person at the old store with `work_date >= today` (old store time zone) and status `pending` OR `approved` → `cancelled`. Past ones stay as history. Otherwise an approved preference at store A still occupies that day for store B.
3. Debt register entry (P3 from review): `wf_shift_requests_self_insert` (0097:191-198) does not tie `location_id` to the employee's home store, so a request can be inserted at an old store (also races a move). Decide together with DEBT-139 (d)/(n) help shifts.
4. Design note (P3): cancelling an accepted exchange where the moved person is the `replacement` cancels the whole exchange; the requester is not notified. Write it into multi-location design §3.4 and the move dialog text.

Web (new commit on `feat/debt-139-l3b-cabinet`):
5. **Review P2:** readers of preferences must skip `status = 'cancelled'` and use only the run store: `monthly-shift-preference-modal.tsx` `lockedByDate` (check that the L3b change covers it), `lib/workforce/schedule-actions.ts:305,336` / `listShiftRequestsForManager` for auto-distribute, `packages/workforce/src/auto-distribute.ts:362-366` (last-wins Map), manager preference lists. `computeUnavailableConflictCellKeys` and `shift-exchange-candidates` ignore status too — filter.
6. After 0156 is on Cloud DEV: add `manager_scope` to `MANAGE_SELECT` (employees.ts) and `created_at` to `listMyLocations` if those direct reads need them (engineer left them out on purpose).

Then:
7. `db push` 0156 to Cloud DEV from the MAIN checkout (only it is linked; detach at the L3a commit, push, switch back).
8. oruwa-ux-i18n-reviewer on L3b; oruwa-reviewer on both.
9. PRs (DB first, merge with `--db-review-pass`), then web; wait for preview.oruwa.jp.
10. Live QA at 375 px on qa-4c-cafe-1 (owner) — engineer's list:
    - stores section: long names ellipsis, ••• menu, add field wraps, badges メイン / 表示中;
    - errors: 3rd store limit (max_locations 3 — qa-4c-cafe-1 has 2, so add 1 OK then 4th refused), store with staff → has_active_staff, last store, duplicate name; JA + EN;
    - after add / archive the switcher updates; archiving the current store falls back to the main store;
    - manager scope radio / text / change; 1-store tenant (oruwa-cafe) unchanged;
    - move: dialog over the staff popup, future shifts refusal, success removes the person and shows cancelled count;
    - after move, staff view: no cancelled days as submitted, no 「保留中」; manager correction history キャンセル済み;
    - a store Manager sees neither 「店舗」 nor move.
    Second login via chrome-devtools isolatedContext; close all tabs after.

## 4. After L3

L3c console (platform_create / rename / set_active location in admin/tenants) → L4 (「全店舗」 totals in Owner views) → L5 (live "two stores" QA, cross-store probes) → 4D (ideal demo tenant, screenshots) → production pack incl. DEBT-141.

## 5. Housekeeping

- Worktrees: L3a `.claude/worktrees/agent-aef855283301363c7`, L3b `.claude/worktrees/agent-a6a32419e2e937948` (keep until merged); many stale merged worktrees — clean in a batch.
- The DB reviewer ran `db reset` from the L3a worktree: local DB is at 0156 now.
- Main checkout is on `feat/debt-139-l3-store-management` (empty, = dev at fetch time) — can be deleted.

## 6. Bootstrap prompt for the next chat

```
Продолжи по docs/ai/SESSION_HANDOFF_2026-11-05.md §3 и памяти.
Сегодня в dev и на Cloud DEV: #691/#692 (перевод названий, 0153), #693/#694 DEBT-139 L2 (0154, 0155).
В работе DEBT-139 L3: ветки feat/debt-139-l3a-db (f019dee, 0156, DB-ревью PASS) и
feat/debt-139-l3b-cabinet (9367f65, веб) запушены, PR нет, 0156 НЕ на Cloud DEV.
Сначала правки §3 п.1–6 (решения уже приняты), потом db push 0156 → ревью → PR → merge → живая проверка §3 п.10 на qa-4c-cafe-1, 375 px.
Потом L3c консоль → L4 → L5 → 4D → production pack (вкл. DEBT-141).

Кто решает: ты — CTO, решения по разработке принимаешь сам; ко мне — только продакшн/main, сообщения реальным людям,
деньги/аккаунты/юридическое, .github/workflows. Одним списком.
Chrome — личный профиль, только свои новые вкладки; второй логин — chrome-devtools isolatedContext; закрывать после работы.
QA только на preview.oruwa.jp; учётки в .claude/qa-accounts.local.md.
Правила: миграции/RLS — oruwa-db-security-reviewer; видимый UI — oruwa-ux-i18n-reviewer + живая проверка на телефонном размере;
одна команда на вызов Bash; amend/force-push запрещены настройками — новые коммиты или новая ветка. Общение на русском.
Коммерческие файлы (docs/commercial/, ORUWA_*_RU.md, NEW_CHAT_PROMPT_*_RU.md, qa121026-evidence/) не коммитить и не трогать;
добавлять только конкретные файлы.
```
