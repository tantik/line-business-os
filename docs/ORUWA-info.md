# ORUWA Business OS — Project Map

> **Назначение:** краткая карта продукта, платформы и способа разработки для Founder и новой AI-сессии. Это не источник правил и не журнал миссий. При конфликте приоритет имеют Foundation, принятые ADR, Security Requirements, [AI Engineering Operating Model](ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md) и [current-task.md](ai/current-task.md).
>
> **Срез состояния:** `origin/dev` на 2026-08-16, включая PR #235–#240. Текущую миссию всегда перепроверять по Git и `current-task.md`.

## 1. Executive Summary

ORUWA Business OS — один multi-tenant SaaS для японских малых и средних компаний. Клиентские vertical packages используют общую Platform Foundation и переиспользуемые модули; отдельный codebase под каждого клиента не создаётся. Первый продукт — ORUWA Cafe. Salon, Construction / Field Service, Retail и Clinic остаются кандидатами, требующими отдельной проверки спроса и рисков. Базовый порядок развития: **REUSE → CONNECT → IMPROVE → ONLY THEN BUILD NEW**.

## 2. Product Philosophy

- Простая операционная ясность важнее тяжёлой ERP-функциональности: пользователь должен быстро понять, что происходит, что требует внимания, какое действие нужно и кто должен действовать.
- **Five-Minute Love Test** — внутренняя эвристика качества первого опыта, а не доказанное маркетинговое обещание.
- Customer experience — Japanese-first; Staff-сценарии должны быть удобны на мобильном устройстве.
- ORUWA не соревнуется количеством функций. Новый модуль оправдан только после проверки возможности переиспользовать, соединить или улучшить существующее.

Каноническая продуктовая ДНК: [core-laws-and-product-dna.md](foundation/core-laws-and-product-dna.md).

## 3. Who ORUWA Is For

Основная аудитория — owner- и manager-operated японские SMB с сотрудниками, одной или несколькими локациями и повторяющимися ежедневными операциями. ORUWA заменяет фрагментацию между LINE, таблицами, бумагой, памятью и несвязанными инструментами единым рабочим контекстом. Cafe проверяет эту модель на управлении сменами, персоналом, запасами и инструкциями; следующая вертикаль выбирается только после customer validation.

## 4. Platform Architecture

```text
Users / LINE / LIFF / Web
             │
      Next.js application
             │
  app-facing API / server actions
             │
 PostgreSQL / Supabase
  ├─ core schemas and audit
  ├─ RLS + roles/permissions
  └─ tenant_id + location_id
             │
 Platform Foundation → shared modules → vertical packages
```

- Один SaaS и одна multi-tenant архитектура: `tenant` — бизнес, `location` — его физическая/операционная точка.
- Business tables tenant-scoped; `location_id` применяется там, где данные относятся к конкретной точке.
- PostgreSQL/Supabase обеспечивает данные и RLS; приложение использует app-facing API/facade там, где это требуется архитектурой.
- `service_role` запрещён на frontend. Доступ контролируется совместно RLS, server-side tenant context и permissions; значимые операции должны быть аудитируемыми.
- Текущий web stack — Next.js/TypeScript; deployment — Vercel. LINE/LIFF — каналы входа и интеграции, а не отдельная tenant architecture.

Подробности: [Architecture Overview](architecture/overview.md), [Multi-Tenancy](architecture/multi-tenancy.md), [RBAC](architecture/rbac.md), [ADR 0002](adr/0002-multi-tenant-rls.md), [ADR 0005](adr/0005-data-access-model.md), [ADR 0008](adr/0008-api-facade-schema.md).

## 5. Product / Vertical Model

```text
Platform Foundation
  └─ reusable platform services and business modules
       └─ vertical package
            └─ tenant/location configuration
```

| Горизонт         | Вертикаль                    | Статус                                                   |
| ---------------- | ---------------------------- | -------------------------------------------------------- |
| Now              | ORUWA Cafe                   | Текущий первый vertical product                          |
| Candidate        | Salon                        | Требует product validation                               |
| Future candidate | Construction / Field Service | Справочное направление; не авторизовано к реализации     |
| Future candidate | Retail                       | Названо, но не проработано                               |
| Later candidate  | Clinic                       | Регуляторно более рискованно; требует отдельной проверки |

Каноническая классификация: [ORUWA Portfolio & Module Strategy](foundation/oruwa-portfolio-and-module-strategy.md).

## 6. Account / Role / Product Surface Model

```text
Public ORUWA website → login → identity
  ├─ ORUWA Platform Admin (внутренний cross-tenant контекст)
  ├─ Tenant Account (Owner / authorized business admin)
  └─ Business Application (Owner / Manager / Staff по permissions)
```

Это не набор независимых приложений и не общие credentials для ролей.

- **ORUWA Platform Admin — future foundation:** внутренний интерфейс Founder/оператора для tenants, billing, onboarding, support, entitlements, health и audit. Русский язык допустим. Это **не** текущий tenant route `/dashboard/admin`.
- **Tenant Account — approved future direction:** Owner или уполномоченный business admin управляет подпиской, package/plan, платежной историей, поддержкой, настройками бизнеса и onboarding.
- **Business Application — current architecture:** Owner, Manager и Staff работают внутри одного tenant, но с разными identities и permissions. Owner и Manager могут быть разными людьми с отдельными аккаунтами и паролями.

Текущий canonical product target — protected dashboard (`/dashboard/workforce/**`, `/dashboard/inventory`). Историческая Preview Surface A (`/_client-preview/mame-to-cha/**`) пока служит reference/acceptance surface; срок её удаления остаётся открытым решением. Публичные `/mame-to-cha/**` и `/demo/cafe/**` — demos, не authenticated business application.

## 7. Customer Purchase and Onboarding Flow

Целевой поток:

```text
oruwa.jp → package/contract → Owner account → tenant
→ entitlements → business setup → locations
→ Manager/Staff invitations → package configuration → first value
```

Onboarding — не анкета, а настройка tenant/package до рабочего состояния: business name, locations, staff/invitations, operating hours и package-specific параметры, включая Inventory при необходимости. Следует собирать минимум данных до first value и использовать presets/templates. Self-service и assisted onboarding должны менять одно общее состояние; ORUWA может продавать помощь с настройкой отдельно. Полная реализация ещё не утверждена.

## 8. ORUWA Platform Admin — Future Foundation

Будущий внутренний слой должен показывать customers/tenants, customer status, package/plan, billing history/status, onboarding progress, entitlements, support requests, operational health и audit trail.

Owner/Manager должен иметь возможность отправить `bug`, `question`, `feature request`, `billing issue` или `other`. При безопасной возможности система добавляет tenant, location, user, role, route, product и app/deployment version. Founder видит обращение в Platform Admin; email notification — возможный канал, не утверждённая реализация. Этот слой нельзя начинать до закрытия текущего Cafe gate без нового Founder scope.

## 9. Billing and Entitlements

- Внешний payment provider должен быть source of truth для платежа/подписки; ORUWA хранит синхронизированное состояние и entitlements.
- Provider-hosted portal предпочтительнее собственной платёжной UI, если выбранный provider это поддерживает и проверка подтвердит пригодность.
- Entitlements управляют доступными packages/modules; нельзя размазывать проверки названия plan по коду.
- Выбор provider, японские требования, налоги, invoices, retries и конкретные API — **OPEN / TO BE VERIFIED** до Architecture/Product Review.

SaaS billing и merchant/customer-commerce payments — разные домены и не должны смешиваться без отдельного решения.

## 10. Current ORUWA Cafe Product

Подтверждённый repository scope включает:

- Manager Dashboard и cross-module Manager Attention presentation layer;
- Staff UI и Workforce: графики, preferences, correction requests, shift exchange/change/cancel flows, attendance/work reports;
- Staff provisioning/invitations и authenticated role separation;
- Inventory, Daily Stock Check, min/target/shortage и reorder state;
- Recipes / Manuals / SOP с JA/EN presentation/content там, где это реализовано;
- tenant/location/role boundaries и responsive web surfaces.

Manager Attention не является новым business module: он собирает уже существующие операционные состояния в понятный список действий.

## 11. Cafe v2.1 Current Status

На `origin/dev` уже вошли: canonical Staff surface reconciliation и onboarding `token_hash` fix; Manager shift-exchange closure; AI Operating Model и governance consolidation (PR #235–#238); customer-facing product-integrity/Japanese-first baseline (PR #239); Manager Attention & Product Experience (PR #240).

**Whole-Product Integrity & Completeness Gate — COMPLETE.** Итог: `CAFE_V2_1_READY_AFTER_BOUNDED_FIXES`, P0 = 0, P1 = 2. Единственный Final Bounded Closure scope:

- **F1:** localization Manager Add/Edit Staff modal;
- **F2:** localization Manager Shift Cell Editor.

Implementation F1/F2 merged в `dev` через PR #241; CI и Vercel для PR прошли. **Authenticated Preview QA, independent review и Final Founder Acceptance завершены 2026-08-16** — оба F1 и F2 подтверждены PASS live на `preview.oruwa.jp`, P0/P1 regression не найден. **Cafe v2.1 (bounded, F1/F2) CLOSED.** Evidence: [Final Founder Acceptance 2026-08-16](product/cafe-package-v2-1-final-founder-acceptance-2026-08-16.md); полный deferred P2/P3 register остаётся открытым и не закрыт этим решением: [Whole-Product Integrity Gate](ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md).

**Это не то же самое, что "Cafe готов к продаже".** Founder decision 2026-08-16: отдельный, более высокий gate — **Cafe Commercial Launch Readiness** (`ai/current-task.md` §2.4) — должен пройти прежде, чем Cafe считается коммерчески готовым. Он намеренно не влит обратно в "Cafe v2.1", потому что объединяет разнородную работу: Cafe-специфичную (IA/route + visual reconciliation, оставшийся Cafe Hardening) и платформенную, не принадлежащую Cafe (Platform Foundation critical path — Entitlements → Module Registry → Navigation/Settings → Notifications → Event Bus, Horizon C). Ни один из четырёх шагов этого gate ещё не начат.

## 12. Cafe v2.1 Closure Philosophy

| Приоритет    | Значение                                                 |
| ------------ | -------------------------------------------------------- |
| BLOCKER / P0 | Release/acceptance невозможен                            |
| P1           | Core workflow, требующий closure decision                |
| P2           | Важно, но не блокирует при доказанном workaround/границе |
| P3           | Polish или later                                         |

Каждая находка получает тип: `BUG`, `MISSING_REQUIRED_WORKFLOW`, `SECURITY`, `PRODUCT_INTEGRITY`, `UX`, `POLISH`, `FUTURE_PRODUCT_CAPABILITY` или `TECH_DEBT`. Future ideas не удерживают v2.1 открытым бесконечно.

**Release blockers** для текущего closure — только F1/F2. Известные P2/P3 не потеряны и не считаются автоматически исправленными: это durable deferred backlog, а не доказательство идеального продукта. Закрытие версии не требует исправить каждый P2/P3; полный register остаётся в Whole-Product Gate.

## 13. Existing Modules Improvement Strategy

**REUSE → CONNECT → IMPROVE → ONLY THEN BUILD NEW.** Post-v2.1 candidates, пока не повышены отдельной validation mission:

- **Manager Attention:** существующие состояния питают единый attention layer.
- **Manuals → Checklists:** Manual объясняет «как», Checklist — «что сделать сегодня»; checklist item может ссылаться на Manual.
- **Checklist → Inventory:** inventory check вызывается из процедуры без второго Inventory.
- **Staff Report → problem lifecycle:** возможная модель `OPEN → ACKNOWLEDGED → IN PROGRESS → RESOLVED` только после проверки существующих report models.
- **Training from Manuals:** лёгкий onboarding из Manuals, не LMS.
- **Weekly Review:** детерминированный summary из доверенных данных; AI может объяснять факты, но не быть source of truth.

## 14. What We Should NOT Build Now

- generic Tasks или Jira/Trello-like project management;
- generic Incident либо отдельный Handover до переиспользования reporting;
- LMS, BI platform, Notification Center или отдельный Today module;
- тяжёлый Warehouse/Procurement/ERP;
- CRM/Loyalty в Cafe v2.1 closure;
- Platform Admin, Customer Portal или Billing до закрытия Cafe gate, если не обнаружен реальный blocker;
- tenant-specific forks;
- тяжёлый agent/orchestrator framework без измеримого недостатка текущего процесса.

## 15. Future Product / Capability Roadmap

| Горизонт                           | Результат                                                                                                                                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Cafe v2.1 Closure              | F1/F2 only → verification → Preview/independent/Founder Acceptance                                                                                                                                                                                                    |
| B — Cafe Hardening / Deferred Debt | Backlog category: remaining localization, location fallback, onboarding recovery/Defect C, mobile issues, legacy route cleanup, `workforce_staff_roster` disposition, Surface A retirement и другие verified P2/P3. Не автоматически авторизованная следующая mission |
| C — Platform Foundation            | Customer Account, identities, Onboarding, Platform Admin, Billing, Entitlements, Support, status, audit/health                                                                                                                                                        |
| D — Cafe Product Growth            | Validated recurring operations/checklists, Manuals integration, problem lifecycle, lightweight Training, Weekly Review, Inventory improvements                                                                                                                        |
| E — Product #2 / Next Vertical     | Product research and customer validation; winner не выбран заранее                                                                                                                                                                                                    |
| F — Cross-product Expansion        | CRM/Loyalty/LINE/AI capabilities после validation и нужной foundation                                                                                                                                                                                                 |
| G — Go-to-Market                   | Website, commercial package, sales pipeline/channels, AI Sales Assistant, first real customers, Product #2 selection gate — commercial layer above C, runs after Cafe v2.1 closes                                                                                    |

Roadmaps: [Platform Foundation Roadmap](foundation/platform-foundation-roadmap.md) и [Repository Maturity Roadmap](foundation/repository-maturity-roadmap.md) задают engineering gates для Horizon C. [Go-to-Market Roadmap](strategy/go-to-market-roadmap.md) (draft, not yet Founder-reviewed) раскрывает Horizon G и сверяет её порядок с уже принятым critical path из Platform Foundation Roadmap. Ни один из roadmap-документов не даёт автоматического разрешения строить следующий горизонт.

## 16. AI Engineering Operating Model

```text
Founder — goal, scope, human gates
  ├─ ChatGPT — Strategic CTO / Product / research / independent review
  └─ Claude Code — Lead Engineering Agent
       inspect → plan → implement → test → QA → iterate → PR → evidence
```

Subagents применяются только для полезных bounded subtasks. Merge, production, destructive data/DB actions, high-risk Security/RLS/Auth, secrets, billing, LINE broadcast и другие внешние/необратимые действия остаются human gates. Durable memory — Git, canonical docs и evidence; conversation context не является source of truth. Полные правила: [ORUWA AI Engineering Operating Model](ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md).

### ORUWA AI Engineering Infrastructure

Аудит основан на фактическом содержимом локальных репозиториев на 2026-08-16; ни один из них этой миссией не изменён.

| System           | Actual purpose                                                                                                                     | Current state                                                                                                          | ORUWA integration                                                                                                             | Unique value                                                                              | Decision                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| IAOS             | Markdown-first company strategy, Active Stage, portfolio decisions и repeatable business/engineering context                       | Functional как docs repo, но status/Active Stage отстаёт от текущего `origin/dev`; maintenance mode заявлен самим repo | `docs/IAC_REFERENCE.md` ссылается на него; application/CI/hooks integration нет                                               | Cross-product/company decisions, которые не принадлежат одному product repo               | **KEEP_FOR_LATER** — сохранить как редкий стратегический реестр, но не считать current status надёжным до refresh |
| iac-orchestrator | Node/TypeScript CLI: YAML mission, bounded Claude/Codex phases, policy engine, persisted run state, verification и evidence bundle | Build PASS; 172/172 tests PASS. Локально есть два чужих modified task files, не затронуты                              | Реализован pilot/context reader, но в текущем `line-business-os` нет `.iac` config; нет обнаруженной CI/hook/skill/MCP wiring | Deterministic evidence, resumability и policy classification для unattended/repeated runs | **EXPERIMENTAL** — pause; применять только в измеримом pilot после появления повторяющегося bottleneck            |
| OAES             | Vendor-independent Markdown engineering standard, gates, Definition of Done, review checklists и thin Claude adapter               | v1.0 in progress; не application, automation отсутствует по дизайну                                                    | Реально встроен через `AGENTS.md`, `CLAUDE.md` и `docs/ai/oaes-project-profile.md`                                            | Стабильные provider-independent minimum rules и review vocabulary                         | **ACTIVE** — оставить тонким стандартом; не дублировать Operating Model и не превращать в agent platform          |

Фактическое отношение слоёв:

```text
IAOS (редкие company/portfolio decisions)
           │
OAES (тонкий vendor-independent standard)
           │ applied by project profile
line-business-os Operating Model + repository skills
           │
Founder / ChatGPT / Claude Code → code, QA, evidence

iac-orchestrator = optional experimental automation beside this flow,
not a mandatory runtime layer
```

Системы были задуманы как разные слои, но сегодня частично перекрываются: mission gates, authority и evidence уже описаны в OAES profile/Operating Model и выполняются Claude Code. Поэтому IAOS не должен дублировать product state, OAES — mission instructions, а orchestrator — становиться обязательной оболочкой без доказанного выигрыша.

### When We Should Expand AI Automation

Расширение оправдано только по цепочке **повторяющийся bottleneck → самая малая автоматизация → измерение → решение о расширении**. Конкретные triggers:

- одинаковый ручной mission/evidence/handoff flow ломается в нескольких миссиях;
- регулярные потери контекста сохраняются после `current-task.md` и templates;
- Preview QA или cross-repository coordination становится измеримым bottleneck;
- automation снижает Founder intervention, cycle time или повторяемые ошибки;
- рост customer/tenant operations создаёт подтверждённую повторяющуюся нагрузку.

Следующая инвестиция при возникновении trigger — сначала repository skill/script для автоматической сверки `current-task.md`, scope и evidence manifest. Pilot iac-orchestrator имеет смысл только если эта малая автоматизация недостаточна. Сейчас не нужны network service, autonomous multi-agent workforce, credential store, production actions, scheduler/queue или новый MCP layer.

## 17. Development Flow

```text
Founder/Product goal → bounded mission → inspect/implement
→ automated checks → authenticated Preview QA
→ independent ChatGPT gate → Founder merge/acceptance → next mission
```

Для крупного milestone: остановить feature work → Whole-Product Gate → scope freeze → bounded closure → Founder Acceptance. Automated PASS не заменяет authenticated product acceptance.

## 18. Security Non-Negotiables

Tenant isolation, location scoping, RLS, role/permission boundaries, отсутствие frontend `service_role`, PII protection и auditability обязательны. Destructive migration, production change, billing, credentials, bulk messaging и security/policy change требуют human control. Этот summary не ослабляет [Security Requirements](security/security-requirements.md) и принятые ADR.

## 19. Commercial / Implementation Model

Предполагается SaaS subscription; возможны отдельная implementation/setup fee и платный assisted setup. Presets/templates/wizards должны уменьшать ручную работу Founder и time-to-value. Точные цены, willingness to pay и provider economics требуют customer validation. На ранней стадии ORUWA должна оставаться экономичной в эксплуатации; старые draft prices не являются текущей истиной без отдельного canonical decision.

## 20. Current Strategic Decisions

- Один SaaS, не client forks; Cafe — первая vertical.
- Canonical protected dashboard — product target; Surface A — временный reference, не второй продукт.
- Manager Attention — cross-module presentation layer, не новый module.
- Owner и Manager — разные roles/identities и могут принадлежать разным людям.
- Future Platform Admin отделён от tenant `/dashboard/admin`.
- Customer Onboarding конфигурирует tenant/package; self-service и assisted flow используют одно состояние.
- Развитие модулей: REUSE → CONNECT → IMPROVE → ONLY THEN BUILD NEW.
- Whole-Product Gate после PR #240 завершён; Final Bounded Closure (F1/F2) прошёл Preview QA, independent review и Final Founder Acceptance 2026-08-16 — **Cafe v2.1 CLOSED.**

## 21. Open Decisions / Risks

- **CLOSED 2026-08-16:** Final Bounded Closure (F1/F2, PR #241) прошёл authenticated Preview QA, independent review и Final Founder Acceptance с результатом PASS, P0/P1 regression не найден — см. [Final Founder Acceptance 2026-08-16](product/cafe-package-v2-1-final-founder-acceptance-2026-08-16.md).
- **OPEN:** live clock-in/out disposition и strict location-fallback policy.
- **OPEN:** retirement timing Surface A после parity canonical dashboard.
- **OPEN:** IA/route naming (`/dashboard/workforce/**` is internal/technical, not decided customer-facing IA) и visual/UX reconciliation канонической поверхности против Surface A reference — не начато этим закрытием, отдельное будущее решение (`strategy/go-to-market-roadmap.md` §3).
- **OPEN:** native Japanese review и recovery после прерванного first-time Staff invite.
- **OPEN:** точная последовательность Platform Foundation и billing/provider details.
- **CANDIDATE:** следующая vertical и Checklists/Training/Weekly Review — только после customer validation.
- **NEEDS_FOUNDER_DECISION:** должен ли IAOS после refresh оставаться отдельным authoritative company-strategy repo или быть сведён к редкому portfolio decision register. До решения не переносить его правила и не удалять repo.

Актуальный реестр: [risk-register.md](operations/risk-register.md).

## 22. Where We Are Now

- **CURRENT PRODUCT:** ORUWA Cafe
- **CURRENT STAGE:** Cafe v2.1 (bounded, F1/F2) CLOSED 2026-08-16; Cafe Commercial Launch Readiness step 1 (§11, `ai/current-task.md` §2.4) COMPLETE 2026-08-16 (IA/visual reconciliation, Hardening register items, LOC-1, Defect C — all done, merged, and deployed). Only `I18N-JA-1` (native review) and Surface A retirement timing remain open, neither blocking.
- **CURRENT GOAL:** Founder-directed 2026-08-16 to proceed to step 2, Platform Foundation critical path (Entitlements engine → Module Registry → Navigation/Settings → Notifications → Event Bus), per `ai/current-task.md` §2.4/§5.
- **NEXT:** re-verify `ai/current-task.md` and `foundation/platform-foundation-roadmap.md` against actual repo state before starting implementation — do not assume this summary is still current without checking.

## 23. How a Fresh AI Session Should Use This File

1. Прочитать этот файл как глобальную карту, не как разрешение на работу.
2. Прочитать `AGENTS.md`/`CLAUDE.md` и релевантные Foundation, ADR, Architecture, Security и Operating Model.
3. Прочитать [current-task.md](ai/current-task.md) для точной текущей миссии, но проверить его свежесть по Git.
4. Восстановить branch, HEAD, working tree, `origin/dev`, PR/CI/Preview state и фактические файлы.
5. Не использовать `ORUWA-info.md` вместо mission scope, ADR, Security evidence или live acceptance.
