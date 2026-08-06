# ORUWA Engineering Principles & Governance

> Governed by ORUWA Core Laws & Product DNA (`docs/foundation/core-laws-and-product-dna.md`).
> This document must not contradict the Core Laws. Where a conflict exists, the Core Laws prevail.

## Document Metadata

| Field | Value |
|---|---|
| Version | 1.0.1 |
| Status | Accepted |
| Acceptance Note | Accepted status does not approve items explicitly marked OPEN QUESTION, GOVERNANCE RECOMMENDATION, HYPOTHESIS, or FOUNDER REVIEW REQUIRED. |
| Owner | Founder / CTO |
| Applies to | Все инженерные решения в ORUWA Business OS: архитектура, база данных, безопасность, работа AI-агентов |
| Scope (RU) | Как принимаются инженерные решения в ORUWA — процесс, а не архитектура конкретного модуля |
| Horizon | Многолетний, независимо от текущего стека и текущей вертикали |
| Priority | Ниже Core Laws & Product DNA. Уровень Decision Hierarchy: **Platform Architecture Principles** — тот же уровень, на котором находятся `platform-foundation-roadmap.md` и `oruwa-portfolio-and-module-strategy.md`, но отвечает не "что строить" (portfolio) и не "в каком порядке строить платформу" (roadmap), а "как принимается и утверждается любое инженерное решение" |
| Supersedes | None |
| Last Updated | 2026-08-06 |

## Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| 1.0.0 | 2026-08-06 | Initial draft. | Claude (agent), for Founder review |
| 1.0.1 | 2026-08-06 | Founder acceptance: Status changed from Draft for Founder Review to Accepted. Content marked OPEN QUESTION, RECOMMENDATION / Governance Recommendation, `[ГИПОТЕЗА]`, or Founder Review Required elsewhere in this document (see Раздел "Метод" for the marking scheme; e.g. §3.2 OPEN QUESTION on ADR escalation threshold) remains unresolved and is not approved by this acceptance. | Founder |

## Что это за документ

Это главный инженерный процессный документ ORUWA: он не описывает Cafe, не описывает Product DNA заново, не переопределяет состав Platform Foundation и не переопределяет состав портфеля вертикалей. Он отвечает только на один вопрос — **как принимается, утверждается и проверяется инженерное решение** в этом репозитории, от идеи до Definition of Done.

Это **не** Product DNA (`core-laws-and-product-dna.md`), **не** Platform Foundation Roadmap (`platform-foundation-roadmap.md`), **не** Portfolio Strategy (`oruwa-portfolio-and-module-strategy.md`), **не** новый ADR и не заменяет существующие `.cursor/rules/*`. Документ **собирает** уже принятые инженерные правила из этих источников в одно место и **не изобретает** новых архитектурных принципов, если это явно не обозначено как `[РЕКОМЕНДАЦИЯ]` или `Governance Recommendation`.

## Related Documents

- [docs/foundation/core-laws-and-product-dna.md](core-laws-and-product-dna.md) — нормативная основа; в частности Rules for Developers (§16), Rules for CTO and Architects (§15), Rules for AI Agents (§13), Core Compliance Review (§20), Evolution Rules (§19).
- [docs/foundation/platform-foundation-roadmap.md](platform-foundation-roadmap.md) — что строится и в каком порядке на уровне платформенных компонентов; этот документ не пересматривает его.
- [docs/foundation/oruwa-portfolio-and-module-strategy.md](oruwa-portfolio-and-module-strategy.md) — что строится на уровне вертикалей и модулей, включая Build Decision Flow (§17) и Shared Module Promotion Rules (§15), на которые Module Governance (Раздел 4 этого документа) прямо ссылается, не дублируя.
- `AGENTS.md` — операционные правила для AI-агентов и разработчиков; источник для Раздела 5 (Database Governance) и Раздела 7 (AI Development Governance).
- `.cursor/rules/00-project-architecture.mdc`, `01-security.mdc`, `02-database-rls.mdc`, `03-git-workflow.mdc`, `04-ai-agent-workflow.mdc`, `05-legacy-migration-boundaries.mdc` — machine-enforced guardrails; этот документ ссылается на них, а не переопределяет.
- `docs/security/security-requirements.md` — обязательные требования безопасности; источник для Раздела 6.
- `docs/ai/oaes-project-profile.md`, `docs/ai/current-task.md` — процесс OAES (Product Review → Architecture Review → Implementation → Self Review → QA → Acceptance Report → Ready for Merge) и роли; источник для Раздела 3 и Раздела 7.
- `docs/adr/*` — принятые Architecture Decision Records; источник примеров для Раздела 3 (когда нужен ADR).

## Метод

Как и `oruwa-portfolio-and-module-strategy.md`, этот документ не начинает анализ заново — он сводит воедино уже принятые правила. Каждое утверждение помечено одним из статусов:

- **FACT** — прямая цитата или прямая производная уже принятого документа (Core Laws, ADR, `.cursor/rules`, AGENTS.md, `docs/security/security-requirements.md`, `docs/ai/oaes-project-profile.md`).
- **RECOMMENDATION** / **Governance Recommendation** — обобщение практики или логичное расширение принятого правила, которое, однако, нигде не зафиксировано как принятое Founder-решение.
- **[ГИПОТЕЗА]** — вывод автора документа, не подтверждённый ни одним источником.
- **OPEN QUESTION** — вопрос, на который ни один существующий источник не даёт ответа.
- **Founder Review Required** — решение, которое явно требует Founder, а не может быть закрыто этим документом.

---

## Table of Contents

1. Purpose
2. Architecture Principles
3. Engineering Decision Process
4. Module Governance
5. Database Governance
6. Security Governance
7. AI Development Governance
8. Definition of Done
9. Architecture Review Checklist

---

## 1. Purpose

**Статус: FACT.**

Этот документ существует, чтобы ответить на вопрос: **как принимается инженерное решение в ORUWA, кем, и на основании какого артефакта**. Он не проектирует код, БД, API или UI (это делают Architecture Review и ADR — Раздел 3), не выбирает вертикали и модули (это делает `oruwa-portfolio-and-module-strategy.md`), и не переопределяет продуктовые законы (это делает `core-laws-and-product-dna.md`).

Он существует, потому что три источника уже несут инженерные правила по отдельности — Core Laws §13–16 (Rules for AI Agents / CTO / Developers), `.cursor/rules/*` (machine-enforced), и `docs/ai/oaes-project-profile.md` (процесс review) — и ни один из них не связывает их в единый governance-документ. Этот документ — точка сборки, не новый источник правил.

---

## 2. Architecture Principles

**Статус: FACT** для каждого принципа ниже, с указанием источника. Задача явно требует не изобретать принципы — поэтому в списке нет ни одного пункта без прямой ссылки на уже принятый документ; принципы из примера задачи, для которых источника не нашлось, в списке ниже отсутствуют (см. Раздел 2.1).

| Принцип | Формулировка | Источник |
|---|---|---|
| **Platform First** | Любое решение сначала проверяется на принадлежность к Core Platform / Platform Services, прежде чем строиться как модульная или клиентская функциональность | Core Laws Law 10 (Modular Without Fragmentation); `platform-foundation-roadmap.md` §4 |
| **Tenant Isolation by Design** | `tenant_id uuid not null` обязателен на каждой бизнес-таблице; RLS включается в той же миграции, что создаёт таблицу; изоляция живёт в БД, не во frontend | Core Laws Law 11.2, Law 13; `.cursor/rules/02-database-rls.mdc`; ADR 0009 п.6 |
| **Configuration over Forks** | Различия между клиентами решаются конфигурацией и reusable capability, никогда постоянным `if tenantSlug === 'X'` | Core Laws Law 11; Anti-Principle 12.5; ADR 0010 §C |
| **Forward-only Migrations** | Схема меняется только новыми, аддитивными миграциями; существующие migration-файлы не переписываются после применения без отдельного документированного решения | Core Laws Law 11.10 (Migration Safety); ADR 0009 п.4–5; AGENTS.md ("Do not delete or renumber existing migrations") |
| **Security by Design, not by Addition** | Безопасность, tenant isolation и ограничение полномочий проектируются как свойство системы с первой миграции, а не добавляются после реализации | Core Laws Law 13 (Safety and Isolation by Design) |
| **Least Privilege** | `service_role` — только сервер; anon получает минимум необходимых grant'ов (в текущей архитектуре — практически ноль); привилегированные helper-функции (`SECURITY DEFINER`) никогда не публикуются напрямую через Data API | ADR 0005 (§5 "No broad grants"); ADR 0007/0008 (`api`-facade, только non-`SECURITY DEFINER` invoker views); `.cursor/rules/01-security.mdc` |
| **App-facing / Internal Boundary** | Внутренние схемы (`core`, `audit`, `workforce`, `booking`, `ai`) никогда не входят в Data API exposed-schemas; приложение читает только через `api`-facade | Core Laws Law 11.8; ADR 0008; ADR 0009 п.7–8 |
| **Auditability** | Каждая мутирующая операция с бизнес-данными пишет `audit.audit_logs` через `writeAudit` (actor, tenant, module, entity, action, before/after, timestamp); таблица append-only | Core Laws Law 11.9 (Observability Is a Product Requirement); AGENTS.md п.7; `docs/security/security-requirements.md` §6 |
| **Composable Modules, Stable Contracts** | Модули взаимодействуют через определённые контракты (APIs, events, shared identifiers, permission model), а не через случайные внутренние детали друг друга | Core Laws Law 10, Law 11.7 (Stable Contracts Between Modules) |
| **Reuse before Rewrite** | Порядок предпочтения: shared code → tenant/module entitlement → role/permission checks → tenant/location configuration → reusable capability → typed module-specific settings | ADR 0010 §C |
| **Simple before Complex** | Проверяются более простые альтернативы (текст, существующая настройка, checklist, notification, расширение существующего модуля), прежде чем создаётся новый модуль | Core Laws Filter 6 (Simplicity Test); Law 1 |
| **Plan before Implementation** | Product Review и Architecture Review MUST завершиться прежде, чем начинается реализация | `docs/ai/oaes-project-profile.md` ("Required workflow"); AGENTS.md ("Before implementing any module feature") |

### 2.1. Принципы из примера задачи, для которых не найдено принятого источника

Задача приводит пример списка, включающий **API First** и **Documentation First** как отдельные названные принципы. Ни один источник репозитория не формулирует их именно в таком виде:

- **"API First"** — репозиторий имеет строгую и принятую политику app-facing `api`-facade (ADR 0008), но это политика границы схемы (что публикуется через Data API), а не общий принцип "сначала проектируется API, затем реализация". Отдельного принятого "API First" как engineering principle нет. **[ГИПОТЕЗА не подтверждена — принцип не включён в таблицу выше.]**
- **"Documentation First"** — OAES workflow (`docs/ai/oaes-project-profile.md`) требует Product Review и Architecture Review как задокументированные артефакты до реализации, что близко к духу "Documentation First", но ни один источник не называет это так явно и не требует документации иных решений (например, чистого рефакторинга без изменения поведения). Отражено выше как "Plan before Implementation", что точнее описывает принятое правило.

Оба случая размечены явно, а не молча пропущены, в соответствии с требованием задачи не придумывать факты.

---

## 3. Engineering Decision Process

**Статус: FACT** — процесс уже определён `docs/ai/oaes-project-profile.md` (общий workflow) и практикой ADR (`docs/adr/*`, десять принятых записей). Раздел ниже объясняет, когда какой артефакт нужен, синтезируя оба источника.

### 3.1. Общий workflow (FACT)

Каждая нетривиальная задача проходит через шлюзы в порядке (`docs/ai/oaes-project-profile.md`):

```
Repository Recovery
  → Product Review
  → Architecture Review
  → Implementation
  → Self Review
  → QA
  → Acceptance Report
  → Ready for Merge
```

Roles (Product Manager, CTO/Architect, Security Reviewer, Database/RLS Reviewer, Frontend/UX Reviewer, QA Reviewer, Release Reviewer) — это "review lenses", применяемые по риску, а не постоянно работающая команда (`docs/ai/oaes-project-profile.md` "Roles are review lenses").

### 3.2. Когда достаточно документа/Issue, когда нужен ADR, откуда берётся RFC

Явного правила "ADR vs Issue vs документ" ни один источник не формулирует напрямую как отдельную политику. Наблюдение по факту практики репозитория (10 принятых ADR в `docs/adr/`, множество phase-планов и review-документов в `docs/`) даёт следующую **[РЕКОМЕНДАЦИЯ]**, выведенную из уже существующей практики, а не новое правило:

| Тип решения | Достаточный артефакт | Наблюдение |
|---|---|---|
| Значимое, устойчивое архитектурное решение с альтернативами и последствиями (например: где проходит security boundary, какая модель данных выбрана, как открывается Data API) | **ADR** (`docs/adr/000N-*.md`) | Все 10 существующих ADR фиксируют именно такие решения: multi-tenant RLS, PII encryption, AI human-in-the-loop, data access model, authenticated read access, core helper hardening, api facade schema, safe growth, modular governance |
| Планирование конкретной фичи/фазы, не меняющее платформенную политику | **Phase-план / Product Review + Architecture Review документ** в `docs/` (например `docs/phase-1j-*.md`, `docs/product/cafe-package-v2-1-*.md`) | Существующая практика — десятки таких документов в `docs/` |
| Новая вертикаль или крупная новая продуктовая гипотеза, требующая отдельного исследования рынка/ICP/конкурентов | **RFC** (по образцу `docs/strategy/future-vertical-construction-os-rfc.md`) | Единственный явный прецедент RFC в репозитории — `future-vertical-construction-os-rfc.md`, явно принятая как справочная, не авторизованная к реализации |
| Небольшое, обратимое, документированное как эксперимент решение | **Class 6 "temporary experiment"** — reason, owner, флаг/граница, review/removal date, тесты | ADR 0010 §C |

**OPEN QUESTION**: не задокументирован явный порог, при котором Issue/задача обязана эскалироваться до полноценного ADR, а не оставаться phase-планом. Решение о создании ADR на сегодня — суждение CTO/Founder по факту (наблюдаемое по 10 существующим записям), не формализованное правило.

### 3.3. Обязательные предпосылки перед реализацией (FACT)

Из AGENTS.md ("Before implementing any module feature") и `docs/ai/oaes-project-profile.md`:

1. Пройдены Product Review и Architecture Review gates.
2. Проверено `docs/architecture`.
3. Проверено требование `tenant_id`.
4. Проверено влияние на RLS.
5. Проверены RBAC-права (`packages/core/src/permissions.ts`).
6. Проверено требование audit log.
7. Проверено влияние на другие модули (cross-module impact).
8. Выполнена применимая локальная верификация.
9. Подготовлен Acceptance Report прежде, чем задача объявляется завершённой.

---

## 4. Module Governance

**Статус: FACT (ссылка), не дублирование.** Полная модель уже построена в `oruwa-portfolio-and-module-strategy.md` §17 (Build Decision Flow) и ADR 0010 §A–D. Этот раздел не переопределяет её, а формулирует инженерную сторону того же вопроса: что делает разработчик/архитектор, когда получает запрос на новый модуль, расширение или интеграцию.

### 4.1. Когда создавать новый модуль

Новый top-level модуль (Level 1, ADR 0010 §A) создаётся, только если:

- запрос классифицирован как class 5 ("reusable top-level product module") по ADR 0010 §B;
- пройден Build Decision Flow (`oruwa-portfolio-and-module-strategy.md` §17) до узла "Vertical Module" или "Shared Module" с ответом "новый top-level модуль";
- пройден Core Compliance Review (Core Laws §20) до присвоения статуса Approved (Core Laws §21.7).

### 4.2. Когда расширять существующий модуль

Расширение (Level 2 capability, ADR 0010 §A) — предпочтительный путь перед созданием нового модуля (Filter 6, Simplicity Test). Запрос классифицируется как class 4 ("reusable capability inside an existing module") по ADR 0010 §B.

### 4.3. Когда делать интеграцию

Функциональность, которую типично уже покрывает внешняя система клиента (POS, бухгалтерия, payroll), подключается как **Integration**, а не строится внутри ORUWA — уже принятое решение, зафиксированное в `oruwa-portfolio-and-module-strategy.md` §4.4 и §3 (Build/Integrate/Defer/Reject Matrix) со ссылкой на `cafe-audit-product-audit.md`. Обобщённый Integrations framework сознательно откладывается до появления второго типа внешней интеграции (`platform-foundation-roadmap.md` §7, п.9) — строить framework по одному примеру (LINE) было бы преждевременной абстракцией (Core Law 1, Filter 6).

### 4.4. Когда отклонять

Запрос отклоняется (class 7, ADR 0010 §B) без реализации, если единственный способ его удовлетворить — постоянная tenant-specific логика (`if tenantSlug === 'X'`), независимо от размера или коммерческой значимости клиента (Anti-Principle 12.5). Отклонение — не "реализовать и пересмотреть позже": ADR 0010 Consequences прямо требует отклонять такие запросы сразу.

---

## 5. Database Governance

**Статус: FACT.** Собрано из AGENTS.md, `.cursor/rules/02-database-rls.mdc`, ADR 0002, ADR 0005, ADR 0008, ADR 0009, Core Laws Law 11.2/11.8/13.

| Правило | Формулировка | Источник |
|---|---|---|
| **Forward-only migrations** | Схема меняется только новыми, аддитивными миграциями. Существующие migration-файлы не удаляются, не переименовываются и не изменяются после применения без отдельного документированного и одобренного решения | ADR 0009 п.4–5; AGENTS.md |
| **`tenant_id` обязателен** | `tenant_id uuid not null` на каждой бизнес-таблице, без исключений; `location_id uuid`, если данные принадлежат физической точке | AGENTS.md п.1; `.cursor/rules/02-database-rls.mdc`; ADR 0009 п.6 |
| **RLS обязателен, в той же миграции** | RLS включается и политики добавляются в той же миграции, что создаёт таблицу. Таблица без RLS — баг, не TODO | `.cursor/rules/02-database-rls.mdc`; `docs/security/security-requirements.md` §1; ADR 0002 |
| **`tenant_id` выводится из membership, не из клиента** | Backend получает `tenant_id` из `core.tenant_memberships` через `resolveTenantContext`; запросу/телу запроса не доверяют | AGENTS.md п.3; `docs/security/security-requirements.md` §2 |
| **`api` schema — единственная app-facing поверхность** | Внутренние схемы (`core`, `audit`, `workforce`, `booking`, `ai`) никогда не входят в Data API exposed-schemas; браузер читает только через `api`-facade (security-invoker views, без `SECURITY DEFINER`) | ADR 0008; ADR 0009 п.7–8 |
| **`internal` schemas остаются internal** | Помимо `api`, только `public` экспонируется через Data API | ADR 0009 п.8 |
| **`service_role` — сервер-only** | Никогда не импортируется и не читается в `apps/web`; живёт только в `apps/api`/`apps/worker`/скриптах | AGENTS.md п.4; `docs/security/security-requirements.md` §3 |
| **Platform-staff привилегия не самоизменяема** | `core.users.is_platform_staff` не может быть изменена пользователем через `authenticated`/`anon`; изменение — только `service_role` (BEFORE UPDATE trigger, migration 0012) | `docs/security/security-requirements.md` §1; ADR 0005 |
| **Деструктивные изменения требуют отдельного одобрения** | Удаление/переименование колонок или таблиц, backfill, переписывающий данные — отдельная явно одобренная задача, никогда неявный побочный эффект feature-работы | ADR 0009 п.5 |
| **Новый модуль не ломает существующие tenant'ы** | Тенанты без включённого модуля не видят изменения поведения, деградации производительности или утечки доступа | ADR 0009 п.9 |

---

## 6. Security Governance

**Статус: FACT.** Собрано из `docs/security/security-requirements.md`, `.cursor/rules/01-security.mdc`, Core Laws Law 6, Law 13, Law 11.2. Этот раздел не создаёт новых правил безопасности — `docs/security/security-requirements.md` явно помечен как "mandatory. PRs that violate them must not merge."

1. **Row Level Security (mandatory)** — каждая таблица с `tenant_id` имеет RLS, политики гейтятся через `core.is_member_of`/`core.has_permission`. Изоляция не зависит от frontend-фильтрации (`docs/security/security-requirements.md` §1).
2. **Tenant id derivation** — только из membership через `resolveTenantContext`, никогда из тела запроса (§2).
3. **Key handling** — `SUPABASE_SERVICE_ROLE_KEY` только на сервере; браузер использует только `NEXT_PUBLIC_*` anon-значения + RLS (§3).
4. **LINE webhook verification** — `x-line-signature` (HMAC-SHA256 сырого тела с channel secret) проверяется до обработки события; несовпадение — 403 (§4).
5. **PII protection** — email, phone, address, customer name, employee name, LINE user id шифруются AES-256-GCM (`@line-os/db/crypto`); searchable PII — blind index (`*_encrypted` + `*_hash`, HMAC-SHA256 с pepper) (§5).
6. **Audit logging** — каждая мутация пишет `audit.audit_logs` через `writeAudit`; таблица append-only (DB trigger блокирует update/delete) (§6).
7. **AI safety** — AI предлагает, никогда не мутирует бизнес-данные напрямую; approval — человек с `ai.approve`; AI tenant- и permission-scoped, никогда не получает cross-tenant данные (§7; Core Laws Law 6, Law 4).

Human approval остаётся обязательным (Core Laws Law 6; `docs/ai/oaes-project-profile.md` "Authority boundaries") перед: production deployment со значимым риском, деструктивной миграцией, удалением данных, изменением security policies, billing, массовыми сообщениями, LINE broadcast, изменением ролей/прав, работой с чувствительными PII, подключением критических интеграций.

---

## 7. AI Development Governance

**Статус: FACT.** Собрано из Core Laws §13 (Rules for AI Agents), `.cursor/rules/04-ai-agent-workflow.mdc`, `docs/ai/oaes-project-profile.md` ("Authority boundaries"), `.cursor/rules/03-git-workflow.mdc`, AGENTS.md.

### 7.1. AI never writes business data directly

AI-driven изменение бизнес-данных всегда идёт по пайплайну: **AI предлагает** (структурированный proposal, без прямой записи в БД) → **менеджер одобряет** (RBAC-gated человеческое решение) → **backend применяет** через обычные Core API (tenant context, RLS, валидация) → **audit фиксирует** действие через `writeAudit` (`.cursor/rules/04-ai-agent-workflow.mdc`).

### 7.2. Feature branches и git workflow

`main` — стабильная ветка, `dev` — интеграционная, `feature/*` — ветки задач. Прямой push в `main` запрещён; force-push в `main` запрещён. PR открываются в `dev` (`.cursor/rules/03-git-workflow.mdc`, AGENTS.md).

### 7.3. Plan before implementation

Каждая нетривиальная задача проходит Repository Recovery → Product Review → Architecture Review, прежде чем начинается Implementation (`docs/ai/oaes-project-profile.md`). Repository Recovery обязан подтвердить branch/HEAD/working tree/remote relationship/relevant migrations/existing PR state — "no chat summary or handoff is proof of repository state".

### 7.4. Review

Roles применяются по риску (Раздел 3.1). Database work всегда требует Security и Database/RLS lens; customer-facing Cafe UI всегда требует Frontend/UX и QA lens (`docs/ai/oaes-project-profile.md`).

### 7.5. Approval boundaries

Явное человеческое одобрение обязательно перед (`docs/ai/oaes-project-profile.md` "Authority boundaries"):

- созданием или изменением database migration или RLS policy;
- сбросом локальной БД или выполнением локальных миграций;
- установкой зависимости или подключением внешнего сервиса;
- любой записью в Supabase Cloud, Vercel, DNS или production;
- изменением auth, secrets, PII handling, ролей, прав, billing, LINE broadcast поведения;
- commit, push, созданием PR, merge, force-push, переписыванием истории, удалением branch/данных или другим внешне видимым действием.

Одобрение узкое: одобрение одного действия не авторизует следующий шлюз.

### 7.6. Documentation

`docs/ai/current-task.md` MUST описывать проверенную текущую стадию, baseline, следующий gate и границы безопасности; обновляется при закрытии крупной стадии, чтобы следующая сессия не восстанавливала контекст из устаревшей истории чата (`docs/ai/oaes-project-profile.md` "Context continuity").

### 7.7. Verification

AI-агент MUST NOT (Core Laws §13):

- изменять интерпретацию закона ради желаемого решения;
- считать пользовательский запрос автоматически правильным;
- рекомендовать destructive или production-действие без явного предупреждения;
- обещать неподтверждённую возможность;
- представлять гипотезу как факт;
- скрывать конфликт с Core Laws.

Перед финальным отчётом или PR выполняются `pnpm install --frozen-lockfile` и `pnpm exec turbo run typecheck test build lint --force --ui=stream`; каждый отчёт о задаче фиксирует scope, изменённые файлы, результат build/lint, security impact, migration impact, rollback note (`.cursor/rules/03-git-workflow.mdc`).

---

## 8. Definition of Done

**Статус: смешанный.** Часть критериев — прямая цитата принятых требований (Acceptance Report, verification gates). Общей сводной формулировки "Definition of Done" как отдельного документа в репозитории нет — раздел собирает существующие требования под этим заголовком.

### 8.1. Уже принятые (FACT) требования

Из `docs/ai/oaes-project-profile.md` ("Required artifacts" → Acceptance Report) архитектурная/инженерная задача не считается завершённой без зафиксированного Acceptance Report, включающего:

- scope, фактически реализованный;
- изменённые файлы;
- фактически выполненные проверки и их результаты;
- наблюдаемое browser/Preview evidence, если менялся UI;
- security, migration, tenant-isolation и environment impact;
- известные пробелы и rollback note;
- точный следующий human gate.

Дополнительно, из `.cursor/rules/03-git-workflow.mdc`: `pnpm exec turbo run typecheck test build lint` должен пройти до финального отчёта.

### 8.2. Governance Recommendation — предлагаемый сводный чек-лист

Ниже — обобщение уже принятых пунктов Разделов 5–7 в единый чек-лист "готово, если это верно для каждого пункта". Это **[РЕКОМЕНДАЦИЯ]**, а не отдельно принятый документ:

- Core Compliance Review пройден для значимых модулей/capability (Core Laws §20, §21.7).
- `tenant_id`/`location_id` присутствуют на новых таблицах; RLS включён в той же миграции (Раздел 5).
- `writeAudit` вызывается для каждой мутации бизнес-данных (Раздел 5, 6).
- PII, если затронуто, зашифровано и, если нужно, снабжено blind index (Раздел 6).
- AI-функциональность, если есть, следует пайплайну propose → approve → apply → audit (Раздел 7.1).
- Verification (`typecheck test build lint`) пройдена локально (Раздел 7.7).
- Acceptance Report составлен по формату `docs/ai/oaes-project-profile.md` (Раздел 8.1).
- Для затронутых Cafe UI сценариев выполнена observed browser/Preview acceptance, не только CI (`docs/ai/oaes-project-profile.md` "Project verification routing").

---

## 9. Architecture Review Checklist

**Статус: FACT** — краткая форма уже принятого содержания Architecture Review artifact (`docs/ai/oaes-project-profile.md`) и Core Compliance Review (Core Laws §20).

✓ **Reuse** — использует существующий Core Platform / Shared Module, где возможно, вместо новой реализации (Раздел 2, Раздел 4)

✓ **Tenant safety** — `tenant_id`/`location_id` на месте, `tenant_id` выводится из membership, не из клиента (Раздел 5)

✓ **RLS** — политика существует, добавлена в той же миграции, покрыта негативным тестом cross-tenant (Раздел 5, 6)

✓ **Security** — `service_role` не в `apps/web`, PII зашифрован при необходимости, LINE webhook подпись проверяется, если применимо (Раздел 6)

✓ **Audit** — мутации пишут `writeAudit`; действие можно проследить: кто, когда, в каком tenant, с каким результатом (Раздел 5, 6; Core Laws Law 11.9)

✓ **AI boundary** — если задействован AI, соблюдён пайплайн propose → approve → apply → audit, нет прямой записи бизнес-данных (Раздел 7.1)

✓ **Migration safety** — миграция аддитивна; ничего исторического не переписано без отдельного одобрения; rollback note зафиксирован (Раздел 5; Core Laws Law 11.10)

✓ **Cross-module impact** — проверено влияние на другие модули и на уже подключённых tenant'ов без нового модуля (ADR 0009 п.9)

✓ **Product alignment** — решение классифицировано по ADR 0010 §B (configuration / capability / module / experiment / reject) и прошло применимые Decision Filters (`oruwa-portfolio-and-module-strategy.md` §17)

✓ **Verification** — `typecheck test build lint` пройдены; для Cafe UI — наблюдаемая browser/Preview acceptance (Раздел 7.7, 8.1)

✓ **Documentation** — `docs/ai/current-task.md` обновлён, если закрывается крупная стадия; Acceptance Report составлен (Раздел 7.6, 8.1)
