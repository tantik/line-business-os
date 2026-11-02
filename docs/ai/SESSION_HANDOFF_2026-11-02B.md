# Session handoff 2026-11-02B — DEBT-128 (a) done, DEBT-136 receipts data layer merged

## 1. State (`dev` = da12fbb)

- **DEBT-135 DONE** (#673/#674, 0145): `/staff` 21 → 4, `/manager` 35 → 4 PostgREST requests per view.
- **DEBT-138 DONE** (data): `oruwa-cafe` November schedule on staffa/b/c/d/i, published; staff see coworkers.
- **DEBT-128 (a) DONE** (#675, **0146 on Cloud DEV**): no platform-staff bypass in
  `is_member_of` / `has_permission` / `has_permission_in_tenant`, 12 staff-only core policies
  dropped, `packages/core` `can()` without bypass; pgTAP 0085; live-checked. Open (b): MFA,
  staff roles, platform audit log with console Phase B; deployment checklist: no staff
  account in production until then.
- **DEBT-136 part 1 DONE** (#676, **0147 on Cloud DEV**): `purchases.spend_receipts` /
  `spend_receipt_items` / `receipt_settings`, permission `purchases.receipt.manage`
  (owner/admin/manager), private bucket `purchase-receipts`
  (`<tenant>/<location>/<uploader user>/<uuid>.<ext>`, 5 MB, jpg/png/webp).
  - API: `api.create_spend_receipt(tenant, location, purchased_on, amount_jpy, category, note,
    media_path, action_ids uuid[], client_request_id uuid) → uuid`,
    `api.update_spend_receipt(tenant, receipt_id, purchased_on, amount_jpy, category, note,
    media_path, action_ids)`, `api.cancel_spend_receipt(tenant, receipt_id, reason)`,
    `api.set_spend_receipt_settings(tenant, location, receipts_enabled, photo_mode)`;
    views `api.spend_receipts` (`items` jsonb [{action_id, item_id, item_name, action_type,
    actioned_at}], `is_mine`, `created_by_employee_id`), `api.spend_receipt_settings` (no row =
    on + optional).
  - Error codes for the app: P0004 module off (= assert_failure, `when others` does not catch
    it in plpgsql; the app gets it as a normal PostgREST error), P0010 receipts off, P0011 photo
    rule, P0012 edit window closed, P0013 canceled, P0002 not found, 42501 item not allowed /
    no right, 22023 bad input (incl. photo not uploaded, amount < 1, category, note > 200,
    date outside today−90…today, no items without category + note).
  - Rules: amount or photo; Manager adds the amount later; buyer edits until the end of the
    location day, then only `purchases.receipt.manage`; edits check only what changes;
    receipts off → no new receipts and no staff edits; cancel with reason frees the purchases;
    create idempotent per form open (`client_request_id`).
  - pgTAP 0086 (87 asserts); full suite 84 files / 3063 PASS; DB review 2 rounds, no blocker.
  - Design: `docs/architecture/purchase-receipts-design-2026-11-02.md`.
- **DEBT-139** (new, Founder 2026-11-02, priority A, **before release**): several locations per
  client end to end (add/archive location, Manager per location, staff at several stores,
  switcher, Owner cross-location views, billing per location, LINE per client or store).
- Founder 2026-11-02: demo = D now (screenshots + video from the clean demo tenant built in 4D),
  A (one-click read-only demo) right after the site oruwa.jp is live. Commercial stages 2–5: the
  Founder is still thinking — don't push.

## 2. Next (order)

1. **DEBT-136 part 2 — UI** (new branch from `dev`):
   - lib `apps/web/src/lib/purchases/spend-receipts.ts`: list (own / all for the location and
     month), create / update / cancel / settings, error mapping (codes above), signed photo
     URLs like `createInventoryMediaUrlMap`; upload to `purchase-receipts` from the browser
     with the user's session (path above), then create with `media_path`.
   - Purchases popup `apps/web/src/app/(protected)/_ui/purchases-popup.tsx` (used by the staff
     and manager dashboards): after 「購入済み」/「入荷」 an action 「レシートを追加」 → sheet:
     photo (per `photo_mode`), amount (optional), date (today), today's own bought/received
     items pre-ticked, new `client_request_id` per sheet open; 「+ レシート」 without items
     (category + note).
   - Tab 「レシート」: Staff 「自分のレシート」 (edit today / cancel); Manager all receipts of
     the location + monthly spend (total, by person, by category; count 「金額未入力」) +
     settings in ••• (receipts on/off, photo off / optional / required).
   - Load the tab's data on open (server action), not in the page RPC (keeps DEBT-135 gains).
   - JA/EN, Design System, phone first. Unit tests; oruwa-ux-i18n-reviewer; live check on
     preview.oruwa.jp at phone size as staffa (create with photo, without amount, cancel) and
     as the Manager (add amount later, spend view, settings).
2. DEBT-103 (b)(c) — tenant deletion leftovers.
3. **DEBT-139** several locations per client — design first, Founder decisions marked F.
4. 4D — first-run of a new client (DEBT-133 etc.) + the clean demo tenant via the console +
   screenshots/video for the site.
5. Production pack (Founder presses the buttons).

## 3. Bootstrap prompt (new chat)

```
Продолжи по docs/ai/SESSION_HANDOFF_2026-11-02B.md §2 и памяти.
Следующий шаг — DEBT-136 часть 2: интерфейс чеков (レシート) в попапе закупок; слой БД 0147 уже на dev и на Cloud DEV.
Потом по плану: DEBT-103 (b)(c) → DEBT-139 (несколько точек, до релиза) → 4D (+ чистое демо и скриншоты) → production pack.
Кто решает: ты — CTO; ко мне — только продакшн/main, сообщения реальным людям, деньги/аккаунты/юридическое, .github/workflows. Одним списком.
Chrome — личный профиль, только свои новые вкладки; второй логин — chrome-devtools isolatedContext; закрывать после работы. QA только на preview.oruwa.jp; учётки в .claude/qa-accounts.local.md.
Правила: миграции/RLS — oruwa-db-security-reviewer; видимый UI — oruwa-ux-i18n-reviewer + живая проверка на телефонном размере; одна команда на вызов Bash. Общение на русском.
Коммерческие файлы (docs/commercial/, ORUWA_*_RU.md, NEW_CHAT_PROMPT_*_RU.md, qa121026-evidence/) не коммитить и не трогать; добавлять только конкретные файлы.
```
