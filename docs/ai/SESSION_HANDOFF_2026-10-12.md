# SESSION_HANDOFF (2026-10-12) — account screens done, pre-QA3 polish merged, CTO authority model

Durable handoff for a fresh Claude Code session. Reality check first
(Repository Recovery, Operating Model §4): `git log -1` on `dev` should be
the merge of `chore/cto-autonomy-model` or later.

## 1. How this project is run from now on (Founder decision 2026-10-12)

The Lead Agent is the **CTO / architect** (Operating Model §9 "CTO
authority", v1.11.0). It takes the Founder's goal, plans, delegates bounded
tasks (`oruwa-engineer` in a worktree, reviewers per §12), verifies results
itself (tests, CI, live QA on `preview.oruwa.jp`), merges into `dev`
(`scripts/ai-dev-merge.sh`), deploys/migrates **Cloud DEV**, and moves from
one roadmap stage to the next **without asking**. The Founder:

- gives goals and checks finished results (the CTO's mission report lists
  exactly what to look at);
- approves only **production** (deploy, DB, env, `main`) and **messages to
  real customers**;
- supplies inputs only the Founder can give (accounts, money, legal) —
  asked for once, bundled, never as step-by-step confirmations.

Do not ask the Founder to confirm intermediate steps. Questions are allowed
only for the gates/inputs above, and then as one bundled list.

## 2. What happened 2026-10-10..12 (all on `dev`, live-verified)

| PR | What |
|---|---|
| #568 | DEBT-087: invite/recovery emails linked to a missing invitation. Edge Function `invite-employee` v7 deployed to Cloud DEV. 佐藤 陽介 recovered. |
| #569 | Pre-release Cloud DEV authority + `guard-supabase-cloud.mjs` (3 security-review rounds; first round found a P0 env-var/quote-split prod bypass, fixed). |
| #570 | ORUWA sign-in JA/EN, `/forgot-password`, `/auth/reset-password`, `/auth/link-invalid`, JA/EN 404/error/state screens, `/` → sign-in, ログアウト wording. Recovery session is `amr: otp` like LIFF → HMAC session-bound marker cookie (key from `PII_HASH_PEPPER`). |
| #571 | Reset-email template wording; Founder pasted it into the Dashboard. DEBT-088 closed. |
| #572 | Invite/resend tells the manager whether an email went out (DEBT-084 closed). |
| #573 | Copy Audit A-03..A-08 (no raw server messages: `lib/ui/server-message-copy.ts`), `/account` (change password, sign out other devices), registry + QA3 checklist. |
| #574 | Access-denied / not-found states get 「トップに戻る」. |
| chore/cto-autonomy-model | This governance model (§1). |

Facts worth knowing:
- Vercel **PR-preview hosts are not on the Supabase redirect allow-list**:
  their emails fall back to the Site URL (`https://preview.oruwa.jp&token_hash=…`,
  broken). For QA on a PR preview, rebuild the link by hand on the preview host.
  `preview.oruwa.jp` itself works.
- @supabase/ssr sends PKCE recovery emails (`token_hash=pkce_…`); server
  `verifyOtp({token_hash, type:'recovery'})` accepts them.
- Mail messages cannot be deleted in the UI (archive only marks them), so the
  old QA chatter stays until the clean demo tenant (DEBT-001/004).
- 佐藤 陽介 (`+staffb`) password: `52723101`.

## 3. A-09 — allergen wording (DEBT-053, the only Copy Audit item left)

**What it is.** Recipes show allergens from a fixed list of 10 codes
(migration 0121: 卵, 乳, 小麦, そば, 落花生, えび, かに, くるみ, 大豆, ごま) and,
when none is set, the text JA 「アレルゲンなし（確認済み）」 / EN
"No known allergens".

**Why it matters.** Allergen information is a safety statement. JA says
"no allergens — verified"; EN says "none known to us". If a guest reacts,
the JA wording is a guarantee the cafe never gave. Japan's labelling rules
(食品表示基準) make 8 items mandatory for packaged food (特定原材料: えび,
かに, くるみ, 小麦, そば, 卵, 乳, 落花生) and recommend 20 more (特定原材料に準ずる
もの, e.g. 大豆, ごま, 牛肉, 豚肉, 鶏肉, さけ, さば, いか, いくら, あわび, アーモンド,
カシューナッツ, マカダミアナッツ, オレンジ, キウイフルーツ, バナナ, もも, りんご,
やまいも, ゼラチン). Restaurants are not legally obliged to label, but if
they do, the information must be accurate; most chains show all 28 and a
"ask staff" note. The exact current list must be confirmed by the reviewer.

**What closes it (Founder inputs, one bundle):**
1. **List decision:** keep 10, or the full 28 (CTO recommendation: 28 — a
   migration on the CHECK constraint, CTO does it).
2. **Wording decision** (CTO proposal, to be checked by a native speaker):
   - none set → 「アレルゲン情報は登録されていません」 / "No allergen information recorded";
   - none, confirmed by the manager → 「この商品には特定原材料等28品目は使用していません（店舗確認）」 / "Contains none of the 28 listed allergens (checked by the store)";
   - always under the list → 「同じ厨房で他の食材も扱っています。アレルギーのある方はスタッフにお尋ねください。」 / "Prepared in a kitchen that handles other ingredients. Please ask staff about allergies."
3. **Native review** of those 3–5 strings (any Japanese speaker the Founder
   trusts, ideally with restaurant experience).
4. **Optional legal check** (food-labelling consultant / 行政書士) of the
   disclaimer before the first paying customer.

Until then the CTO does not change the wording.

## 4. Founder inputs still open (bundle; nothing else needs the Founder)

See the table in `docs/strategy/oruwa-roadmap-v2-2-close-to-production-2026-10-08.md`
("Founder inputs"). Highest value first:
1. **QA3** on `preview.oruwa.jp` (`docs/ai/FOUNDER_QA3_CHECKLIST_2026-10-08.md`).
2. **Passwords** in `.claude/qa-accounts.local.md` (gitignored; Manager,
   田中, 鈴木) — removes the Founder from every live-QA loop.
3. **QA email access** — today the Founder copies links out of Gmail. CTO
   options: (a) a dedicated QA mailbox the agent can read via IMAP/API,
   (b) a Gmail filter forwarding `【ORUWA】` mail for `+staff*` to such a
   mailbox. The CTO will propose concrete steps.
4. **Supabase access token (Cloud DEV)** — lets the CTO change auth email
   templates/settings through the Management API instead of the Founder
   using the Dashboard.
5. Allergen decision (§3), QA4 aliases `+staffd`/`+staffe`, worker hosting
   is now the CTO's call (recommendation: Supabase pg_cron + Edge Function).

## 5. Next work (CTO proceeds without a new Founder prompt)

1. Triage QA3 findings as they arrive (fix now / debt row / not a defect).
2. **Stage 2 — DEBT-074 monthly auto-schedule in the cloud:** pg_cron →
   Edge Function on Cloud DEV, run log, idempotency, JST boundaries; tests,
   DB/security review, deploy + live check.
3. **Stage 3 — QA4** one-month simulation (needs the aliases).
4. Then Stage 4 in roadmap order; prepare DEBT-043 (`dev → main →
   production` path) early — production itself stays a Founder gate.

## 6. Bootstrap prompt (paste into the new chat)

```
Ты — CTO/архитектор проекта (Operating Model §9 «CTO authority»).
Прочитай AGENTS.md, CLAUDE.md, docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md,
docs/ai/current-task.md, docs/operations/deferred-debt-register.md,
docs/strategy/oruwa-roadmap-v2-2-close-to-production-2026-10-08.md и
docs/ai/SESSION_HANDOFF_2026-10-12.md (последний handoff).

Начни с Repository Recovery. Дальше работай сам по §5 handoff: планируй,
раздавай задачи субагентам (oruwa-engineer, ревьюеры), проверяй результат
(тесты, CI, живая проверка на preview.oruwa.jp), сливай в dev, деплой и
миграции в Cloud DEV — без моих подтверждений. Меня спрашивай только про
продакшн (деплой, БД, env, main) и реальные сообщения клиентам, а входные
данные (аккаунты, деньги, юридическое) проси одним списком.
В конце каждой задачи — короткий отчёт: что сделано, как проверено,
что посмотреть мне руками.
Первое: этап 2 (DEBT-074, ежемесячный автограф в облаке через Supabase
pg_cron + Edge Function) и разбор моих находок QA3, если я их пришлю.
```
