# SESSION_HANDOFF (2026-10-24) — 4B-4a Manager appointment live (0138), QA4 small batch, company mailbox + Claude in Chrome

Reality check first (Operating Model §4): `git log -1 origin/dev` should be
`4ce875a` (#628) or the merge of this handoff. Lead = CTO (Operating Model §9).
Founder gates: production, real-customer messages, money/accounts/secrets.
Previous detail: `docs/ai/SESSION_HANDOFF_2026-10-21B.md`.

## 1. Merged to `dev` since 10-21B, live-verified on preview.oruwa.jp

| PR | What | Cloud DEV | Live evidence |
|---|---|---|---|
| #627 | QA4 F10 kind-specific request banners, F6 shared mark-read rule, F7 quantity input rounding | — | Staff cancel request → 「シフト取り消しリクエストを送信しました。」; Manager 承認 → 「シフトの取り消しを承認しました。」, shift gone for Staff; reply into an open Manager thread marked read 5 s later (DB `is_read`) |
| #628 | **4B-4a** Owner/Admin appoints / revokes a Manager from staff (「役割」 section, 「店長」 badge) + **DEBT-094** (deactivate/delete revokes invites + Manager role; accept rejects inactive) | **0138 applied** (backfill touched 0 rows) | `qa-4b3-cafe-1`: Owner added 鈴木 (Staff C) → invite → banner accept → 「店長にする」 → 鈴木 opens `/manager` there; as Manager no 「役割」 section; 「店長から外す」 → `/manager` 「アクセスできません」; audit `appoint_manager` / `revoke_manager` |

Reviews #628: DB/security PASS (P2 delete-trigger fixed; re-review PASS), UX PASS
(copy fixed), general PASS. pgTAP 0077 100/100; full suite 75 files / 2119
tests, failing set = DEBT-037 baseline only. Tenant cascade-delete with the new
trigger verified locally (temp test). Debt: DEBT-094 CLOSED, DEBT-091 (a) done
except location scoping, DEBT-119 (follow-ups incl. 「シフト交換」 → 「シフト申請」).

Test data on Cloud DEV: Staff C (鈴木) is now also an employee of
`qa-4b3-cafe-1` (no Manager role); 佐藤's 10/25 test shift was cancelled via
the request flow.

## 2. New finding

- **F13** — no tenant switcher in the main UI: a user in two cafes always lands
  in the default tenant; the only switcher is the legacy English `/dashboard`
  page (cookie switch works). Needed before 4C. Planned in 4B-4b.

## 3. Founder setup done 2026-10-24

- **Company / support / QA mailbox: `oruwa.jp@gmail.com`.** Support contact for
  the Owner invite copy (DEBT-113a) = this address. Test identities =
  plus-addresses: `oruwa.jp+staffd@gmail.com`, `+staffe`, `+owner1..6`.
- **Claude in Chrome** extension installed; to be used in a separate Chrome
  profile "ORUWA" (signed in: this mailbox, Vercel, Supabase). Tools did not
  load in the old session — a new session with `/chrome` (or `claude --chrome`)
  is required. Never use the Founder's personal Gmail.
- Global `~/.claude/settings.json`: `supabase db push` no longer in `ask`
  (Founder "да" 2026-10-21); the project hook still blocks production.

## 4. Next (order)

1. Verify Claude in Chrome: open the mailbox, Vercel, Supabase in NEW tabs of
   the ORUWA profile (do not touch the Founder's tabs; close own tabs after).
2. DEBT-113a: Owner invite copy shows `oruwa.jp@gmail.com` (JA/EN) → PR → live.
3. Real-email invite QA: invite `oruwa.jp+staffd@gmail.com` as staff on
   `oruwa-cafe` → read the email in the mailbox → set password → first sign-in.
4. QA4 §13: Vercel Usage + Supabase Usage numbers → report / DEBT-097.
5. DEBT-111 for Preview/DEV only: generate one `PII_HASH_PEPPER`, set it in
   Vercel **Preview** env and Supabase DEV function secrets (production = Founder).
6. **4B-4b**: Owner checklist 「はじめにやること」 on `/manager` (3–5 outcome
   steps, progress from data), tenant switcher in the user menu (F13),
   DEBT-119 f rename; then DEBT-110c, DEBT-113 b/c.
7. **4C** 6-tenant test with `oruwa.jp+owner1..6@gmail.com` (+ DEBT-097, DEBT-114)
   → LINE stage.

## 5. Facts learned

- Worktrees: always `--workdir <worktree>` on supabase commands; never
  `git reset --soft origin/dev` after a merge (reverse diff, see 10-21B).
- Agent rate limits can stop subagents mid-task; resume the same agent with
  SendMessage (its context is kept) instead of starting a new one.
- QA automation: `/dashboard` switcher click needs a moment before navigating;
  Radix tabs/buttons need real clicks (snapshot uid), not `element.click()`.

## 6. Founder inputs (one list)

- Sign the ORUWA Chrome profile into Vercel + Supabase; 2-step verification on
  `oruwa.jp@gmail.com`.
- Before production: one `PII_HASH_PEPPER` for production (DEBT-111); a domain
  mailbox `support@oruwa.jp` (Google Workspace or Zoho) to replace the Gmail.
- Native/legal review of the allergen strings (`apps/web/src/lib/packages/cafe/allergens.ts`).
- QA4 §12 phone Realtime test and the QA4 final review (Founder section of
  `docs/ai/QA4_SCENARIO_2026-10-18.md`).

## 7. Bootstrap prompt (paste into the new chat after `/chrome`)

```
Ты — CTO/архитектор проекта (Operating Model §9 «CTO authority») и мой ИИ-CEO:
давай советы, предлагай вариант лучше, если мой слабее, и всегда ищи готовые
решения в мире (со ссылками), прежде чем строить.
Прочитай AGENTS.md, CLAUDE.md, docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md,
docs/ai/current-task.md, docs/operations/deferred-debt-register.md
и docs/ai/SESSION_HANDOFF_2026-10-24.md (последний).
Начни с Repository Recovery (git worktree list, git log -1 origin/dev).
Claude in Chrome подключён (профиль Chrome «ORUWA»: почта oruwa.jp@gmail.com,
Vercel, Supabase). Сначала загрузи скилл chrome-browser, проверь доступ —
только в новых вкладках, мои вкладки не трогай, свои закрывай после.
Затем по §4 handoff 2026-10-24: DEBT-113a → приглашение через настоящее письмо
(oruwa.jp+staffd@gmail.com) → QA4 §13 Usage → PII_HASH_PEPPER только для
Preview/DEV → 4B-4b (чек-лист Owner + переключатель кафе F13) → 4C → LINE.
Учитывай «Scale and cost» (300+ кафе, без polling) и решение по LINE.
Продакшн, деньги/аккаунты/секреты прода и реальные сообщения клиентам —
только с моего «да», одним списком. Остальное решай сам.
В конце каждой задачи — короткий отчёт на русском и отдельный список
«что посмотреть/проверить руками».
```
