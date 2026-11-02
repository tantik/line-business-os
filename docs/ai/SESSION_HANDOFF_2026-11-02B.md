# Session handoff 2026-11-02B — DEBT-128 (a) done, DEBT-136 receipts data layer in review

## 1. State

- `dev` has #675 (DEBT-128 a): **0146 on Cloud DEV** — no platform-staff bypass in
  `is_member_of` / `has_permission` / `has_permission_in_tenant`, 12 staff-only core
  policies dropped, `packages/core` `can()` without bypass; pgTAP 0085; live-checked
  (manager 7 popups, staffa 6 popups, staff account sees 0 tenant rows). Open DEBT-128 (b):
  MFA / staff roles / platform audit with console Phase B; deployment checklist: no staff
  account in production until then.
- DEBT-138 done (data): `oruwa-cafe` November schedule on staffa/b/c/d/i, published.
- Founder 2026-11-02: demo = D now (screenshots/video from the clean demo tenant built in 4D),
  A (one-click read-only) right after the site oruwa.jp is live. Commercial stages 2–5: the
  Founder is still thinking — don't push.
- **DEBT-136 receipts**, branch `feat/debt-136-spend-receipts` (not pushed at writing time):
  - c77d1a7 + c8e94ca: 0147 `purchases.spend_receipts` / `spend_receipt_items` /
    `receipt_settings`, permission `purchases.receipt.manage` (owner/admin/manager), bucket
    `purchase-receipts` (`<tenant>/<location>/<uploader>/<uuid>.<ext>`), definer writes behind
    invoker `api.create_spend_receipt(…, p_client_request_id)`, `api.update_spend_receipt`,
    `api.cancel_spend_receipt`, `api.set_spend_receipt_settings`; views `api.spend_receipts`
    (items jsonb, `is_mine`, `created_by_employee_id`), `api.spend_receipt_settings`.
  - pgTAP 0086 (82 asserts); full suite 84 files / 3058 PASS locally.
  - DB review round 1: no blocker; 2 P2 fixed in c8e94ca (idempotency; edits check only what
    changes so a Manager can complete old receipts). Round 2 was running.
  - **0147 NOT on Cloud DEV.** Error codes for the app: P0004 module off, P0010 receipts off,
    P0011 photo rule, P0012 edit window closed, P0013 canceled, P0002 not found, 42501 item not
    allowed / no right, 22023 bad input.
  - Design + rules: `docs/architecture/purchase-receipts-design-2026-11-02.md`; Founder
    2026-11-02: amount optional, amount or photo required, the Manager adds the amount later,
    spend view marks receipts without amount 「金額未入力」.

## 2. Next (order)

1. Review round 2 fixes → push branch → `db push --linked` 0147 → PR part 1 → `ai-dev-merge.sh --db-review-pass`.
2. Part 2 UI (new branch): lib `apps/web/src/lib/purchases/spend-receipts.ts` (list/create/update/cancel/settings, error mapping, signed photo URLs like inventory media); Purchases popup (`apps/web/src/app/(protected)/_ui/purchases-popup.tsx`, used by staff + manager dashboards): after 購入済み / 入荷 a 「レシートを追加」 action (sheet: photo per `photo_mode`, amount, date, today's own bought/received items pre-ticked, client_request_id per form open); tab 「レシート」: Staff 「自分のレシート」, Manager all receipts + monthly spend (total / by person / by category, 「金額未入力」 count) + settings in •••. Load the tab's data on open (server action), not in the page RPC (DEBT-135). JA/EN. oruwa-ux-i18n-reviewer + live check on preview at phone size (staffa + manager).
3. Then DEBT-103 (b)(c) → **DEBT-139 several locations per client (Founder 2026-11-02: before release; design first, Founder decisions marked F in the row)** → 4D (+ clean demo tenant via the console, screenshots) → production pack.

## 3. Bootstrap prompt

```
Продолжи по docs/ai/SESSION_HANDOFF_2026-11-02B.md §2 и памяти.
DEBT-136 (чеки): слой БД 0147 + pgTAP 0086 на ветке feat/debt-136-spend-receipts, НЕ на Cloud DEV.
Кто решает: ты — CTO; ко мне — только продакшн/main, сообщения реальным людям, деньги/аккаунты/юридическое, .github/workflows. Одним списком.
Chrome — личный профиль, только свои новые вкладки (второй логин — chrome-devtools isolatedContext), закрывать после работы. QA только на preview.oruwa.jp; учётки в .claude/qa-accounts.local.md.
Правила: миграции/RLS — oruwa-db-security-reviewer; видимый UI — oruwa-ux-i18n-reviewer + живая проверка; одна команда на вызов Bash. Общение на русском.
```
