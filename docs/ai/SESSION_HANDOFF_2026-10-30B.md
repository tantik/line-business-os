# Session handoff 2026-10-30B — DEBT-135 for /staff: code + reviews done, not on Cloud DEV yet

## 1. State

- Branch `perf/debt-135-staff-dashboard` (pushed), on top of `dev` e850873. Not merged, no PR yet.
- 984c964 — 0145 `api.staff_dashboard` (invoker; 13 shared parts via ONE `api.manager_dashboard` call, 6 staff-only parts read itself: myPreferenceRequests, myCorrectionRequests, myAttendance, myStaffMessages(employeeId), staffRoster, operationsResponses), pgTAP 0084, `lib/db/dashboard-rpc.ts` (shared loader, manager now uses it, behaviour unchanged), `lib/staff/dashboard.ts`, `/staff` page uses one RPC ∥ `loadMyAccess`.
- Next commit — `scripts/load/manager-page-views.mjs`: optional env `LOAD_PAGES`, `LOAD_ACCOUNTS` (default = old /manager owner run).
- **0145 is NOT on Cloud DEV.** Push it BEFORE merging (app calls the function; without it every /staff popup errors).

## 2. Evidence

| Check | Result |
|---|---|
| pgTAP 0084 local | 132/132 PASS (full suite not re-run this session) |
| apps/web | tsc clean; `npm test` 1232/1232; eslint on changed files clean |
| oruwa-db-security-reviewer | no blocker/major; probe confirmed: foreign employeeId → [], other location → no responses, module OFF → empty, non-member → empty |
| oruwa-reviewer | PASS on page parity; merge only after 0145 on Cloud DEV + docs/debt update |
| Baseline measure /staff (before) | NOT DONE: run as staffa gave `errors: 30` (exception per GET; cause not investigated — check sign-in for staffa / redirect handling). Chunks with the key on preview: `_next/static/chunks/6611-f1daa25416615269.js,_next/static/chunks/150-9a7a255d1bf605b1.js` (change after each deploy) |

## 3. Next (order)

1. Review follow-ups (minor, do before merge):
   a. `inventoryItems` cap: shared part reads active+inactive `limit 1000` without order, TS filters active → add a staff-own active-only part (e.g. `inventoryActiveItems` in 0145 with `is_active = true`, cap 1000) or `order by is_active desc` — prefer the own part (exact parity).
   b. `operationsResponses` cap 20000 for the whole set (was per 100-instance chunk) — document as accepted in 0145 header.
   c. Add 0084 asserts: foreign employeeId → [], L1 caller asking L2 → no responses, module OFF → empty, non-member → empty.
   d. `listItemResponsesForInstances` → reuse `groupItemResponsesByInstance`; staff test: instance without responses gets [] on the page.
2. Baseline measure (current dev on preview) BEFORE deploying: fix the `errors: 30`, 20 views of `/staff` as staffa, `pg_stat_statements` delta of `WITH pgrst_source%` via `npx supabase db query --linked` (last snapshot 1954703 at 11:32 UTC is stale — retake).
3. `db push --linked` 0145 → PR → `scripts/ai-dev-merge.sh` → live check `/staff` on preview.oruwa.jp (staffa: page + every popup: shifts, mail, inventory, purchases, recipes, operations, issues; manager opening /staff) → re-measure (target ≤ 5 PostgREST/view).
4. Update `docs/operations/deferred-debt-register.md` DEBT-135 (→ DONE with numbers), `docs/ai/current-task.md`.
5. Then DEBT-128 (B-0) → DEBT-103 (b)(c) → 4D → production pack.

Load script deps live in the session scratchpad (lost); reinstall: `npm i @supabase/supabase-js@2.49.4 @supabase/ssr@0.6.1` in a scratch dir.

## 4. Bootstrap prompt

```
Продолжи по docs/ai/SESSION_HANDOFF_2026-10-30B.md §3 и памяти.
Ветка perf/debt-135-staff-dashboard: 0145 api.staff_dashboard готов и прошёл оба ревью, НЕ на Cloud DEV.
Сначала мелкие правки ревью (§3.1), базовый замер /staff, потом db push 0145 → PR → merge → живая проверка → замер.
Кто решает: ты — CTO; ко мне — только продакшн/main, сообщения реальным людям, деньги/аккаунты/юридическое, .github/workflows. Одним списком.
Chrome — личный профиль, только свои новые вкладки, закрывать после работы. QA только на preview.oruwa.jp; учётки в .claude/qa-accounts.local.md.
Правила: миграции/RLS — oruwa-db-security-reviewer; видимый UI — oruwa-ux-i18n-reviewer + живая проверка; одна команда на вызов Bash. Общение на русском.
```
