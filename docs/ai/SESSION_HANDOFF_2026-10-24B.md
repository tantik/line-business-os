# Session handoff 2026-10-24B

## 1. Merged to `dev` this session (all live-verified on preview.oruwa.jp)

| PR | What | Cloud DEV |
|---|---|---|
| #631 | F13 cafe switcher in the account menu (「お店を切り替え」), pending lock, `key={tenantId}` remount | — |
| #632 | read-only `gh api repos/tantik/line-business-os/...` allowed; mutating forms denied | — |
| #633 | **DEBT-121** deactivate/delete revokes the employee role + suspends membership; reactivate restores; rehire accept re-activates `suspended`; staff messages write needs an active employee | **0139 applied** (backfill: old Staff A/B/C in `oruwa-cafe`) |
| #634, #635, #637 | no-store screen: sign-out button, centered, copy fits removed staff | — |
| #636 | **DEBT-122** root cause = double confirmation on 「無効化」 (popup + dashboard); popup now calls `onSetActive` directly | — |
| #638 | QA4 §13 usage measured → DEBT-097/098; DEBT-083 closed | — |

Debt: DEBT-120 (switcher a11y/DS), DEBT-123 (0139 review P3s) opened; DEBT-121/122/083 closed; DEBT-111 decision recorded (no Preview/DEV unification).

## 2. QA identities (Founder 2026-10-24)

Use only the v2 set in `.claude/qa-accounts.local.md`: `oruwa.jp+manager` (松本 拓海, 店長) and `oruwa.jp+staffa/b/c/d/i` (青木/伊藤/中村/小林/井上). Mailbox `oruwa.jp@gmail.com` = Gmail `/mail/u/3` in the Chrome profile. `manager@oruwa-cafe.test` is now also `tenant_owner` of `oruwa-cafe` (one-row Cloud DEV insert). Old Staff A/B/C + 山田/高橋 are deactivated; a temporary 「テスト 削除」 row is inactive.

## 3. Founder decisions

- Roles: Owner (provisioned at launch) appoints Managers; Managers add staff but never appoint Managers; add a `tenant_admin` ("senior manager") appoint button in 4B-4b.
- Removed-employee data: keep 3 months, then delete (DEBT-033). Founder OK: purge contact PII at 3 months; keep the minimal labour record 5 years (労働基準法 109条, transitional 3), then delete.
- Native JA copy review (DEBT-018/053): after development is complete, before the admin/site phase (oruwa site + client cabinet).

## 4. Next (order)

0. **DEBT-098 first (Founder 2026-10-24):** Supabase Log Ingestion 2.53 GB / 1 GB — find the dominant log source in Logs Explorer (edge_logs vs postgres_logs vs auth), reduce that source (no full disable), record before/after.
1. **4B-4b**: Owner checklist 「はじめにやること」 on `/manager`; `tenant_admin` appoint/revoke (Owner only, mirror 0138 manager appointment); DEBT-119 (c)–(f); DEBT-123 (b) self-deactivate guard, (c) friendly rehire error.
2. **4C** 6-tenant test (`oruwa.jp+owner1..6`) with DEBT-097 (measure per tenant), DEBT-114 (max_rows), DEBT-103 (tenant delete).
3. **4D** clean demo tenant — closes DEBT-001..005, 059, 066, 067, 080, 118(a).
4. Before production pack: DEBT-035/036/043/061 (env/keys/main), 056, 090, 092, 093, 099, 111 (prod pepper), 112, 119(b), 123(a)(d), 098 (incl. Supabase Log Ingestion source).

## 5. Facts learned

- Radix/design-kit confirm buttons respond to real CDP clicks; `element.click()` on them is unreliable — use `find` refs or coordinates.
- Claude in Chrome: the window is maximized, `resize_window` has no effect; for phone width render the page in a same-origin 390px iframe.
- The Chrome session is shared with the Founder's browser — signing in as another QA user signs the Founder out there; restore `oruwa.jp+manager` afterwards.
- `scripts/ai-dev-merge.sh <PR> --db-review-pass` is required when a migration recreates policies (`drop policy`).
- Local `apps/web` dev server does not point at Cloud DEV (`.env.local` unreadable) — do live QA on preview.oruwa.jp after merge.
- Deploy status of a `dev` commit: `gh api repos/tantik/line-business-os/commits/<sha>/status` (context `Vercel`).
- Cloud DEV reads: `npx supabase db query --linked "<sql>"`; apply: `npx supabase db push --dry-run` then `npx supabase db push --yes` from `dev`.
- DEBT-111: the Preview/DEV pepper stays as is (rotating it orphans DEV email hashes); production gets one value in both runtimes.

## 6. Bootstrap prompt (paste into the new chat; run `/chrome` first if Chrome tools are not loaded)

```
Продолжи по docs/ai/SESSION_HANDOFF_2026-10-24B.md §4 и памяти.
Chrome — личный профиль, только свои новые вкладки, закрывать после работы
(feedback_chrome_personal_profile_ok, feedback_close_preview_tabs_vercel_cpu).
Сессия Chrome общая с моим браузером: если входишь под другим QA-пользователем,
в конце верни вход oruwa.jp+manager@gmail.com.
QA только на preview.oruwa.jp и только учётками v2 из .claude/qa-accounts.local.md
(oruwa.jp+manager, +staffa/b/c/d/i); почта — oruwa.jp@gmail.com (Gmail /mail/u/3).

Состояние: dev = #631–#640 слиты и проверены вживую; 0139 (DEBT-121) применена на Cloud DEV.

Порядок работы:
0. DEBT-098: Supabase Log Ingestion 2,53 ГБ / 1 ГБ (Free). В Logs Explorer найти,
   какой источник даёт основной объём (edge_logs / postgres_logs / auth / realtime),
   уменьшить именно его, не отключая логи целиком; записать «до/после» в DEBT-098.
1. 4B-4b: чек-лист Owner «はじめにやること» на /manager (3–5 шагов, прогресс из данных);
   назначение/снятие tenant_admin («старший менеджер») — только Owner, по образцу 0138;
   DEBT-119 (c)–(f); DEBT-123 (b) запрет самодеактивации менеджера, (c) понятная ошибка при повторном найме.
2. 4C: тест на 6 кафе (oruwa.jp+owner1..6) + DEBT-097 (замер на кафе), DEBT-114 (max_rows), DEBT-103 (удаление кафе).
3. 4D: чистое демо-кафе (закрывает DEBT-001..005, 059, 066, 067, 080, 118a).
4. Пакет перед продакшном (список в §4 п.4), включая DEBT-033: чистка данных уволенных
   (контакты через 3 месяца, трудовые записи 5 лет по 労働基準法 109条).

Правила: ты CTO — решаешь, делегируешь, проверяешь сам; dev-слияния через
scripts/ai-dev-merge.sh; миграции/RLS — обязательно oruwa-db-security-reviewer;
видимый UI — oruwa-ux-i18n-reviewer + живая проверка; ничего не откладывать молча
(deferred-debt-register). Ко мне — только продакшн, сообщения реальным людям и то,
что могу дать только я (одним списком). Общение на русском. На ~90% контекста —
остановиться и сделать handoff.
```
