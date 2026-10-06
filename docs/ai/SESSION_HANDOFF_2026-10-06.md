# SESSION_HANDOFF (2026-10-06) — Founder Acceptance QA3 in progress; next mission is Shift Preferences recovery + real email reminder

Durable handoff for a **fresh** Claude Code session. Git, this file and the
mission brief it points to are the source of truth, not any prior chat.
VERIFIED = confirmed by tool output in this chat on 2026-10-06; the rest is
INFERRED/UNKNOWN/NOT TESTED. Continues Founder Acceptance (Mission 11),
following `SESSION_HANDOFF_2026-10-01.md` (QA1/QA2 round).

## 1. Repository / git state (VERIFIED)

- Branch `dev`, HEAD `b329240` at the time this handoff was written. Working
  tree clean except this handoff's own new files (being committed in the
  same PR as this document). No open PRs.
- QA accounts (public demo, Founder-classified): Manager
  `manager@oruwa-cafe.test`, Staff 田中美咲 (konstantin.a.chvykov@gmail.com).
  Founder pastes passwords in chat if needed; never write them to a file.

## 2. What happened in this chat (QA3 round so far)

The Founder is personally running a QA3 checklist
(`https://claude.ai/artifact/5QMbWvsLDV9r3EK7rndity`) against `preview.oruwa.jp`.
Findings so far, all shipped to `dev`:

- `@line-os/ui` `Button`/`ListRow` had no `cursor-pointer` for the enabled
  state (native `<button>` has none built in, unlike `<a>`) — fixed,
  affected every DS v1 surface. PR #553.
- Inventory's Add/Edit item Modal was `480px` (a confirm-dialog width) for a
  real form — widened to `720px`. PR #553.
- Weekly Review's real ~1.1s server latency (measured via Network, not
  assumed) — fixed with a hover/focus-prefetch on the entry button
  (mirrors Recipes' existing pattern), measured live: 1242ms direct click
  vs 466ms after a hover dwell. Not a cache — unconsumed prefetches expire
  in 5s, consumed ones are removed immediately, never serves stale data.
  PR #554.
- Recipes "feels slow": measured, not a defect (list opens with zero
  network cost — page-props data; detail view ~540ms, comparable to
  Weekly Review's number). No fix needed.

**The real finding of this round**: Manager → Settings → Shift requests →
Shift preferences (`ShiftRequestsReviewPopup`) looked finished but isn't.
The Founder asked for a dedicated recovery mission, approved a GPT-authored
brief with one amendment, and that mission is **the next thing to do** —
see §4.

## 3. Known defects / open issues

Read `docs/operations/deferred-debt-register.md` directly. Relevant to this
handoff: **DEBT-057** (Shift requests "承認" is a local-state-only mark,
not persisted — this is the exact defect the next mission fixes; close or
update this row as part of that mission, don't leave it stale once fixed).

## 4. New workstream — full objective

**Mission**: `docs/ai/CAFE_V2_2_SHIFT_PREFERENCES_RECOVERY_AND_EMAIL_REMINDER_BRIEF_2026-10-06.md`
(read it in full — this handoff only summarizes it, the brief itself is the
actual spec). Two parts:

1. **Shift Preferences / Shift Requests contract recovery** (acceptance-
   defect repair, bounded): fix the confirmed defect where a Staff member
   marking a day "not working" in the monthly preference UI silently
   produces **no database row at all** (not an `is_unavailable = true`
   row) — verified by reading `monthly-shift-preference-modal.tsx` in this
   chat, see the brief's §0.3 for the exact lines. Also: make Manager
   "review" of a preference persist for real (currently local React state
   only, `shift-requests-review-popup.tsx`'s `approvedRequestIds`), using
   the existing `workforce.shift_requests.status`/`decided_by` columns —
   confirmed safe to reuse without a migration (nothing reads `status` on
   `kind='preference'` rows today).

2. **Real email reminder delivery** (Founder decision, 2026-10-06,
   overriding GPT's original "defer everything" framing for email
   specifically): replace the clipboard-copy stub with a real send via
   **Resend** (Founder-selected provider). LINE delivery stays deferred to
   a separate v2.3 LINE integration mission — do not build it now.

The brief's §0.3 also already cleared one worry: the real auto-distribution
engine (`packages/workforce/src/auto-distribute.ts`) already correctly
excludes `is_unavailable` employees — the gap is entirely in the Staff UI
never being able to set that flag, not in the scheduling engine. Don't
re-audit the engine's exclusion logic; the brief explains exactly where the
gap is.

## 5. Resend setup — DONE, do not re-ask for a key

The Founder completed this 2026-10-06, before the new session starts:

- Sending domain `notifications.oruwa.jp` created in Resend (deliberately
  separate from `auth.oruwa.jp`, which Supabase Auth uses for its own
  transactional emails — do not conflate the two).
- DNS records added at XServer (DKIM TXT, SPF via two CNAMEs to `mta.net`,
  DMARC TXT `v=DMARC1; p=none`). Domain status: **Verified** in Resend.
- A **Sending access**-only API key (not Full access) created for this
  domain, added to Vercel as `RESEND_API_KEY` across **Production,
  Preview, and Development** environments, project redeployed.
- The key was never pasted into any chat and is not in this repo — read it
  from `process.env.RESEND_API_KEY` server-side only, same as every other
  secret here. **Do not ask the Founder for it again.**

**Sender address**: use the `notifications.oruwa.jp` domain (e.g.
`reminders@notifications.oruwa.jp` or similar — pick the local part during
implementation, nothing is fixed yet).

**Side finding worth a quick look, not a blocker**: the Founder noticed the
older "RUWA Supabase Auth" Resend key (`auth.oruwa.jp` domain) shows 0
uses in 2 months. This suggests Supabase Auth's own emails (invite, etc.)
may not actually be relayed through Resend/SMTP and are instead going out
via Supabase's own default email sending — which is a separate, likely
pre-existing and likely-fine configuration question, unrelated to this
mission's reminder feature. Worth a 10-minute sanity check once the new
session has spare attention (confirm whether `auth.oruwa.jp` is even wired
as Supabase's custom SMTP, or just provisioned and unused) — register as a
DEBT-### note if it turns out to be a real gap, don't silently reconfigure
Supabase Auth email delivery as a side effect of this mission.

## 6. Relevant existing documentation

Read in this order: `AGENTS.md` → `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`
→ `docs/ai/current-task.md` → `docs/operations/deferred-debt-register.md` →
this file → **the mission brief itself** (§4 above — it is long and
detailed on purpose, read it in full, it already contains the pre-verified
code findings the new session would otherwise have to re-derive) →
`docs/product/cafe-v2-2-feature-map-ru.md` §5.3 (Shift requests/preferences
feature description, for product context).

## 7. Architecture / security constraints (binding)

Standing rules only (`CLAUDE.md` / Operating Model): never apply a Cloud
migration or merge a PR touching `supabase/migrations/**` without the
Founder; never touch `main`/Production; the Resend API key is a secret —
Founder provides it, never generate/guess one, never commit it.
Independent DB/security review is mandatory for this mission (RLS-adjacent
write paths, PII handling for the email send, a new external integration).

## 8. Explicit prohibitions for the next session

- Do not build LINE delivery, LINE webhook, LINE OA onboarding, or any
  LINE-specific employee-linking-for-delivery work — that is v2.3, a
  separate mission, not triggered by this one's email work.
- Do not build a general notification-queue/audit-log platform for this one
  reminder feature — a simple disabled-while-sending UI guard is sufficient
  scope per the brief §11; a bigger platform is separate SaaS Hardening
  work if the Founder wants it generalized later.
- Do not expand Staff self-edit RLS on already-submitted preference rows
  (brief §7) — that stays Manager-mediated for this mission.
- Do not start WP6, Cafe v2.3, SaaS Hardening, the clean demo tenant, or
  Production work without a fresh, explicit Founder prompt.
- Do not restart Founder Acceptance from scratch — this is a bounded
  recovery mission within it; return the Founder to the Shift
  Preferences/Shift Requests checkpoint when done (brief §16), not a full
  re-walkthrough.

## 9. What must NOT be accidentally modified

`main`, Production (Vercel/Supabase), `.env*`, `.claude/settings.json`,
`scripts/ai-hooks/*`, `scripts/ai-dev-merge.sh`, `docs/ai/history/*`.
Existing `oruwa-cafe` employee/preference records — this mission may need
to create bounded, clearly-named QA test data (a test preference
submission, a test reminder send to a real/disposable inbox) but should
clean up anything it creates with zero history immediately after
verification, same pattern already used earlier this Founder Acceptance
round (create → verify → delete immediately, never leave fresh QA residue
if avoidable).

## 10. Bootstrap prompt (paste into the new chat)

```
Прочитай AGENTS.md, затем docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md,
затем docs/ai/current-task.md, docs/operations/deferred-debt-register.md,
docs/ai/SESSION_HANDOFF_2026-10-06.md (этот файл) и ПОЛНОСТЬЮ
docs/ai/CAFE_V2_2_SHIFT_PREFERENCES_RECOVERY_AND_EMAIL_REMINDER_BRIEF_2026-10-06.md
(это и есть техническое задание миссии, не пересказ).

Состояние: Founder Acceptance (Mission 11) в процессе, я (Founder) прохожу
QA3 лично. Нашёл реальный дефект в Shift Preferences / Shift Requests
(Manager Settings -> Shift requests). Бриф уже учитывает моё решение:
email-напоминания делаем СЕЙЧАС по-настоящему (через Resend), LINE
откладываем до отдельной миссии v2.3. Бриф также содержит уже проверенные
находки по коду (где именно дефект, что уже работает правильно, что можно
переиспользовать без миграции) — не передумывай их заново, читай §0.3
брифа.

Resend уже настроен (домен notifications.oruwa.jp подтверждён, API-ключ с
правом Sending access лежит в переменной RESEND_API_KEY на Vercel для
Production/Preview/Development, проект передеплоен) — ключ мне присылать
не нужно, читай его из process.env.RESEND_API_KEY на сервере. Детали в §5
этого файла.

Действуй автономно в границах брифа (ветка -> фикс -> тесты -> typecheck ->
lint -> живая проверка на Preview PR -> независимое ревью (обязательно,
есть RLS-прилегающий путь записи и PII) -> PR -> ai-dev-merge.sh при
зелёных проверках). Рутинных вопросов не задавай. За мной только RED:
main, прод, применение миграций к Cloud, секреты, биллинг, LINE-рассылки,
слияние PR с миграциями, материальное расширение scope за рамки брифа.

Начни с Repository Recovery (ветка, HEAD, дерево, открытые PR), затем
читай бриф полностью и начинай работу.
```

---

No secrets, passwords, tokens or keys are recorded in this file.
