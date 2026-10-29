# Session handoff 2026-10-29

## 1. Merged to `dev` this session

| PR | What |
|---|---|
| #656 | Handoff 2026-10-25B |
| #657 | DEBT-129 (a): `provision-tenant` passes `invite_kind=tenant_owner`; Auth Invite template branches on `.Data.invite_kind` (Owner / staff wording, neutral subject) |
| #658, #660, #661, #662, #665, #667 | Debt register: DEBT-129 a done, DEBT-131 (translate inventory item names, reuse `content.translations`, show "Milk / 牛乳" in EN UI), DEBT-132, DEBT-133, DEBT-103 done, DEBT-097 measured, DEBT-135 |
| #659 | Mobile: Dialog full-width bottom sheet + 12px padding, `card` padding 12px on phones (`--card-padding`), inputs 16px below 768px (no iOS focus zoom). Founder confirmed on iPhone |
| #663 | DEBT-114: `apps/web/src/lib/db/fetch-all-rows.ts` pages 14 unbounded history reads, `LBO_ROW_CAP` above 20 pages |
| #664 | DEBT-103: 0141 `core.purge_tenant` + pgTAP 0080 + `docs/operations/tenant-deletion-procedure.md` |

Cloud DEV: Invite template saved; `provision-tenant` deployed; **0141 applied** (`db push`). `qa-4c-cafe-7` created (owner + staff email live check) and then **purged** (live DEBT-103 test). 12 tenants remain.

**Open PR #666** (pgTAP suite green + `.github/workflows/db-tests.yml`, DB review PASS, CI green incl. the new pgTAP job 1m56s): `ai-dev-merge.sh` blocks `.github/workflows/**` as a RED path → **Founder approval to merge** (or Founder merges it).

## 2. Facts learned

- Translation infrastructure already exists (`content.translations` 0039–0047, providers Google/OpenAI on Vercel Preview); recipes covered, inventory items not. No new API key.
- Cost per Manager page view (1,464 scripted views): ~110 ms Vercel Active CPU, ~45 Supabase API requests. Capacity model in DEBT-097.
- Load script: scratchpad `load/run.mjs` (signs in Owners with `@supabase/ssr` cookies; Supabase URL/key found in authenticated-page chunks, pass paths without a leading `/` — Git Bash rewrites them).
- `postgres` can delete `auth.users` on Cloud via `db query --linked`.
- CI never ran pgTAP before #666; 11 drifted assertions on `dev`. Inventory delete with history: Lead decision = keep refuse + Deactivate (DEBT-134).
- Permission prompts come from compound Bash (`cd && …`, `$(…)`, `curl`); one allow-listed command per call. `npx supabase db query --linked -f *` allowed in settings.local.

## 3. Next (order)

1. Founder: approve/merge #666; then make `pgTAP (supabase test db)` a required check on `dev` (Lead) and `main` (Founder).
2. **DEBT-128 = Phase B-0** (class A): remove the platform-staff short-circuit from `core.is_member_of` / `core.has_permission` (35 uses in 15 migrations; `is_platform_staff()` also gates catalogs 0106/0107/0129/0134/0135 — keep catalog writes, remove tenant-data bypass); `api.platform_*` RPCs with aal2 for what `/admin/tenants` needs; platform audit log; pgTAP: a staff JWT sees zero tenant rows. DB/security review mandatory.
3. DEBT-103 (b): orphan rule for invited-never-accepted users (test case `oruwa.jp+o7staff1` still in auth.users); (c) purge mame-to-cha.
4. 4D clean demo tenant: DEBT-001..005, 059, 066, 067, 080, 118a + DEBT-131, 132, 133, 114 (a).
5. Production pack: DEBT-124 + DEBT-135, DEBT-033, DEBT-130 smoke, env/key gate.

## 4. Bootstrap prompt

```
Продолжи по docs/ai/SESSION_HANDOFF_2026-10-29.md §3 и памяти.
Chrome — личный профиль, только свои новые вкладки, закрывать после работы;
инструменты Chrome разрешены без подтверждения (settings.local).
Сессия Chrome общая с моим браузером: если входишь под другим QA-пользователем,
в конце верни вход oruwa.jp+manager@gmail.com.
QA только на preview.oruwa.jp; учётки в .claude/qa-accounts.local.md; почта — oruwa.jp@gmail.com (Gmail /mail/u/3).

Порядок: #666 (если я одобрил) → DEBT-128 (B-0) → DEBT-103 (b)(c) → 4D → пакет перед продакшном.

Кто решает: ты — главный ИИ-агент (CTO/архитектор), все решения по разработке,
слияния в dev, миграции и деплой на Cloud DEV — твои, с обоснованием и ссылками.
Ко мне — только продакшн, сообщения реальным людям, деньги/аккаунты/юридическое,
изменения .github/workflows и main. Одним списком.

Правила: dev-слияния через scripts/ai-dev-merge.sh; миграции/RLS — oruwa-db-security-reviewer;
видимый UI — oruwa-ux-i18n-reviewer + живая проверка; ничего не откладывать молча;
одна разрешённая команда на вызов Bash. Общение на русском. На ~90% контекста — handoff.
```
