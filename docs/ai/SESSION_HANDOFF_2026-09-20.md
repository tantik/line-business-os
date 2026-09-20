# SESSION_HANDOFF (2026-09-20) — governance v1.9.0 closed, Full Integrated Acceptance prepared

Durable handoff for a **fresh** Claude Code session. This file, git, and the
repository's own tests/docs are the source of truth, not any prior chat.
Everything marked VERIFIED was confirmed by tool output in the session that
wrote this file on 2026-09-20; anything else is INFERRED or UNKNOWN
(Operating Model §6). Template: `docs/ai/templates/handoff-template.md`.

## 1. Repository / git state (VERIFIED)

- Branch `dev` at time of writing (this file is carried by the docs PR `docs/ai-handoff-2026-09-20-acceptance-prep`), HEAD `64a374c` (`fix(web): discover tests automatically … (DEBT-038) (#534)`), equal to `origin/dev` at the time of writing.
- Working tree clean apart from this handoff and the mission file, which are added by the docs PR that carries them. No open PRs.
- `main` and production untouched. Cloud DEV migrations `0099` to `0121` applied per the closure records (not re-queried this session).
- Recommended branch for the next session: a new `docs/` or `fix/` feature branch off `dev`; never work on `dev` directly.

## 2. Merged this session

| PR | Commit | What |
|---|---|---|
| #533 | `30b7f78` | Governance v1.9.0: roles, Prompt Review (§18), 15-dimension coverage matrix and "CLOSED WITH GAPS" (§19), reviewer-selection table, two new specialist reviewers, `current-task.md` cut from 2240 to about 215 lines (old text verbatim in `docs/ai/history/`), `docs/operations/deferred-debt-register.md`. |
| #534 | `64a374c` | `apps/web` test script now auto-discovers tests (`apps/web/scripts/run-tests.mjs`); 4 previously never-run tests now run; suite = 131 files, **1347 tests**, all pass. Closes DEBT-038. |

## 3. Verified results (CLOSED, do not reopen without new evidence)

- Two independent reviews of #533 (first FAIL with 2 P1 and 4 P2, all fixed; second PASS) and one of #534 (no P0 to P2). CI green on both.
- The three reviewer agent types (`oruwa-reviewer`, `oruwa-db-security-reviewer`, `oruwa-ux-i18n-reviewer`) load as Agent types in a session started after #533. The old `oruwa-reviewer` never loaded before because its YAML frontmatter was invalid; fixed.
- The archived text in `docs/ai/history/` is byte-faithful to the pre-2026-09-19 `current-task.md` (verified against `git show 604af04:docs/ai/current-task.md`).

## 4. Known defects / open issues

All open items live in `docs/operations/deferred-debt-register.md` (DEBT-001 to DEBT-049, 48 rows; DEBT-038 was closed and deleted); do not keep a second list here. The ones that matter for the next mission:

- DEBT-001 to DEBT-003 (Founder decisions before any live customer demo): Mail thread in Russian, Operations backlog of 52 items and 23 shift requests, two Inventory items named "QAフィクスチャー…". DEBT-004 (clean demo tenant) is the systemic fix and a Cloud data write, so a Founder gate and a separate mission.
- DEBT-049: no-role user and module-OFF tenant cannot be tested live on the single-tenant reference tenant; pgTAP and code review only.
- DEBT-006 to DEBT-009 and DEBT-042: the coverage gaps of Missions 8/9 that the acceptance mission is designed to close (EN pass, real Staff mutations, performance, keyboard audit, viewport combinations).
- DEBT-037: known pre-existing pgTAP failures (`0002`, `0006`, `0008`, `0012`, `0023`).
- DEBT-048 (residual hazard): `packages/db`, `config`, `line`, `tokens` still use hand-kept test lists; in sync on 2026-09-20 (db 24/24). Add new tests to those lists by hand and check the count rises.

## 5. Read first, in order

1. `AGENTS.md`, then `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` (v1.9.0: §2 roles, §12 reviewers, §18 Prompt Review, §19 coverage matrix, §9 boundaries, "Command discipline").
2. `docs/ai/current-task.md` (about 215 lines) and `docs/operations/deferred-debt-register.md`.
3. `docs/ai/CAFE_V2_2_FULL_INTEGRATED_ACCEPTANCE_MISSION_2026-09-20.md` (the mission, with its planned coverage matrix).
4. `docs/ai/SESSION_HANDOFF_2026-09-18-MISSION9.md` (what the last live QA did and did not cover), `docs/ai/review-checklists.md` ("Founder Acceptance order"), `docs/development/product-acceptance-workflow.md`.
5. `docs/project/master-state.md` §7, §12, §14 to §16 and `docs/strategy/oruwa-master-roadmap.md` Phase 4. Re-verify currency; they were reconciled 2026-09-18.

## 6. Not fully verified

- Whether the Full JA/EN Copy Audit and the Russian Feature Map were ever produced (DEBT-047, UNVERIFIED). Assume not until checked.
- Status of the UNVERIFIED register rows (DEBT-014, 015, 016, 019, 020, 025, 030 to 032, 034, 039, 047): re-check against code before acting.
- CI's behaviour with the old hand-kept lists is moot now; the new runner ran green in CI on #534.

## 7. Binding constraints for this mission

- The RED tier of Operating Model §9 is Founder-only: merging into `main`, production, any write to a real database, secrets, billing, real LINE broadcast, and merging a PR that touches `supabase/migrations/**`. Everything else the Lead Agent decides itself and does not ask the Founder routine questions (standing Founder instruction 2026-09-20).
- `oruwa-cafe` on Cloud DEV is a real shared database. QA actions go through the product UI, carry the "(v2.2 acceptance QA)" suffix, are resolved (not deleted), and are logged. No bulk cleanup, no `db push`, no migration apply by the session (hard-denied in `.claude/settings.json`; the Founder runs those).
- `.env` cannot be read by the session; if a QA credential is needed the Founder pastes it (they are Founder-classified public demo credentials: Manager `manager@oruwa-cafe.test`, Staff 田中美咲). The browser profile may already be signed in.
- Canonical Preview entry: `https://preview.oruwa.jp/sign-in`, then `/manager` or `/staff`. Not a raw per-deployment Vercel URL.
- Founder-facing language: Russian. Command discipline: plain allow-listed commands, no `cd … &&`, no `node -e` heredocs, no pipes, because those forms trigger permission prompts the Founder has to click.

## 8. Explicit prohibitions

No new features, no SaaS Hardening, no clean demo tenant, no Production work, no Platform Foundation wiring, no Purchasing/legacy-theme migration (DEBT-011) unless a finding proves it blocks release. Class B and C findings go to the register.

## 9. New workstream

Verbatim intent (Founder, 2026-09-20): "подготовь все чтобы начать в новом чате". Full objective, scope, tracks A to D, planned coverage matrix, Definition of Done, and stop condition are in the mission file listed in section 5.

## 10. Required deliverables

- `docs/ai/CAFE_V2_2_FULL_INTEGRATED_ACCEPTANCE_REPORT_<date>.md` (findings register, coverage matrix actual, verdict).
- Track A: Copy Audit report, Russian Feature Map, Demo Readiness note (place them under `docs/ai/` or `docs/product/` and name them in the report).
- Updated `docs/ai/current-task.md` (§5 replaced, not appended), `docs/project/master-state.md`, `docs/operations/deferred-debt-register.md`, and a new `SESSION_HANDOFF_<date>.md`.

## 11. Approval boundaries and deviations

None beyond Operating Model §9 and the constraints in section 7. Repairs are non-RED unless a finding forces a migration; then the PR is RED (Founder merges, Founder applies to Cloud DEV).

## 12. Do not accidentally modify

`main`; production Vercel/Supabase configuration; `.env*` files; the QA identities' credentials; existing `oruwa-cafe` records (resolve through workflows, never delete); `docs/ai/history/*` (verbatim archives); the RED-tier permission and hook files (`.claude/settings.json`, `scripts/ai-hooks/*`, `scripts/ai-dev-merge.sh`) unless the Founder asks.

## 13. Bootstrap prompt (paste into the new chat)

```
Прочитай AGENTS.md, затем docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md (v1.9.0),
затем docs/ai/current-task.md, docs/operations/deferred-debt-register.md,
docs/ai/SESSION_HANDOFF_2026-09-20.md и
docs/ai/CAFE_V2_2_FULL_INTEGRATED_ACCEPTANCE_MISSION_2026-09-20.md.

Миссия: Cafe v2.2 Full Integrated Acceptance (Phase 4), Tracks A-D из файла миссии.
Начни с Repository Recovery (ветка, HEAD, дерево, открытые PR, свежесть handoff) и
проверки триггеров реестра долга. Выполняй автономно в границах миссии: решения
принимаешь сам, мне пиши по-русски, вопросов по рутине не задавай. За мной только
RED-действия из Operating Model §9: слияние в main, прод, запись в реальную базу
данных, секреты и биллинг, реальные LINE-рассылки, слияние PR с миграциями. Если
нужен QA-пароль, скажи, я вставлю его в чат. Используй ревьюеров oruwa-ux-i18n-reviewer,
oruwa-db-security-reviewer и oruwa-reviewer по таблице §12. В конце дай мне итоговый
отчёт с явным разделением трёх разных понятий: Engineering PASS (твоя оценка),
Founder Technical Freeze и Commercial Release (это мои решения, ты только
рекомендуешь и называешь, что для них не хватает).
```

---

No secrets, passwords, tokens, or service_role values are recorded in this handoff.
