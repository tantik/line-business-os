# SESSION_HANDOFF (2026-10-10) — invite/recovery dead-link fix ready (deploy pending); next: sign-in page + forgot password

Durable handoff for a fresh Claude Code session. Follows
`SESSION_HANDOFF_2026-10-08.md` (still valid for the overall plan, QA3
checklist, roadmap). Read that one too.

## 1. Git state (VERIFIED at hand-off)

- `dev` HEAD `3d5b3b9` (#567). No open PRs.
- **Unmerged branch `fix/invite-resend-dead-link`** (pushed, PR NOT yet
  opened — the session's `gh pr create` was declined): commit `c1b7199`
  + this handoff commit. Contains:
  - `supabase/functions/invite-employee/index.ts` — DEBT-087 fix;
  - `supabase/functions/invite-employee/index.source.test.ts` + wiring in
    `packages/config/package.json` (37/37 pass);
  - debt register rows DEBT-087, DEBT-088;
  - this file.
  Independent DB/security review of the fix: **no P0–P2** (3 P3s recorded in
  DEBT-087).

## 2. What happened since 2026-10-08

- Founder pasted JA+EN Supabase templates (Invite user, Reset password with
  `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=...`). The
  recovery email now arrives in Japanese.
- The recovery link for 佐藤 陽介 (Staff B, `+staffb`) still failed →
  `/sign-in?error=1`. **Root cause (DEBT-087, P1):** the Edge Function built
  the link with a fresh random `invitation_id`, while
  `upsert_employee_invitation` (0065/0097) keeps an already-pending row's
  id. Every re-send and every "アクセスを回復" linked to a non-existent
  invitation; only first invitations ever worked.
- 佐藤's pending invitation was revoked during diagnosis; the UI then offers
  only "招待する", which sends no email for an existing Auth user.
  Recovery path after deploy: 招待する (creates a pending row, no email) →
  アクセスを回復 (now links to that row) → Founder opens the link in an
  incognito window → sets the password.
- Founder findings (registered): DEBT-084 (invalid-invite page / silent
  redirect), DEBT-085 (Reset password template — Founder fixed it in the
  Dashboard 2026-10-10; close after the end-to-end recovery works),
  DEBT-086 (missing standard screens), DEBT-088 (sign-in page: "LINE
  Business OS" branding, English only, no forgot-password).

## 3. Next session — exact order

1. Repository Recovery. Open the PR for `fix/invite-resend-dead-link` into
   `dev`, let CI run, merge via `scripts/ai-dev-merge.sh` (if the guard
   treats `supabase/functions/**` as RED, ask the Founder to merge).
2. **Founder gate:** ask approval to deploy the Edge Function to Cloud DEV
   (`supabase functions deploy invite-employee --project-ref <Cloud DEV ref>`);
   the Founder may run it themself. Merging does not deploy it.
3. Re-test end to end: Manager → 佐藤 陽介 → 招待する → アクセスを回復 →
   Founder opens the link in incognito → set password → Staff screen. Then
   close DEBT-087, DEBT-085, DEBT-079. Ask the Founder for the password.
4. **First feature (Founder ask 2026-10-10, DEBT-088 + DEBT-084):**
   - Sign-in page: ORUWA branding (replace "LINE Business OS"), JA/EN,
     remove "not available yet" text.
   - "パスワードをお忘れですか？" link → request page (email field) →
     `resetPasswordForEmail(email, { redirectTo: <origin>/auth/accept-invite?...` or a
     dedicated `/auth/reset` callback }) → always show the same neutral
     "if this email is registered, we sent a link" message (no account
     enumeration) → `token_hash` + `type=recovery` verified server-side →
     set-password screen → sign-in. Note: the current callback requires an
     `invitation_id`; a self-service reset has none, so add a dedicated
     recovery callback/set-password path rather than overloading the invite
     one. Rate-limit the request (Supabase has its own limit; show a
     friendly message on 429).
   - Invalid / expired link page (JA/EN) instead of `/sign-in?error=1`
     (DEBT-084), incl. the signed-in-user case.
   - Mandatory reviews: DB/security (auth), UX/i18n, general. Live test with
     a Founder alias in incognito.
5. Then continue `SESSION_HANDOFF_2026-10-08.md` §3: Founder QA3 →
   DEBT-074 worker (hosting choice) → QA4 → v2.2 close → roadmap.

## 4. Founder actions pending

- Approve (or run) the Edge Function deploy (step 2).
- QA3 from `docs/ai/FOUNDER_QA3_CHECKLIST_2026-10-08.md`.
- Worker hosting choice (roadmap Stage 2), QA4 aliases / seed decision.

## 5. Bootstrap prompt (paste into the new chat)

```
Прочитай AGENTS.md, docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md,
docs/ai/current-task.md, docs/operations/deferred-debt-register.md,
docs/ai/SESSION_HANDOFF_2026-10-08.md и docs/ai/SESSION_HANDOFF_2026-10-10.md
(последний; файл лежит в ветке fix/invite-resend-dead-link, если ещё не
слит в dev), а также
docs/strategy/oruwa-roadmap-v2-2-close-to-production-2026-10-08.md.

Начни с Repository Recovery. Затем по SESSION_HANDOFF_2026-10-10.md §3:
1) PR и merge ветки fix/invite-resend-dead-link (DEBT-087);
2) спроси моё одобрение на деплой Edge Function invite-employee в Cloud DEV;
3) после деплоя проверим восстановление доступа 佐藤 陽介 (я открою ссылку
   в инкогнито);
4) сделай страницу входа ORUWA (JA/EN), «Забыли пароль?» с восстановлением
   по почте и страницу «ссылка недействительна» (DEBT-088, DEBT-084) —
   полный цикл: ветка → код → тесты → живая проверка → независимые ревью →
   PR → ai-dev-merge.sh.
Дальше — по плану roadmap, каждый этап после моего подтверждения.
RED: main, прод, миграции и деплой в Cloud, секреты, биллинг, LINE-рассылки.
```
