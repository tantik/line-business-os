# Session handoff 2026-10-25

## 1. Merged to `dev` this session

| PR | What | Cloud DEV |
|---|---|---|
| #643 | DEBT-098: Log Ingestion source = `edge_logs` (old 2.5 s polling); peak 579.6 MB/day → ~9–17 MB/day since #588/#589; DEBT-124/125 opened | — |
| #644 | design-kit stacked Escape (Modal, ConfirmDialog, ActionsMenu) — DEBT-119 (c) for design-kit hosts | — |
| #645 | 0140: `tenant_admin` (JA 管理者) appoint/revoke by Owner only (role check); `is_admin` on `api.workforce_staff_manage`; deactivate/delete revokes admin; self deactivate/delete refused except Owner (DEBT-123 b); invite checks staff.manage at the employee's location; rehire codes `user_has_other_employee_record` / `email_used_by_other_employee_record` (DEBT-123 c) | **0140 applied** (backfill 0/0); **`invite-employee` deployed** |
| #646 | Owner checklist 「はじめにやること」 (3 required + optional 店長, published shift only); 「管理者権限」 section (Owner only, hidden on own row, gold badge); DEBT-119 (d)(e)(f) copy | — |
| #647 | `.claude/settings.json`: Edit/Write allowed in `.claude/worktrees/**` (Founder OK). `git push` stays `ask`; use plain `git push origin <branch>` so `guard-git-push` auto-allows | — |
| #648 | `docs/product/salon-booking-package-plan.md` (salon01 analysis, world analogues, plan, §9 decommission list, §10 Founder questions) | — |
| #649 | debt register: 119/123 progress, 125 decision, new DEBT-126 (Radix overlay Escape), DEBT-127 (4B-4b UI leftovers) | — |

Live-verified (preview.oruwa.jp, `oruwa.jp+manager`): no checklist for a Manager; 店長 badge blue; Escape closes confirm → detail → popup, focus returns to trigger. **Not live-tested:** admin appoint/revoke + Owner checklist (no Owner in the v2 QA set) → DEBT-127 (g), do first in 4C.

## 2. Founder decisions (2026-10-25)

- `line-app-prod-salon01` = test of a 3rd product (salon with LINE booking). Delete it **after** the ORUWA release (DEBT-125); plan saved first (#648).
- Old Supabase logs: nothing to clean (Free retention 1 day; counter resets each cycle).
- Three surfaces, one monorepo, one Supabase: `oruwa.jp` (sales site, `apps/site`, static, no login), `app.oruwa.jp` (product + Owner cabinet as an `/owner` section, not a separate site), `admin.oruwa.jp` (Founder/platform console, `platform_staff`, MFA, separate session, audit). **Domains approved.**
- Billing: Stripe Billing, one customer + subscription per tenant, Checkout/Customer Portal (no card data stored), webhook = source of truth → `billing.subscriptions` → `has_module_access`; grace period on `past_due`. Founder supplies the Stripe account, prices, legal pages later.
- Sales site: rebuild — more premium, modern, sales-focused (new design and structure, not a reskin of `D:\Dev\oruwa-web`; reuse only ideas/copy worth keeping). Process: Founder picks 3–5 reference sites → analysis → structure (problem → solution → proof → price → CTA) → real product screenshots from the clean demo tenant (4D) → native JA review.
- Order: 4C → 4D → production pack → native JA review → site/cabinet/console phase (A plan, B console, C cabinet, D billing, E site in parallel, F legal + JA). Plan A may be written during 4C.

## 3. Next (order)

1. **4C** 6-tenant test (`oruwa.jp+owner1..6`): first DEBT-127 (g) live test of 管理者 + Owner checklist; DEBT-097 per-tenant usage; DEBT-114 `max_rows`; DEBT-103 tenant delete; decide DEBT-124 (`/auth/v1/user`, `has_permission` per page).
2. In parallel: write `docs/architecture/site-cabinet-console-plan.md` (phase A: architecture, `billing.*` model, tiers draft, domains, auth/session separation, console security), and review `D:\Dev\oruwa-web` (+ `oruwa-gpt`, `generated-assets`) for reusable copy/assets.
3. **4D** clean demo tenant (DEBT-001..005, 059, 066, 067, 080, 118a).
4. Production pack (handoff 2026-10-24B §4 item 4 + DEBT-033 retention).

## 4. Facts learned

- Supabase Logs Explorer: ClickHouse SQL on a unified `logs` table (`source`, `event_message`, `log_attributes`, `toJSONString`, LIMIT required); `?s=` URL param loads the query but the range resets to "Last hour".
- The repo guard treats `line-app-prod-salon01` as PRODUCTION: any Bash command naming its ref is blocked.
- Agent worktrees share the local Supabase DB with the main checkout (`db reset` in one overwrites the other).
- Agent worktrees under `.claude/worktrees/agent-*` from this session can be removed.

## 5. Bootstrap prompt (paste into the new chat; run `/chrome` first if Chrome tools are not loaded)

```
Продолжи по docs/ai/SESSION_HANDOFF_2026-10-25.md §3 и памяти.
Chrome — личный профиль, только свои новые вкладки, закрывать после работы.
Сессия Chrome общая с моим браузером: если входишь под другим QA-пользователем,
в конце верни вход oruwa.jp+manager@gmail.com.
QA только на preview.oruwa.jp; учётки в .claude/qa-accounts.local.md
(v2: oruwa.jp+manager, +staffa/b/c/d/i; для 4C — oruwa.jp+owner1..6, создать по плану 4C);
почта — oruwa.jp@gmail.com (Gmail /mail/u/3).

Состояние: dev = #643–#649 слиты; 0140 применена на Cloud DEV, invite-employee задеплоена.

Порядок:
1. 4C: сначала живая проверка 管理者 и чек-листа под Owner (DEBT-127 g),
   затем тест на 6 кафе + DEBT-097, DEBT-114, DEBT-103, решение по DEBT-124.
2. Параллельно: план этапа A «сайт oruwa.jp + кабинет владельца + консоль admin.oruwa.jp»
   (домены утверждены; оплата Stripe; сайт — новый, премиальный, продающий),
   и разбор D:\Dev\oruwa-web на что взять.
3. 4D чистое демо-кафе, затем пакет перед продакшном.

Кто решает: ты — главный ИИ-агент (AI CEO / CTO / архитектор), все решения по
продукту и разработке, слияния в dev, миграции и деплой на Cloud DEV — твои,
с обоснованием в отчёте и ссылками на мировые практики. Ко мне — только
продакшн, сообщения реальным людям, деньги/аккаунты/юридическое/секреты прода,
смена стратегии. Одним списком.

Правила: dev-слияния через scripts/ai-dev-merge.sh; миграции/RLS — обязательно
oruwa-db-security-reviewer; видимый UI — oruwa-ux-i18n-reviewer + живая проверка;
ничего не откладывать молча (deferred-debt-register). Общение на русском.
На ~90% контекста — остановиться и сделать handoff.
```
