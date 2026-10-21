# SESSION_HANDOFF (2026-10-21) — 4B-3 live, font self-hosted, HACCP −15 °C done; QA4 F2/F3/F9/F11 in flight

Reality check first (Operating Model §4): `git log -1 origin/dev` should be
`48d9116` (#617) or the merge of this handoff. Lead = CTO (Operating Model §9).
Founder gates: production, real-customer messages, money/accounts/secrets.
The 2026-10-20 session stopped on the usage limit; all in-flight work was
WIP-committed and pushed on 2026-10-21 (nothing lives only on disk).

## 1. Done and merged to `dev` (2026-10-20)

| PR | What | Cloud DEV | Evidence |
|---|---|---|---|
| #616 | Noto Sans JP self-hosted via `@fontsource-variable/noto-sans-jp` (replaces `next/font/google`; the Google fetch broke `next build` on CI and locally) | — | local `next build` without Google; Chrome: 10 of 124 woff2 chunks on `/sign-in`, 0 Google requests |
| #617 | **4B-3**: `/admin/tenants` (platform staff only, 404 otherwise; list / create / retry with the same `request_id`), Owner accept flow `/auth/accept-invite?flow=tenant_invite` (Invite token only) → Owner password page → `api.accept_tenant_invitation` → `/manager`; in-app `PendingTenantInvitationBanner` for an existing account; owner reasons on `/auth/link-invalid`; 0135 `api.platform_tenant_provisioning_list` | **0135 applied**; `provision-tenant` **deployed** (v1, verify_jwt) | live QA table in the #617 PR comment |

**"New client in 2–5 minutes" — PROVEN live** (PR preview, Cloud DEV):
click 「作成して招待を送る」 → Owner working in `/manager` of the new tenant in
**≈70 s**; provisioning transaction 4.7 s (+≈5 s function cold start). Tenant
had 7 modules, 1 location, 3 shift types, schedule limits, HACCP items.
Also live: slug_taken message, existing-account banner → accept → lands in
the 2nd tenant, reused link → owner link-invalid page, non-staff → 404.

Reviews of 4B-3: DB/security PASS, UX/i18n PASS (no P1), general PASS; P3s →
**DEBT-111** (functions' `PII_HASH_PEPPER` ≠ Vercel value — Founder secret),
**DEBT-112** (invite password step not bound to a fresh invite session),
**DEBT-113** (support contact, JA-only banners, two banner RPCs, 1000-row cap).

**HACCP −15 °C step: DONE live** on `oruwa-cafe` (Manager set freezer max −15 °C
in the template; Staff re-saved −12 °C → `task_exceptions` source=threshold,
open; Manager 「対応が必要」 19 → 20 live).

## 2. Cloud DEV facts added this session

- Function secret `PII_HASH_PEPPER` = a generated DEV value (the Vercel Preview
  value is a hidden Secret). DEBT-111 until the Founder sets one value in both.
- QA user **`platform-staff@oruwa.test`** (`core.users.is_platform_staff = true`,
  no tenant; password in `.claude/qa-accounts.local.md`). NOT a public demo
  account — never give it to the Founder's public QA list. After sign-in it
  lands on 「所属している店舗がありません」 → open `/admin/tenants` directly
  (small follow-up: link it from that page for staff).
- Test tenants: `qa-4b3-cafe-1`, `qa-4b3-cafe-2` (Owner
  `delivered+qa4b3owner1@resend.dev`, password `QaOwner4b3-Pass!1`). Owner test
  addresses: **Resend sandbox `delivered+<tag>@resend.dev` only**.
- Invite links can be tested without a mailbox: read `auth.one_time_tokens.token_hash`
  (`token_type='confirmation_token'`) via `supabase db query --linked` and open
  `<host>/auth/accept-invite?flow=tenant_invite&token_hash=<hash>&type=invite`
  (host-agnostic, works on PR previews).
- Legacy service_role JWT is disabled; `supabase projects api-keys` masks the
  `sb_secret` value. Auth admin calls from scripts are not possible → seed
  test users via SQL (auth.users + auth.identities + core.users), as done for
  the platform-staff user.
- `ai-dev-merge.sh` blocks a migration whose ROLLBACK comment contains
  `drop function` → re-run with `--db-review-pass` after the DB/security PASS.
- `psql` is denied for the Lead and subagents → verify migrations locally with
  `npx supabase db reset` (from the worktree that has them) +
  `npx supabase test db <files>`; run resets **one at a time** (shared local DB).
- `npx deno` must not run from the repo root (it rewrote `package.json`
  workspaces once; reverted). Use a scratch copy with `{"nodeModulesDir":"auto"}`.

## 3. In flight — all pushed, NOT verified, NOT in `dev`

| Branch (worktree) | Content | State | Next step |
|---|---|---|---|
| `feat/qa4-f3-weekly-review-attendance` (`.claude/worktrees/agent-a41e88f4a3d1428f4`, `7afc74f`) | **F3**: 0136 redefines `api.weekly_review_summary` from the live body (0119 + 0131 change): attendance count, late (≥1 min after published shift start, location tz), late minutes, no-shows (published shift ended, no clock-in), clock-ins without a shift, threshold exceptions in the week (+ open); new index `operations_task_exceptions_location_created_idx`; pgTAP 0075; 0060 scenario F extended; UI in TeamSection / OperationsSection JA/EN | code complete; web tests 1097 pass, tsc/eslint clean; **0136 never applied locally → pgTAP 0075/0060/0070 NOT run** | db reset + pgTAP, DB/security + UX review, PR, Cloud DEV apply, live check vs QA4 data |
| `feat/qa4-f11-f2-manager` (`agent-a15769081f6aae874`, `1b28886` WIP) | **F11-A** presence 「出勤中 9:58〜」/「退勤 17:02」 in today's column; **F11-C** attention 「シフト外の出勤」; **F2** month selector + on-demand month fetch (`attendance-month-actions.ts`); bounded `listAttendanceForManager` load | engineer stopped right before `next build`; nothing verified | tsc/eslint/tests/build, review the attendance range bound carefully (week paging, labour cost, attention), UX review, live QA |
| `feat/qa4-f9-expected-receipts` (`agent-a39ba10bb366266e2`, `8a0b514` WIP) | **F9**: 0137 open order quantity + `order_closed` action + `api.close_purchase_order_remainder`; pgTAP 0076 | **SQL only, no UI**; untracked `supabase/tests/zz_tmp_*.sql` scratch files left in that worktree (delete, never commit); local DB may hold a partial 0137 → start with `supabase db reset` | finish UI (「入荷待ち 4 L（8 Lのうち）」, prefill receive, 「残りを取り消す」 with ConfirmDialog), tests, reviews, PR |
| `fix/haccp-one-sided-range-label` (`opsrange`, `4fc6322` WIP) | `formatNumericRange` (「−15 °C以下」 / "≤ −15 °C", 「65 °C以上」) + tests | call sites not switched: `operations/task-detail-modal.tsx` (~:310 rangeHint), `template-detail-modal.tsx` (~:469), `attention-section.tsx` (~:217) | switch the 3 call sites, tests, PR, merge |

Migration numbers taken: **0136** (F3), **0137** (F9). pgTAP: 0075, 0076.

## 4. Plan (order)

1. Small: HACCP range label PR (§3 last row).
2. F3 → F11/F2 → F9 (each: verify, reviews, PR, Cloud DEV apply where a migration exists, live QA on `preview.oruwa.jp`, close preview tabs).
3. QA4 rest: §5 lateness/limits on real days (F3 makes lateness visible), Founder phone test §12, §13 cost measurement.
4. 4B-4 Owner first-run wizard + Manager appointment (DEBT-091), DEBT-110(c) resend/revoke Owner invite → 4C 6-tenant test (+ DEBT-097 usage) → LINE stage (each client's own OA; app works without LINE).

## 5. Founder inputs (one list)

- One `PII_HASH_PEPPER` value per environment into both Vercel and Supabase function secrets (DEBT-111) — before production.
- ORUWA support contact (email/link) for the Owner invitation copy (DEBT-113 a) — before the first real Owner invite.
- Still open from earlier: QA mailbox the CTO can read; native/legal review of allergen strings.

## 6. Bootstrap prompt (paste into the new chat)

```
Ты — CTO/архитектор проекта (Operating Model §9 «CTO authority») и мой ИИ-CEO:
давай советы, предлагай вариант лучше, если мой слабее, и всегда ищи готовые
решения в мире (со ссылками), прежде чем строить.
Прочитай AGENTS.md, CLAUDE.md, docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md,
docs/ai/current-task.md, docs/operations/deferred-debt-register.md,
docs/architecture/tenant-provisioning-plan-2026-10-18.md
и docs/ai/SESSION_HANDOFF_2026-10-21.md (последний; QA4-лог — в 2026-10-20.md).
Начни с Repository Recovery (git worktree list; 4 ветки из §3 запушены).
Затем по §4 handoff 2026-10-21:
1) PR с подписью одностороннего диапазона HACCP (ветка fix/haccp-one-sided-range-label);
2) QA4 F3 → F11+F2 → F9: проверка (supabase db reset по одному, pgTAP, tsc,
   тесты, next build), ревью (DB/security для 0136/0137, UX, общий), PR,
   Cloud DEV, живая проверка на preview.oruwa.jp;
3) остаток QA4 (§5 опоздания, §13 стоимость);
4) дальше 4B-4 → 4C → LINE.
Учитывай «Scale and cost» (300+ кафе, без polling) и решение по LINE.
После каждой проверки в браузере закрывай вкладки preview.
Работай без моих подтверждений; спрашивай только про продакшн, деньги/аккаунты/
секреты и реальные сообщения клиентам — одним списком.
В конце каждой задачи — короткий отчёт на русском и отдельный список
«что посмотреть/проверить руками».
```
