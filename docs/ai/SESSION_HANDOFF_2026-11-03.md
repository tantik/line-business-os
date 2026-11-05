# Session handoff 2026-11-03 — DEBT-139 L1 DONE, inventory fixes live, name translation in flight

## 1. State

Merged to `dev` today (all live on preview.oruwa.jp):

- **#686** inventory item form: specific JA/EN field errors (reorder point > target etc.), red border, focus. Live-checked at 375 px.
- **#687** `0150_inventory_media_policy_objects_name` — item photos upload/read again (0095 had re-broken the 0088 `objects.name` fix; nothing uploaded since 2026-08-24). **0150 on Cloud DEV.** pgTAP 0090.
- **#688 DEBT-139 L1 (DB)** — `0151_core_locations_lifecycle` (was 0150 on the branch) + `0152_location_scoped_manager_boundaries`. **0151 + 0152 on Cloud DEV** (trigger, unique index, max_locations limits verified). oruwa-db-security-reviewer: review 1 FAIL (P1/P2) → fixed → re-review FAIL (tests) → final PASS. pgTAP 0089 = 202 tests; full suite Files=88 PASS.
  - Rule now: a store-scoped Manager reaches only their store; employee-owned rows (LINE links, invitations, role flags) are checked at the employee's home store; writing tenant-wide rows (shared recipes, categories, recipe media, shared Operations templates) needs a tenant-wide grant. Home location changes only through `api.move_employee_location`.
  - Carried to L2/L3: DEBT-139 (a)–(f) in `docs/operations/deferred-debt-register.md`. Open P3: archive in a timezone west of UTC (`greatest(v_today, current_date, effective_from)`), recipe-categories RLS only tested behind the missing grant.
- **#689** any photo (inventory, recipes, receipts) is reduced in the browser before upload (`lib/media/shrink-image-*`, accept `image/*`, ≤2048 px, JPEG ≤1.5 MB, server still → WebP). Live-checked: an AVIF uploaded, stored as WebP 62 KB.

Cloud DEV data (oruwa-cafe, Founder test week from 2026-11-03): 13 Japanese inventory items with photos (牛乳 15/10 L, 氷, 水, 炭酸水, お団子（カラー）, お団子（黒）, オレンジジュース, アイスコーヒー, 生クリーム, アーモンドミルク, ココア, ココナッツミルク, コーヒー; unit pcs except 牛乳); 9 old items archived (history kept, not deleted).

## 2. In flight — inventory item name translation (Founder: "нет перевода")

- Branch `feat/inventory-name-translation`, worktree `D:/Dev/line-business-os/.claude/worktrees/agent-ae7a51710077f7942`, commit `e2e2c8b` rebased on dev locally (**not pushed after rebase**; the engineer was told to push fixes to `feat/inventory-name-translation-v2`, no amend/force — denied by settings).
- `0153_inventory_item_name_translation` (items.name_language, content.translations accepts `inventory_item`/`name`, read/manage/source/language helpers) + pgTAP 0091; web: translate on save via `after()`, lazy backfill ≤20 per Manager load, `displayItemName` on every item-name surface, +1 batched read per page.
- Lead ran full pgTAP after rebase: Files=89, Tests=3384 PASS. Reviews: DB PASS (P3 only), UX PASS (P3 only).
- **Fix batch sent to the engineer (may be done or half-done — check the worktree / `-v2` branch):** backfill gated on `inventory.item.manage` + cooldown/dedupe, never save '' ; search by original OR translated name; recipe picker sorted by label; `/purchases` read in Promise.all; edit-form hint (JA 「元の名前（他の言語では自動翻訳で表示されます）」); delete translations on permanent delete; JS/SQL trim consistency; extra pgTAP (Staff denial, tenant-wide Manager, backfill keeps updated_at).
- Then: full pgTAP → `db push` 0153 to Cloud DEV (dry run first; the main checkout CLI v2.107 has no consent prompt, the newer CLI needs `--yes` / `--read-only`) → PR to dev → `scripts/ai-dev-merge.sh <PR> --db-review-pass` → live check on preview in EN (names translated from the next load after backfill; Staff sees them; purchases/receipts labels).

## 3. Other open items

- **New product name** (Founder: ORUWA sounds bad to Japanese ears). Prompt ready for a separate chat: `NEW_CHAT_PROMPT_BRAND_NAME_RU.md` (repo root, NOT committed — commercial). Direction: control, growth, development, speed (swift). Lead recommendation: rebrand only the user-visible layer (UI, mail, domains, site, legal, LINE); keep internal ids (`--oruwa-*`, `oruwa:` topics, cookies, `oruwa-cafe` demo).
- Live checks not done for #689 on phones (iPhone HEIC in Safari, Android large photo, portrait orientation).
- Next in plan after translation: **DEBT-139 L2** (resolveActiveLocation + switcher on all pages, DEBT-120) → L3 → L4 → L5 → 4D → production pack (incl. DEBT-141).
- Worktrees to clean when done: `.claude/worktrees/agent-*` (engineer worktrees; check `git worktree list`).

## 4. Bootstrap prompt (new chat)

```
Продолжи по docs/ai/SESSION_HANDOFF_2026-11-03.md §2 и памяти.
Сегодня в dev: #686 (ошибки формы товара), #687 (фото товаров, 0150 на Cloud DEV), #688 DEBT-139 L1 (0151+0152 на Cloud DEV), #689 (любое фото с уменьшением). В oruwa-cafe 13 японских товаров с фото — я тестирую неделю.
Сейчас: автоперевод названий товаров — ветка feat/inventory-name-translation (worktree .claude/worktrees/agent-ae7a51710077f7942, e2e2c8b, ревью PASS) + пакет правок P3 у инженера (проверь, что сделано, ветка -v2). Доведи: pgTAP → db push 0153 на Cloud DEV → PR → merge → живая проверка в EN. Потом DEBT-139 L2 (единый выбор точки + переключатель) → L3 → L4 → L5 → 4D → production pack (вкл. DEBT-141).
Кто решает: ты — CTO, простые решения принимаешь сам; ко мне — только продакшн/main, сообщения реальным людям, деньги/аккаунты/юридическое, .github/workflows. Одним списком.
Chrome — личный профиль, только свои новые вкладки; второй логин — chrome-devtools isolatedContext; закрывать после работы. QA только на preview.oruwa.jp; учётки в .claude/qa-accounts.local.md.
Правила: миграции/RLS — oruwa-db-security-reviewer; видимый UI — oruwa-ux-i18n-reviewer + живая проверка на телефонном размере; одна команда на вызов Bash; amend/force-push запрещены настройками — новые коммиты или новая ветка. Общение на русском.
Коммерческие файлы (docs/commercial/, ORUWA_*_RU.md, NEW_CHAT_PROMPT_*_RU.md, qa121026-evidence/) не коммитить и не трогать; добавлять только конкретные файлы.
```
