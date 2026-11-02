# Session handoff 2026-11-02C — DEBT-136 receipts DONE, next = DEBT-103 (b)(c)

## 1. State (`dev` after #679)

- **DEBT-136 DONE** (purchase receipts, レシート):
  - #676 data layer (0147, on Cloud DEV), #678 UI, #679 polish — all merged to `dev`.
  - Code: `apps/web/src/lib/purchases/{spend-receipts,spend-receipt-input,spend-receipt-actions}.ts`,
    `apps/web/src/app/(protected)/purchases/{receipts-tab,receipt-sheet,receipts-i18n,receipts-copy}.tsx|ts`,
    `apps/web/src/lib/media/shrink-image-client.ts`.
  - Tab data loads on open via `loadSpendReceiptsAction(location, month, tz, 'tab'|'prompt')`; page RPCs unchanged (DEBT-135 budget kept).
  - Reviews: oruwa-reviewer + oruwa-ux-i18n-reviewer, all P2 fixed before merge.
  - Live-checked on preview.oruwa.jp at 375px as staffa (青木 葵) and the manager (松本 拓海): create with photo / no amount, validation, cancel with reason, prompt after 購入済み pre-ticks only the just-recorded purchase, manager adds amount later, spend summary (incl. 仕入れ品), settings (photo required, receipts off, restored to on + optional).
  - Not live-checked: #679 polish (notice timing, settings button label); real iPhone/Android camera (only Chrome emulation).
  - QA side effect in oruwa-cafe (public demo): 牛乳 counted 2 L and marked 購入済み by staffa; receipts ¥640, ¥1,280 and one canceled (notes start with "QA").
- New debt: **DEBT-140** (DB-side "already on a receipt" flag for candidates, C), **DEBT-141** (sharp `limitInputPixels` for all photo uploads, C, before prod pack).

## 2. Next (Founder order)

1. **DEBT-103 (b)(c)** — tenant deletion leftovers (`docs/operations/deferred-debt-register.md` DEBT-103, `docs/operations/tenant-deletion-procedure.md`, 0141 `core.purge_tenant`):
   - (b) widen the orphan rule: a user referenced only by the purged tenant's employees/invitations (never accepted, no membership elsewhere, no pending invitation elsewhere) is deleted with the tenant. Test case `oruwa.jp+o7staff1` (still in `auth.users`). Migration + pgTAP + oruwa-db-security-reviewer.
   - (c) purge archived `mame-to-cha` with the procedure incl. its 9 `recipe-media` objects (Cloud DEV; dry run first, check before/after).
2. **DEBT-139** several locations per client — design first, Founder decisions marked F.
3. 4D — first run of a new client + clean demo tenant via the console + screenshots/video.
4. Production pack (Founder presses the buttons). Include DEBT-141.

## 3. Bootstrap prompt (new chat)

```
Продолжи по docs/ai/SESSION_HANDOFF_2026-11-02C.md §2 и памяти.
DEBT-136 (чеки) закрыт: #676/#678/#679 в dev, проверено вживую.
Следующий шаг — DEBT-103 (b)(c): (b) удаление «сирот» — приглашённых, но не принявших пользователей при purge тенанта (миграция + pgTAP + oruwa-db-security-reviewer, тест-кейс oruwa.jp+o7staff1); (c) purge архивного mame-to-cha с 9 фото в recipe-media на Cloud DEV (dry run, проверка до/после).
Потом по плану: DEBT-139 (несколько точек, до релиза) → 4D (+ чистое демо и скриншоты) → production pack (вкл. DEBT-141).
Кто решает: ты — CTO, простые решения принимаешь сам; ко мне — только продакшн/main, сообщения реальным людям, деньги/аккаунты/юридическое, .github/workflows. Одним списком.
Chrome — личный профиль, только свои новые вкладки; второй логин — chrome-devtools isolatedContext; закрывать после работы. QA только на preview.oruwa.jp; учётки в .claude/qa-accounts.local.md.
Правила: миграции/RLS — oruwa-db-security-reviewer; видимый UI — oruwa-ux-i18n-reviewer + живая проверка на телефонном размере; одна команда на вызов Bash. Общение на русском.
Коммерческие файлы (docs/commercial/, ORUWA_*_RU.md, NEW_CHAT_PROMPT_*_RU.md, qa121026-evidence/) не коммитить и не трогать; добавлять только конкретные файлы.
```
