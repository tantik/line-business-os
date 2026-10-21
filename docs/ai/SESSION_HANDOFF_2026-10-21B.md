# SESSION_HANDOFF (2026-10-21 B) — QA4 fixes F2/F3/F9/F11/F12 live, 0136 + 0137 on Cloud DEV

Reality check first (Operating Model §4): `git log -1 origin/dev` should be
`4ea9008` (#625) or the merge of this handoff. Lead = CTO (Operating Model §9).
Founder gates: production, real-customer messages, money/accounts/secrets.

## 1. Merged to `dev` and live-verified on preview.oruwa.jp

| PR | What | Cloud DEV | Live evidence (2026-10-21) |
|---|---|---|---|
| #619 | HACCP one-sided range label (`formatNumericRange`) | — | template shows 「0–5 °C」 and 「−15 °C以下」 |
| #620 | **F3** Weekly Review: attendance, lateness, possible no-shows (on_leave excluded), off-shift clock-ins, out-of-range readings (+ open) | **0136 applied** | week 10/12–18: 出勤13回, 遅刻1回（計16分）, 範囲外2件（未対応1件） = DB counts; 375 px clean |
| #621, #623 | **F11-A** presence 「出勤中 17:33〜」/「退勤 17:35」, **F11-C** 「シフト外の出勤」 in 要確認, **F2** staff report month stepper (12 months, older months on demand); attendance read bounded to prev + current month | — | Staff clock-in → Manager marker + chip in ≈2 s (Realtime); labour cost +¥40 live; Sep preloaded 13.9h, Aug on demand 30.3h; focus returns to the name button; phone: dot above time (#623 fixed clipping) |
| #624 | **F12** lateness in the presence marker 「出勤中 17:46〜（遅刻16分）」 (0136 rule, no new read) | — | 佐藤 17:46 vs 17:30 shift → 16 min, same as Weekly Review |
| #622 | **F9** 「入荷待ち 4 L（8 Lのうち）」, receive prefill, 「残りを取り消す」 (••• → DS ConfirmDialog), history 「残りを取り消し」, audit `close_remainder`; `record_purchase_order` now takes the item lock | **0137 applied** | 牛乳 4 L of 8 L visible (kept for the Founder), fixture 紙コップ remainder cancelled; Escape closes only the confirm |
| #625 | monthly hour cap counts drafts outside the re-run period | — | re-run 11/23–29: November 169–173 h → 153–159 h (cap 160), week ≤ 40 h / ≤ 5 days |

Reviews: every PR had general + UX/i18n + DB/security (where applicable);
all P1/P2 fixed before merge; P3 → DEBT-114..118.

Test data created on Cloud DEV (`oruwa-cafe`): published shift 佐藤 2026-10-21
17:30–20:00 (id `c20633c6…`), clock-ins 田中 17:33–17:35, 佐藤 17:46 (open),
November week 11/23–29 auto-drafts (16), fixture 紙コップ order closed.

## 2. QA4 status

- §5 DONE: clock-in/out live, lateness live (Weekly Review + marker), monthly
  cap (after #625). 日報 = DEBT-057.
- §12 phone Realtime: Founder.
- §13 cost: Realtime messages from `realtime.messages` ≈ 4–79 per day for the
  QA tenant during active QA (10-17..10-20). Vercel function invocations and
  Supabase Usage need dashboard access — the agent browser is not signed in
  (Founder input below).
- Findings closed: F1 (label 今月の概算人件費 already live), F2, F3, F9, F11,
  F12 (new), monthly cap (new). Open: F5 pending states (spot-checked: clock-in
  shows 処理中…), F6, F7 (check), F10 copy — next small batch.

## 3. Next (order)

1. Small QA4 batch: F10 cancel-request copy, F6 unread while thread open, F7
   float display check, DEBT-118 b/c.
2. 4B-4 Owner first-run wizard + Manager appointment (DEBT-091), DEBT-110(c)
   resend/revoke Owner invite, DEBT-113 b/c with it.
3. 4C 6-tenant test (+ DEBT-097 usage, DEBT-114 row cap) → LINE stage (each
   client's own OA; app works without LINE).

## 4. Facts learned this session

- Never `git reset --soft origin/dev` in a worktree after another PR merged:
  `ai-dev-merge.sh` fetches and moves `origin/dev`, so the soft reset commits a
  reverse diff (happened once on #621, caught by the general reviewer, fixed).
  Squash with a new commit instead; `--amend` is denied by settings anyway.
- `npx supabase … --workdir <worktree>` targets a worktree from the main
  checkout (the shell may start in the main repo).
- Global `~/.claude/settings.json`: `supabase db push` removed from `ask`
  (Founder "да", 2026-10-21); the project hook still blocks production.
- Clock-out has a confirm step 「退勤を確定」 after the break dialog.
- `attendance.status` is always `present` from the app (DEBT-118 d).

## 5. Founder inputs (one list)

- Vercel Usage + Supabase Usage screenshots for 2026-10-21 (or sign the agent
  browser in) — QA4 §13 / DEBT-097.
- From before: one `PII_HASH_PEPPER` per environment (DEBT-111); ORUWA support
  contact (DEBT-113a); QA mailbox; native/legal review of allergen strings.
- QA4 §12 phone test and the final review (Founder section of the QA4 scenario).
