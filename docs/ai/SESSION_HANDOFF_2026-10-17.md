# SESSION_HANDOFF (2026-10-17) — QA3 Lead run done, Vercel CPU fix, Realtime push, scale plan

Durable handoff for a fresh Claude Code session. Reality check first
(Operating Model §4): `git log -1` on `dev` should be the merge of
`docs/handoff-2026-10-17` or later. Operating model unchanged: the Lead is
CTO (Operating Model §9); Founder gates = production + real-customer
messages + money/accounts.

## 1. Merged to `dev` and live on preview.oruwa.jp (2026-10-14..17)

| PR | What | Cloud DEV |
|---|---|---|
| #584 | QA3 batch 1: 要確認 counts open Issues + Operations exceptions (grouped), Staff sees the decision on own request, sign-in keeps email after a failed login, localized tab titles | — |
| #586 | Tab title survives Next's late streamed metadata (`useDocumentTitle`) | — |
| #587 | QA3 batch 2: deactivated staff leave the Weekly Schedule (unless they have a shift that week), delete disabled for staff with history, JA copy without ASCII "--", account busy label, tab titles マネージャー/スタッフ; DEBT-094 | — |
| #588 | **Vercel CPU fix**: shared `useVisiblePolling` (no raw `setInterval`; hidden-tab stop, 5 min idle pause) | — |
| #589 | **Live updates by push** (Supabase Realtime): migration 0127 triggers send content-free signals to private topics `oruwa:<tenant>:staff|manager|emp:<id>`; `useLiveSignals`; timers are a 15 min safety net. DEBT-095 closed | **0127 applied**, policy + 20 triggers verified |
| #590 | Scale & cost rules (AGENTS.md, `.cursor/rules/00`, roadmap): 300+ tenants, no polling, per-tenant cost in PRs; DEBT-096/097/098 | — |
| #591 | QA3 batch 3: recipe dialog title in EN, Weekly Review 「この週…」 labels, 375 px schedule header "!" slot, HACCP numeric input aria-label | — |

All verified live (details in the PRs and the QA3 artifact).

## 2. Why the Vercel alert happened (keep in mind)

`/staff` polled a Server Action every 2.5 s; each poll = 1 Vercel invocation
+ ~5 Supabase calls. Agent-browser QA tabs left open (they count as
"visible") burned ~75% of the Hobby free Active CPU. Fixed by #588, then
replaced by push (#589). **Standing rule:** close every preview tab in the
agent browser after QA (memory `feedback_close_preview_tabs_vercel_cpu`).
Live verification on preview: 0 server calls in 129 s idle; Manager→Staff
mail ≈ instant, Staff→Manager ≈ 9 s (2 s coalesce + full manager refresh).

## 3. QA3 status

Checklist artifact: https://claude.ai/artifact/CjEx8ihW7PBuU8YC6Py5zZ
(db collection `results`, ids `i<section>_<item>`, artifact numbering 1–17).
Every Lead-testable item has a result. Still open:
- 2.1–2.3, 10.2 delivery — need a dedicated QA mailbox (Founder input).
- 12.3 — native Japanese review of the allergen disclaimer (DEBT-053).
- Section 7 (attendance corrections) — needs past shifts → QA4.

## 4. Founder decisions on 2026-10-17 (act on them)

1. **Show the reporter's name** on Issues / Handover for the Manager
   (today 「報告者: スタッフ」). `issues.reported_by` is an auth user id
   (`apps/web/src/lib/issues/issues.ts`); resolve it to the employee's
   decrypted name server-side for Manager views (Staff views: decide —
   recommendation: name too, coworkers already see each other's names in
   the roster). Fallback 「スタッフ」/「マネージャー」 when unresolvable.
2. **HACCP temperature ranges:** manual editing already exists (template →
   item → 最小値/最大値/単位). Add standard defaults to the Cafe HACCP
   presets (`packages/db/scripts/cafe-haccp-presets.ts`) for new tenants:
   freezer ≤ −15 °C, hot-holding ≥ 65 °C (verify against the MHLW HACCP
   guidance before shipping; fridge stays 0–5 °C as today). Existing
   tenants keep their values.
3. **Scale:** design for 300+ tenants; **Vercel Pro from the first paying
   client** (Hobby is non-commercial only), **Supabase Pro after the 5th**
   (DEBT-096). Spend caps before the first paying client (DEBT-098).
   Measured capacity plan in the 6-tenant test (DEBT-097).

## 5. Facts worth knowing

- Cloud DEV SQL: `pnpm exec supabase db query --linked "<sql>"`; push/deploy
  only from `D:/Dev/line-business-os` (uppercase `D:`).
- `scripts/ai-dev-merge.sh` blocks migrations whose added lines match
  "drop …" even inside comments (e.g. a rollback note); use
  `--db-review-pass` only after the DB/security reviewer PASS.
- Chrome DevTools MCP does not list WebSockets; wrap `window.WebSocket` via
  `navigate_page` `initScript` to inspect Realtime frames.
- Inputs in the agent browser: JS `.click()` on custom checkboxes/tabs often
  does nothing — click by snapshot uid. Confirm dialogs are
  `role=alertdialog`. Staff language key: `localStorage['demo-cafe-lang']`.
- `gh api` is denied by settings; use `gh pr checks` / `gh pr view`.
- Local Docker: start `C:/Program Files/Docker/Docker/Docker Desktop.exe`,
  then `pnpm exec supabase start`; pgTAP baseline failures = DEBT-037 only
  (5 files / 11 subtests).

## 6. Next work (CTO proceeds without a Founder prompt)

1. **Small batch from §4:** reporter name on Issues/Handover; HACCP preset
   defaults (freezer/hot-holding) with source check; manager live refresh
   could be targeted (≈1–2 s) instead of a full `router.refresh()` if 9 s
   feels slow — measure first.
2. **Stage 3 — QA4 prep:** scenario document + seed script for a realistic
   past month on the test tenant (Cloud DEV data write = CTO call, with
   before/after verification); mobile check of Realtime reconnect after
   sleep; section 7 attendance corrections.
3. **QA4 run** (one-month operational simulation, all blocks except LINE),
   reviewers, then Founder final review → Cafe v2.2 CLOSED.
4. **Stage 4B — automated tenant provisioning** (architecture plan first;
   Manager appointment UI, DEBT-091; HACCP presets with defaults), then 4C
   6-tenant test incl. **usage measurement** (DEBT-097).
5. Small debts when touching the area: DEBT-090, 092, 093, 094, 083.

Founder inputs still open: dedicated QA Gmail; QA4 mailbox aliases
(`+staffd`, `+staffe`); native/legal review of allergen strings; optional:
Supabase Realtime "Allow public access" off.

## 7. Bootstrap prompt (paste into the new chat)

```
Ты — CTO/архитектор проекта (Operating Model §9 «CTO authority»).
Прочитай AGENTS.md, CLAUDE.md, docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md,
docs/ai/current-task.md, docs/operations/deferred-debt-register.md и
docs/ai/SESSION_HANDOFF_2026-10-17.md (последний handoff).

Начни с Repository Recovery. Затем по §6 handoff:
1) малый батч из §4 — имя автора в «申し送り・問題報告» у менеджера,
   стандартные диапазоны HACCP (морозильник, тёплое оборудование) в
   шаблонах для новых кафе (сверь с руководством 厚労省);
2) подготовка QA4: сценарий месяца + seed прошлого месяца на тестовом
   арендаторе, проверка Realtime на телефоне;
3) затем QA4 и этап 4B (сначала архитектурный план).
Учитывай правила «Scale and cost» (300+ кафе, никакого polling).
После каждой проверки в браузере закрывай вкладки preview.
Работай без моих подтверждений; меня спрашивай только про продакшн,
деньги/аккаунты и реальные сообщения клиентам — одним списком.
В конце каждой задачи — короткий отчёт на русском: что сделано, как
проверено, что посмотреть мне руками.
```
