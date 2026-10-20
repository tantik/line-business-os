# SESSION_HANDOFF (2026-10-20 B) — continue 4B-3, QA4 fixes F2/F3/F9/F11

Read `docs/ai/SESSION_HANDOFF_2026-10-20.md` first (what was done 10-19..20,
QA4 run log §2, findings F1–F11, facts). This file adds the end-of-session
state, the Founder's decisions and the plan. Lead = CTO (Operating Model §9).

## 1. State at the end of the session

- `dev` green. Merged since the first 10-20 handoff: #611 (4B-2, **0134 on
  Cloud DEV**, Edge Function `provision-tenant` **NOT deployed** — DEBT-110(d)
  deploy gate), #612 (QA4 progress), #613 (F1/F6/F10 fixed, F6 live-verified),
  #604 (Founder-merged; CI on `dev` first failed on the Google Fonts flake,
  re-run green).
- **4B-3 WIP**: branch `feat/4b3-admin-console` (pushed, commit `559bc2e`,
  "wip … do not merge"), worktree `.claude/worktrees/4b3`. Contains a started
  owner accept flow (`app/auth/accept-invite/route.ts`, `lib/tenant/tenant-invite*`),
  platform helpers (`lib/platform/*`), migration `0135_core_platform_tenant_provisioning_list.sql`
  + pgTAP `0074`. NOT verified. The original engineer brief is in the
  4B-3 section of `docs/architecture/tenant-provisioning-plan-2026-10-18.md`
  §7 + DEBT-109/110; finish it (deliverables: accept flow `flow=tenant_invite`,
  existing-user banner, `/admin/tenants` staff-only console with list/create/
  retry using the same request_id, `deno check` of `provision-tenant`), then
  DB/security + UX + general review, Cloud DEV apply 0135, deploy the function
  with test addresses only, live QA.
- Cloud DEV migrations applied through **0134**. `oruwa-cafe` QA data:
  November week 11/9–11/15 re-generated + published; other November weeks
  still hold the old 10/12 drafts (made before the 0126 weekly limits) —
  re-run 「自動でシフトを作成」 on each before publishing.

## 2. Founder decisions (2026-10-20)

| Item | Decision |
|---|---|
| Staff 「メール」 button last | keep |
| F8 receipt without an order | keep (supplier delivered without an order) |
| F2 month selector in the staff monthly report | **APPROVED** (~0.5 d) |
| F3 Weekly Review: attendance / lateness / temperature out-of-range | **APPROVED** (~1 d, RPC + UI) |
| F9 partial receipt "still expected" | **APPROVED** (~1 d) |
| F11 "who is working now" for the Manager | **APPROVED: option A + C** (§3) |
| HACCP freezer max −15 °C on `oruwa-cafe` | **APPROVED** — do it (§4) |
| Allergen list in the item form | Founder confirmed by screenshot: 29 checkboxes visible after 「確認済み」, saving works |
| Phone Realtime test (QA4 §12) | Founder will do it |

## 3. F11 options (to build, Lead recommendation A + C)

- **A. Presence badge in the week grid** (recommended): today's column shows
  a small green dot / 「出勤中 9:58〜」 on the staff member's cell when clocked
  in (grey 「退勤 17:02」 after clock-out). Uses existing attendance + Realtime
  signals; no new screen.
- **B. "Now at work" strip** above the grid: chips 「田中 9:58〜」 with a
  count. Clear but takes space on mobile.
- **C. Attention item for an unscheduled clock-in** (「シフト外の出勤」) so a
  clock-in without a shift is never invisible. Recommended together with A.

## 4. HACCP question explained

`oruwa-cafe`'s freezer check item (冷凍庫内温度確認) has NO numeric limits, so
−12 °C (too warm) raises no warning. New cafés get −15 °C by default from
4B-1. QA4 step: the Manager sets max −15 °C in that template item, then a
−12 °C answer must create a 「範囲外」 exception. Lead: do it — it is the
correct food-safety setting (MHLW), matches new clients, can be edited back,
and it tests the template-edit UI.

## 5. Plan (order)

1. Finish **4B-3** (WIP branch) → reviews → Cloud DEV 0135 → deploy
   `provision-tenant` (test emails only) → live: create a test tenant from
   `/admin/tenants`, Owner accepts → **"new client in 2–5 minutes" proven**.
2. QA4 fixes: **F11 (A+C)**, **F3**, **F9**, **F2**; then HACCP −15 °C step;
   QA4 §5 lateness/limits on real days; Founder phone test §12; §13 cost.
3. CI hardening: self-host Noto Sans JP via `next/font/local` (the Google Fonts
   fetch flake `Cannot read properties of null (reading '1')` broke `next build`
   twice) — also faster pages, no third-party request.
4. 4B-4 Owner first-run wizard + Manager appointment (DEBT-091) → 4C
   6-tenant test → LINE stage (Founder decisions 2026-10-19 §5).

## 6. Bootstrap prompt (paste into the new chat)

```
Ты — CTO/архитектор проекта (Operating Model §9 «CTO authority») и мой ИИ-CEO:
давай советы, предлагай вариант лучше, если мой слабее, и всегда ищи готовые
решения в мире (со ссылками), прежде чем строить.
Прочитай AGENTS.md, CLAUDE.md, docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md,
docs/ai/current-task.md, docs/operations/deferred-debt-register.md,
docs/architecture/platform-packages-model.md,
docs/architecture/tenant-provisioning-plan-2026-10-18.md,
docs/ai/SESSION_HANDOFF_2026-10-20.md и docs/ai/SESSION_HANDOFF_2026-10-20B.md
(последний).
Начни с Repository Recovery. Затем по §5 handoff 2026-10-20B:
1) доделай 4B-3 (ветка feat/4b3-admin-console, WIP), ревью, Cloud DEV,
   деплой provision-tenant только с тестовыми адресами, живая проверка
   «новый клиент за 2–5 минут»;
2) QA4-исправления F11 (вариант A+C), F3, F9, F2; шаг HACCP −15 °C;
3) шрифт Noto Sans JP локально (next/font/local);
4) дальше 4B-4 → 4C → LINE.
Учитывай «Scale and cost» (300+ кафе, без polling) и решение по LINE.
После каждой проверки в браузере закрывай вкладки preview.
Работай без моих подтверждений; спрашивай только про продакшн, деньги/аккаунты
и реальные сообщения клиентам — одним списком.
В конце каждой задачи — короткий отчёт на русском и отдельный список
«что посмотреть/проверить руками».
```
