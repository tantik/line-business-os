# SESSION_HANDOFF (2026-10-08) — Shift Preferences mission CLOSED; QA3 checklist and next-phase roadmap ready

Durable handoff for a fresh Claude Code session. Follows
`SESSION_HANDOFF_2026-10-07.md` (full functional QA; read its §3 for the
per-block results and §4 for the coverage matrix).

## 1. Git state

- `dev` HEAD after this docs PR (check `git log -1`); no open PRs expected.
- Session PRs: #557, #558 (Founder-merged), #559, #560, #561, #562 and this
  docs PR (all via `scripts/ai-dev-merge.sh`). No migration. `main` and
  Production untouched.

## 2. What closed today (VERIFIED)

- **DEBT-073 CLOSED**: a real reminder email was delivered through Resend
  (`reminders@notifications.oruwa.jp` → Founder inbox `+qa1008`, 18:58 JST,
  JA + EN body correct). Earlier "not configured" was a missing rebuild:
  Vercel injects env vars at build time; a merge to `dev` redeploys.
- **Shift Preferences / email reminder mission: CLOSED** (was CLOSED WITH
  GAPS only because of DEBT-073).
- **DEBT-072 CLOSED**: Supabase Auth invite email is delivered (Founder saw
  it). New **DEBT-083**: that email is English-only → ready-to-paste JA+EN
  template in `docs/operations/supabase-invite-email-template-ja.md`
  (Founder pastes in Supabase Dashboard; never change the `href`).
- **DEBT-079 cause found**: Staff B (`+staffb`) is 佐藤 陽介, whose invite had
  expired, so the account was never activated. Invite re-sent 2026-10-08;
  closes once the Founder accepts it and sets a password.
- Temporary QA employees (`QA検証 太郎`, `QA検証 花子`) were permanently
  deleted after use.

## 3. Current stage and plan

- **Founder Acceptance (Mission 11): IN PROGRESS.** The Founder runs QA3 from
  `docs/ai/FOUNDER_QA3_CHECKLIST_2026-10-08.md` (in Russian, marks what
  changed on 10/7–10/8).
- **Next-phase order** (Founder + ChatGPT proposal, Lead Prompt Review:
  ACCEPT WITH AMENDMENTS): `docs/strategy/oruwa-roadmap-v2-2-close-to-production-2026-10-08.md`
  1. QA3 (Founder) → triage findings.
  2. DEBT-074 worker: needs the Founder's hosting choice (recommended:
     Supabase scheduled Edge Function; Vercel Cron in `apps/web` is not
     allowed because of `service_role`).
  3. QA4 Final Operational Simulation (~1 month) → final reviews →
     Cafe v2.2 CLOSED, under the exit criteria in that document
     (0 P0/P1/data-loss/security/broken-core/misleading; all else accepted debt).
  4. After v2.2: LINE + email notifications → automated tenant provisioning
     → 6-tenant provisioning test → clean demo tenant via provisioning →
     JA copy finalization → SaaS hardening → production → billing/legal.

## 4. Founder actions pending

1. Run QA3; send findings as "block → action → expected → seen".
2. Accept the 佐藤 陽介 invite from the `+staffb` inbox and set a password.
3. Optional now: paste the JA invite template (DEBT-083).
4. For Stage 2: choose worker hosting (1 / 2 / 3 in the roadmap).
5. For QA4: create 2–4 more Founder-owned mailbox aliases for extra Staff
   (`+staffd`, `+staffe`, ...) — the Lead invites them; decide whether a
   seed script may write a realistic past month to Cloud DEV (Cloud data
   write = Founder gate).

## 5. Rules a new session must keep

- Passwords are never written to files; the Founder pastes them in chat.
- The Founder sometimes merges PRs directly; check `gh pr view <n> --json
  state` before pushing a follow-up commit.
- Do not start Stage 2 or later without the Founder's prompt for that stage.

## 6. Bootstrap prompt (paste into the new chat)

```
Прочитай AGENTS.md, docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md,
docs/ai/current-task.md, docs/operations/deferred-debt-register.md,
docs/ai/SESSION_HANDOFF_2026-10-08.md (последний handoff) и
docs/strategy/oruwa-roadmap-v2-2-close-to-production-2026-10-08.md (план).

Состояние: Founder Acceptance (Mission 11) идёт. Миссия Shift Preferences +
email reminder закрыта (письмо через Resend дошло). Я прохожу QA3 по
docs/ai/FOUNDER_QA3_CHECKLIST_2026-10-08.md.

[Впиши: результаты QA3 (список находок: блок → действие → ожидал → увидел),
принял ли приглашение Staff B, вставил ли японский шаблон приглашения,
выбор хостинга worker (1/2/3), алиасы для доп. Staff, можно ли seed-скрипт]

Начни с Repository Recovery. Затем разбери мои находки QA3 (исправить /
в долг / не дефект) и исправь подтверждённые по обычному циклу (ветка →
фикс → тесты → живая проверка → независимое ревью → PR → ai-dev-merge.sh).
Дальше действуй по плану roadmap, этап за этапом; каждый этап начинай только
после моего подтверждения. RED: main, прод, миграции на Cloud, секреты,
биллинг, LINE-рассылки.
```
