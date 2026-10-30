# Session handoff 2026-10-30 — DEBT-124 done, DEBT-135 done for /manager

## 1. State

- **#670** merged to `dev` (Founder, bypass; squash 7ed7684): getClaims (DEBT-124), `api.my_access` 0142, `api.my_page_context` 0143.
- **#671** merged to `dev` (Lead, `ai-dev-merge.sh`; squash 2acaa09): `api.manager_dashboard` 0144 — all 28 Manager reads in one invoker RPC.
- **0142, 0143, 0144 are applied on Cloud DEV** (`db push --linked`).
- Branch protection `dev` (Founder 2026-10-30): approvals 0 (the Lead can merge again), required check `pgTAP (supabase test db)` only, "up to date" ON. Still open for the Founder: add `typecheck / test / build / lint` as required, drop "up to date"; same two checks on `main`.

## 2. Evidence

| Check | Result |
|---|---|
| pgTAP local | 81 files / 2810 PASS (+2 checks in 0083 after review) |
| apps/web | tsc + eslint clean, tests 1225/1225 |
| DB/security review 0143 | no blocker; major (0082 fixtures) fixed |
| DB/security review 0144 | no blocker, no widening; timeout risk measured + accepted (DEBT-135 trigger) |
| Real data 0143 (Cloud DEV) | 30 users × 6 keys = direct reads; temp pending invitations seen only by the addressee; 0 mismatches / 0 leaks (`scripts/load/page-context-realdata-check.sql`) |
| 0144 timing (Cloud DEV) | oruwa-cafe 0.53–0.62 s (772 rows), other tenants ≈ 0.05 s, no part errored |
| Requests per `/manager` view (PostgREST, `pg_stat_statements` delta, 20 views, Owner qa-4c-cafe-1) | ≈ 45 (10-29) → 35 after #670 → **4 after #671**; `auth/v1/user` 2 → 0 |
| Live, preview.oruwa.jp | Manager (oruwa-cafe): page + all 8 popups OK; Staff A: `/staff`, Operations popup OK, `/manager` → アクセスできません; platform staff: `/admin/tenants` OK; Owner qa-4c-cafe-1: `/manager`, 店長にする / 管理者から外す shown |

## 3. Next (order)

1. DEBT-135 for `/staff`: same pattern as 0144 (`api.staff_dashboard`), reuse `lib/manager/dashboard.ts` style; then re-measure.
2. Lazy-load popup-only data (UX-visible → `oruwa-ux-i18n-reviewer` + live check) only if Vercel CPU/latency needs it — request count is already at target.
3. Consider folding `operations_flag_missed_critical` (a write on every Manager view) into a cron.
4. Then DEBT-128 (B-0) → DEBT-103 (b)(c) → 4D → production pack (SESSION_HANDOFF_2026-10-29.md §3).

Untracked files in the repo root not created by these sessions (left alone): `ORUWA_FOUNDER_COMMERCIAL_LEGAL_DECISIONS_2026-10-29_RU.md`, `NEW_CHAT_PROMPT_ORUWA_COMMERCIAL_LEGAL_2026-10-29_RU.md`, `qa121026-evidence/`.

## 4. Bootstrap prompt

```
Продолжи по docs/ai/SESSION_HANDOFF_2026-10-30.md §3 и памяти.
0142–0144 уже на Cloud DEV; /manager = 4 запроса на просмотр. Следующее — /staff (api.staff_dashboard).
Chrome — личный профиль, только свои новые вкладки, закрывать после работы.
QA только на preview.oruwa.jp; учётки в .claude/qa-accounts.local.md.
Кто решает: ты — CTO; ко мне — только продакшн, сообщения реальным людям, деньги/аккаунты/юридическое,
.github/workflows, main и защита веток. Одним списком.
Правила: dev-слияния через scripts/ai-dev-merge.sh; миграции/RLS — oruwa-db-security-reviewer;
видимый UI — oruwa-ux-i18n-reviewer + живая проверка; одна команда на вызов Bash. Общение на русском.
```
