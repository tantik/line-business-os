# ORUWA Platform Foundation Roadmap

> Governed by ORUWA Core Laws & Product DNA (`docs/foundation/core-laws-and-product-dna.md`).
> This document must not contradict the Core Laws. Where a conflict exists, the Core Laws prevail.

## Document Metadata

| Field | Value |
|---|---|
| Version | 1.0.1 |
| Status | Accepted |
| Acceptance Note | Accepted status does not approve items explicitly marked OPEN QUESTION, GOVERNANCE RECOMMENDATION, HYPOTHESIS, or FOUNDER REVIEW REQUIRED. |
| Owner | Founder / CTO |
| Applies to | ORUWA Business OS platform engineering |
| Scope (RU) | инженерное построение платформенного фундамента ORUWA |
| Horizon | От текущего состояния до момента, когда безопасно открывать разработку новых вертикалей |
| Priority | Ниже Core Laws & Product DNA. Уровень Decision Hierarchy: **Platform Architecture Principles** (между Long-term SaaS Principles и Vertical Product Constitution) |
| Supersedes | None |
| Last Updated | 2026-08-06 |

## Что это за документ

Это инженерная дорожная карта построения платформы ORUWA: из каких компонентов она должна состоять, в каком порядке они строятся, какие зависимости между ними существуют и что уже готово.

Это **не** Product Vision, **не** Product Constitution, **не** roadmap функций, **не** backlog, **не** Architecture Specification, **не** ADR и **не** описание базы данных. Документ не проектирует код, БД, API или UI и не планирует новые вертикали — он определяет, в каком порядке должна строиться платформа, чтобы новые вертикали можно было строить безопасно.

## Related Documents

- [docs/foundation/core-laws-and-product-dna.md](core-laws-and-product-dna.md) — нормативная основа; в частности Law 10 (Modular Without Fragmentation), Law 11 (Configuration Over Custom Development), Law 13 (Safety and Isolation by Design), Section 11 (Long-term SaaS Principles).
- [docs/architecture/overview.md](../architecture/overview.md), [multi-tenancy.md](../architecture/multi-tenancy.md), [rbac.md](../architecture/rbac.md) — текущее состояние реализованной архитектуры Core.
- [docs/product/modules.md](../product/modules.md) — реестр текущих продуктовых модулей.
- [docs/ai/current-task.md](../ai/current-task.md) — текущая верифицированная стадия работы (Cafe Package).

## Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| 1.0.0 | 2026-08-06 | Initial draft. | Claude (agent), for Founder review |
| 1.0.1 | 2026-08-06 | Founder acceptance: Status changed from Draft for Founder Review to Accepted. Any content elsewhere in this document explicitly marked OPEN QUESTION, GOVERNANCE RECOMMENDATION, HYPOTHESIS, or FOUNDER REVIEW REQUIRED remains unresolved and is not approved by this acceptance. | Founder |

---

## Table of Contents

1. Назначение и границы документа
2. Что составляет Platform Foundation
3. Критический разбор списка компонентов
4. Три уровня платформы: Core Platform / Platform Services / Vertical Products
5. Карта зависимостей
6. Что уже существует благодаря Cafe Package
7. Последовательность построения
8. Что нельзя откладывать и что можно отложить
9. Риски нарушения последовательности
10. Финальная дорожная карта, приоритеты и критический путь
11. Что делать сразу после Platform Foundation

---

## 1. Назначение и границы документа

ORUWA уже имеет одну работающую вертикаль в производственной готовности (Cafe Package, модули Workforce/Booking/Inventory) и Core, построенный вместе с ней. До появления второй и третьей вертикали должен существовать явный ответ на вопрос: **какая часть текущей системы — это платформа, которую обязана переиспользовать любая вертикаль, а какая часть — специфика Cafe, которую нельзя молча тащить как "общую" в следующий модуль.**

Этот документ:

- MUST использовать Core Laws как нормативную основу и не вводит новых продуктовых принципов;
- MUST явно отделять Core Platform, Platform Services и Vertical Products;
- MUST NOT проектировать таблицы, API или UI;
- MUST NOT планировать содержание новых вертикалей — только то, что должно существовать до них.

---

## 2. Что составляет Platform Foundation

Platform Foundation — это совокупность компонентов, которые:

1. используются каждой вертикалью без исключения (Law 10, Law 11.4, Law 11.6);
2. образуют единственный источник истины для сквозных сущностей — identity, права, тарификация, аудит (Law 7, Law 11.2);
3. если построены неправильно или в неправильном порядке — заставляют каждую следующую вертикаль либо дублировать логику, либо создавать tenant-specific fork (Anti-Principle 12.5).

Platform Foundation — это не "всё, что не является функцией конкретной вертикали". Локальная настройка вертикали (типы смен, рецепты, категории склада) — не Foundation. Foundation — это то, без чего вторая вертикаль физически не может быть подключена так, как того требует Law 10/11, не создав дублирование.

---

## 3. Критический разбор списка компонентов

Ниже — список из постановки задачи, проверенный против фактического состояния кода (`supabase/migrations`, `packages/core`, `apps/web`, `apps/api`) и Core Laws.

| Компонент | Вердикт | Обоснование |
|---|---|---|
| Organization | **Удалить как отдельный обязательный компонент сейчас** | В коде нет и не нужен слой выше Tenant. Tenant уже играет роль "клиент платформы" (Law 11.2). Отдельная сущность Organization (зонтик над несколькими tenant, например сеть кафе с разными юрлицами) — реальная потребность, но не блокирует ни одну известную вертикаль сегодня. Понижается до Platform Services, DEFER. |
| Tenant | **Обязателен, реализован** | `core.tenants`, security boundary по Law 11.2. |
| Location | **Обязателен, реализован** | `core.locations`, operational boundary по Law 11.3. |
| Identity | **Обязателен, реализован** | `core.users`, единая identity для tenant+platform staff. |
| Authentication | **Обязателен, реализован** | Supabase Auth + `resolveTenantContext`. |
| Authorization | **Обязателен, реализован** | `core.has_permission`, RLS + `requirePermission` (двухслойный enforcement). |
| Roles | **Обязателен, реализован** | `core.roles`, `core.role_assignments`, system + custom roles. |
| Permissions | **Обязателен, реализован** | `core.permissions`, строковый формат `module.entity.action`. |
| Entitlements | **Обязателен, частично реализован — требует доработки** | Есть только `core.tenant_modules` (булев вкл/выкл модуля). Нет модели плана/тарифа, лимитов, жизненного цикла (trial/active/suspended). Это заготовка, не полноценный Entitlements engine, требуемый Law 11.4. |
| Platform Billing | **Обязателен для коммерческого масштабирования, не реализован** | Упомянут в `docs/ai/current-task.md` как "отдельно gated subscription-lifecycle foundation", но кода/схемы нет. Должен оставаться отдельным доменом от платежей клиентов бизнеса (Law 11.5). |
| Customer Portal | **Обязателен позже, не реализован** | Self-serve signup/billing/plan management отсутствует; сейчас onboarding ручной. Зависит от Billing и Entitlements. |
| Module Registry | **Обязателен, частично реализован — требует доработки** | `core.tenant_modules` + `core.module_code` enum — это включатель, не реестр. Нет метаданных модуля (версия, статус жизненного цикла, зависимости, минимальный план). Нужен до того, как число вертикалей вырастет за 3-4. |
| Shared Navigation | **Обязателен, частично реализован — требует консолидации** | `apps/web` уже имеет общий `/dashboard` shell (см. `docs/architecture/overview.md`), но построен вместе с Cafe и не формализован как платформенный контракт для произвольного модуля. |
| Shared Settings | **Обязателен, не формализован** | Tenant-level настройки сейчас специфичны для Workforce/Booking. Общего "Tenant Settings" слоя как платформенного контракта нет. |
| Notifications | **Обязателен, не реализован как платформенный сервис** | LINE-уведомления реализованы внутри Workforce/Booking по отдельности (module-specific), а не как общий Notifications-сервис. Нарушает Law 10 при добавлении третьей вертикали, если не исправить. |
| Audit | **Обязателен, реализован** | `audit.audit_logs`, используется через `writeAudit(...)` в `apps/api`. Уже платформенный, не модульный — хороший прецедент для остальных Platform Services. |
| Event Bus | **Обязателен позже, не реализован** | Модули сейчас взаимодействуют напрямую (прямые вызовы/DB), явной pub/sub шины нет. Нужен, когда межмодульная реакция (например: Inventory → Workforce задача) должна быть decoupled (Law 10, Law 11.7). Не блокирует текущие 3 модуля, но блокирует безопасный рост дальше. |
| AI Platform | **Частично реализован, требует расширения до платформенного слоя** | `ai.proposals` и `ai.prompt_logs` уже существуют и соответствуют Law 4/Law 6 (proposal → approval паттерн). Это фундамент, но не кросс-модульная AI-платформа (единый layer оценки уверенности, fallback, стоимости — Law 11.12). |
| Integrations | **Обязателен позже, частично реализован в узком виде** | LINE registry (`core.line_registry`, migration 0004) — по сути первая интеграция, встроенная в Core, а не обобщённый Integrations framework. Обобщать имеет смысл только когда появится второй тип внешней интеграции — раньше это будет преждевременная абстракция (Core Law 1). |

### Добавлено сверх исходного списка (обосновано состоянием кода, а не придумано заново)

| Компонент | Вердикт | Обоснование |
|---|---|---|
| Platform Admin / Ops Console | **Обязателен до масштабирования поддержки, не реализован** | `docs/architecture/overview.md` уже явно резервирует для этого отдельное пространство (`/platform` или `/ops`), архитектурно отличное от tenant-facing `/dashboard`. Это не опция — существующая архитектура прямо указывает необходимость. |
| Localization / Translation Service | **Уже существует как платформенный прецедент** | `content_translations` (migrations 0039–0042, 0047) — первый пример по-настоящему общего Platform Service, не привязанного к одному модулю. Стоит явно признать паттерном для остальных Platform Services. |

---

## 4. Три уровня платформы

### 4.1. Core Platform

**Назначение.** Единственный источник истины для того, "кто есть кто, где, и что ему разрешено" в любой вертикали.

**Ответственность.** Identity, Authentication, Tenant, Location, Roles, Permissions, Authorization, Audit.

**Основные сущности.** `core.tenants`, `core.locations`, `core.users`, `core.tenant_memberships`, `core.roles`, `core.permissions`, `core.role_assignments`, `core.role_permissions`, `audit.audit_logs`.

**Зависимости.** Нет — это нижний уровень, от которого зависит всё остальное.

**Ожидаемый результат.** Любой новый модуль подключается к identity/правам/аудиту без единой собственной таблицы пользователей, ролей или журнала действий (Law 10, практический пример из Core Laws §Law 10).

**Текущий статус.** Построен и стабилен. Дальнейшая работа — hardening (RLS negative tests, permission coverage), не новое строительство.

---

### 4.2. Platform Services

**Назначение.** Возможности, которые нужны каждой вертикали, но не являются "кто и что может" — это "как модуль сообщает, тарифицируется, настраивается и виден пользователю в общей системе".

**Ответственность.** Entitlements, Module Registry, Shared Navigation, Shared Settings, Notifications, Event Bus, Platform Billing, Customer Portal, AI Platform, Integrations, Platform Admin/Ops Console, Localization.

**Основные сущности.** Entitlement/plan модель поверх `core.tenant_modules`; реестр модулей с метаданными жизненного цикла; общий notification dispatch (LINE как первый канал, но не единственный); шина событий между модулями; billing-домен, отделённый от платежей клиентов бизнеса (Law 11.5).

**Зависимости.** Полностью зависят от Core Platform (используют tenant/roles/permissions/audit как данность). Не зависят друг от друга линейно, но некоторые блокируют другие (см. Раздел 5).

**Ожидаемый результат.** Вторая и третья вертикаль подключают уведомления, настройки, тарификацию и навигацию через контракт, а не пишут собственную реализацию (Law 11, Anti-Principle 12.5).

**Текущий статус.** Смешанный: Audit и Localization — платформенный прецедент уже есть; Entitlements и Module Registry — заготовки, требующие доработки; Notifications, Event Bus, Billing, Customer Portal, Admin Console, обобщённые Integrations, AI Platform как кросс-модульный слой — не построены.

---

### 4.3. Vertical Products

**Назначение.** Отраслевая ценность для конкретного типа бизнеса (кафе, салон, логистика и т.д.).

**Ответственность.** Доменные сущности и workflow конкретной вертикали (recipes, shifts, bookings, stock items).

**Основные сущности.** Схемы модулей: `workforce.*`, `booking.*`, `inventory.*`.

**Зависимости.** Полностью зависят от Core Platform и от Platform Services в той мере, в какой Platform Services уже существуют. Там, где Platform Service ещё не построен (Notifications, Event Bus), вертикаль вынужденно реализует его локально — это признанный технический долг, а не образец для копирования следующей вертикалью.

**Ожидаемый результат.** Каждая новая вертикаль — это в первую очередь новая доменная модель и UX, а не переизобретение прав доступа, уведомлений или тарификации.

**Текущий статус.** Workforce и Booking — production-oriented (Cafe Package). Inventory — частично (Daily Stock Check). Logistics, CRM, AI Assistant — заявлены как Planned в `docs/product/modules.md`, не начаты.

---

## 5. Карта зависимостей

```
Core Platform
 (Identity, Auth, Tenant, Location, Roles, Permissions, Authorization, Audit)
        │
        ├──> Entitlements  ──────────────┐
        │                                 │
        ├──> Module Registry ─────────────┼──> Customer Portal
        │                                 │
        ├──> Shared Navigation ───────────┤
        │                                 │
        ├──> Shared Settings ─────────────┤
        │                                 │
        ├──> Notifications                │
        │                                 │
        ├──> Event Bus                    │
        │                                 │
        ├──> Platform Billing ────────────┘
        │
        ├──> AI Platform (расширение существующего ai.proposals)
        │
        ├──> Integrations (обобщение LINE registry)
        │
        └──> Platform Admin / Ops Console
                    │
                    ▼
        Vertical Products (Workforce, Booking, Inventory, будущие)
```

Ключевые зависимости, которые определяют порядок (Раздел 7):

- **Customer Portal зависит от Entitlements и Platform Billing** — нельзя показать клиенту "что он может" и "сколько это стоит", если это не определено платформенно.
- **Platform Billing зависит от Entitlements** — тариф без модели плана/лимита бессмысленен.
- **Module Registry зависит от Entitlements** (или строится параллельно) — реестр модулей без понятия "какой план даёт доступ к какому модулю" — просто список.
- **Notifications и Event Bus не зависят друг от друга напрямую**, но обе блокируют третью вертикаль без дублирования логики.
- **Shared Navigation/Settings зависят от Module Registry** в той мере, в какой навигация должна показывать модули, на которые у tenant есть entitlement.

---

## 6. Что уже существует благодаря Cafe Package

### Можно переиспользовать напрямую

- **Core Platform целиком** — Tenant/Location/Identity/RBAC/Audit не специфичны для кафе, построены как платформенные с первого дня (`docs/architecture/overview.md`, `multi-tenancy.md`, `rbac.md` не содержат кафе-специфики).
- **API facade pattern** (`apps/api`, service-role write path + audit) — архитектурный паттерн, не привязанный к вертикали.
- **`content_translations`** — уже общий платформенный сервис локализации, используемый напрямую как образец для остальных Platform Services.
- **`ai.proposals` / `ai.prompt_logs`** — паттерн "AI предлагает → человек утверждает" (Law 4, Law 6) реализован платформенно, не как кафе-специфика.

### Нужно извлечь и обобщить (сейчас живёт внутри Workforce/Booking)

- **Notifications** — LINE-уведомления реализованы отдельно в Workforce (сдвиги) и Booking (напоминания, `apps/worker/src/jobs/booking-reminders.ts`). Логику доставки/канала нужно вынести в общий сервис до того, как третий модуль начнёт писать собственную третью реализацию.
- **Module gating** — `core.tenant_modules` работает, но как булев переключатель; логика "что показать в навигации, если модуль выключен" сейчас размазана по UI Cafe, а не является платформенным контрактом.

### Нужно построить с нуля (не существует даже в зачаточном виде)

- Entitlements как модель плана/лимита (а не просто вкл/выкл).
- Platform Billing.
- Customer Portal.
- Event Bus.
- Обобщённый Integrations framework.
- Platform Admin / Ops Console.

---

## 7. Последовательность построения

Порядок определяется зависимостями (Раздел 5) и правилом: **компонент строится тогда, когда его отсутствие вынуждает следующую вертикаль нарушить Core Law.**

1. **Entitlements engine** (доработка `core.tenant_modules` до модели плана/лимита/жизненного цикла). Блокирует Billing, Customer Portal, осмысленный Module Registry.
2. **Module Registry** (метаданные модуля: версия, статус, зависимости, минимальный план). Блокирует безопасное добавление 3-й+ вертикали без ручной координации.
3. **Shared Navigation + Shared Settings** как формальный платформенный контракт (сейчас — неявное соглашение внутри Cafe UI). Блокирует DNA 9 ("модульна для бизнеса, цельна для пользователя") при росте числа модулей.
4. **Notifications** как общий сервис (извлечение из Workforce/Booking + обобщение канала). Блокирует Law 10 при добавлении модуля, которому тоже нужны уведомления.
5. **Event Bus** (базовый pub/sub между модулями). Блокирует decoupled межмодульные сценарии (Law 11.7) — нужен раньше, чем количество межмодульных сценариев станет непроизвольно связывать модули напрямую.
6. **Platform Billing** — после Entitlements. Блокирует коммерческое расширение за пределы ручного онбординга.
7. **Customer Portal** — после Billing и Entitlements. Блокирует self-serve рост.
8. **AI Platform как кросс-модульный слой** (расширение `ai.proposals`) — может идти параллельно с 4–7, независим от Billing/Portal.
9. **Integrations framework** (обобщение LINE registry) — DEFER до появления второго типа внешней интеграции; строить раньше — преждевременная абстракция.
10. **Platform Admin / Ops Console** — может строиться параллельно с 3–7, не блокирует новые вертикали, но блокирует масштабирование поддержки клиентов.

---

## 8. Что нельзя откладывать и что можно отложить

### Нельзя откладывать до следующей вертикали

- Entitlements engine (иначе новая вертикаль получает собственный, несовместимый способ проверки доступа — прямое нарушение Law 11.4).
- Module Registry (иначе включение/выключение модуля остаётся ручной, недокументированной операцией).
- Notifications как общий сервис (иначе третья вертикаль третий раз пишет LINE-доставку с нуля — прямое нарушение Law 10/11).
- Shared Navigation/Settings как формальный контракт (иначе UX расходится по вертикалям — нарушение DNA 9).

### Можно безопасно отложить

- Organization как отдельная сущность над Tenant — нет доказанной потребности (Filter 2, Problem Evidence), пока не появится клиент с несколькими юридическими tenant под одним брендом.
- Обобщённый Integrations framework — преждевременно при одном типе интеграции (LINE).
- Event Bus может подождать первого реального сценария decoupled межмодульной реакции — но не дольше третьей вертикали (см. Риски, Раздел 9).
- Platform Admin/Ops Console — не блокирует инженерную работу над вертикалями, только операционную поддержку в масштабе.
- AI Platform как полноценный кросс-модульный слой — существующий `ai.proposals` достаточен, пока AI используется в одном-двух модулях.

---

## 9. Риски нарушения последовательности

| Если построить в неправильном порядке | Последствие |
|---|---|
| Новая вертикаль до Entitlements engine | Доступ к модулю проверяется ad hoc внутри вертикали → прямое нарушение Law 11.4, дублирование логики, которое придётся переписывать при появлении Billing. |
| Billing до Entitlements | Тарифная модель встраивается в billing-код напрямую → billing становится источником истины о правах, что нарушает Law 7 (One Operational Truth) и Law 11.5 (разделение доменов). |
| Третья вертикаль до Notifications | Третья независимая реализация LINE-доставки → расхождение статусов доставки, нарушение Law 12 (Confirmation Over Assumption), рост стоимости поддержки (Filter 15). |
| Много вертикалей до Event Bus | Модули начинают вызывать друг друга напрямую (прямые DB/API связи) → жёсткая связанность, невозможность отключить модуль без поломки другого — прямое нарушение Law 10 ("модуль нельзя отключить без поломки core"). |
| Customer Portal до Billing/Entitlements | Портал показывает функциональность, которая не подкреплена реальной моделью плана → риск нарушения Law 14 (Commercial Honesty). |
| Integrations framework до появления 2-й интеграции | Абстракция строится по одному примеру (LINE) → почти гарантированно неверна, придётся переписывать (Core Law 1, Filter 6 Simplicity Test). |

---

## 10. Финальная дорожная карта, приоритеты и критический путь

### Финальная дорожная карта (по уровням)

**Уровень 1 — Core Platform.** Статус: построен. Действие: hardening only, не новое строительство.

**Уровень 2 — Platform Services, в порядке приоритета:**

1. Entitlements engine
2. Module Registry
3. Shared Navigation + Shared Settings (формализация)
4. Notifications (извлечение и обобщение)
5. Event Bus
6. Platform Billing
7. Customer Portal
8. AI Platform (расширение)
9. Platform Admin / Ops Console
10. Integrations framework (DEFER до второй интеграции)

**Уровень 3 — Vertical Products.** Существующие (Workforce, Booking, Inventory-partial) продолжают приниматься точечными фиксами под текущий Product Freeze. Новые вертикали (Logistics, CRM, AI Assistant) не начинаются до завершения пунктов 1–5 Уровня 2.

### Критический путь (Critical Path)

```
Entitlements engine → Module Registry → Shared Navigation/Settings → Notifications → Event Bus
```

Это минимальный набор, без которого третья вертикаль не может быть добавлена без нарушения Core Laws. Billing, Customer Portal, AI Platform, Admin Console и Integrations framework не входят в критический путь для *инженерной* готовности к новой вертикали, но Billing/Customer Portal входят в критический путь для *коммерческого* масштабирования за пределы ручного онбординга.

### Приоритеты

1. Закрыть критический путь (5 пунктов выше) прежде, чем открывать разработку второй новой вертикали (Logistics/CRM/AI Assistant).
2. Параллельно, без блокировки критического пути: Platform Billing, Customer Portal, Platform Admin/Ops Console, расширение AI Platform.
3. Отложить: Organization-сущность, обобщённый Integrations framework — до появления доказанной потребности (Filter 2).

---

## 11. Что делать сразу после завершения Platform Foundation

После закрытия критического пути (Раздел 10):

1. Провести Founder Review: подтвердить, что Entitlements, Module Registry, Shared Navigation/Settings, Notifications и Event Bus прошли Core Compliance Review (Core Laws §20) — не только "работают", но соответствуют Decision Filters (особенно Filter 9 Platform Fit, Filter 10 Data Integrity, Filter 11 Tenant and Permission Safety).
2. Выбрать вторую вертикаль через отдельный Product Review (Product Vision/Constitution уровня, не этот документ) — этот документ намеренно не участвует в выборе *какая* вертикаль следующая.
3. Только после этого начинать проектирование архитектуры и БД новой вертикали — что прямо вне границ этого документа.

Этот документ не переоткрывается при каждой новой вертикали. Он переоткрывается только тогда, когда появляется новый класс платформенного компонента, не покрытый текущим списком, или когда фактическое состояние кода расходится с зафиксированным здесь (Раздел 3, 6).
