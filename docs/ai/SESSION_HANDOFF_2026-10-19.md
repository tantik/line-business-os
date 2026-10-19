# SESSION_HANDOFF (2026-10-19) — packages model P1 live, Mame To Cha archived, P3 in progress

Reality check first (Operating Model §4): `git log -1` on `dev` should be the
merge of this handoff or later. Lead = CTO (Operating Model §9). Founder gates:
production, real-customer messages, money/accounts.

## 1. Merged to `dev` and applied (2026-10-18..19)

| PR | What | Cloud DEV |
|---|---|---|
| #594 | HACCP preset default ranges (fridge 0–5, freezer ≤ −15, hot ≥ 65; MHLW 大量調理施設衛生管理マニュアル). New-tenant install path = DEBT-100 | — |
| #595 | Reporter name on Issues/Handover (DEBT-075 closed; DEBT-099) | **0128 applied** |
| #596 | QA4 past-month seed + scenario `docs/ai/QA4_SCENARIO_2026-10-18.md` | **seed applied** to oruwa-cafe (2026-09-21..10-17), verify 16/16 |
| #597, #598 | 4B provisioning plan + Founder decisions (trial 30 d, no card, 7 d read-only, data 90 d; one plan, all modules, no limits) | — |
| #599 | **Platform / modules / packages model** (Founder-approved) + tasks P1–P7: `docs/architecture/platform-packages-model.md` | — |
| #600 | **P1 packages** (0129): `core.packages`, `package_modules`, `tenant_packages`, `tenant_module_overrides`; `core.tenant_modules` stays the only runtime gate; mutations `core.set_tenant_package` / `set_tenant_module_override` / `adopt_tenant_into_package` (service_role only, audited, per-tenant lock); DB review PASS after 2 rounds | **0129 applied**, modules of all 4 tenants unchanged (diff before/after) |

## 2. Done on Cloud DEV without a PR (R0a, Founder-approved)

Mame To Cha pilot + smoke tenants **archived**, not deleted: physical delete is
blocked by the append-only `audit.audit_logs` (correct protection, not
bypassed). `mame-to-cha`, `smoke-tenant-a/b`: status `archived`, 0 members,
0 role assignments, 0 modules, invitation revoked, one audit row each.
Archive JSON (619 rows): `D:/Dev/oruwa-archive/r0-mame-to-cha-smoke-archive-2026-10-19.json`
(outside the repo). Auth accounts kept (no access left). Only active tenant:
`oruwa-cafe`.

## 3. In flight — check first in the new session

1. **R0b (code removal of Mame To Cha)** — delegated to an `oruwa-engineer`
   subagent in a worktree: branch `chore/r0b-remove-mame-to-cha`, a PR to
   `dev` may already exist (`gh pr list`). Scope: delete
   `app/%5Fclient-preview/mame-to-cha/**` and public `app/mame-to-cha/**`,
   only Mame-specific parts of `lib/preview` (it is shared with ORUWA screens!),
   `packages/db/scripts/mame-to-cha-*`, seed tenant → `oruwa-local` via
   `core.set_tenant_package`, close DEBT-020/039/063, add **DEBT-103**
   (tenant physical deletion + 9 recipe-media files). Review it (general +
   UX/i18n for routes), then merge.
2. **P3 (Purchasing + Recipes as own modules)** — branch
   `feat/p3-purchases-recipes-modules`, commit `2d26d7b`, **WIP, NOT
   VERIFIED, no PR**. Migrations `0130` (enum values) and `0131` (registry,
   cafe package, 24 policies + 5 functions rewritten from live definitions
   with exact counts, zero-access-change assertion). After adding them the
   local `supabase db reset` left an EMPTY database — cause unknown (0131 or
   the local container flake seen the same morning). Debug locally first:
   `pnpm exec supabase stop` → `pnpm exec supabase start --ignore-health-check`
   → `pnpm exec supabase db reset`; if it fails at 0131, read the error. Then
   pgTAP for the gates, DB/security review, then Cloud DEV.
3. App side of P3 is part of **P4** (pages still use the `inventory` flag for
   Purchasing UI; harmless while both are on).

## 4. Next (order approved by the Founder)

P3 → P2 (dependencies, mostly done inside 0131: purchases → inventory) → P4
navigation from enabled modules/packages → P5 package vocabulary → P6 move
cafe-specific config out of shared modules → P7 module-OFF QA → **QA4 on the
new structure** (scenario doc) → **provisioning: new client ready in 2–5
minutes** (`docs/architecture/tenant-provisioning-plan-2026-10-18.md`, uses
`set_tenant_package`, plan before package) → **LINE** → 6-tenant test (4C).

Second package: **「開店・閉店チェック」** (HACCP closing/opening + stock count +
shopping list; Founder chose it 2026-10-19), ~2–3 days after P1–P7. Cleaning =
third candidate, needs a market-research doc first.

## 5. Founder decisions to keep (2026-10-19)

- Several packages per client; add/remove suitable modules at extra price.
- LINE: **each client connects its OWN LINE Official Account**; ORUWA lives in
  the client's chat via a staff-only per-user rich menu. Path A (launch):
  client pastes Messaging API + LINE Login (same provider) IDs/secrets, ORUWA
  sets LIFF + rich menu via API, **no webhook dependency** (coexists with
  Lステップ/エルメ). Path B later: LINE Module channel (partner application).
  **The app works fully without LINE** (email + in-app messages are the
  baseline; one notification router: in-app → email/LINE by settings).
  One demo LINE OA per package (Cafe: provider "ORUWA Cafe Demo", OA
  "ORUWA カフェ デモ", created at the LINE stage). Founder's existing
  "Mirawi Salon Demo" provider stays for the salon.
- Communication: the Lead acts as AI CEO/architect — gives improvement advice
  unprompted, proposes better variants when the Founder's idea is weaker, and
  **always researches existing world solutions (with links) before building**.
  Founder wants this added to the communication rules (AGENTS.md) later.

## 6. Facts worth knowing

- Cloud DEV ref `pehcoenozjtsjdvjietj`; SQL: `pnpm exec supabase db query --linked [-o table] [-f file]`.
- Rollback-only rehearsal on real data: put the work in a `pg_temp` plpgsql
  function that ends with `RAISE EXCEPTION '<results>'`, run with `-f`.
- `scripts/ai-dev-merge.sh <PR> --db-review-pass` for migrations containing
  `delete from` / `drop` (even in comments) after a DB/security PASS.
- Run reviewers/engineers with `isolation: "worktree"`; local Supabase is
  shared — tell agents to use only `BEGIN … ROLLBACK`.
- `backups/` and `rm -rf` are blocked by settings; archives go to `D:/Dev/oruwa-archive/`.
- Close preview tabs after browser QA (Vercel CPU).
- Founder inputs still open: QA Gmail (optional), `+staffd`/`+staffe` need no
  setup (Gmail plus-addressing), prices (Stage 4H).

## 7. Bootstrap prompt (paste into the new chat)

```
Ты — CTO/архитектор проекта (Operating Model §9 «CTO authority»), а также мой
ИИ-CEO: давай советы по улучшению, предлагай вариант лучше, если мой слабее, и
всегда ищи готовые решения в мире (со ссылками), прежде чем строить.
Прочитай AGENTS.md, CLAUDE.md, docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md,
docs/ai/current-task.md, docs/operations/deferred-debt-register.md,
docs/architecture/platform-packages-model.md и
docs/ai/SESSION_HANDOFF_2026-10-19.md (последний handoff).

Начни с Repository Recovery. Затем по §3 handoff:
1) R0b (удаление кода Mame To Cha): найди PR ветки chore/r0b-remove-mame-to-cha,
   проверь, ревью, слей;
2) P3 (ветка feat/p3-purchases-recipes-modules, WIP): почини локальный reset,
   тесты, DB-ревью, применение на Cloud DEV;
3) дальше P2/P4–P7 → QA4 → создание клиента за 2–5 минут → LINE.
Учитывай «Scale and cost» (300+ кафе, без polling) и решение по LINE (§5).
После каждой проверки в браузере закрывай вкладки preview.
Работай без моих подтверждений; спрашивай только про продакшн, деньги/аккаунты
и реальные сообщения клиентам — одним списком.
В конце каждой задачи — короткий отчёт на русском.
```
