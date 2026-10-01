# SESSION_HANDOFF (2026-10-01) — Founder Acceptance: QA1/QA2 fixed, Founder now runs QA3 personally

Durable handoff for a **fresh** Claude Code session. Git, this file and the
listed PRs/register are the source of truth, not any prior chat. VERIFIED =
confirmed by tool output on 2026-09-22/2026-10-01; the rest is INFERRED,
UNKNOWN or NOT TESTED (Operating Model §6). This file continues the
"Founder Acceptance" mission started from `SESSION_HANDOFF_2026-09-22.md`
(Mission 11, ChatGPT-authored brief, Founder-approved as the mission plan).

## 1. Repository / git state (VERIFIED)

- Branch `dev`, HEAD `061f89c` ("docs(ai): session handoff 2026-10-01 for
  Founder Acceptance QA3 round (#551)"). Working tree clean. `main` and
  Production: untouched.
- **No open PRs.** #549 (migration `0123`) was merged by the Founder
  directly, and the Founder then ran `npx supabase db push` themselves
  (2026-10-01) — `supabase migration list` confirms `0123` in the Remote
  column, and it was live-verified in this session: Manager → オペレーション
  → 対応が必要 now shows 5 real checklist groups (オープニング衛生チェック,
  Opening checklist, 温度管理チェック, 日次清掃チェック, クロージング衛生チェック)
  instead of one generic "タスク" bucket. §6 below is historical — do not
  re-apply or re-verify unless new evidence suggests regression.
- Local branches from this chat
  (`fix/founder-acceptance-qa1-2026-09-22`,
  `fix/founder-acceptance-qa2-2026-10-01`,
  `fix/founder-acceptance-qa2-exception-names`,
  `docs/debt-065-supabase-public-grants`,
  `docs/debt-066-067-qa2-2026-10-01`) are all merged except the last commit
  of `fix/founder-acceptance-qa2-exception-names`, which IS PR #549 above —
  do not delete that one's remote branch. The session cannot delete local
  branches itself (destructive-git permission gate); harmless to leave.
- QA accounts (public demo, Founder-classified): Manager
  `manager@oruwa-cafe.test`, Staff 田中美咲 (konstantin.a.chvykov@gmail.com).
  Founder pastes passwords in chat if needed; never write them to a file.

## 2. What was done in this chat (merged to `dev`)

**QA1 (quick pass, 2026-09-22–23), PR #546:**
- Inventory/Purchases/Recipes popups moved off the legacy design-kit
  `Modal` (no scroll-lock) onto `@line-os/ui` `Dialog` — background page no
  longer scrolls behind an open popup.
- `ListRow` (packages/ui): title got a `min-w-[9rem]` floor + row `flex-wrap`
  so 2-3 status badges drop to their own line instead of squeezing the
  title — fixed Staff "Today's tasks" truncation at 375px.
- Purchases (Staff): removed a stray `opacity:0.85` stacked on already-muted
  text for settled items (was ~4.15:1 contrast, below WCAG AA).
- Settings "View requests" button: removed a misapplied `.actionReveal`
  hover class (hand-icon reveal meant for staff-name buttons only) that
  overlapped the JA label.
- Attention Panel heading (要確認): explicit `font-weight:700`.
- Independent UX/i18n review: PASS, 2 non-blocking notes both live-verified
  afterward (focus recovery after a Recipe edit+save stays inside the
  Dialog; Purchases popup's new `wide` (960px) size reads fine at 1440px).

**QA2 (GPT-authored browser run, 2026-10-01), PR #548 + #549 + #550:**
- `ListRow` gained a `stackStatus` prop (status always full-width below
  title/subtitle) — fixes Operations Today's tasks title truncation at
  **768px**, which QA1's 375px fix didn't cover. Used only by Today's tasks
  (Manager + Staff); every other `ListRow` caller unchanged. **PR #548,
  merged.**
- Inventory OK/十分 count and the "OK" filter tab used
  `status !== 'shortage'`, silently counting a never-counted item (status
  `'unknown'`, row correctly shows "未カウント") as OK. Now requires
  `status === 'sufficient'`. **PR #548, merged.**
- Migration `0123`: resolves `template_name` directly in
  `api.operations_open_exceptions` (via the exception's instance or
  schedule, both `ON DELETE RESTRICT` to the template — never null), so a
  historical Operations exception outside "today" gets its real checklist
  name instead of a generic "タスク" placeholder. **PR #549, merged; migration
  applied to Cloud DEV by the Founder and live-verified — CLOSED.**
- Weekly Review's real server time measured via the Network panel (not
  client-to-paint): **1117ms** for the whole server action. The SQL itself
  (9 plain `count(*)`, no joins) isn't expensive on this dataset — reads as
  Cloud DEV cold-start/connection latency, not a query defect. Not fixed
  (nothing to fix in code); recorded as a fact, not a bug.
- Two content-only findings are live tenant data, not code — not touched:
  a kanji typo in the アイスコーヒー recipe description (「冒やした」 should
  read 「冷やした」), and a 蓋 (lid) ingredient in カフェラテ priced in kg
  (looks like a unit/packaging mismatch). **DEBT-066.**
- GPT's own test item "QA2 2026-10-01 検証専用" (Inventory, pcs) is new QA
  residue left on `oruwa-cafe`, count 10, with its own history. **DEBT-067.**
- Docs: DEBT-065 (Supabase's 2026-10-30 public-schema Data API grant
  change — no impact, no migration creates a `public` table), DEBT-066,
  DEBT-067, DEBT-068 (this file's §6, the open PR #549) all added to
  `docs/operations/deferred-debt-register.md`.

## 3. Where we are

- Founder Technical Freeze: **APPROVED** (Founder decision, stands).
- Founder Acceptance (Mission 11) is **IN PROGRESS, not closed.** Two
  bounded QA rounds (QA1 quick pass, QA2 GPT-authored deep pass) found and
  fixed 6 real defects total (all merged and live, including the migration),
  and flagged 2 content-only items + 1 QA-residue item as separate debt.
  Neither QA round claimed 100% coverage.
- **The Founder is now running QA3 personally** — a checklist artifact was
  published covering: (a) quick re-verification of every QA1/QA2 fix, and
  (b) every item GPT's own QA2 report and the acceptance's DEBT-060 row
  listed as NOT TESTED live (full Staff clock-in/out cycle with a real
  labour-cost sum, Mail two-way exchange, correction-request submit+approve,
  invitations/LINE linking, Settings edits, module-OFF degradation,
  network-error handling, JA/EN parity sweep). **This chat does not know
  the Founder's QA3 answers yet — read them from the Founder's first message
  in the new chat, do not assume or re-derive them.**

## 4. Known defects / open issues (all in the register)

Read `docs/operations/deferred-debt-register.md` directly — do not trust a
restated list here to still be current. At minimum: DEBT-053 (Copy Audit
class A, native JA pass), DEBT-059/066/067 (QA residue + content typos,
clean together with DEBT-004), DEBT-060 (surfaces never tested live before
QA3 — QA3 may close some of these), DEBT-061 (Production Data API probe,
still needs the Founder's Prod ref+key). DEBT-068 (tracked PR #549) is
CLOSED — mark it so in the register on your first touch of that file if it
still shows OPEN.

## 5. Relevant existing documentation

Read in this order: `AGENTS.md` → `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`
→ `docs/ai/current-task.md` → `docs/operations/deferred-debt-register.md`
→ this file → `docs/ai/SESSION_HANDOFF_2026-09-22.md` (prior round, still
useful for the original Mission 11 brief and its own earlier findings) →
`docs/product/cafe-v2-2-feature-map-ru.md` (what the product actually does,
by code, useful context for judging a QA3 finding's severity).

## 6. PR #549 — apply steps (HISTORICAL — already done, 2026-10-01)

Kept for reference only; nothing to act on. The Founder merged PR #549 and
ran `npx supabase db push` themselves in this session (their PowerShell
had no global `supabase` on PATH, so used the repo-local
`npx supabase db push`); the Lead then confirmed `0123` in
`supabase migration list`'s Remote column and live-verified the Attention
feed. Original steps, for the shape of any future RED migration PR:
1. Merge the migration PR into `dev`.
2. Apply the `.sql` file to Cloud DEV (`npx supabase db push` from the repo
   root, or `pnpm db:migrate`) — **Founder action, the session cannot do
   this itself** (the `Bash` tool's permission layer blocks it outright,
   confirmed in this session).
3. Verify live.

## 7. Architecture / security constraints (binding)

Nothing beyond the standing rules in `CLAUDE.md` / the Operating Model: never
`db push`/apply a Cloud migration, never merge a PR touching
`supabase/migrations/**`, never touch `main`/Production without explicit
Founder approval.

## 8. Explicit prohibitions for the next session

- Do not restart a full QA sweep — QA1/QA2 already covered a lot; read §2-3
  before re-testing something already closed.
- Do not silently edit the two content findings in DEBT-066 (recipe copy,
  lid unit) — that is live tenant data, Founder/native-review territory.
- Do not start WP6, Cafe v2.3, SaaS Hardening, the clean demo tenant, or
  Production work without a fresh, explicit Founder prompt (Operating Model
  §16 / the original Mission 11 brief §3).

## 9. New workstream — full objective

Continue Founder Acceptance (Mission 11, full brief in
`SESSION_HANDOFF_2026-09-22.md`'s originating chat — the ChatGPT-authored
brief the Founder approved). Immediate next step: the Founder reports their
QA3 findings in the new chat, one at a time or as a batch. For each: classify
FA0 (blocker) / FA1 (major, fix now if bounded) / FA2 (non-blocking, backlog
unless trivial) / FA3 (idea, backlog, Technical-Freeze-protected) per the
original brief's own classification rules — do not invent new categories.
Fix bounded FA0/FA1 defects autonomously (branch → fix → typecheck/lint →
live Browser QA on a Preview deploy → independent review if the change
touches RLS/migrations/security or is a Standard/High-risk UI change →
PR → `scripts/ai-dev-merge.sh` → confirm live), the same workflow this
session already ran twice.

## 10. Required deliverable

None fixed yet — follows from whatever the Founder reports. When Founder
Acceptance eventually reaches a finish line (QA3 complete, all bounded
defects resolved, no open RED gates), the deliverable is the same as any
mission close: a completion report + a new `SESSION_HANDOFF_<date>.md`,
and the Founder's own explicit "Founder Acceptance: PASS / Cafe v2.2:
CLOSED" decision — per the original Mission 11 brief §18-19. Not there yet.

## 11. Mission-specific approval boundaries / deviations

None beyond the Operating Model defaults. PRs #546 and #548 were merged
autonomously via `scripts/ai-dev-merge.sh` (routine commit/push/PR/dev-merge
authority, standing Founder grant); #549 was correctly held back as RED
(split out of #548 specifically because it depended on a migration apply)
until the Founder merged it and ran the migration apply themselves — do not
treat that split as a tightened rule, it is the existing migration gate
working as designed, and it resolved the same session it was raised.

## 12. What must NOT be accidentally modified

- `main`, Production (Vercel/Supabase), `.env*`, `.claude/settings.json`,
  `scripts/ai-hooks/*`, `scripts/ai-dev-merge.sh`, `docs/ai/history/*`.
- Existing `oruwa-cafe` records — resolve/complete through the product's own
  workflows, never delete directly; the GPT QA2 residue item
  ("QA2 2026-10-01 検証専用") stays until the Founder decides on the clean
  demo tenant (DEBT-004/067), don't delete it unilaterally (unlike the
  Lead's own QA3 test item earlier, which had zero history and was deleted
  immediately after use — that's the right pattern for any test data this
  session creates: clean up only what you created yourself, with zero
  history, right after verifying).

## 13. Bootstrap prompt (paste into the new chat)

```
Прочитай AGENTS.md, затем docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md,
затем docs/ai/current-task.md, docs/operations/deferred-debt-register.md,
docs/ai/SESSION_HANDOFF_2026-10-01.md (этот файл) и
docs/ai/SESSION_HANDOFF_2026-09-22.md (исходный бриф Mission 11).

Состояние: Founder Technical Freeze одобрен. Founder Acceptance (Mission 11)
в процессе. QA1 и QA2 закрыты, все 6 найденных дефектов исправлены и живут
в dev, включая миграцию 0123 (PR #549 смержен, применена к Cloud DEV мной
лично, живьём проверена). Открытых PR нет. Два находки по контенту и один
остаток QA-данных записаны как DEBT-066/067, не трогать без отдельного
решения.

Я (Founder) сейчас прохожу чек-лист QA3 лично:
https://claude.ai/artifact/5QMbWvsLDV9r3EK7rndity
Буду присылать находки по ходу — классифицируй их (FA0-FA3 по правилам
исходного брифа Mission 11), чини ограниченные FA0/FA1 автономно
(ветка → фикс → typecheck/lint → живая проверка на Preview → ревью где
нужно → PR → ai-dev-merge.sh), возвращай меня к проверенному пункту.
Рутинных вопросов не задавай. За мной только RED: main, прод, запись в
реальную БД и применение миграций к Cloud, секреты, биллинг, LINE-рассылки,
слияние PR с миграциями.
Если нужен QA-пароль, скажу, вставлю в чат.

Начни с Repository Recovery (ветка, HEAD, дерево, открытые PR) и жди мои
находки по QA3.
```

---

No secrets, passwords, tokens or keys are recorded in this file.
