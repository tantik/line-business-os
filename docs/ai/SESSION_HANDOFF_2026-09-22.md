# SESSION_HANDOFF (2026-09-22) — Cafe v2.2: Integrated Acceptance and Technical Freeze Closure done; next is the Founder's freeze decision and Founder Acceptance

Durable handoff for a **fresh** Claude Code session. Git, this file and the listed reports are the source of truth, not any prior chat. VERIFIED = confirmed by tool output on 2026-09-21/22; the rest is INFERRED, UNKNOWN or NOT TESTED (Operating Model §6). This file consolidates the whole chat "Cafe v2.2 Full Integrated Acceptance" (Mission 10 and Mission 10.5). Earlier files: `SESSION_HANDOFF_2026-09-21.md` (Mission 10), `SESSION_HANDOFF_2026-09-21-MISSION10-5.md` (Mission 10.5).

## 1. Repository and environment state (VERIFIED)

- `dev` = `7762c36` (PR #544) when this file was written, no open PRs. `main` and Production: untouched.
- Cloud DEV migrations: `0000`–`0121` **and `0122` applied** (Founder ran `supabase db push` on 2026-09-22; `supabase migration list` shows `0122` in the Remote column).
- Local: Docker Desktop and the local Supabase stack were started this session and may still run. The local DB has `0122` applied by `psql` (local only).
- Local git branches from this chat are all merged and harmless; the session cannot delete branches.
- QA accounts (public demo, Founder-classified): Manager `manager@oruwa-cafe.test`, Staff 田中美咲. The Founder pastes passwords in chat if needed; never write them to a file. The session cannot read `.env`.
- `.claude/settings.json`, hooks and `scripts/ai-dev-merge.sh` unchanged.

## 2. What was done in this chat

**Mission 10 — Full Integrated Acceptance: CLOSED WITH GAPS** (report `CAFE_V2_2_FULL_INTEGRATED_ACCEPTANCE_REPORT_2026-09-21.md`)
- Live acceptance in real Manager and Staff sessions on `preview.oruwa.jp`: Schedule, Operations, Issues, Inventory, Purchasing to Inventory, Recipes (cost and allergens), Weekly Review, Attention, Mail, clock in/out, staff create/delete, Help, role negatives, JA/EN, 320/375/768/1440, keyboard, performance.
- Fixed and merged: #536 (Operations "today" was the UTC date, so 00:00–09:00 JST showed yesterday's tasks overdue), #537 (Attention subtitle now names unread mail, DEBT-014).
- Track A: `CAFE_V2_2_COPY_AUDIT_2026-09-21.md`, `docs/product/cafe-v2-2-feature-map-ru.md`.
- pgTAP baseline re-proved locally: only `0002`, `0006`, `0008`, `0012`, `0023` fail (11 subtests, DEBT-037).

**Mission 10.5 — Technical Freeze Closure: CLOSED** (report `CAFE_V2_2_TECHNICAL_FREEZE_CLOSURE_REPORT_2026-09-21.md`, section 0 has the final result)
- #539: individual hourly rate in the Manager staff form on the existing `workforce.employees.hourly_wage_yen`; edits no longer erase wage/notes/position/employment type (DEBT-052); "概算人件費" never counts a missing rate as 0 yen. Live-verified with two different rates (田中 1200, 鈴木 1500).
- #541 (RED, Founder merged and applied): migration `0122` = Issues `business_date` in the location timezone, Inventory module gate restored on Purchases writes, and `api.workforce_staff_manage` Manager-only (a plain Staff user could read coworkers' wage; found by independent review, reproduced locally, fixed).
- Verified after apply: Staff reads 0 rows of the manager view (real Staff JWT, public key), Manager list/read/write works, an Issue created at 03:04 JST got 営業日 2026-09-22, Data API exposes only `public`, `graphql_public`, `api`.
- Records: #538, #542, #543, #544. Tests: `apps/web` 1370/1370; pgTAP 61 files / 1501 tests, baseline failures only.

## 3. Where we are

- Engineering: **Founder Technical Freeze readiness = PASS.** The freeze itself is the **Founder's decision** and has not been declared.
- **Cafe v2.2 is NOT declared CLOSED.** Next and final Cafe v2.2 mission: **Founder Acceptance** (not started).
- Three different notions stay separate: Engineering PASS (the Lead's assessment), Founder Technical Freeze (Founder), Commercial Release (Founder).

## 4. Open items (all in `docs/operations/deferred-debt-register.md`)

- **Commercial Release blockers (not freeze blockers):** DEBT-053 (Copy Audit class A: sign-in screen English-only, English state screens, raw server messages, 仕入れ vs 購入, and the allergen wording JA `アレルゲンなし（確認済み）` vs EN `No known allergens` which needs native and legal review); DEBT-001 to DEBT-004 and DEBT-059 (Mail thread, Operations backlog now 63+ and growing daily, QA-named Inventory items, append-only QA residue; systemic fix = clean demo tenant); DEBT-035/036/043 (Production keys and the `dev → main → production` path).
- **Still to do by the Founder:** Production Data API probe (DEBT-061, Prod only): needs the Prod project ref and publishable key; method in the Mission 10.5 report section 7 (`Accept-Profile` per schema; internal schemas must answer `406 PGRST106`).
- **Founder decisions:** DEBT-057 (Feature Map found things not wired in code: schedule publish button, `WorkReportForm`, "承認" in the shift-preferences popup is a local mark only, Staff accept-exchange/cancel-own-request; not verified live), DEBT-063 (preview Surface A still prices a missing rate as 0 yen; part of DEBT-020), DEBT-050 residual (old Issues keep UTC dates; backfill needs a migration that disables the guard).
- **SaaS Hardening:** DEBT-049 (no second tenant: cross-tenant/cross-location/no-role/module-OFF not tested live), DEBT-056 (no audit record on wage/purchases/issues mutations, lost-update window on `received`, NaN).
- **Accepted for freeze / backlog:** DEBT-054 (legacy Modal focus trap), DEBT-055 (UI polish), DEBT-058 (UTC remnants), DEBT-060 (surfaces not tested live: correction requests, invitations, Settings edits, Transport, error states, Inventory-OFF live), DEBT-009, DEBT-042, DEBT-064 (stale tab spams 404 after a deploy).
- Test wages (田中 1200, 鈴木 1500) are QA data on `oruwa-cafe`; replace before real use.

## 5. Plan (recommended order)

1. **Founder:** declare (or not) the Technical Freeze; optional but wise: give the Production project ref + publishable key so the Lead probes its Data API.
2. **Founder, in parallel and not blocking:** send the allergen wording and the Copy Audit review packet (`CAFE_V2_2_COPY_AUDIT_2026-09-21.md` section 7, 56 rows) to GPT/native/legal.
3. **Founder Acceptance mission** (fresh chat, bootstrap below): the Founder personally walks Manager and Staff; the Lead prepares the walkthrough, records findings, fixes only class-A bounded defects. Recommended: agree first whether to accept on the current QA tenant or after a clean demo tenant.
4. After acceptance: clean demo tenant mission (DEBT-004, closes 001–003, 059), Copy/native JA pass, SaaS Hardening (second tenant, audit, DEBT-056), then the Production gate (DEBT-035/036/043).
5. Do NOT start new features, SaaS Hardening, the clean demo tenant or Production work without a fresh Founder prompt (Operating Model §16).

## 6. Tooling notes learned (do not relearn)

- Radix tabs and menus ignore a scripted `click()`: dispatch `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`.
- React inputs: set the value with the native setter and dispatch `input`; `fill` needs a fresh snapshot uid.
- Full accessibility snapshots are huge; prefer `evaluate_script` reading `innerText` of the top `[role=dialog]`.
- Reviewer subagents share the working tree and can detach HEAD or switch branches: run `git status -sb` before every commit.
- `cat >> file` on a branch without the file creates a partial file; use Edit on the right branch.
- P0004 is `ASSERT_FAILURE` in PL/pgSQL, `WHEN OTHERS` does not catch it in pgTAP helpers.
- `supabase migration list` reads the linked Cloud project (read-only, safe). Never print keys via the CLI. A public `sb_publishable_*` key may be used from a browser page on the project's own origin for read-only probes.
- After a Vercel deploy, an open tab can show one "Something went wrong" page and a stale tab keeps POSTing 404 (DEBT-064): reload.
- Today's own shift cell in the Staff view does not open by design (needs a report or "!"): a correction request for today cannot be started from it.
- The Staff account is a single employee (田中美咲): per-employee labour-cost sums with real hours cannot be produced live.
- Command discipline: plain allow-listed commands, no `cd … &&`, no `node -e` heredocs.

## 7. Prohibitions and boundaries

RED (Founder only): merging into `main`, Production, any write to a real database or applying a migration to Cloud, secrets, billing, real LINE broadcast, merging a PR that touches `supabase/migrations/**`. Do not modify: `main`; Production Vercel/Supabase; `.env*`; `.claude/settings.json`, `scripts/ai-hooks/*`, `scripts/ai-dev-merge.sh`; `docs/ai/history/*`; existing `oruwa-cafe` records (resolve through workflows, never delete).

## 8. Bootstrap prompt (paste into the new chat)

```
Прочитай AGENTS.md, затем docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md (v1.9.0),
затем docs/ai/current-task.md, docs/operations/deferred-debt-register.md,
docs/ai/SESSION_HANDOFF_2026-09-22.md,
docs/ai/CAFE_V2_2_FULL_INTEGRATED_ACCEPTANCE_REPORT_2026-09-21.md и
docs/ai/CAFE_V2_2_TECHNICAL_FREEZE_CLOSURE_REPORT_2026-09-21.md.

Состояние: Mission 10 закрыта с пробелами, Mission 10.5 закрыта, готовность к
Founder Technical Freeze = PASS (инженерная часть), миграция 0122 применена к Cloud DEV.
Cafe v2.2 НЕ объявлен закрытым. Заморозку и Commercial Release решаю я.

Начни с Repository Recovery (ветка, HEAD, дерево, открытые PR, свежесть handoff),
проверки триггеров реестра долга и read-only `supabase migration list`.
Миссия: <ВСТАВЬТЕ: например «Founder Acceptance: подготовь пошаговый сценарий приёмки
Manager и Staff для меня, веди журнал находок, чини только ограниченные дефекты
класса A» ИЛИ «проверка Data API Production-проекта: ref и ключ ниже» ИЛИ
«миссия чистого демо-тенанта DEBT-004»>.
Действуй автономно в границах миссии, пиши по-русски, рутинных вопросов не задавай.
За мной только RED-действия из Operating Model §9: main, прод, запись в реальную БД и
применение миграций к Cloud, секреты, биллинг, LINE-рассылки, слияние PR с миграциями.
Если нужен QA-пароль, скажу, вставлю в чат.
```

---

No secrets, passwords, tokens or keys are recorded in this file.
