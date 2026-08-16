# ORUWA Portfolio & Module Strategy

> Governed by ORUWA Core Laws & Product DNA (`docs/foundation/core-laws-and-product-dna.md`).
> This document must not contradict the Core Laws. Where a conflict exists, the Core Laws prevail.

## Document Metadata

| Field | Value |
|---|---|
| Version | 1.1.1 |
| Status | Accepted |
| Acceptance Note | Accepted status does not approve items explicitly marked OPEN QUESTION, GOVERNANCE RECOMMENDATION, HYPOTHESIS, or FOUNDER REVIEW REQUIRED. |
| Owner | Founder / CTO |
| Applies to | Вся продуктовая линейка ORUWA: текущие и будущие вертикали, платформенные и общие модули |
| Scope (RU) | Стратегическое определение состава портфеля продуктов ORUWA на несколько лет |
| Horizon | Многолетний, независимо от текущего состояния Cafe Package |
| Priority | Ниже Core Laws & Product DNA. Уровень Decision Hierarchy: между **Platform Architecture Principles** и **Vertical Product Constitution** — тот же уровень, на котором находится Platform Foundation Roadmap, но отвечает не "как строить платформу", а "что строить и в каком порядке на уровне вертикалей и модулей" |
| Supersedes | None |
| Last Updated | 2026-08-06 |

## Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| 1.0.0 | 2026-08-06 | Initial draft (Sections 1–12): portfolio composition, vertical sequencing, module map, risks. | Claude (agent), for Founder review |
| 1.1.0 | 2026-08-06 | Editorial addition (Sections 13–18): Portfolio Principles, Vertical Acceptance Criteria, Shared Module Promotion Rules, Platform vs Product, Build Decision Flow, Success Metrics. No prior decision (Sections 1–12) changed. Several new sections mark their content as Governance Recommendation rather than accepted Founder decision — see each section's status line. | Claude (agent), for Founder review |
| 1.1.1 | 2026-08-06 | Founder acceptance: Status changed from Draft for Founder Review to Accepted. Content marked `[ГИПОТЕЗА]`, OPEN QUESTION, Governance Recommendation, or Founder Review Required elsewhere in this document (e.g. §2.7 Salon vs. Cleaning sequencing) remains unresolved and is not approved by this acceptance. Two markdown links to untracked product documents (`../product/cafe-audit-product-audit.md`, `../product/cafe-v2-2-candidate-backlog.md`) removed from Related Documents; citations to a temporary handoff document replaced with "Founder-confirmed project fact; repository evidence record pending" markers, per Founder decision. | Founder |

## Что это за документ

Это стратегический документ уровня Founder/CTO, определяющий состав продуктовой линейки ORUWA: какие вертикали ORUWA развивает, какие — нет, как классифицируются все будущие модули, и в каком порядке всё это должно появляться.

Это **не** Roadmap, **не** Backlog, **не** Platform Foundation Roadmap, **не** Product Vision, **не** Product Constitution и **не** список хотелок. Документ не проектирует код, БД, API или UI и не создаёт backlog реализации.

## Related Documents

- [docs/foundation/core-laws-and-product-dna.md](core-laws-and-product-dna.md) — нормативная основа: Meta Principle, Purpose (§3.3 — чем ORUWA не является), Core Product Laws, Long-term SaaS Principle 11.1 (One Platform, Multiple Verticals), Anti-Principle 12.5 (Custom Fork Per Client), §21.4 (Vertical Applicability Check — Cafe/Salon/Clinic/Construction/Retail/Logistics).
- [docs/foundation/platform-foundation-roadmap.md](platform-foundation-roadmap.md) — инженерная последовательность построения Core Platform и Platform Services; этот документ не пересматривает её, а опирается на неё как на данность.
- [docs/adr/0009-safe-growth-and-module-rollout.md](../adr/0009-safe-growth-and-module-rollout.md) — принятая цель масштабирования (300+ tenants) и текущий список ожидаемых модулей.
- [docs/adr/0010-modular-product-governance-and-client-request-classification.md](../adr/0010-modular-product-governance-and-client-request-classification.md) — действующий трёхуровневый модульный каталог (7 top-level модулей) и правило классификации клиентских запросов.
- [docs/strategy/future-vertical-construction-os-rfc.md](../strategy/future-vertical-construction-os-rfc.md) — принятая как справочная (но не авторизованная к реализации) RFC для Construction.
- [docs/product/modules.md](../product/modules.md), [docs/product/mvp-roadmap.md](../product/mvp-roadmap.md) — фактическое состояние Cafe Package и уже принятые решения по объёму (что build, что integrate, что defer).
- `docs/product/cafe-audit-product-audit.md`, `docs/product/cafe-v2-2-candidate-backlog.md` — non-authoritative product evidence references (Cafe-specific documents, versioned separately from Foundation; not part of this repository's tracked baseline as of this Foundation commit).
- Mame To Cha pilot status and Platform Foundation as the next stage: Founder-confirmed project fact; repository evidence record pending. Not sourced to any temporary handoff document — a temporary handoff MUST NOT be a normative source for Frozen Foundation content.

## Метод

Этот документ не начинает анализ рынка заново, не переписывает Product Vision и не придумывает новые Core Laws. Он сводит воедино выводы, уже зафиксированные в перечисленных источниках. Там, где вывод не может быть подтверждён существующими исследованиями или фактическим состоянием репозитория, он явно помечен как **[ГИПОТЕЗА]**.

Важное фактическое ограничение, которое сформировало этот документ: **выделенное конкурентное рыночное исследование по вертикалям (Sprint C1) на сегодня существует только как методология и шаблоны — ни одна строка конкурентных данных не заполнена** (`cafe-audit-world-competitive-research-plan.md`, `cafe-audit-competitive-comparison-template.md`, `cafe-audit-feature-value-matrix.md` — все три подтверждённо пусты). Единственные конкуренты, упомянутые где-либо в репозитории, — это ANDPAD, KANNA, Photoruction, SPIDERPLUS (для Construction) и Poster POS (для Cafe), и все они явно помечены как непроверенные. Поэтому везде, где этот документ ссылается на конкурентную ситуацию, это либо ссылка на такую непроверенную заметку, либо гипотеза автора документа — не результат завершённого исследования.

---

## Table of Contents

1. Проверка: не превращается ли ORUWA в ERP
2. Стратегические вертикали ORUWA
3. Вертикали, которые ORUWA не должна делать
4. Четыре категории модулей
5. Итоговая карта модулей ORUWA
6. Build / Integrate / Defer / Reject Matrix
7. Таблица приоритетов (Now / Next / Later / Future / Never)
8. Итоговая карта продуктовой линейки
9. Очерёдность появления вертикалей
10. Очерёдность появления модулей
11. Риски
12. Что должно быть реализовано до ORUWA v3
13. Portfolio Principles
14. Vertical Acceptance Criteria
15. Shared Module Promotion Rules
16. Platform vs Vertical Product
17. Build Decision Flow
18. Success Metrics

---

## 1. Проверка: не превращается ли ORUWA в ERP

Прежде чем определять состав портфеля, нужно явно ответить на вопрос, поставленный в задаче: не превращается ли ORUWA в универсальную ERP.

Core Laws & Product DNA уже дают прямой ответ в §3.3 (Purpose ORUWA не состоит в том, чтобы... "построить универсальную ERP") и в Anti-Principle 12.6 (Complexity as Professionalism). Этот документ обязан применять данный запрет не абстрактно, а к каждому конкретному кандидату на модуль или вертикаль (Раздел 6).

Практическое правило, применяемое ниже: **модуль строится ORUWA, только если он (а) используется несколькими вертикалями или является ядром одной стратегической вертикали, и (б) не является доменом, где регуляторная сложность, точность или ответственность несоразмерны текущему размеру команды и подтверждённому спросу.** Пункт (б) — прямая причина, по которой бухгалтерия, payroll, полноценный POS и enterprise ERP отклонены в Разделе 3, а не просто "пока не приоритет".

---

## 2. Стратегические вертикали ORUWA

### 2.1. Исходный список для критической проверки

Задача просит проверить список: Cafe, Restaurant, Bakery, Salon, Clinic, Retail, Construction, Logistics, Education.

Единственный документ, где Founder-уровень явно перечисляет вертикали и проверяет через них применимость Core Laws, — это `core-laws-and-product-dna.md` §21.4 (Founder Review, Vertical Applicability Check). Он называет ровно шесть вертикалей: **Cafe, Salon, Clinic, Construction, Retail, Logistics** — и утверждает, что ни один Core Law не зависит от конкретной вертикали. Это не список "что строить", а проверка "закон универсален" — но сам факт, что Founder выбрал именно эти шесть как representative sample, значим: **Restaurant, Bakery и Education не входят даже в этот проверочный список.** Ниже они разбираются отдельно.

### 2.2. Cafe — статус: доказанная, активная (Now)

Единственная вертикаль с реальной production-глубиной: Workforce (укомплектован), Booking (стаб), Inventory (частично, migrations 0035–0038), recipes/manuals, JA/EN локализация, 834/834 (позже 848) тестов, versioned Cafe Package template (`cafe-package-v2-1-baseline-and-acceptance-plan.md`). Commercial Principle 1 (commercial necessity gate) founder-approved именно для Cafe.

Важный факт, меняющий интерпретацию "успешности" Cafe: **первый named pilot-клиент Mame To Cha отказался из-за задержек** (Founder-confirmed project fact; repository evidence record pending — not sourced to any temporary handoff document). Founder явно решил не сворачивать вертикаль, а продолжать её как reusable product package. Вывод для стратегии: Cafe остаётся стратегической вертикалью, но её "доказанность" — инженерная и продуктовая (build quality, готовый паттерн), не коммерческая (нет ни одного действующего платящего клиента; ¥4,980/мес — это цена для ещё не подписанного design partner, `docs/product/mvp-roadmap.md`). Это отличие MUST учитываться при принятии решений о второй вертикали: расширять портфель на основании неподтверждённого коммерческого спроса — риск, разобранный в Разделе 11.

### 2.3. Salon — статус: следующий кандидат, частично подготовлен (Next)

Свидетельства сильнее, чем принято считать: (а) `packages/booking/src/index.ts` прямо ссылается на `tantik/line-app` как источник — то есть Booking-модуль изначально спроектирован из salon-логики, а не добавлен позже; (б) в `packages/db/scripts/seed.ts` уже существует рабочий demo-seed для Salon-тенанта (`DEMO_SALON`, `SALON_LOCATION`) с шифрованными PII-записями бронирования; (в) `docs/product/demo-vs-client-template.md` называет "Mirawi Demo Salon" каноническим demo-тенантом для Booking, параллельным Mame To Cha для Workforce; (г) `docs/strategy/future-vertical-construction-os-rfc.md` прямо перечисляет "Salon package / Booking direction" как один из текущих активных приоритетов наравне с Cafe.

Salon хорошо проходит Core Laws §21.4 (bookings, specialist availability, repeat visits, client requests, resources, follow-up — прямое применение Attention Before Data и Actionability Over Awareness) и не требует нового top-level модуля — использует существующий Booking. Это делает Salon самым дешёвым по стоимости следующей вертикали кандидатом с точки зрения Filter 15 (Cost of Ownership) и Filter 6 (Simplicity Test): она не требует нового домена, только доведения Booking до production-глубины, сравнимой с Workforce.

**[ГИПОТЕЗА]** Ни одного реального salon-клиента, интервью или подтверждённого спроса в репозитории не задокументировано — статус Salon как "готового к строительству" следует читать как архитектурная готовность, а не коммерческое подтверждение (Filter 2, Problem Evidence).

### 2.4. Clinic — статус: узнаваемая, но регуляторно тяжёлая (Later, с оговоркой)

Clinic также прямо названа в §21.4, но с явной оговоркой в самом Core Laws: применяется "под более строгими границами — человеческий авторитет, объяснимость, приватность, аудит, профессиональная ответственность. ORUWA не должна подменять медицинское решение." `future-vertical-construction-os-rfc.md` также называет "Clinic package / Booking direction" текущим активным приоритетом.

Это создаёт содержательное противоречие, которое должен разрешить Founder, а не этот документ: Clinic технически использует тот же Booking-модуль, что и Salon (низкая инженерная стоимость), но несёт непропорционально более высокую регуляторную/юридическую нагрузку (медицинские данные, лицензирование, ответственность за расписание приёма) относительно текущего размера команды. Это прямое применение Filter 15 (Cost of Ownership) не на стороне разработки, а на стороне комплаенса и support. Решение: Clinic **классифицируется как Later**, а не Next — тот же модуль (Booking), но её включение как отдельной коммерческой вертикали откладывается до появления или (a) юридической экспертизы по медицинским данным в Японии, или (b) конкретного клиники-partner с готовностью на pilot.

### 2.5. Construction — статус: принятая справочная RFC, не авторизована (Future)

`future-vertical-construction-os-rfc.md` — единственный документ в репозитории, полностью посвящённый анализу будущей вертикали, включая named-but-unverified конкурентов (ANDPAD, KANNA, Photoruction, SPIDERPLUS), ICP (SMB-строительство/ремонт Японии, 3–100 сотрудников), явный MVP-гипотезис ("Construction Photo & Progress OS via LINE") и явный do-not-build-now список. Final Decision самой RFC: "accepted as a future strategic vertical reference... explicitly not approved for active implementation."

Revisit criteria RFC (раздел 13) заданы конкретно: только после того, как Cafe demo показан первому клиенту, начат/запланирован Cafe pilot, у Workforce MVP есть стабильный путь к pilot, готовы первые sales-материалы, и есть либо revenue, либо сильное design-partner доказательство, либо прямой доступ к строительной компании. На сегодня (после отказа Mame To Cha) ни одно из условий revenue/pilot не выполнено — значит **RFC's own gate ещё закрыт**, и этот документ не может законно передвинуть Construction ближе к Now, не нарушая её же revisit-критерии.

Construction остаётся стратегически ценной (архитектурные предвосхищения — `project_id`, `knowledge_items`, `media_assets`, `industry_key` — уже сознательно заложены в дизайн-мышление вокруг неё), но статус — **Future**, не Next.

### 2.6. Retail и Logistics — статус: названы, но не проработаны (Future)

Обе названы в §21.4 (Retail: stock, sales, transfers, orders, deviations, staff; Logistics: events, routes, exceptions, delays, confirmations, responsibility) и Logistics явно фигурирует в module-каталоге ADR 0009/0010 и в `packages/ai/src/proposals.ts` как один из 7 зарезервированных top-level модулей. Однако ни у одной из них нет ни собственной RFC (как Construction), ни demo-seed (как Salon), ни рабочей схемы — только упоминания.

Logistics при этом уже "зарезервирована" на уровне кода (module enum), а Retail — нет вообще как отдельного module_code. Это значит: Logistics ближе к статусу "модуль, который когда-то станет вертикалью или shared-модулем" (см. §4 — вероятнее shared/CRM+Inventory-производная функциональность, чем отдельная вертикаль), а Retail на сегодня — чисто гипотетическая категория без инженерного следа. Обе — **Future**, требуют собственного RFC по образцу Construction, прежде чем получить более высокий приоритет.

### 2.7. Cleaning — статус: единственная вертикаль с явным founder-таймингом (Next, после Platform Foundation)

`docs/product/mvp-roadmap.md` содержит единственную в репозитории конкретную, датированную последовательность "что после Cafe": (1) синхронизировать public demo, (2) довести onboarding до ≤2 часов, (3) построить ORUWA Platform Foundation (Organization, Customer Portal, Platform Billing, Entitlements, отдельный Merchant Payments), (4) **"Start Cleaning Package on that shared platform foundation."** Это единственное место во всём корпусе документов, где следующая вертикаль после Cafe названа не как пример или проверка принципов, а как спланированный следующий шаг с явной зависимостью (после Platform Foundation).

Это создаёт видимое расхождение с §2.3–2.4: Construction RFC называет "Salon/Booking" и "Clinic/Booking" текущими активными приоритетами, а mvp-roadmap называет Cleaning следующим пакетом. Документ явно не может исключить одно в пользу другого без Founder Review — оба сигнала происходят из принятых (не черновых) источников. Разрешение конфликта в этом документе (Раздел 9): **Salon имеет наименьшую инженерную стоимость (переиспользует Booking, уже частично засеян), Cleaning имеет наиболее явный founder-sequencing сигнал.** Оба относятся к Next-после-Platform-Foundation; какая из двух строится первой — открытый вопрос, требующий Founder Review, а не решение, которое этот документ вправе принять единолично.

### 2.8. Restaurant, Bakery, Education — статус: отклонены как отдельные вертикали сейчас

Ни Restaurant, ни Bakery, ни Education не встречаются нигде в репозитории как отдельно проработанные вертикали — они не входят даже в проверочный список §21.4. Обоснование для каждой:

- **Restaurant** — операционно почти полностью покрывается тем же набором модулей, что и Cafe (Workforce + Inventory + recipes), различие в основном в масштабе меню и POS-интеграции, а не в наборе Core-Law-сценариев. Строить как отдельную вертикаль сейчас означало бы дублировать Cafe без нового операционного паттерна — прямое нарушение Filter 6 (Simplicity Test) и Anti-Principle 12.1 (Feature Factory). **Решение: Restaurant — не отдельная вертикаль, а расширение конфигурации Cafe Package (Level 3, ADR 0010) в будущем, если появится спрос.**
- **Bakery** — аналогично Restaurant: тот же набор Core Law сценариев (recipes, inventory, shifts), потенциально даже более узкий, чем Cafe. **Решение: не отдельная вертикаль; кандидат на Cafe/Restaurant-конфигурацию, не на новый модуль.**
- **Education** — не имеет ни одного намёка в репозитории и качественно отличается от остальных вертикалей (long-term enrolment, curriculum, grading, guardian communication) — это не расширение существующих сценариев, а новый набор Core Law применений, сопоставимый по объёму работы с Construction RFC. **Решение: не отклонена по существу, но не имеет никакого исследовательского задела — при интересе требует отдельной RFC по образцу Construction, прежде чем может рассматриваться. На сегодня — вне портфеля.**

### 2.9. Итоговый список стратегических вертикалей

| Вертикаль | Статус | Обоснование (кратко) |
|---|---|---|
| **Cafe** | Активная, production-track | Единственная вертикаль с реальной глубиной; pilot-клиент отказался, но паттерн сохраняется как reusable |
| **Salon** | Next-кандидат | Переиспользует Booking; demo-seed и Founder-упоминание уже существуют; наименьшая инженерная стоимость |
| **Cleaning** | Next-кандидат (альтернативный) | Единственный явный founder-sequencing сигнал ("Start Cleaning Package..."); требует нового домена — инженерно дороже Salon |
| **Clinic** | Later | Тот же модуль (Booking), что и Salon, но регуляторно тяжелее — Core Laws сами требуют более строгих границ |
| **Construction** | Future (RFC принята, gate не выполнен) | Собственная RFC существует; revisit criteria RFC ещё не выполнены |
| **Retail** | Future (не проработана) | Названа в Core Laws applicability check, нет инженерного или исследовательского следа |
| **Logistics** | Future (зарезервирована в коде, не проработана) | Присутствует как module_code с 2026-06; нет RFC, нет схемы |
| **Restaurant, Bakery** | Не отдельные вертикали | Полностью покрываются конфигурацией Cafe Package (Law 11, Level 3) |
| **Education** | Вне портфеля | Нет исследовательского задела; при интересе — требуется RFC уровня Construction |

---

## 3. Вертикали, которые ORUWA не должна делать

Задача прямо просит: ERP для крупных предприятий, бухгалтерские системы, payroll, POS, полноценный HRM. Репозиторий уже содержит founder-уровня решения по каждому пункту — этот раздел не изобретает новые запреты, а собирает уже принятые.

| Категория | Решение | Источник | Что делать вместо |
|---|---|---|---|
| **Enterprise ERP** | Reject как продукт ORUWA | Core Laws §3.3 прямо запрещает "построить универсальную ERP"; ADR 0009 целится в "300+ client tenants" SMB, не enterprise | Оставаться SMB-платформой; enterprise-запросы — вне ICP |
| **Бухгалтерия / accounting** | Reject как build | Не упоминается нигде как продукт ORUWA; попадает под тот же принцип, что и payroll ниже | Integrate — экспорт данных в существующие бухгалтерские системы клиента (например, через будущий Integrations framework, `platform-foundation-roadmap.md` §3) |
| **Payroll / compliance suite** | Explicit Reject-as-build | `cafe-audit-product-audit.md`: "payroll/compliance suite (**integrate, do not build first**)"; `cafe-v2-2-candidate-backlog.md` Future раздел повторяет это | Integrate. CSV attendance/payroll export (High priority в Candidate Backlog) — это интеграционная точка, не построение payroll внутри ORUWA |
| **Полноценный POS** | Explicit Reject-as-build | `cafe-audit-product-audit.md`: "POS integration (**\"partner-led roadmap\", не построено первым**)" | Integrate. ORUWA не строит кассовый узел; интегрируется с существующими POS через будущий Integrations framework |
| **Полноценный HRM** (recruitment, performance review, benefits administration) | Reject как отдельный build сейчас | Нет ни одного упоминания в репозитории; Workforce уже покрывает операционную часть (смены, посещаемость, correction requests) — этого достаточно для Meta Principle; полный HRM — не про ежедневную операционную работу, а про кадровое администрирование, качественно другой домен | ORUWA Workforce остаётся операционным модулем (кто, когда, что делает сегодня), а не HR-системой (карьера, компенсации, найм). Если у клиента уже есть HRM — интеграция, не замена |
| **Закупки/снабжение как отдельная ERP-функция** (multi-vendor procurement, RFQ, contracts) | Defer, не Reject | `cafe-audit-product-audit.md` и Candidate Backlog: "suppliers/receiving/purchase orders (**later module phase**)"; "recipe costing/theoretical stock deduction (needs validated POS/purchasing strategy first)" | Строить только после того, как через POS/Inventory появится подтверждённая транзакционная история; не строить как ERP-модуль с нуля |

Общий принцип, который объединяет эту таблицу: **ORUWA строит операционный слой (что происходит сегодня, что требует решения, что подтверждено), а не системы учёта и расчётов, где цена ошибки, регуляторная нагрузка и специализация несоразмерны команде текущего размера.** Это прямое применение Law 6 (Human Authority at High-Risk Boundaries) и Filter 15 (Cost of Ownership) к выбору портфеля, а не только к отдельным фичам.

---

## 4. Четыре категории модулей

Категоризация ниже опирается на уже принятую трёхуровневую модель `platform-foundation-roadmap.md` (§4: Core Platform / Platform Services / Vertical Products) и добавляет четвёртую категорию — External Integrations, — которая в Platform Foundation Roadmap упомянута только как один из Platform Services (Integrations framework), но для целей портфельной стратегии заслуживает отдельного класса, поскольку решения там принципиально другие: Build/Integrate/Defer/Reject вместо только "когда строить".

### 4.1. Core Platform

**Назначение.** Единственный источник истины о том, кто есть кто, где, и что ему разрешено — для любой вертикали без исключения.

**Состав.** Identity, Authentication, Authorization, Tenant, Location, Roles, Permissions, Audit (все — реализованы, `platform-foundation-roadmap.md` §4.1).

**Повторное использование.** 100% — каждая вертикаль обязана использовать Core Platform целиком, без исключений (Law 10, Law 11.2, Law 11.3).

**Коммерческая ценность.** Косвенная, но фундаментальная: без неё невозможна мультитенантность, а значит невозможна экономика SaaS на 300+ клиентов (ADR 0009).

**Сложность поддержки.** Низкая относительно объёма ценности — построена один раз, дальнейшая работа — hardening, не новое строительство (`platform-foundation-roadmap.md` §4.1, "Текущий статус").

### 4.2. Shared Business Modules

**Назначение.** Возможности, нужные нескольким вертикалям, но представляющие бизнес-функциональность (не инфраструктуру identity/auth) — то есть Platform Services, которые видны пользователю как продуктовая ценность, плюс доменные модули, переиспользуемые более чем одной вертикалью.

**Состав.** Booking, CRM, Inventory, AI (proposals/ai.proposals-паттерн), Notifications (Platform Service в разработке), Workforce — в той мере, в какой Workforce переиспользуется не только Cafe (Construction RFC явно называет Workforce "reusable" для будущей стройки).

**Повторное использование.** Высокое, но не универсальное — например, Booking полезен Salon и Clinic, но не Construction; Inventory полезен Cafe, Retail (гипотетически) и частично Construction (materials), но не Booking-only вертикалям.

**Коммерческая ценность.** Прямая — это то, что фактически продаётся клиенту как функциональность.

**Сложность поддержки.** Средняя — растёт с числом вертикалей, которые модуль обслуживает одновременно (каждая новая интеграция с вертикалью — потенциальный источник config-разрастания, Law 11 требует решать это конфигурацией, не форками).

### 4.3. Vertical Modules

**Назначение.** Отраслевая доменная модель и workflow конкретной вертикали, не подходящие для переиспользования за её пределами.

**Состав.** Recipes/Manuals (кафе-специфичный, хотя `future-vertical-construction-os-rfc.md` предлагает обобщить его в `knowledge_items` для стройки — на сегодня это ещё не сделано, значит текущая реализация остаётся vertical, а обобщение — Future-архитектурная задача), Cafe-специфичные типы смен/рецептов (Level 3 config, не отдельный модуль), будущие Construction-специфичные Projects/Sites/Media Diary.

**Повторное использование.** Низкое по определению — если возникает переиспользование, модуль должен быть повышен в Shared Business Modules (как это уже случилось концептуально с Workforce, изначально кафе-специфичным).

**Коммерческая ценность.** Прямая для одной вертикали, обычно точка дифференциации от Shared-модулей конкурентов.

**Сложность поддержки.** Пропорциональна числу активных вертикалей; ADR 0010 явно требует, чтобы такие модули оставались Level 2 capabilities внутри top-level модуля, а не порождали tenant-specific форки.

### 4.4. External Integrations

**Назначение.** Функциональность, которую ORUWA сознательно не строит сама, а подключает к уже существующим у клиента системам.

**Состав.** POS (explicit partner-led per Product Audit), Payroll/Accounting (explicit "integrate, do not build first"), будущий обобщённый Integrations framework (сейчас — только LINE registry как первая, не обобщённая интеграция, `platform-foundation-roadmap.md` §3, DEFER до появления второй интеграции по Core Law 1/Filter 6).

**Повторное использование.** Архитектурно высокое в потенциале (единый framework для любой внешней системы), но framework сознательно не строится, пока не появится второй тип интеграции — строить раньше значило бы абстрагировать по одному примеру (`platform-foundation-roadmap.md` §9, риск "Integrations framework до появления 2-й интеграции").

**Коммерческая ценность.** Высокая опосредованно — снимает возражение "у нас уже есть POS/бухгалтерия" на продажах, не увеличивая инженерный периметр ORUWA.

**Сложность поддержки.** Потенциально самая высокая на единицу функциональности (внешние API нестабильны, версионируются не по расписанию ORUWA) — именно поэтому Core Laws (Law 6, Filter 15) и уже принятые product-решения последовательно выбирают Integrate, а не Build, для POS/payroll/accounting.

---

## 5. Итоговая карта модулей ORUWA

```
Core Platform
 ├─ Identity                         [реализован]
 ├─ Authentication                   [реализован]
 ├─ Authorization (RBAC + RLS)       [реализован]
 ├─ Tenant                           [реализован]
 ├─ Location                         [реализован]
 ├─ Roles / Permissions              [реализован]
 └─ Audit                            [реализован]

Platform Services (Shared, инфраструктурные — см. Platform Foundation Roadmap)
 ├─ Entitlements engine              [заготовка, требует доработки]
 ├─ Module Registry                  [заготовка, требует доработки]
 ├─ Shared Navigation / Settings     [неформализовано]
 ├─ Notifications                    [не построен как сервис]
 ├─ Event Bus                        [не построен]
 ├─ Platform Billing                 [не построен]
 ├─ Customer Portal                  [не построен]
 ├─ AI Platform (расширение ai.proposals) [частично]
 ├─ Integrations framework           [DEFER до 2-й интеграции]
 ├─ Platform Admin / Ops Console     [не построен]
 ├─ Localization service             [реализован — прецедент]
 └─ Organization (над Tenant)        [DEFER — нет доказанной потребности]

Shared Business Modules
 ├─ Workforce            [production, Cafe-driven, признан reusable для Construction]
 ├─ Booking              [scaffolded, Salon-seed существует]
 ├─ Inventory            [частично production, Cafe-driven]
 ├─ CRM                  [Planned, не начат]
 └─ AI Support           [Planned, только ai.proposals-паттерн]

Vertical Modules
 ├─ Cafe
 │   ├─ Recipes / Manuals            [production]
 │   └─ Cafe-specific shift/inventory config (Level 3) [production]
 ├─ Salon (через Booking)
 │   └─ Salon-specific booking config (Level 3)        [demo-seed only]
 ├─ Clinic (через Booking, стро­же)
 │   └─ Clinic-specific booking config (Level 3)       [не начат]
 ├─ Cleaning (новая вертикаль)
 │   └─ TBD — не спроектирован, ждёт Platform Foundation
 └─ Construction (RFC, не авторизована)
     ├─ Projects / Sites
     ├─ Tasks / Stages
     ├─ Media / Photo Diary
     └─ Client Portal (per-vertical, строже RLS)

External Integrations
 ├─ POS                              [Integrate — partner-led]
 ├─ Payroll / Accounting             [Integrate — do not build first]
 ├─ LINE                             [реализован, первая интеграция]
 └─ (обобщённый framework)           [DEFER до 2-й интеграции]

Rejected / Out of Portfolio
 ├─ Enterprise ERP
 ├─ Полноценный HRM
 └─ Education (без RFC)
```

---

## 6. Build / Integrate / Defer / Reject Matrix

| Модуль / направление | Решение | Обоснование |
|---|---|---|
| Identity, Auth, Tenant, Location, Roles, Permissions, Audit | **Build** (готово) | Core Platform, единственный источник истины, обязателен для любой вертикали |
| Entitlements engine | **Build** | Блокирует Billing, Customer Portal, Module Registry (`platform-foundation-roadmap.md` §7, п.1) |
| Module Registry | **Build** | Блокирует безопасное добавление 3-й+ вертикали без ручной координации |
| Notifications (как сервис) | **Build** | Иначе третья вертикаль третий раз пишет LINE-доставку с нуля — нарушение Law 10/11 |
| Event Bus | **Build**, но не блокирует немедленно | Нужен до decoupled межмодульных сценариев; можно ждать первого реального сценария, не дольше третьей вертикали |
| Platform Billing | **Build** | Отдельно от Merchant Payments (Law 11.5); блокирует коммерческий рост за пределы ручного онбординга |
| Customer Portal | **Build**, после Billing/Entitlements | Иначе риск нарушения Law 14 (Commercial Honesty) — портал обещал бы то, что не подкреплено моделью плана |
| Organization (над Tenant) | **Defer** | Нет доказанной потребности (Filter 2); появится, когда возникнет клиент с несколькими юр.tenant под одним брендом |
| Integrations framework (обобщённый) | **Defer** | Преждевременная абстракция по одному примеру (LINE); строить только при появлении 2-го типа интеграции |
| Platform Admin / Ops Console | **Build**, параллельно, не в критическом пути | Не блокирует новые вертикали, но блокирует масштабирование поддержки |
| Workforce | **Build** (готово) | Production, доказанный, reusable за пределами Cafe (подтверждено Construction RFC) |
| Booking | **Build**, довести до production-глубины | Scaffolded; ключ к Salon и Clinic без нового домена |
| Inventory | **Build**, продолжить (Cafe-driven) | Частично production; естественно расширяется на Retail в будущем |
| CRM | **Defer** | Planned, но нет активного клиентского сценария сейчас; строить, когда Salon/Cleaning создадут конкретную потребность (repeat customers, follow-up) |
| AI Support (как продукт, не только ai.proposals-паттерн) | **Defer** | Паттерн (proposal→approval) уже платформенный и достаточен для текущего масштаба; полноценный кросс-модульный AI Support — после расширения числа вертикалей |
| Recipes/Manuals | **Build** (готово) | Cafe vertical module; кандидат на обобщение в `knowledge_items` при появлении второй вертикали со сравнимой потребностью (Construction) |
| Cleaning (вертикаль) | **Build**, но после Platform Foundation | Единственный явный founder-sequencing сигнал (`mvp-roadmap.md`); требует нового домена, не начинать до Entitlements/Notifications/Billing |
| Salon (вертикаль) | **Build**, кандидат параллельно/раньше Cleaning | Наименьшая инженерная стоимость (переиспользует Booking); Founder Review должен решить очерёдность относительно Cleaning |
| Clinic (вертикаль) | **Defer** | Тот же модуль (Booking), но требует юридической/комплаенс-экспертизы прежде, чем коммерциализация |
| Construction (вертикаль) | **Defer** | RFC принята как справочная; собственные revisit-критерии ещё не выполнены |
| Retail (вертикаль) | **Defer** | Нет RFC, нет инженерного следа; требует отдельного RFC по образцу Construction прежде продвижения |
| Logistics (вертикаль) | **Defer** | Зарезервирована в коде (module_code), но нет RFC/схемы |
| Restaurant, Bakery (как вертикали) | **Reject** (как отдельные вертикали) | Полностью покрываются Cafe Package конфигурацией (Law 11) |
| Education (вертикаль) | **Reject** (на сегодня) | Нет исследовательского задела; качественно другой набор сценариев |
| POS | **Integrate** | Explicit "partner-led roadmap" в Product Audit |
| Payroll / Accounting | **Integrate** | Explicit "integrate, do not build first" |
| Enterprise ERP | **Reject** | Прямо запрещено Core Laws §3.3 |
| Полноценный HRM | **Reject** | Вне Meta Principle (операционная работа, не кадровое администрирование); Workforce уже покрывает операционную часть |
| Suppliers / Purchase Orders | **Defer** | "later module phase", нуждается в подтверждённой транзакционной истории через POS-интеграцию |
| Recipe costing / auto stock deduction | **Defer** | Нуждается в validated POS/purchasing стратегии сначала |

---

## 7. Таблица приоритетов

| Приоритет | Модули / вертикали | Условие перехода к следующему приоритету |
|---|---|---|
| **Now** | Core Platform hardening; Cafe Package maintenance (только bug/security/localization fixes, per `docs/ai/current-task.md` — "новые функции требуют нового Product Review"); Entitlements engine; Module Registry | Закрыт критический путь Platform Foundation (Entitlements → Module Registry → Shared Navigation/Settings → Notifications → Event Bus), см. `platform-foundation-roadmap.md` §10 |
| **Next** | Shared Navigation/Settings; Notifications-as-service; Event Bus; Platform Billing; Customer Portal; Booking доведён до production-глубины; Salon **и/или** Cleaning (порядок — предмет Founder Review) | Founder Review подтверждает Core Compliance Review (§20 Core Laws) для каждого из Platform Services; выбор второй вертикали сделан явно, не по умолчанию |
| **Later** | Clinic (после юридической/комплаенс-проработки); CRM (когда Salon/Cleaning создадут конкретный сценарий); AI Platform как кросс-модульный слой; Platform Admin/Ops Console; обобщение Recipes/Manuals → knowledge_items | Появление конкретного клиентского сценария или подтверждённого спроса (Filter 2, Problem Evidence) |
| **Future** | Construction (после выполнения её собственных revisit-критериев); Retail (после отдельного RFC); Logistics (после отдельного RFC); обобщённый Integrations framework (после 2-й интеграции); Organization-сущность (после появления multi-tenant-brand клиента) | Написана и принята отдельная RFC уровня `future-vertical-construction-os-rfc.md`; либо появилось прямое коммерческое доказательство |
| **Never** (в текущей архитектуре ORUWA-как-платформы) | Enterprise ERP; полноценная бухгалтерия как build; полноценный payroll как build; полноценный POS как build; полноценный HRM как build; Restaurant/Bakery как отдельные вертикали (вместо конфигурации Cafe); tenant-specific форки любого модуля | Не пересматривается без формального изменения Core Laws (Evolution Rules, §19) |

---

## 8. Итоговая карта продуктовой линейки

```
ORUWA Business OS
│
├─ Core Platform (общий для всех продуктов, не продаётся отдельно)
│
├─ Platform Services (общая инфраструктура, монетизируется опосредованно через план/entitlement)
│
├─ ORUWA Cafe Package                     [Active / Maintenance — production track, коммерчески не подтверждён]
│    Workforce + Inventory + Recipes/Manuals + Booking(частично)
│
├─ ORUWA Salon Package                    [Next candidate — переиспользует Booking]
│    Booking + (в будущем) CRM
│
├─ ORUWA Cleaning Package                 [Next candidate — founder-named, требует нового домена]
│    TBD, ждёт Platform Foundation
│
├─ ORUWA Clinic Package                   [Later — тот же Booking, регуляторно тяжелее]
│
├─ ORUWA Construction Package             [Future — RFC принята, не авторизована]
│
├─ ORUWA Retail Package                   [Future — требует RFC]
│
└─ ORUWA Logistics Package                [Future — требует RFC]

Вне портфеля: Enterprise ERP, Accounting, Payroll-as-build, POS-as-build, полноценный HRM,
Restaurant/Bakery как отдельные пакеты, Education (без RFC).
```

---

## 9. Очерёдность появления вертикалей

1. **Cafe** — уже существует, остаётся в режиме maintenance (не активной feature-разработки) до отдельного Product Review.
2. **Platform Foundation** — не вертикаль, но обязательный шаг перед любой второй вертикалью (уже зафиксировано и в `platform-foundation-roadmap.md`, и в `mvp-roadmap.md`, и в handoff-документе — три независимых источника сходятся на этом порядке).
3. **Salon и/или Cleaning** — открытый вопрос очерёдности между ними, требующий явного Founder Review (см. §2.7). Данный документ рекомендует использовать инженерную стоимость (Salon дешевле — переиспользует Booking) и коммерческое доказательство (ни у одной из двух пока нет подтверждённого клиента) как два равнозначных критерия и не предрешает исход.
4. **Clinic** — после Salon, при появлении юридической/комплаенс-готовности.
5. **Construction** — после выполнения её собственных revisit-критериев (Cafe pilot начат/запланирован, sales-материалы готовы, revenue или design-partner доказательство).
6. **Retail, Logistics** — после отдельных RFC по образцу Construction; порядок между ними не определён ни одним источником и не должен решаться этим документом без RFC.

---

## 10. Очерёдность появления модулей

Повторяет и не переопределяет критический путь `platform-foundation-roadmap.md` §10:

```
Entitlements engine → Module Registry → Shared Navigation/Settings → Notifications → Event Bus
```

Параллельно, вне критического пути: Platform Billing, Customer Portal, Platform Admin/Ops Console, расширение AI Platform.

После закрытия критического пути и до начала Salon/Cleaning: доведение Booking до production-глубины, сравнимой с Workforce (это Vertical/Shared-модульная работа, не Platform Foundation, но она логически предшествует любой Booking-ориентированной вертикали).

---

## 11. Риски

| Риск | Описание | Источник / индикатор |
|---|---|---|
| **Расширение портфеля на неподтверждённом спросе** | Cafe — единственная вертикаль с реальной глубиной, и её единственный named pilot-клиент отказался. Переход к второй вертикали без урока из этого может повторить ту же ошибку — строить раньше, чем есть подтверждённый клиент | Founder-confirmed project fact; repository evidence record pending; Core Laws Law 15 (Learn From Reality) |
| **Конфликт между двумя founder-сигналами о второй вертикали** | Construction RFC называет Salon/Clinic активными приоритетами; mvp-roadmap называет Cleaning следующим пакетом. Если это не разрешено явным Founder Review, разработка рискует начаться в двух направлениях одновременно или в направлении, которое founder уже пересмотрел | §2.7 этого документа |
| **Регуляторная недооценка Clinic** | Тот же модуль (Booking), что и Salon, создаёт соблазн трактовать Clinic как "почти готовую" вертикаль по инженерным причинам, игнорируя, что Core Laws сами требуют для неё более строгих границ | Core Laws §21.4 |
| **Преждевременное обобщение (Integrations framework, knowledge_items, Organization)** | Несколько архитектурных идей (обобщённые интеграции, единая модель "знания" между Cafe recipes и Construction site instructions, Organization-сущность) уже предложены в RFC до появления второго конкретного примера. Построить их раньше времени — гарантированно построить неправильно (Core Law 1, Filter 6) | `platform-foundation-roadmap.md` §9; `future-vertical-construction-os-rfc.md` §Architecture implications |
| **Feature creep через "интеграцию", которая тихо становится build** | Явное решение "POS/payroll — Integrate, не Build" может размываться со временем через последовательность мелких "просто ещё одно поле для экспорта" запросов, каждое из которых по отдельности выглядит безобидно (Anti-Principle 12.1, Feature Factory) | ADR 0010 §7-way classification — обязательный, но требует дисциплины применения |
| **Смешение Platform Billing и Merchant Payments** | Оба документа (mvp-roadmap, handoff) подчёркивают это разделение как критическое (Law 11.5), но именно потому, что оно упоминается так настойчиво в нескольких документах, есть основания полагать, что риск спутать эти домены при реализации Platform Foundation воспринимается founder как реальный, а не гипотетический | Law 11.5; `mvp-roadmap.md` explicit rule |
| **Construction/Retail/Logistics как "приятные к упоминанию", но никогда не проверяемые** | Названные в §21.4 как проверочный список, эти вертикали рискуют оставаться вечно на уровне "мы про них думали" без того, чтобы когда-либо получить RFC или revisit — если этот документ не зафиксирует явное требование RFC перед продвижением, они могут либо быть забыты, либо, наоборот, начаты без должной проработки под коммерческим давлением | Filter 2 (Problem Evidence); Anti-Principle 12.1 |
| **Отсутствие завершённого конкурентного исследования** | Ни один вывод этого документа о рыночной позиции ORUWA не может опираться на подтверждённые конкурентные данные — Sprint C1 (Competitive Audit) существует только как методология. Решения о приоритете вертикалей, сделанные здесь, основаны на внутренней архитектурной готовности и founder-сигналах, а не на knowledge о том, что делают конкуренты в Salon/Clinic/Cleaning/Construction | `cafe-audit-world-competitive-research-plan.md`, `cafe-audit-competitive-comparison-template.md` — оба пусты |

---

## 12. Что должно быть реализовано до ORUWA v3

Если "ORUWA v3" понимать как состояние платформы с тремя и более активными вертикалями (Cafe + вторая + третья), то, опираясь на `platform-foundation-roadmap.md` (критический путь) и Раздел 9–10 этого документа, до этого момента обязательны:

1. **Весь критический путь Platform Foundation**: Entitlements engine, Module Registry, Shared Navigation/Settings (формализованы как контракт), Notifications-as-service, Event Bus. Без этого третья вертикаль структурно нарушает Law 10/11 (`platform-foundation-roadmap.md` §9, Раздел риски).
2. **Явное Founder Review, разрешающее конфликт §2.7** (Salon vs Cleaning как вторая вертикаль) — иначе третий пункт портфеля выбирается де-факто, а не де-юре.
3. **Booking доведён до production-глубины**, сравнимой с текущим Workforce, — предпосылка для любой Booking-based вертикали (Salon, позже Clinic).
4. **Platform Billing и Customer Portal**, отделённые от Merchant Payments (Law 11.5) — без них коммерческий рост ограничен ручным онбордингом, что не масштабируется до 300+ tenants (ADR 0009).
5. **Формальное решение по Clinic** (юридическая/комплаенс-проработка или явный отказ на данном этапе) — Clinic не должна попасть в производство "по инерции" вместе с Salon только потому, что использует тот же модуль.
6. **Хотя бы одна дополнительная RFC** (по образцу Construction) для любой третьей вертикали за пределами Salon/Cleaning/Clinic, прежде чем она получает приоритет выше Future.
7. **Core Compliance Review (§20 Core Laws)** пройден и зафиксирован для каждого нового top-level модуля и каждой новой вертикали — это уже обязательное организационное правило (§21.7 Core Laws: "No significant module... gets Approved status without a recorded Core Compliance Review"), и оно прямо применяется к решениям этого документа, не только к будущим.

---

## 13. Portfolio Principles

**Статус: FACT.** Каждый принцип ниже — не новая формулировка, а прямая производная от уже принятого Core Law, Long-term SaaS Principle, Anti-Principle или ADR. Раздел не вводит ничего, что не выводится из перечисленных источников.

| Принцип | Формулировка | Источник |
|---|---|---|
| **Platform First** | Любая новая возможность сначала проверяется на принадлежность к Core Platform или Platform Services, прежде чем рассматриваться как вертикальная функциональность | Law 10 (Modular Without Fragmentation); `platform-foundation-roadmap.md` §4 (Core Platform / Platform Services / Vertical Products) |
| **Shared before Vertical** | Если возможность нужна двум и более вертикалям, она строится как Shared Business Module, а не дублируется внутри каждой вертикали | Law 10; Раздел 4.2 этого документа |
| **Reuse before Rewrite** | Порядок предпочтения при удовлетворении запроса: shared code → tenant/module entitlement → role/permission checks → tenant/location configuration → reusable capability → module-specific typed settings | ADR 0010 §C ("Preferred model, in order of precedence") |
| **Integrate before Build** | Функциональность, для которой у клиента уже типично есть внешняя система (POS, бухгалтерия, payroll), подключается через интеграцию, а не строится внутри ORUWA | Раздел 4.4 и Раздел 3 этого документа; `cafe-audit-product-audit.md` ("integrate, do not build first") |
| **Configuration before Customization** | Различия между клиентами MUST решаться конфигурацией и reusable capabilities, а не индивидуальными версиями продукта | Law 11 (Configuration Over Custom Development), заголовок закона дословно совпадает с формулировкой принципа |
| **Multi-tenant First** | Любая новая сущность или таблица обязана иметь `tenant_id` (и `location_id` для физических точек) и RLS с первой миграции, а не добавленными позже | Law 11.2, Law 13; `.cursor/rules/02-database-rls.mdc`; ADR 0009 п.6 |
| **One Product → Many Customers** | Платформа не создаёт отдельные репозитории, приложения или базы данных на клиента; масштабирование идёт через мультитенантность, а не через изоляцию проектов | AGENTS.md ("Do not build isolated one-off projects"); `.cursor/rules/00-project-architecture.mdc` |
| **Vertical Packages over Client Forks** | Даже коммерчески значимый клиент не должен получать отдельную версию платформы; клиентский запрос либо становится reusable, либо отклоняется | Anti-Principle 12.5 (Custom Fork Per Client); ADR 0010 §C (явный запрет `if tenantSlug === 'mame-to-cha'`) |

Общее наблюдение: все восемь принципов — это переформулировка уже принятых Core Laws и ADR под портфельный, а не продуктовый или инженерный угол. Ни один из них не может быть изменён этим документом; изменение любого из них требует Evolution Rules (§19 Core Laws) или пересмотра соответствующего ADR.

---

## 14. Vertical Acceptance Criteria

**Статус: смешанный.** Часть критериев ниже — принятое правило (Core Compliance Review, Founder Review). Часть — не зафиксированное общее правило, а обобщение практики, применённой только к Construction (`future-vertical-construction-os-rfc.md`). Эта часть помечена явно как **Governance Recommendation**, а не как принятое решение.

### 14.1. Уже принятые (FACT) требования — применяются к любой новой вертикали

Прежде чем новая вертикаль может получить приоритет выше **Future**, к ней уже обязаны применяться (независимо от того, зафиксирован ли где-либо отдельный "vertical acceptance" чек-лист):

1. **Decision Filters 1–16** (Core Laws §8) — в первую очередь Filter 1 (Purpose Fit), Filter 2 (Problem Evidence), Filter 6 (Simplicity Test), Filter 9 (Platform Fit), Filter 15 (Cost of Ownership).
2. **Core Compliance Review** (Core Laws §20) — обязателен перед тем, как вертикаль или её top-level модуль получает статус Approved (§21.7: "No significant module... gets Approved status without a recorded Core Compliance Review").
3. **Founder Review** — везде, где в этом документе зафиксирован конфликт сигналов о следующей вертикали (§2.7), решение явно оставлено Founder, а не разрешено документом.

Это не отдельный "vertical-specific" процесс — это применение уже существующего общего процесса (Filters + Compliance Review) к категории решений "новая вертикаль".

### 14.2. Governance Recommendation — предлагаемый явный чек-лист

Отдельного документа или ADR, формулирующего чек-лист именно для вертикалей (в отличие от Decision Filters, которые универсальны для любого решения), в репозитории нет. Единственный прецедент — revisit criteria, написанные для одной конкретной вертикали (`future-vertical-construction-os-rfc.md` §13: Cafe demo показан клиенту, Cafe pilot начат/запланирован, стабильный путь к pilot для Workforce MVP, готовы sales-материалы, есть revenue или design-partner доказательство, либо прямой доступ к целевой компании).

Ниже — обобщение этого прецедента до уровня общего чек-листа. Это **[РЕКОМЕНДАЦИЯ]**, не принятое правило:

- **Problem Evidence**: подтверждённая рыночная проблема, а не только архитектурная гипотеза (Filter 2).
- **Pilot Signal**: минимум один реальный или предметно обсуждаемый pilot-кандидат (по прецеденту Construction RFC; ни у Salon, ни у Cleaning на сегодня такого кандидата не задокументировано, см. §2.3, §2.7 этого документа).
- **Platform Reuse**: вертикаль использует существующий Shared Module (Booking, Workforce, Inventory) без нового top-level модуля, либо явно обосновывает, почему нужен новый модуль (Filter 6, Filter 9).
- **No Vertical Conflict**: вертикаль не создаёт конкурирующую или дублирующую модель с уже строящейся вертикалью (например, Clinic vs Salon делят Booking — конфликт не архитектурный, а комплаенс/приоритетный, разобран в §2.4).
- **Founder Approval**: явное решение Founder о переводе вертикали выше Future — сегодня это уже фактически required (Core Compliance Review + Founder Review), но не оформлено как отдельный именованный gate.

Если Founder примет этот чек-лист как формальный gate, следующим шагом должно стать не изменение этого документа, а отдельное дополнение к Core Laws §20 (Core Compliance Review) или новый ADR — это документ не имеет полномочий вводить новый обязательный процесс.

---

## 15. Shared Module Promotion Rules

**Статус: смешанный.** Общий принцип (что переиспользование двумя+ вертикалями требует статуса Shared) уже присутствует в Law 10 и в Разделе 4.3 этого документа. Конкретная процедура повышения — не задокументирована нигде как отдельное правило и помечается как **Governance Recommendation**.

### 15.1. Уже принятый принцип (FACT)

Раздел 4.3 этого документа (со ссылкой на Law 10) уже устанавливает: *"Повторное использование [Vertical Module] — низкое по определению — если возникает переиспользование, модуль должен быть повышен в Shared Business Modules"*. Пример уже произошедшего повышения де-факто задокументирован там же: Workforce был кафе-специфичным, но признан reusable для Construction (`future-vertical-construction-os-rfc.md`).

ADR 0010 §A даёт формальную трёхуровневую модель (top-level module / capability / tenant-configuration), через которую любое повышение обязано проходить классификацию (ADR 0010 §B, class 4 "reusable capability" vs class 5 "reusable top-level module"), но ADR 0010 классифицирует **запросы**, а не формулирует триггер для **повышения уже существующего vertical-specific кода** в shared.

### 15.2. Governance Recommendation — предлагаемый триггер повышения

Явного порога ("используется двумя вертикалями" или "вторая вертикаль запросила ту же возможность") ни в одном источнике не зафиксировано как принятое правило. Предлагается — **[РЕКОМЕНДАЦИЯ]**, требует Founder Review:

- **Двойное использование**: как только вторая вертикаль (существующая или проектируемая через RFC) нуждается в capability, изначально построенной для одной вертикали, эта capability проходит переклассификацию по ADR 0010 §D (Decision process) с вопросом "остаётся Vertical Module или становится Shared Business Module".
- **Архитектурная очевидность**: capability явно принадлежит Platform Services по критерию Раздела 4.1–4.2 этого документа (например, идентичность, доступность, время — не доменная бизнес-логика конкретной отрасли), независимо от текущего числа вертикалей, которые её используют.
- **Стоимость разделения**: повышение выполняется, только если стоимость поддержки единого shared-модуля с конфигурацией ниже, чем стоимость двух параллельных vertical-specific реализаций (Filter 15, Cost of Ownership) — это защита от преждевременного обобщения, отдельно зафиксированного как риск в §11 этого документа ("Преждевременное обобщение").
- **Compliance Review при повышении**: повышение модуля из Vertical в Shared — значимое архитектурное решение и должно проходить Core Compliance Review (Core Laws §20), а не выполняться неявно в рамках обычной feature-задачи.

---

## 16. Platform vs Vertical Product

**Статус: FACT.** Раздел синтезирует, а не переопределяет, уже принятую многоуровневую модель из `platform-foundation-roadmap.md` §4 (Core Platform / Platform Services / Vertical Products) и ADR 0010 §A (Level 1 / Level 2 / Level 3). Новых уровней не вводится.

### 16.1. Core Platform

Единственный источник истины о том, кто есть кто, где, и что ему разрешено — для любой вертикали без исключения. Identity, Authentication, Authorization (RBAC + RLS), Tenant, Location, Roles, Permissions, Audit. 100% обязательное переиспользование (Law 10, Law 11.2, Law 11.3). См. Раздел 4.1 этого документа и `platform-foundation-roadmap.md` §4.1.

### 16.2. Shared Modules (= Platform Services + Shared Business Modules)

Возможности, нужные нескольким вертикалям, но не являющиеся идентичностью/правами. `platform-foundation-roadmap.md` делит их дальше на инфраструктурные Platform Services (Entitlements, Module Registry, Notifications, Event Bus, Billing, Customer Portal, AI Platform, Integrations, Admin Console, Localization) и продуктово-видимые Shared Business Modules (Booking, CRM, Inventory, Workforce — в мере переиспользования за пределами одной вертикали). Это различие важно для планирования (кто строит и в каком порядке — `platform-foundation-roadmap.md`), но для целей Platform vs Product обе категории — "Shared", в противовес Vertical-специфике. См. Раздел 4.2 этого документа.

### 16.3. Vertical Packages (= Level 1 top-level module + Level 2 capabilities, ADR 0010 §A)

Отраслевая доменная модель конкретной вертикали: Recipes/Manuals (Cafe), будущие Construction Projects/Sites/Media Diary. Не подходит для переиспользования за пределами вертикали по определению — если возникает переиспользование, см. Раздел 15 (Shared Module Promotion). Соответствует Level 1 (top-level module, если вертикаль вводит новый module_code) и Level 2 (capability внутри существующего модуля, если вертикаль расширяет уже существующий Level 1 модуль — как Salon/Clinic расширяют Booking) из ADR 0010 §A.

### 16.4. Customer Configuration (= Level 3, ADR 0010 §A)

Данные, а не код: значения, которые различаются по tenant/location без изменения того, какой код исполняется. Shift types, часы работы, branding, locale, лимиты, location-specific defaults (ADR 0010 §A, Level 3). Это единственный уровень, где клиентские различия MUST решаться (Law 11) — любое различие, которое нельзя выразить через Customer Configuration, обязано подняться на уровень Vertical Package (новая capability) или быть отклонено как tenant-specific fork (ADR 0010 §C, class 7).

### 16.5. Сводная таблица

| Уровень | Кто переиспользует | Что определяет | Источник |
|---|---|---|---|
| Core Platform | Все вертикали, без исключения | Identity, права, tenant/location boundary, audit | `platform-foundation-roadmap.md` §4.1; Law 10, Law 11.2, 11.3 |
| Shared Modules | Две и более вертикали | Booking, Inventory, CRM, Notifications, Entitlements и др. | `platform-foundation-roadmap.md` §4.2; Раздел 4.2, 15 этого документа |
| Vertical Packages | Одна вертикаль (Level 1/2) | Recipes, Projects/Sites, отраслевой workflow | ADR 0010 §A (Level 1, Level 2); Раздел 4.3 этого документа |
| Customer Configuration | Один tenant/location (Level 3) | Значения без изменения кода | ADR 0010 §A (Level 3); Law 11 |

---

## 17. Build Decision Flow

**Статус: FACT (компоновка), классификация — прямая производная ADR 0010 §B и Раздела 4 этого документа.** Дерево не вводит новых категорий решений — оно последовательно применяет уже принятую четырёхкатегорийную модель модулей (Раздел 4) и семиклассовую классификацию клиентских запросов (ADR 0010 §B) в виде процедуры.

```
Новая идея / запрос
       │
       ▼
Проходит ли Decision Filters 1–16? (Core Laws §8, особенно Filter 1 Purpose Fit,
Filter 2 Problem Evidence, Filter 6 Simplicity Test)
       │
       ├─ FAIL без права на EXPERIMENT ──────────────────────► REJECT
       │
       ▼ PASS / PASS WITH CONDITIONS / EXPERIMENT
Это Core Platform? (identity, права, tenant/location boundary,
затрагивает "кто есть кто, где, что разрешено")
       │
       ├─ ДА ─────────────────────────────────────────────────► Core Platform
       │                                                          (Раздел 16.1)
       ▼ НЕТ
Нужно двум и более вертикалям, или явно инфраструктурный
Platform Service (навигация, уведомления, тарификация, аудит)?
       │
       ├─ ДА ─────────────────────────────────────────────────► Shared Module
       │                                                          (Раздел 16.2, 15)
       ▼ НЕТ
Расширяет существующий top-level модуль (Level 2, ADR 0010 §A)
или требует нового top-level модуля (Level 1) для одной вертикали?
       │
       ├─ ДА ─────────────────────────────────────────────────► Vertical Module
       │                                                          (Раздел 16.3)
       ▼ НЕТ
Можно решить значением, которое не меняет исполняемый код
(shift types, часы, branding, лимиты — Level 3, ADR 0010 §A)?
       │
       ├─ ДА ─────────────────────────────────────────────────► Customer
       │                                                          Configuration
       │                                                          (Раздел 16.4)
       ▼ НЕТ
Функциональность, которую типично уже покрывает внешняя система
клиента (POS, бухгалтерия, payroll — Раздел 4.4, 3 этого документа)?
       │
       ├─ ДА ─────────────────────────────────────────────────► Integration
       │                                                          (Раздел 4.4)
       ▼ НЕТ
Удовлетворяет только `if tenantSlug === 'X'` / permanent
tenant-specific логика (ADR 0010 §C)?
       │
       ├─ ДА ─────────────────────────────────────────────────► REJECT
       │                                                          (class 7, ADR 0010 §B)
       ▼ НЕТ
Есть гипотеза, ограниченная область, срок и критерий остановки,
но недостаточно доказательств для постоянного решения?
       │
       ├─ ДА ─────────────────────────────────────────────────► EXPERIMENT
       │                                                          (class 6, ADR 0010 §B;
       │                                                          Core Laws §9)
       ▼ НЕТ
                                                                  ► DEFER
                                                                  (недостаточно
                                                                  срочности/доказательств,
                                                                  Core Laws §9)
```

Этот decision flow — процедурное представление уже принятых источников (Decision Filters, четырёхкатегорийная модель модулей Раздела 4, ADR 0010 §B classification, Core Laws §9 Decision Results), а не новая политика. Любое расхождение между этим деревом и указанными источниками должно разрешаться в пользу источников — дерево неавторитетно само по себе.

---

## 18. Success Metrics

**Статус: FACT (только качественные критерии, ничего не изобретено).** Core Laws §21.2 (Слабость 6) явно фиксирует, что Core Laws намеренно не задают универсальные KPI, поскольку метрики зависят от вертикали, роли, модуля и стадии продукта. Поэтому раздел ниже приводит только **качественные** критерии, выводимые из Filter 14 (Measurement), Filter 15 (Cost of Ownership), Filter 12 (Progressive Complexity) и DNA 9 (одна согласованная операционная реальность) — не бизнес-метрики (revenue, MRR, churn), которых ни один источник этого репозитория не утверждает как принятые портфельные KPI.

| Критерий | Что оценивает | Источник |
|---|---|---|
| **Reuse** | Доля новой вертикали/модуля, построенная на существующих Core Platform + Shared Modules, а не написанная заново | Law 10, Law 11; Раздел 13 (Reuse before Rewrite) |
| **Maintainability** | Соответствует ли решение Law 7 (One Operational Truth) — есть ли один system of record, нет ли расхождения данных между модулями | Law 7; Filter 10 (Data Integrity) |
| **Onboarding Cost** | Сколько типов конфигурации и решений требуется от нового клиента до первого рабочего результата | DNA 7 (Progressive Complexity); Filter 12 |
| **Configuration Complexity** | Растёт ли число настроек быстрее, чем понятность продукта — риск, отдельно зафиксированный как "Configuration и Simplicity" конфликт | Core Laws §21.3 ("Configuration и Simplicity"); Law 11 |
| **Architecture Consistency** | Использует ли новый модуль общую identity/roles/navigation/audit модель без создания параллельной | DNA 9; Law 10 |
| **Cost of Ownership over Time** | Понятны ли стоимость разработки, поддержки, миграций, документации, обучения и support на годы вперёд, а не только на запуск | Filter 15 |
| **Explainability of Decisions** | Может ли Founder/CTO проследить, почему модуль или вертикаль получили текущий приоритет (Now/Next/Later/Future/Never), опираясь на зафиксированные источники, а не память | Law 5 (Explainability Proportional to Consequence), применённое к портфельным, а не только продуктовым решениям |

Как и в остальных разделах этого документа: там, где для конкретной вертикали или модуля нет ни одного из этих качественных сигналов, статус должен явно оставаться **[ГИПОТЕЗА]** или **OPEN QUESTION**, а не молчаливо считаться "успешным".
