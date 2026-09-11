# ORUWA Browser Visual / UX / Copy / Product Audit

**Дата аудита:** 2026-09-10  
**Поверхность:** `https://preview.oruwa.jp`  
**Режим:** независимый read-only browser audit  
**Роли:** Manager и Staff  
**Основной язык:** JA; дополнительный: EN

## 1. Executive Verdict

ORUWA Cafe уже выглядит как связный рабочий продукт, а не набор прототипов. Сильнейшие стороны — единая спокойная визуальная тональность, понятные входы в ключевые модули, реальная двусторонняя связка Manager/Staff и особенно перспективный модуль Operations.

Главная проблема перед масштабированием UI: продукт вырос быстрее, чем его системные правила. Одни и те же сущности показываются разными словами и разными видами компонентов; модальные окна стали заменять полноценную информационную архитектуру; статусы, метаданные и действия визуально конкурируют; JA/EN-режим не гарантирует один язык для пользовательского содержимого; accessibility-поведение модалей не завершено.

**Verdict: B — READY WITH REQUIRED PRECONDITIONS.**

До реализации Design System v1 нужно закрыть четыре обязательных условия:

1. единый Modal/Dialog contract с focus trap, Escape, возвратом фокуса и mobile-layout;
2. единая модель Status / Metadata / Action;
3. согласованный словарь ключевых терминов JA/EN и корректное pluralization;
4. компактный Operations pilot без изменения бизнес-логики.

После Design System Foundation + Operations pilot продолжать WP2–WP5 можно: **YES WITH CONDITIONS**.

## 2. What Was Actually Tested

### VERIFIED в браузере

- Staff dashboard: JA и EN.
- Staff schedule: текущая неделя, легенда, пустые ячейки.
- Staff account menu и переключение JA/EN.
- Staff Recipes: список в EN.
- Staff Inventory: mobile, поиск/фильтры/сортировка и карточки остатков.
- Staff Purchasing: JA, статусы куплено/не куплено.
- Staff Mail: JA, переписка, поле ответа, меню действий.
- Staff Operations: список Today, открытие task detail, checkbox/numeric items, problem actions, completed item в списке.
- Manager dashboard: JA и EN.
- Manager schedule: desktop.
- Manager Needs attention: correction, exchange, review-all.
- Manager Inventory: desktop table.
- Manager Purchasing: список.
- Manager Staff management: список и карточка сотрудника.
- Manager Recipes: список и открытие detail.
- Manager Operations: Templates → template detail → Today → Attention.
- Viewports: 1440×900, 768×1024, 375×667, 320×667.
- Keyboard: реальный Tab-проход в Staff Mail и Manager Operations.
- Console: на проверенной Manager-сессии новых warning/error не наблюдалось.

### NOT TESTED

- Создание/изменение/удаление данных: намеренно не выполнялось.
- Полный cross-role mutation workflow с reload/persistence.
- Offline/PWA/LIFF container и mobile keyboard при отправке формы.
- Screen reader и формальный contrast measurement.
- Completed Operations task detail: completed item был виден, но detail не открывался.
- Error/loading states, требующие искусственного network failure.
- Browser matrix вне использованного Chrome.

**QA residue, созданный этим аудитом:** отсутствует.

## 3. Overall Product Score

| Критерий | Score | Evidence | Что даст +1 |
|---|---:|---|---|
| Visual quality | 7/10 | Спокойная палитра, аккуратные cards, хорошая базовая типографика | Убрать modal-within-modal и визуальный шум badges |
| Consistency | 5/10 | Общая стилистика есть, но `仕入れ/購入`, разные list/table patterns, raw enum | Зафиксировать component contracts и terminology glossary |
| Modern SaaS feel | 7/10 | Быстрые dashboard entry points, attention summary, contextual panels | Перевести крупные workflows из вложенных popup в устойчивые surfaces |
| Premium feel | 6/10 | Manager dashboard выглядит профессионально | Удалить QA residue, исправить copy/pluralization и смешанные языки |
| Manager usability | 6/10 | Главные зоны доступны быстро | Снизить длину страницы и повторяемость attention, улучшить IA |
| Staff usability | 7/10 | Большие основные кнопки, ясный Work status | Сократить Operations task и сделать schedule читаемее на mobile |
| Mobile usability | 6/10 | Нет горизонтального overflow на 320/375px | Убрать двойной scroll, увеличить 24/32px targets, sticky task actions |
| Japanese UX/copy | 6/10 | Большая часть JA естественна | Исправить `実施時刻 … まで …`, raw `part_time`, единый термин Purchasing |
| English UX/copy | 5/10 | Основная навигация переведена | Убрать `request(s)`, `warning(s)`, смешанный user content без ясного режима |
| Accessibility | 4/10 | Dialog получает начальный фокус, labels в основном присутствуют | Focus trap/return, 44px touch targets, focus-visible и contrast audit |
| Functional confidence | 6/10 | Модули открываются и отображают реальные состояния | Пройти mutation → reload → counterpart-role acceptance |
| Demo readiness | 6/10 | Schedule, Inventory и Operations дают сильный сценарий | Очистить QA content и привести demo data к одной истории дня |
| Commercial trust | 6/10 | Продукт уже демонстрирует реальную операционную ценность | Устранить счётчики, raw codes, старые даты и противоречивые статусы |
| Design-system readiness | 6/10 | Повторяющиеся primitives и patterns уже хорошо видны | Зафиксировать contracts до WP2–WP5 |

## 4. Visual System Audit

### Buttons

OBSERVED: основные action buttons имеют стабильную форму и высоту 44px; Staff `Clock in` хорошо выделен. Однако `?` имеет 24×24px, close обычно 32×32px, tabs Operations — 36px. На touch-экране это слишком мало. Destructive actions в Recipe list и Staff detail визуально слишком доступны рядом с обычным edit.

RECOMMENDATION: Button system должен различать Primary, Secondary, Quiet, Destructive, Icon и Segmented. Для mobile target — не менее 44×44 CSS px; иконка может оставаться визуально 16–24px внутри target.

### Cards / surfaces

Dashboard cards помогают группировать Schedule, Settings и Attention. В Operations task появляется card-inside-modal-inside-modal: это создаёт двойные рамки, двойной scroll и ощущение интерфейса внутри интерфейса.

### Forms

Labels обычно присутствуют. В Manager Staff detail form понятен, но блок `危険な操作` расположен в том же основном потоке, что редактирование профиля. В Operations numeric item одновременно показывает input, threshold message, Save и problem action — слишком много решений на один элемент.

### Badges / status

Статусы (`Overdue`, `Critical`, `Required`, `No response yet`) визуально оформлены одинаково с обычной metadata (`Due`, category, location). В результате task card выглядит как коллекция равноправных pills. Design System должен жёстко разделить:

- **Status:** состояние, требующее интерпретации или действия;
- **Severity:** critical/warning;
- **Metadata:** due time, category, location;
- **Count:** число элементов;
- **Tag:** пользовательская классификация.

### Modals / popups

P1: modal используется как основной navigation container почти для всех модулей. В Staff Operations task на 375px одновременно видны два scrollbar; detail занимает почти весь экран и содержит длинный вертикальный checklist. В обоих проверенных dialog focus после Tab выходит на элементы страницы за overlay.

### Tables / lists

Manager Schedule и Inventory подходят desktop-режиму. Staff Schedule технически помещается на 375px без горизонтального overflow, но текст и значения становятся слишком мелкими для быстрой проверки на ходу. Это не адаптация таблицы, а её уменьшение.

### Navigation

Пять верхних entry points понятны, но active location визуально слабая: пользователь видит dashboard под открытым modal и должен помнить контекст. Для Manager гипотеза «information-dense desktop SaaS» верна. Для Staff — «mobile-first operational UI» также верна; текущий продукт частично следует ей, но Schedule и Operations detail ещё наследуют desktop density.

## 5. Manager UX Audit

### Child-clarity test

| Вопрос | Оценка | Evidence |
|---|---|---|
| Кто сегодня работает? | PARTIAL | Schedule виден сразу, но текущая неделя практически пустая и нет отдельного Today roster |
| Что требует внимания? | PASS | `要確認` виден сверху |
| Что произошло? | PARTIAL | Attention показывает события, но Operations повторяет 14 похожих записей |
| Что нужно сделать? | PASS | Review/Resolve/Approve/Reject доступны |
| Где сообщения сотрудников? | PASS | Mail и Operations Attention |
| Где inventory problem? | PASS | отдельный shortage entry |
| Где shift request? | PASS | Shift exchange/correction entries |
| Где Operations issue? | PASS | Operations → Attention |
| Как исправить ситуацию? | PARTIAL | action виден, но последствия Resolve и связи с task не всегда ясны |

### Главные выводы

- Dashboard имеет хорошую hierarchy: entry points → attention → schedule.
- Badge `9` конфликтует с подписью `4 require action · 4 warning(s)` — фактически Mail учитывается отдельно, но интерфейс это не объясняет.
- Manager page высотой около 1921px при 900px viewport: Settings и requests находятся далеко ниже ключевого dashboard.
- Staff management показывает raw `part_time` в японском UI.
- Shift exchange показывает `Shift change → 2`, то есть внутренний code вместо понятного названия смены.
- Recipe list показывает `削除` на каждой строке; для частого просмотра это избыточный destructive affordance.

## 6. Staff UX Audit

### Persona test

| Задача | Оценка | Evidence |
|---|---|---|
| Когда работает | PARTIAL | schedule есть, но при пустой неделе нет next-shift summary |
| Что сделать сейчас | PASS | Work status и Operations доступны сверху |
| Выполнить checklist | PARTIAL | понятные inputs, но длинный task и повторяющиеся problem buttons |
| Сообщить проблему | PASS | item-level и task-level actions видны |
| Запросить изменение смены | PARTIAL | открывается из shift detail; в пустой неделе discoverability низкая |
| Найти рецепт | PASS | отдельная большая кнопка и поиск |
| Выполнить inventory action | PASS | остаток редактируется в Inventory |
| Понять, что завершено | PARTIAL | Completed виден в списке, detail не проверен |
| Понять, что требует внимания | PASS | Overdue/Critical/missed показаны текстом, не только цветом |

### Главные выводы

- Home layout удачен для молодого part-time staff: крупные кнопки и минимум навигационных уровней.
- Schedule на mobile визуально слишком мелкий, хотя overflow отсутствует.
- Operations task предъявляет пользователю до четырёх статусов/метаданных на item и отдельную кнопку Report problem для каждого item; скорость выполнения снижается.
- Inventory card показывает `−177 pcs` как shortage при reorder point 50 и current 23: арифметика отражает пополнение до target, но слово «недостаток» может восприниматься как нехватка до порога. Нужна ясная copy-модель: `補充目安 177 pcs` / `Suggested restock 177 pcs`.
- Mail содержит видимые русские и английские QA-сообщения. Это не баг модуля, но demo trust breaker.

## 7. Mobile / LINE UX

VERIFIED:

- 375px и 320px: document-wide horizontal overflow отсутствовал.
- Staff home сохраняет понятную структуру.
- Operations task занимает 360px ширины при 375px viewport.

P1:

- два scrollbar в Staff Operations detail;
- title смешанного JA/EN контента переносится на 3 строки и съедает верх экрана;
- основные bottom actions находятся после длинного checklist и не sticky;
- `?` 24px, `×` 24–32px;
- background page остаётся в tab order;
- table schedule слишком мелкий для быстрого mobile scanning.

LIFF/PWA остаются NOT TESTED. До заявления mobile-ready нужен отдельный acceptance в iOS Safari, Android Chrome и реальном LIFF webview.

## 8. Operations Deep Audit

### Manager flow

| Step | Status | Наблюдение |
|---|---|---|
| Templates | PASS | список, Active/Retired и Add доступны |
| Items | PASS | тип ответа, Required/Critical и actions видны |
| Scheduling | PASS | schedule detail виден внутри template |
| Today | PASS | tasks и статусы отображаются |
| Attention | PARTIAL | 14 событий, много generic `タスク`, слабая различимость |
| Resolve | PARTIAL | кнопка есть, mutation не выполнялась |

### Staff flow

| Step | Status | Наблюдение |
|---|---|---|
| Today task list | PASS | due/status/issue count видны |
| Open task | PASS | detail открывается |
| Respond to items | PARTIAL | controls видны, submission не выполнялся |
| Report problem | PARTIAL | действия видны, submission не выполнялся |
| Complete task | PARTIAL | кнопка есть, completion не выполнялся |
| Completed/read-only | NOT TESTED | completed row виден, detail не проверен |

### Как сделать быстрее без изменения backend

1. Один summary header: status + due + progress (`1/3`) вместо 3–4 равноправных pills.
2. Metadata (`category`, `due`) вывести простой строкой, не badges.
3. Item action `Report problem` спрятать в компактную secondary action; раскрывать reason field после нажатия.
4. Для checkbox item сохранять мгновенно и показывать короткий inline confirmation.
5. Для numeric item объединить input, unit, threshold и save state в одну строку.
6. Sticky footer: `Report problem` secondary, `Complete task` primary.
7. Mobile task detail — один full-screen sheet, не nested modal.
8. Attention группировать по task/date/type и сворачивать повторяющиеся missed events.

## 9. JA Copy Audit

| Screen / component | Current JA | Problem | Recommended JA | Reason |
|---|---|---|---|---|
| Manager Operations Today | `実施時刻 07:30 まで 08:30` | Неестественный диапазон | `実施時間 07:30〜08:30` | Нормальная японская запись времени |
| Staff/Manager Purchasing | Nav `仕入れ`, dialog `購入` | Один workflow назван двумя словами | Для кафе: `仕入れ` везде | `仕入れ` точнее для закупки запасов бизнесом |
| Staff management | `part_time` | Внутреннее значение БД | `アルバイト・パート` | Понятно японскому менеджеру |
| Manager Attention | `対応が必要 4件 · 注意事項 4件`, badge `9` | Сумма не совпадает | `対応 4件・確認 4件・未読 1件` | Объясняет все 9 элементов |
| Operations content | `名称（日本語）（English Name）` в одной строке | Повтор и перегрузка | Показывать выбранный язык; второй — по явному toggle | Быстрее сканируется |
| Staff Inventory | `不足 −177 pcs` | Похоже на физический deficit, но это amount-to-target | `補充目安 177 pcs` | Точнее отражает действие |
| Manager destructive area | `危険な操作` | Сильный технический оттенок | `利用停止・削除` | Называет реальные действия |

## 10. EN Copy Audit

| Screen / component | Current EN | Problem | Recommended EN | Reason |
|---|---|---|---|---|
| Needs attention | `1 correction request(s)` | Непрофессиональное pluralization | `1 correction request` | Естественный EN |
| Needs attention | `4 warning(s)` | Непрофессиональное pluralization | `4 warnings` | Естественный EN |
| Inventory | `4 item(s) require restocking` | Непрофессиональное pluralization | `4 items need restocking` | Короче и естественнее |
| Shift exchange | `Shift change → 2` | Raw internal code | `Shift change → 07:00–17:00` или label | Пользователь понимает результат |
| Staff Operations | `Due 07:30 until 08:30` | Неестественно | `Due window: 07:30–08:30` | Ясный диапазон |
| Inventory | `Shortage −177 pcs` | Семантически неоднозначно | `Suggested restock: 177 pcs` | Связывает число с действием |
| Staff schedule | `Published schedule` | Модель publish не объяснена и может не существовать как отдельный шаг | `Shift schedule` | Не обещает лишний lifecycle |

## 11. Accessibility Findings

### VERIFIED issues

- **P1:** focus trap отсутствует. В Staff Mail и Manager Operations после обхода элементов Tab фокус переходит на фон страницы.
- **P1:** close/help/tab targets меньше рекомендуемого mobile target.
- **P2:** некоторые interactive list rows представлены focusable `LI`, что может быть неожиданно для assistive technology.
- **P2:** фон визуально затемнён, но body остаётся `overflow: visible`; вместе с nested modal это создаёт конкурирующую прокрутку.
- **Positive:** dialogs получают начальный фокус; controls в основном имеют accessible names; критические состояния представлены текстом, не только цветом.

WCAG PASS не заявляется: контраст, screen reader и полный keyboard matrix не проверялись.

## 12. Functional Reality Audit

| Function | Classification | Evidence |
|---|---|---|
| Language switch JA↔EN | PASS | Manager и Staff chrome изменился сразу |
| Staff module navigation | PASS | Recipes/Inventory/Purchases/Mail/Operations открылись |
| Manager module navigation | PASS | Все пять entry points открылись |
| Staff Operations read | PASS | list и task detail открылись |
| Manager Operations read | PASS | Templates/Today/Attention/detail открылись |
| Schedule navigation | NOT TESTED | кнопки видны, week change не выполнялся |
| Inventory count mutation | NOT TESTED | данные не менялись |
| Purchase mutation | NOT TESTED | `購入済み` не нажималось |
| Recipe CRUD | PARTIAL | list/detail открылись; CRUD не выполнялся |
| Staff management mutation | NOT TESTED | form открыт, save/deactivate не выполнялись |
| Correction decision | NOT TESTED | Approve/Reject не нажимались |
| Shift exchange decision | NOT TESTED | actions видны, не выполнялись |
| Operations resolve/complete | NOT TESTED | actions видны, не выполнялись |
| Persistence after reload | NOT TESTED | mutation не выполнялась |

## 13. Cross-role Workflow Audit

Browser показал обе стороны существующих flows, но не доказал полный mutation cycle.

- Staff Mail ↔ Manager Mail: **PARTIAL** — существующая переписка видна, новая отправка не выполнялась.
- Staff correction → Manager decision → Staff result: **PARTIAL** — Manager request виден, решение не выполнялось.
- Staff exchange → Manager decision → Staff result: **PARTIAL**.
- Staff Operations issue → Manager Attention → Resolve: **PARTIAL** — обе поверхности существуют, новое событие не создавалось.
- Inventory count → Manager shortage → Purchase → new count: **PARTIAL** — связанные состояния видны, новый цикл не выполнялся.

## 14. Demo / Sales Readiness

### Top demo moments

1. `要確認` как единая точка решений менеджера.
2. Недельный график с shortage markers.
3. Staff mobile Work status + быстрые модули.
4. Inventory reorder point/target/current и связь с Purchasing.
5. Operations Templates → Today → Attention.
6. Recipe JA/EN отображение.

### Demo risks / trust breakers

- русские и технические QA-сообщения в Mail;
- объекты `QAフィクスチャー`;
- пустой текущий schedule и ¥0 labour estimate;
- raw `part_time` и `Shift change → 2`;
- badge 9 при расшифровке 4+4;
- повторяющиеся generic Operations events;
- `request(s)` и `warning(s)`;
- смешанный JA+EN в длинных task names.

### Recommended 10-minute flow

1. Manager dashboard и `要確認` — 1 минута.
2. Schedule и staffing shortage — 1 минута.
3. Staff mobile home — 1 минута.
4. Operations: Manager template → Staff Today task → Manager Attention — 3 минуты.
5. Inventory → Purchasing connection — 2 минуты.
6. Recipe JA/EN — 1 минута.
7. Завершить объяснением multi-tenant/product roadmap — 1 минута.

## 15. Feature Map — Russian Client Explanation

| Area | Block / feature | Role | Что делает | Зачем клиенту | Current status | Demo value |
|---|---|---|---|---|---|---|
| Workforce | Weekly schedule | Manager/Staff | Показывает смены сотрудников по дням | Планировать работу и видеть нехватку людей | Present, read verified | High |
| Workforce | Shift preferences | Staff/Manager | Сотрудник сообщает доступность, менеджер учитывает её | Меньше ручной переписки | Present, mutation not tested | Medium |
| Workforce | Corrections | Staff/Manager | Запрашивает и подтверждает исправления рабочего времени | Контроль ошибок в учёте | Present, cross-role partial | High |
| Workforce | Shift exchange | Staff/Manager | Запрашивает замену/изменение смены и решение менеджера | Быстрее решать отсутствие сотрудника | Present, cross-role partial | High |
| Workforce | Work status | Staff | Фиксирует начало и окончание работы | Актуальная посещаемость | Present, mutation not tested | High |
| Workforce | Staff management | Manager | Управляет профилями, доступом и активностью сотрудников | Единый список команды | Present | Medium |
| Attention | Needs attention | Manager | Собирает запросы, предупреждения и нехватку запасов | Менеджер видит, что нужно решить сейчас | Present | Very high |
| Inventory | Stock check | Manager/Staff | Хранит текущий остаток, reorder point и target | Вовремя пополнять запасы | Present | High |
| Purchasing | Restock list | Manager/Staff | Показывает, что нужно купить и что уже куплено | Не терять закупки | Present | High |
| Recipes | Recipe/manual library | Manager/Staff | Хранит рецепты и инструкции | Стандартизировать качество и обучение | Present | High |
| Translation | JA/EN content | Manager/Staff | Показывает контент сотруднику на выбранном языке | Поддерживать иностранный персонал | Present, browser read verified | High |
| Mail | Manager–Staff messages | Manager/Staff | Личная рабочая переписка | Сохранять контекст договорённостей | Present | Medium |
| Operations | Templates | Manager | Создаёт повторяемые операционные чек-листы | Стандартизировать ежедневную работу | Present | Very high |
| Operations | Scheduling | Manager | Назначает время и повторение checklist | Автоматически готовить ежедневные задачи | Present | High |
| Operations | Today | Manager/Staff | Показывает задачи на сегодня и их состояние | Понимать, что выполнить сейчас | Present | Very high |
| Operations | Checklist execution | Staff | Записывает checkbox/numeric/text ответы | Подтверждать выполнение стандартов | Present, mutation not tested | Very high |
| Operations | Problem reporting | Staff | Сообщает проблему по item или задаче | Быстро эскалировать отклонение | Present, mutation not tested | High |
| Operations | Attention/Resolve | Manager | Собирает пропуски и проблемы для решения | Не пропускать критические события | Present, resolve not tested | Very high |
| Settings | Staffing/shift types | Manager | Настраивает нормы людей и типы смен | Подготовить расписание под конкретное кафе | Present | Medium |

## 16. ORUWA Design System v1 Requirements

### Foundations

- Semantic color roles: surface, text, border, action, success, warning, danger, info, muted.
- Type scale отдельно проверенная для JA и EN; не уменьшать Staff table ниже читаемого уровня.
- Spacing scale и layout primitives вместо случайных gaps.
- Radius/elevation levels: page surface, card, floating dialog — максимум три уровня.
- Density modes: Manager compact/comfortable; Staff touch-first.
- Responsive contracts для 320, 375, 768 и desktop.
- Focus-visible, focus trap, focus return, Escape и scroll lock как обязательная часть dialog contract.
- Motion минимальная и функциональная: open/close, save feedback, status change.

### Evidence-based primitives

Button, IconButton, Input, NumberInput, Textarea, Select, Checkbox, Badge, StatusLabel, MetadataText, Card, Alert, Modal/Sheet, ConfirmDialog, Menu, Tooltip/Help, SegmentedControl, Toast/InlineSaveState, EmptyState, DataTable, SearchField.

### Patterns

- AppHeader + account/language menu.
- Module entry grid.
- AttentionSummary + AttentionRow.
- ManagerDataTable.
- StaffTaskCard.
- ChecklistItem by response type.
- StickyActionFooter.
- Filter/Search toolbar.
- Entity list → detail surface.
- DestructiveActionZone.
- StatusSummary / ProgressSummary.

## 17. P0/P1/P2/P3 Prioritized Findings

### P0

Нет browser-visible проблемы, которая доказанно ведёт к потере данных или полностью блокирует показ продукта. Mutation/security scope не проверялся.

### P1

| Finding | Impact | Effort |
|---|---|---|
| Dialog focus выходит на фон | HIGH | M |
| Nested Operations modal и двойной mobile scroll | HIGH | M |
| Operations Attention: 14 повторов и generic `タスク` | HIGH | M |
| Mixed-language content без ясной presentation policy | HIGH | M |
| Badge 9 не объясняется суммой 4+4 | HIGH | XS |
| Raw `part_time` и shift type IDs | HIGH | XS/S |
| Английское `request(s)/warning(s)/item(s)` | MEDIUM | XS |
| 24/32px mobile targets | HIGH | S |
| Demo загрязнено QA fixture/messages | HIGH | S (data/process) |

### P2

- Staff schedule mobile слишком мелкий.
- Destructive actions слишком заметны в Recipe/Staff flows.
- Metadata выглядит как status badge.
- Operations action footer не sticky.
- `不足` не объясняет amount-to-target.
- Длинная Manager page требует лучшей section navigation.
- Нет видимого last-refresh/data freshness indicator для operational screens.

### P3

- Выравнивание дат и использование `〜`/en dash.
- Унификация иконок и avatar initials.
- Уменьшение декоративных nested borders.

## 18. Top 10 Quick Wins

| Problem | Change | Impact | Effort | Why now |
|---|---|---|---|---|
| `request(s)` | Locale-aware pluralization | MEDIUM | XS | Сразу повышает доверие |
| 9 ≠ 4+4 | Показать third category unread mail | HIGH | XS | Убирает видимое противоречие |
| `part_time` | Localized label map | HIGH | XS | Убирает raw DB feel |
| Shift `→ 2` | Показывать label/time | HIGH | S | Решение становится понятным |
| `仕入れ/購入` | Выбрать один product term | MEDIUM | XS | Улучшает IA |
| Time range | `実施時間 07:30〜08:30` | MEDIUM | XS | Естественный японский |
| Small `?`/`×` | 44px hit area | HIGH | S | Mobile/accessibility |
| QA messages | Подготовить clean demo dataset | HIGH | S | Непосредственно влияет на продажи |
| Badge overload | Due/category как plain metadata | HIGH | S | Быстрее scanning |
| Task footer | Sticky Complete/Problem actions | HIGH | S/M | Сокращает scroll и ошибки |

## 19. Gap Analysis — What We Forgot

- Empty-tenant/first-run UX: проверенный tenant уже заполнен, onboarding не доказан.
- Demo reset и clean seed: QA residue явно виден клиенту.
- Session expiry recovery: не проверено, что несохранённый form state переживает повторный вход.
- Data freshness: пользователь не знает, когда Attention/Inventory обновились.
- Offline/network failure: особенно важно внутри мобильного LINE webview.
- Mobile numeric keyboard и decimal entry.
- Timezone/date policy: даты в ISO и locale formats смешиваются.
- Translation presentation policy для user-authored bilingual content.
- Support path: Help объясняет конкретные блоки, но нет понятного «не получается — куда обратиться».
- Browser/LIFF/PWA acceptance matrix.
- Accessibility regression checklist до каждого vertical rollout.
- Non-destructive demo cleanup/retire flow.

## 20. Comparison / Benchmarks

- Linear показывает полезный принцип: приоритетные элементы группируются по urgency/ownership, а действия доступны контекстно и с keyboard navigation. Для ORUWA это аргумент в пользу группировки Operations Attention, а не длинного плоского списка. Источник: https://linear.app/docs/my-issues
- Stripe ограничивает произвольную стилизацию компонентов ради consistency и accessibility и использует Home как overview, ведущий в ключевые workflows. Это соответствует сильной части ORUWA Manager dashboard и поддерживает необходимость component contracts. Источники: https://docs.stripe.com/dashboard/basics и https://docs.stripe.com/stripe-apps/design
- SmartHR Design System отдельно фиксирует components, information architecture, writing и multilingual quality; цель — одинаковая usability при росте числа функций. Для ORUWA важен именно этот системный охват, а не копирование внешнего стиля. Источники: https://smarthr.design/ и https://smarthr.design/products/components/
- freee публично связывает единый design system с поддержанием качества и accessibility checklist. ORUWA нужен такой же обязательный QA contract, но меньшего масштаба. Источник: https://www.freee.co.jp/accessibility/
- AirSHIFT различает confirmed, draft, requested и unavailable shift states и уведомляет staff о подтверждённой смене. Это подчёркивает необходимость однозначно назвать lifecycle ORUWA Schedule вместо неясного сочетания `Published schedule` и мгновенных изменений. Источники: https://faq.airshift.jp/hc/ja/articles/115002276412-Air%E3%82%B7%E3%83%95%E3%83%88%E3%81%AE%E3%82%B7%E3%83%95%E3%83%88%E3%81%AE%E7%A8%AE%E9%A1%9E и https://airregi.jp/shift/pdf/faq/sft_manual.pdf

## 21. Recommendation Before WP2

Не начинать общий redesign. Выполнить ограниченный Design System Foundation и использовать Operations как pilot:

1. Modal/Sheet accessibility contract.
2. Button/IconButton/Segmented contracts.
3. Status vs metadata model.
4. JA/EN terminology + pluralization helpers.
5. Operations task compact layout и Attention grouping.
6. Browser acceptance 320/375/768/1440 + keyboard.

Затем перенести только подтверждённые primitives/patterns в новые WP2–WP5 surfaces и обновлять старые экраны on-touch.

## 22. Founder Decisions Required

1. **Schedule lifecycle:** ORUWA имеет отдельное publish/draft состояние или любое сохранение сразу видно Staff? Это влияет на терминологию и trust.
2. **Bilingual user content:** показывать только выбранный язык или JA+EN вместе? Рекомендация — один язык + explicit original toggle.
3. **Cafe v2.2 release gate:** входят ли focus-safe dialogs, clean demo data и Operations compact pilot до продаж? Рекомендация — да.
4. **Operations Attention retention:** показывать все исторические события или только actionable + grouped history? Рекомендация — actionable first, history отдельно.

## 23. Evidence / Screenshot Index

1. `audit-evidence-2026-09-10/01-staff-dashboard-desktop.png`
2. `audit-evidence-2026-09-10/02-staff-operations-desktop.png`
3. `audit-evidence-2026-09-10/03-staff-operations-task-mobile-375.png`
4. `audit-evidence-2026-09-10/04-staff-operations-task-mobile-320.png`
5. `audit-evidence-2026-09-10/05-staff-dashboard-mobile-375.png`
6. `audit-evidence-2026-09-10/06-staff-inventory-mobile.png`
7. `audit-evidence-2026-09-10/07-staff-recipes-mobile-en.png`
8. `audit-evidence-2026-09-10/08-manager-dashboard-desktop.png`
9. `audit-evidence-2026-09-10/09-manager-operations-templates-desktop.png`
10. `audit-evidence-2026-09-10/10-manager-operations-template-detail.png`
11. `audit-evidence-2026-09-10/11-manager-operations-today.png`
12. `audit-evidence-2026-09-10/12-manager-operations-attention-tablet.png`

## 24. QA Residue

Этот аудит не создавал и не изменял данные. В Preview уже присутствовали видимые fixture/QA данные:

- товары с префиксом `QAフィクスチャー`;
- сообщения `QA: PR #444`, `Final QA`, русский текст;
- повторяющиеся Operations events и generic `タスク`;
- старые shift/correction/exchange dates.

Перед клиентским demo нужен отдельный безопасный data-curation процесс. Не удалять их прямым SQL в рамках UX-задачи.

## 25. Final Verdict

**B — READY WITH REQUIRED PRECONDITIONS.**

ORUWA Cafe достаточно зрел, чтобы стать источником требований для Design System v1. Он пока не готов быть «эталоном», который без исправлений копируется в WP2–WP5: тогда modal, status, copy и accessibility debt размножатся во всех будущих vertical products.

После Design System Foundation + Operations pilot:

**YES WITH CONDITIONS** — можно продолжать WP2–WP5, если новые surfaces обязаны использовать зафиксированные component contracts, JA/EN glossary и browser acceptance matrix.

