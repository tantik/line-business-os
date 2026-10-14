# SESSION_HANDOFF (2026-10-14) — allergens 29, cloud auto-schedule, Lead-run QA3 + fixes

Durable handoff for a fresh Claude Code session. Reality check first
(Operating Model §4): `git log -1` on `dev` should be the merge of
`docs/handoff-2026-10-14` or later. Operating model unchanged: the Lead is
CTO (Operating Model §9 "CTO authority"); Founder gates = production +
real-customer messages only.

## 1. Merged and live on Cloud DEV / preview.oruwa.jp (2026-10-12..14)

| PR | What | Cloud DEV |
|---|---|---|
| #576 | A-09 allergens: **29 items** (CAA revision effective 2026-04-01: カシューナッツ mandatory, ピスタチオ added), recipe 「アレルゲン情報」 + disclaimer, stale `'{}'` reset, revocable confirmation | 0124 applied, verified live |
| #577 | Stage 2 / DEBT-074: pg_cron (`7 * * * *`) → pg_net → Edge Function `auto-schedule-monthly`; run log in Manager Settings | 0125 applied, function deployed, vault `auto_schedule_project_url` set; live run made 87 Nov drafts; hourly cron proven (pg_net request ids 3→46) |
| #578 | DEBT-074 closed, DEBT-091 (multi-manager), QA3 md checklist, `oruwa-engineer` command discipline | — |
| #579, #580 | Inventory ••• menu + photo viewer inside Radix dialogs (Radix `Menu`, new `@line-os/ui` `ImageViewer`); token `--oruwa-z-dropdown` 1000 → **1350** (above modal) | verified live |
| #581, #582 | Exchange replacement: conflicts outside the viewed week flagged (この時間帯は既に予定あり), conflicting candidates disabled, result shown inside the popup | verified live |
| #583 | Auto-schedule **weekly labour limits**: `max_weekly_hours` (40) / `max_days_per_week` (5) settings, engine + manual + cloud paths | 0126 applied, function redeployed; live: 4–5 days, 37–39 h per person (was 7 days, 57–70 h) |

## 2. OPEN — finish first

**PR #584 `fix/qa3-batch-1`** (worktree `.claude/worktrees/agent-a3066c95d556278a2`).
Commits: attention panel gets `issue` + `operations` categories; Staff
shift dialog shows the decision on own request; sign-in keeps email after a
failed login (sessionStorage); localized tab titles; 「この週の予定時間」;
`role=alert` on the preference error; draft suffix in grid aria-labels;
DEBT-092/093. Last commit `2e9b62c` = UX-review fixes **partial** (engineer
hit a session limit). Web tests 1490/1490, typecheck clean.

UX review (PASS WITH NOTES) items — verify each in the diff, finish what is missing:
1. P2: "すべて確認" queue must collapse Operations exceptions by task+source+severity (as `operations/attention-section.tsx` does), not one row each.
2. Use Operations' own source wording (`attentionSource*` in `operations-i18n.ts`), no 「オペレーションの例外」, no generic 「対応が必要」 for warnings.
3. 「要対応の問題報告」 / "Issue reports – needs action" instead of 「重要な問題報告」.
4. 「問題報告」 chip shows total plus 「（要対応 N）」 when N > 0.
5. EN: "View issues"; staff header "Scheduled (selected week)".
6. `Array.from(note).slice(0, 60)`.
7. Staff decision notice via `InlineAlert` (warning/info); no duplicate 「すでに承認済み…」 line.

Then: CI → `bash scripts/ai-dev-merge.sh 584` → live check list from the review:
sign-in email kept after wrong password (React 19 form reset risk), tab
titles EN/JA, 要確認 chips + Review-all with a 重要 issue, Staff sees
「申請は却下されました（…）」 after a rejection.

## 3. Lead-run QA3 (2026-10-14)

Interactive checklist with per-item results ("Claude 14.10" notes):
https://claude.ai/artifact/CjEx8ihW7PBuU8YC6Py5zZ (artifact db collection
`results`, readable with ArtifactData). Markdown copy:
`docs/ai/FOUNDER_QA3_CHECKLIST_2026-10-12.md`.

Verified OK: sections 1, 2.4–2.5, 3, 4, 5, 6.1/6.4, 8, 9.1–9.2, 11, 12.1–12.2, 15.1.
Not yet done by the Lead: 2.1–2.3 (need email), 2.6, 7 (no past shifts to
correct — do in QA4), 9.3–9.4, 10, 12.3–12.8, 13, 14, 15.2–15.3, 16.2–16.4, 17.

Test-data changes made: Nov 2–8 week published; 鈴木 preferences 10/11 Nov;
3 old August exchange requests rejected; 鈴木's Nov 2 exchange request
rejected; 鈴木 clocked in/out on 2026-10-14 (transport ¥480); one 重要 issue
「QA 10/14: 製氷機から水漏れしています。」 open; mail thread 鈴木↔Manager.

## 4. Facts worth knowing

- Cloud DEV SQL: `pnpm exec supabase db query --linked "<sql>"` (CLI logged
  in). Cloud push/deploy only from the main checkout `D:/Dev/line-business-os`
  (uppercase `D:` — a lowercase `d:` cwd breaks worktree isolation).
- Engineer subagents die on session rate limits: check the worktree, run
  tests, commit by hand.
- Local Docker sometimes stops: start `C:/Program Files/Docker/Docker/Docker Desktop.exe`.
- Agent Chrome cannot read the Founder's Gmail; QA mail needs a dedicated QA Gmail (Founder input).
- `.claude/settings.local.json` (Founder's): `supabase db push` deny and `find *` allow removed with OK.

## 5. Next work (CTO proceeds without a Founder prompt)

1. Finish and merge PR #584 (§2), live-check.
2. Continue Lead QA3 on the remaining sections (§3), fix findings.
3. Stage 3 prep — QA4 one-month simulation: scenario + seed script for a realistic past month on the test tenant.
4. Stage 4B — automated tenant provisioning (incl. Manager-appointment UI, DEBT-091): architecture plan first, then engineer.
5. Small debts: DEBT-090 (marker read-only), DEBT-092, DEBT-093, DEBT-083 (JA invite email).

Founder inputs still open: dedicated QA Gmail; native/legal review of the
allergen strings; QA3 owner's-eye pass (§4 auto-schedule settings, JA texts).

## 6. Bootstrap prompt (paste into the new chat)

```
Ты — CTO/архитектор проекта (Operating Model §9 «CTO authority»).
Прочитай AGENTS.md, CLAUDE.md, docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md,
docs/ai/current-task.md, docs/operations/deferred-debt-register.md и
docs/ai/SESSION_HANDOFF_2026-10-14.md (последний handoff).

Начни с Repository Recovery. Первое: доведи PR #584 (§2 handoff) — проверь
каждый пункт UX-ревью, доделай, CI, слияние в dev, живая проверка на
preview.oruwa.jp. Дальше по §5: продолжай QA3 сам (результаты — в артефакт
чек-листа), исправляй находки; затем подготовка QA4 и этап 4B.
Работай без моих подтверждений; меня спрашивай только про продакшн и
реальные сообщения клиентам, входные данные проси одним списком.
В конце каждой задачи — короткий отчёт на русском: что сделано, как
проверено, что посмотреть мне руками.
```
