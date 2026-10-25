# Session handoff 2026-10-25 B

## 1. Merged to `dev` this session

| PR | What |
|---|---|
| #651 | `.claude/settings.json`: `WebSearch`, `WebFetch` allowed (Founder OK) |
| #652 | Owner checklist 「はじめにやること」 shown to the Owner only (`canAppointAdmins`); an Admin saw 0/3 |
| #653 | Staff popup: own Delete/Deactivate disabled for a non-Owner with the 0140 reason; Activate/Deactivate outcome shown inside the popup (was only in the page banner behind it) |
| #654 | Phase A plan `docs/architecture/site-cabinet-console-plan.md` + `docs/product/oruwa-web-reuse-review.md` |
| #655 | Debt register: DEBT-127 (g) done, DEBT-124 decided, DEBT-128..130, DEBT-097 progress |

No migrations, no Edge Function deploys this session. Reviews: UX/i18n PASS on #652 and #653.
Local only (gitignored): `.claude/settings.local.json` allows `mcp__claude-in-chrome__*` (Founder OK).

## 2. 4C status (preview.oruwa.jp)

- Six tenants created via `/admin/tenants`, all Owners onboarded by the real invite email: `qa-4c-cafe-1..6`, `oruwa.jp+owner1..6` (cafe 2 after a `slug_taken` error + retry with the same request_id; cafe 3 = Asia/Seoul). Passwords in `.claude/qa-accounts.local.md`.
- cafe 1 has staff 山田 花子 (`oruwa.jp+o1staff1`) appointed 管理者.
- Live-verified: Owner checklist progress; 管理者 appoint flow; Admin cannot see 管理者権限 / change own role; 0140 refuses Admin self-deactivate; after #652/#653 deploy: Admin has no checklist, own Delete/Deactivate disabled with the reason.
- Isolation: with owner6's JWT, `core`/`workforce` are not exposed (PGRST106); 21 `api.*` views return only its own tenant (DEBT-130 keeps the RPC write probe).
- Not possible through the product: "minimal modules", "two locations" (DEBT-129).

## 3. Next (order)

1. **4C rest:** DEBT-097 per-tenant usage (scripted activity on the 6 tenants ≥ 24 h, then Vercel + Supabase usage); DEBT-114 (`max_rows` paging) fix; DEBT-103 tenant deletion procedure + test on one 4C tenant; DEBT-129 (a) Owner invite email wording (Edge Function `provision-tenant` / auth template).
2. **DEBT-128 (class A)** = Phase B-0: remove the platform-staff bypass in `core.is_member_of`/`has_permission`; `api.platform_*` RPCs with aal2; platform audit log; pgTAP. DB/security review mandatory. Before production.
3. **4D** clean demo tenant (DEBT-001..005, 059, 066, 067, 080, 118a).
4. Production pack (handoff 2026-10-24B §4 item 4 + DEBT-033 + DEBT-124 + DEBT-130 smoke).
5. Phase B–F per the plan (§9), after the Founder inputs in plan §10.

## 4. Founder inputs needed (from plan §10, one list)

Price model conflict (old Sales Kit 3 tiers + setup fee vs 2026-10-19 one plan / 30-day trial); Stripe account; legal texts (特商法, privacy, terms, 登録番号); 3–5 reference sites; DNS access for `oruwa.jp`; trust numbers; logo rights; lead form vs LINE/email.

## 5. Facts learned

- Chrome MCP: a background tab can freeze (screenshot timeout); open a new tab. JS output hides URL query strings — read links with `find`/`read_page`.
- Gmail threads all invites with the same subject; expand all and map links by recipient.
- `read_page` must run before refs on a freshly loaded page are usable.

## 6. Bootstrap prompt

```
Продолжи по docs/ai/SESSION_HANDOFF_2026-10-25B.md §3 и памяти.
Chrome — личный профиль, только свои новые вкладки, закрывать после работы;
инструменты Chrome разрешены без подтверждения (settings.local).
Сессия Chrome общая с моим браузером: если входишь под другим QA-пользователем,
в конце верни вход oruwa.jp+manager@gmail.com.
QA только на preview.oruwa.jp; учётки в .claude/qa-accounts.local.md
(v2 + 4C: oruwa.jp+owner1..6, +o1staff1); почта — oruwa.jp@gmail.com (Gmail /mail/u/3).

Состояние: dev = #651–#655 слиты; 6 тенантов 4C созданы и приняты.

Порядок:
1. 4C остаток: DEBT-097 замер по тенантам, DEBT-114, DEBT-103, DEBT-129 (a).
2. DEBT-128 (класс A) = этап B-0: убрать обход platform staff в RLS.
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
