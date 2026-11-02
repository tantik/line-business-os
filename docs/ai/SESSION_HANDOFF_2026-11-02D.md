# Session handoff 2026-11-02D — DEBT-103 b/c DONE, DEBT-139 L1 under DB review

## 1. State

- **DEBT-103 (b)(c) DONE** — #681 merged to `dev`; **0148 + 0149 applied on Cloud DEV**.
  - 0148: wider orphan rule in `core.purge_tenant`, `core.user_is_referenced` (catalog-wide FK check), `core.purge_unreferenced_users` + `audit.user_purge_log`.
  - 0149: purge deletes rows of tables with `tenant_id` but no FK to `core.tenants` (stock_counts, purchase_actions, …) before the cascade.
  - Cloud DEV: mame-to-cha purged (tombstone 4, 9 recipe-media objects removed), smoke-tenant-a/b purged (5, 6); all 7 unreferenced users deleted (3 personal-gmail ones after Founder "удали"). 0 unreferenced non-staff users left.
- **DEBT-139 design merged** — #682, `docs/architecture/multi-location-design-2026-11-02.md`. **Founder decisions F1–F5 answered 2026-11-02** (recorded in §5 of the design, commit `1f5712a` on the L1 branch, not yet on `dev`):
  F1 Owner adds stores in the cabinet + ORUWA in the console; F2 tier S/M per store by its staff count; F3 one home store per person (Owner can move), help shifts later; F4 up to 3 stores self-service, surcharge from the 3rd store (amounts = Founder's pricing docs); F5 one LINE OA per client.
- **DEBT-139 L1 (DB) implemented, NOT reviewed yet, NOT on Cloud DEV:**
  - Branch `feat/debt-139-l1-locations-db` (pushed): `1f5712a` (design decisions) + `55feffa` (0150 + pgTAP 0089 + one line in 0006 allow-list).
  - 0150 `core_locations_lifecycle`: `core.location.manage` (Owner/Admin), `max_locations = 3` per plan (`core.plan_default_limits`, module `core`), create / rename / activate-deactivate store (cabinet `api.create_location` etc., console `api.platform_*` with `p_actor_id`), new store copies settings of a source store (schedule settings with auto-create off, shift types, checklist templates/items/schedules, receipt settings), `api.my_locations` (access all/manage/staff), scoped Manager = 4-arg overload `set_employee_manager_role(..., p_scope)`, `api.move_employee_location`.
  - Lead-verified locally: `supabase db reset` + `supabase test db` → **Files=87, Tests=3304, PASS**.
  - **oruwa-db-security-reviewer result (2026-11-02): no P0; FAIL on the store-to-store boundary — fix before merge:**
    - **P1 (verified by probe):** older RLS policies check `core.has_permission_in_tenant` (ignores `location_id`); with the new store-scoped Manager they let a Manager of store A read / change store B rows: `workforce.employee_line_links` (0097:595-604, FOR ALL; also via `api.workforce_employee_line_links`), `workforce.employee_invitations` manager_read / manager_revoke (0097:631-650); tenant-wide `operations.checklist_templates` (0105:105-123, create 0105:349) and recipes (0097:377-459) editable by a store Manager. Fix in a new migration: line_links / invitations check `core.has_permission(e.tenant_id, 'workforce.staff.manage', e.location_id)` via the employee row; tenant-wide templates / recipes require `core.has_permission(tenant, perm, null)` (Lead decision: tenant-wide rows = tenant-wide grant only). Also review the flag-only uses: `core.employee_user_is_manager` / `_is_admin` (0138:180, 0140:233), 0116:351, realtime topics 0127:62-66, 0142. Extend pgTAP 0089 §J with these tables + `api.workforce_shift_requests`, leave_requests, attendance, staff_messages, and UPDATE/DELETE-returns-0 checks. Design doc line 80 ("RLS already enforces this") must be corrected.
    - **P2 (verified):** `api.workforce_staff_manage` is auto-updatable and lets a tenant-wide Manager update `employees.location_id` directly (bypasses `move_employee_location`: no `core.location.manage`, archived target allowed, future shifts ignored, scoped role left behind, no audit). Fix: BEFORE UPDATE OF location_id trigger on `workforce.employees` that only allows the change inside `core.move_employee_location` (transaction-local GUC set by the definer), + pgTAP.
    - **P2:** missing `has_module_access('workforce')` in `move_employee_location` (0150:675-772); tests missing for module-off on move / 4-arg appointment / my_locations, cross-tenant Owner on the 4-arg appointment.
    - **P3:** archiving should turn off `auto_create_enabled` and deactivate the store's task schedules (0150:408-455); pending shift / leave requests stay at the old store on move, and a shift can be inserted between the future-shift check and the move (lock the employee row / re-check); name uniqueness: add partial unique index on `(tenant_id, lower(normalize(btrim(name, ' 　'), NFKC))) where is_active` after checking Cloud DEV for duplicates; move silently carries a store Manager role to the new store (make it explicit in L3); console actions audited as `actor_kind 'user'` (mark platform); 3-arg 0138 call on a store Manager returns "unchanged" (L3 must use the 4-arg one).
    - PASS: tenant-to-tenant boundary, who can create stores, definer grants / search_path, no direct writes on `core.locations`, limit + reactivate, copy set, audit without PII, error codes, 0006 allow-list, rollback.
  - Engineer findings to carry into L2/L3: rows keyed by employee keep their old `location_id` after a move (history stays with the store); archiving a store does not remove location-scoped manager roles on it (refused anyway while active staff remain); no Edge Function / web for the platform path yet (L3).

## 2. Next

1. Fix the review findings of §1 on the L1 branch (P1 + P2 required, P3 where cheap; 0150 is not on Cloud yet, so it may still be edited) → re-review the fixes (oruwa-db-security-reviewer) → full pgTAP → `db push` 0150 to Cloud DEV (dry run first) → PR to `dev` → merge via `scripts/ai-dev-merge.sh <PR> --db-review-pass`.
2. **L2** web: `resolveActiveLocation` (same rules as `selectActiveTenant`, cookie `oruwa_location`) in the page context, replace every "sole active location" (manager, recipes, weekly-review, recipe-actions, attendance-month-actions, post-login-redirect = DEBT-120 d) and "first active location" path (purchases, inventory, operations, issues, staff pages), switcher on `@line-os/ui` (DEBT-120 a/b/c); oruwa-reviewer + oruwa-ux-i18n-reviewer + live check at 375 px on preview.oruwa.jp.
3. L3 cabinet + console UI (add / rename / archive store, Manager scope, move employee), L4 「全店舗」 totals, L5 live "two stores" QA, L6 billing with Stripe.
4. Then 4D → production pack (incl. DEBT-141).

## 3. Bootstrap prompt (new chat)

```
Продолжи по docs/ai/SESSION_HANDOFF_2026-11-02D.md §2 и памяти.
DEBT-103 (b)(c) закрыт (#681, 0148+0149 на Cloud DEV). Дизайн DEBT-139 в dev (#682), мои решения F1–F5 даны (записаны в §5 дизайна на ветке L1).
Сейчас: DEBT-139 L1 (БД) на ветке feat/debt-139-l1-locations-db, коммит 55feffa (0150 + pgTAP 0089), локально 3304 PASS, на Cloud DEV НЕ применено. Ревью БД готово (§1): P1 — менеджер одной точки видит/меняет LINE-привязки, приглашения и общие шаблоны/рецепты другой точки; P2 — прямое изменение employees.location_id в обход move_employee_location. Исправь P1+P2 (и дешёвые P3), повторное ревью, db push, PR в dev. Потом L2 (единый выбор точки + переключатель на всех страницах) → L3 → L4 → L5 → 4D → production pack (вкл. DEBT-141).
Кто решает: ты — CTO, простые решения принимаешь сам; ко мне — только продакшн/main, сообщения реальным людям, деньги/аккаунты/юридическое, .github/workflows. Одним списком.
Chrome — личный профиль, только свои новые вкладки; второй логин — chrome-devtools isolatedContext; закрывать после работы. QA только на preview.oruwa.jp; учётки в .claude/qa-accounts.local.md.
Правила: миграции/RLS — oruwa-db-security-reviewer; видимый UI — oruwa-ux-i18n-reviewer + живая проверка на телефонном размере; одна команда на вызов Bash. Общение на русском.
Коммерческие файлы (docs/commercial/, ORUWA_*_RU.md, NEW_CHAT_PROMPT_*_RU.md, qa121026-evidence/) не коммитить и не трогать; добавлять только конкретные файлы.
```
