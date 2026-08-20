# ORUWA Cafe Package v2.1 — полный Founder QA-аудит

**Дата проверки:** 2026-08-17  
**Среда:** `https://preview.oruwa.jp`  
**Тип проверки:** live browser QA + сравнение с прежней Mame To Cha / Surface A + read-only анализ репозитория  
**Итоговый статус:** **FAIL — текущую реализацию нельзя считать готовой к клиентскому релизу**

---

## 1. Краткий вывод для Founder

Новая каноническая реализация правильно движется в сторону настоящего multi-tenant SaaS: используются реальные tenant, location, роли, серверная авторизация и DB-backed данные. Однако при переносе с прежней Mame To Cha / Surface A был потерян значительный продуктовый и визуальный слой.

Сейчас это больше похоже на техническую административную оболочку Workforce, чем на готовое рабочее приложение для японского кафе. Основные ежедневные сценарии разнесены по неочевидным путям, часть старой функциональности отсутствует, перевод рецептов не работает полностью, Inventory падает после успешного сохранения, а одобренная коррекция рабочего времени фактически не изменяет время.

Главная продуктовая рекомендация:

- Staff должен работать непосредственно через `/staff`;
- Manager должен работать непосредственно через `/manager`;
- рецепты должны находиться по прямому пути `/recipes`;
- `/dashboard/workforce` не должен быть обязательным промежуточным экраном для работников кафе;
- Founder/Tenant Admin должен получить отдельный административный контур позднее;
- прежний Mame To Cha UX необходимо использовать как продуктовый ориентир, но не возвращать его небезопасную preview-архитектуру.

Текущий выпуск необходимо остановить до устранения блокеров P1.

---

## 2. Что и как было проверено

### Live Browser

Проверены реальные страницы Preview:

- `/manager`;
- `/staff`;
- `/dashboard`;
- `/dashboard/workforce`;
- `/dashboard/workforce/recipes`;
- `/dashboard/workforce/recipes/[recipeId]`;
- `/dashboard/inventory`;
- `/recipes`;
- попытка доступа Staff к Manager/Admin;
- попытка доступа Manager к Staff без Staff-профиля;
- desktop;
- мобильная ширина, эквивалентная запросу 375 px (фактический browser viewport среды сообщал 416 px, поэтому это ограничение отмечено отдельно).

### Созданные QA fixtures в Preview

Для Staff 鈴木 健太 были созданы:

- shift preference на 2026-08-17: Unavailable;
- work report: 09:00–17:00, перерыв 30 минут, транспорт 123;
- daily message: `QA_AUDIT_STAFF_20260817`;
- correction request: `QA_AUDIT_CORRECTION_20260817 change clock-out to 17:15`;
- Manager назначил custom shift 10:00–14:00, затем изменил окончание на 14:30 и опубликовал;
- Manager одобрил correction request;
- количество кофе было повторно сохранено как 1 kg.

Fixture с опубликованной сменой нельзя удалить через UI после публикации: интерфейс переводит её в read-only. Это необходимо учитывать при очистке Preview.

### Сравнение со старой Mame To Cha

Старый DB-backed live-маршрут Surface A к моменту проверки уже закрыт/удалён. `/mame-to-cha`, `/mame-to-cha/manager`, `/mame-to-cha/recipes` и `/_client-preview/mame-to-cha/manager` не открывают прежний рабочий продукт и возвращают Access denied для проверенного Staff-аккаунта. При этом сохранилась отдельная статическая Mirawi Cafe demo-поверхность:

- `https://preview.oruwa.jp/demo/cafe/staff`;
- `https://preview.oruwa.jp/demo/cafe/manager`;
- `https://preview.oruwa.jp/demo/cafe/recipes`.

Эти три demo-страницы фактически открываются и подходят для визуального/UX-сравнения: branded header, clock-in, насыщенное расписание, Needs review, shortage indicators, auto schedule, publish, labour estimate, Staff/Recipe management, shift types и богатый recipe catalog. Они не являются доказательством работы канонических DB-backed flows: demo использует фиктивные данные Mirawi Cafe и `Reset demo`.

Поэтому сравнение выполнено по пяти источникам:

1. фактическая новая реализация в Preview;
2. сохранённые результаты прежнего Founder Acceptance;
3. предоставленный Founder скриншот старой и новой поверхностей;
4. исходный код Surface A до удаления и текущий код канонических маршрутов;
5. фактически открывающиеся `/demo/cafe/staff`, `/demo/cafe/manager`, `/demo/cafe/recipes` как визуальный reference, но не acceptance environment.

Удаляющий Surface A commit убрал 109 файлов и примерно 14 797 строк. Само удаление было архитектурно запланировано, но новая поверхность пока не восстановила продуктовый паритет.

### Ограничение доказательности

Preview deployment SHA не был показан в пользовательском интерфейсе, поэтому нельзя автоматически утверждать, что live Preview побайтно соответствует локальному `main`. Live-находки основаны на браузере; архитектурные гипотезы и loading-state — на read-only анализе текущего репозитория.

### Повторная проверка с тремя точными учётными записями

После первичного прохода выполнен отдельный последовательный login/logout regression с двумя Staff-аккаунтами и Manager. Пароли не сохранялись и в этот документ не включены.

| Аккаунт | Результат |
|---|---|
| Staff 1 | вход успешен; после login отправлен на технический `/dashboard`; `/manager` корректно возвращает Access denied; QA-fixtures отсутствуют |
| Staff 2 | вход успешен; после login отправлен на технический `/dashboard`; найдены все ранее созданные preference/work report/correction fixtures; опубликованная смена учитывается как 4.5h, но не отображается в таблице |
| Manager | вход успешен; после login также отправлен на `/dashboard`; видит Staff 2 как 鈴木 健太, опубликованную смену, Unavailable preference и Approved correction со старым временем |

Это подтверждает, что fixtures не потерялись: они принадлежат Staff 2. Одновременно подтверждены проблемы post-login routing, отсутствия имени в Staff profile и несогласованного отображения schedule.

---

## 3. Release blockers / P1

### P1-1. Inventory сохраняет данные, затем показывает fatal error

**Фактически воспроизведено:** да.

#### Воспроизведение

1. Staff открывает Inventory.
2. Вводит фактическое количество кофе `1`.
3. Нажимает `Save count`.
4. Запись сохраняется: время последнего обновления изменяется.
5. UI переходит в состояние `Something went wrong`.

#### Console evidence

`TypeError: Cannot read properties of null (reading 'reset')`

#### Ожидаемое поведение

- сохранить значение;
- показать подтверждение;
- обновить карточку без падения;
- сохранить фокус в логичном месте;
- позволить продолжить работу.

#### Фактическое поведение

DB write проходит, но клиент падает после успешного действия. Пользователь не понимает, сохранились данные или нет, и может повторить операцию.

#### Вероятная причина

После server action компонент пытается вызвать `reset()` у уже размонтированной или обнулённой ссылки на форму.

#### Вероятно затронутые файлы

- `apps/web/src/app/(protected)/dashboard/inventory/count-form.tsx`;
- `apps/web/src/app/(protected)/dashboard/inventory/inventory-dashboard-client.tsx`;
- inventory count action/result handling.

#### Цель исправления

Сохранение остатков должно быть безошибочной ежедневной операцией. Это основной рабочий сценарий, а не второстепенная настройка.

---

### P1-2. В канонической версии отсутствует управление рецептами

**Фактически проверено:** да.

На `/dashboard/workforce/recipes` доступны только две опубликованные карточки. Нет:

- Create recipe;
- Edit;
- Delete;
- Archive/Restore;
- Draft/Published management;
- управления категориями;
- запуска/контроля перевода;
- проверки translation lifecycle.

Прямой ожидаемый маршрут `/recipes` возвращает 404.

#### Регресс относительно Mame To Cha

Старая Surface A содержала отдельный recipe manager, категории, Staff recipe management, detail view, translation workspace и server actions. Новая каноническая поверхность показывает только read-only список.

#### Как должно работать

Manager:

1. открывает `/recipes`;
2. создаёт JA-рецепт;
3. сохраняет Draft;
4. запускается одна EN translation;
5. перевод сохраняется отдельно;
6. Manager проверяет/редактирует EN;
7. публикует рецепт;
8. Staff видит только Published;
9. повторное открытие не вызывает новый AI-перевод;
10. новый перевод запускается только после изменения исходного JA;
11. Manager может Archive/Restore и удалить disposable Draft с подтверждением.

#### Цель

Рецепт — рабочая инструкция кафе. Staff должен получать актуальную опубликованную версию, а Manager — управлять жизненным циклом без технических инструментов.

---

### P1-3. Перевод рецептов фактически не работает

**Фактически проверено:** да.

При выборе EN переводится оболочка страницы, но остаются на японском:

- категория `ドリンク`;
- названия `カフェラテ`, `抹茶ラテ`;
- заголовок detail page;
- описание;
- ингредиенты;
- шаги.

Таким образом, Recipe Translation lifecycle невозможно принять: UI управления отсутствует, а опубликованный EN-контент не отображается.

#### Ожидаемая архитектура

- JA — canonical source;
- EN — сохранённая translation revision;
- hash/version исходных полей;
- идемпотентный запуск перевода;
- состояния `not translated`, `translating`, `translated`, `stale`, `failed`;
- ручная проверка Manager;
- Staff получает сохранённый перевод, а не новый AI-вызов при каждом просмотре.

---

### P1-4. Correction request имеет ложную семантику успеха

**Фактически воспроизведено:** да.

Staff отправил просьбу изменить clock-out на 17:15. Manager одобрил запрос, статус стал `Approved`, но attendance остался `09:00 - 17:00`.

#### Причина на уровне продукта

Staff-форма содержит только свободный текст Message. В ней отсутствуют структурированные поля:

- requested clock-in;
- requested clock-out;
- requested break;
- requested attendance status;
- requested transportation;
- причина изменения.

Manager одобряет текст, но системе нечего детерминированно применить.

#### Как должно работать

1. Staff выбирает конкретный work report.
2. UI показывает текущие значения.
3. Staff вводит только изменяемые значения и причину.
4. Manager видит `before → requested after`.
5. Approve транзакционно обновляет attendance/work report и сохраняет audit trail.
6. Reject сохраняет причину.
7. Staff видит конечные применённые значения.

#### Цель

Статус Approved должен означать, что исправление применено, а не только что Manager прочитал сообщение.

---

### P1-5. Manager может назначить смену в день Unavailable без предупреждения

**Фактически воспроизведено:** да.

У 鈴木 健太 была заявка `Unavailable` на 2026-08-17. Manager смог назначить и опубликовать custom shift на тот же день без заметного предупреждения или блокировки.

#### Как должно работать

- ячейка должна заранее показывать preference conflict;
- Assign/Edit dialog должен показывать предупреждение;
- публикация должна показывать общий список конфликтов;
- Manager может осознанно override, но обязан указать причину;
- override записывается в audit log и, в будущем, вызывает уведомление Staff.

#### Цель

Не допустить случайной публикации смен, на которые сотрудник заранее заявил недоступность.

---

### P1-6. Опубликованная смена учитывается в часах, но не показывается Staff

**Фактически воспроизведено под точным Staff 2 аккаунтом:** да.

Manager видит у 鈴木 健太 опубликованную custom shift на 2026-08-17. Staff 2 видит `Scheduled this week: 4.5h`, следовательно assignment загружен и участвует в расчёте. Но таблица `All` и таблица `Only me` показывают прочерк во всех семи днях.

#### Фактическое противоречие

- summary: 4.5h;
- schedule cells: ни даты, ни 10:00–14:30, только `－`;
- Manager cell: `Custom / Published`, также без видимого времени.

#### Риск

Сотрудник не знает, в какой день и во сколько выходить, хотя система считает его назначенным. Это прямой операционный release blocker.

#### Вероятная причина

Расчёт total hours использует assignment напрямую, а построение ячеек не сопоставляет custom shift с локальной датой/сотрудником либо ожидает отсутствующий shift type. В системе одновременно нет настроенных Shift Types, но custom assignment разрешён.

#### Как должно работать

- custom shift всегда отображается по локальной дате location;
- ячейка показывает `10:00–14:30` и status Published;
- `Only me` показывает ту же смену;
- total hours вычисляется из того же view model, что и видимые ячейки;
- тест проверяет инвариант: сумма видимых смен равна weekly total.

---

## 4. Major issues / P2

### P2-1. Неправильная информационная архитектура маршрутов

Текущая цепочка:

`/dashboard` → `/dashboard/workforce` → `/staff` или `/manager` → `/dashboard/workforce/recipes`

Для сотрудника кафе это лишняя платформенная архитектура, которую он не должен изучать.

#### Рекомендуемая модель

| Роль | Основной путь | Назначение |
|---|---|---|
| Staff | `/staff` | смены, заявки, отчёты, attendance, inventory, рецепты |
| Manager | `/manager` | сотрудники, расписание, запросы, attendance, inventory, рецепты |
| Staff + Manager | `/recipes` | опубликованные рецепты; Manager получает management controls |
| Founder/Tenant Admin | `/admin` или `/owner` | locations, modules, memberships, billing, tenant settings |
| Platform operator | отдельный internal route | обслуживание всей SaaS-платформы |

`/dashboard/workforce` можно сохранить как технический module launcher для multi-module SaaS, но не делать обязательной страницей ежедневной работы Cafe. После входа система должна отправлять пользователя на primary workspace по роли.

Повторный login/logout regression подтвердил: оба Staff-аккаунта и Manager после успешного входа попадают именно на `/dashboard`, а не на своё рабочее место.

#### Цель

URL должен отражать пользовательскую задачу, а не внутреннюю структуру модулей.

---

### P2-2. `/dashboard` показывает клиенту незавершённый технический shell

Фактически видны:

- `Read-only tenant administration shell`;
- `Management actions will mount in later phases`;
- disabled Manage locations/modules/invite/billing;
- raw slug, kind, status и module internals.

Это снижает доверие к продукту и выглядит как dev console.

#### Рекомендация

До готовности Founder/Admin продукта:

- не вести работников на `/dashboard`;
- скрыть недоступные будущие возможности;
- заменить технические термины на язык владельца бизнеса;
- показывать только действия, которые реально работают.

---

### P2-3. Inventory потерял autosave, filters и search

Live-проверка показала:

- autosave отсутствует;
- изменение значения без `Save count` не сохраняется;
- нет фильтров All / Need reorder / OK;
- нет Search;
- Staff и Manager работают на одной перегруженной management-странице;
- у Manager есть Add/Edit/Deactivate, но Staff также видит интерфейс, визуально похожий на management surface.

#### Как должно работать

Staff surface:

- быстрый ввод фактического количества;
- debounce autosave либо ясная batch-кнопка `Save all`;
- статус сохранения `Saving… / Saved / Error`;
- filters All / Need reorder / OK;
- поиск;
- крупные touch controls;
- shortage наверху.

Manager дополнительно:

- Add/Edit/Deactivate item;
- target и reorder point;
- units;
- история изменений;
- кто и когда считал.

---

### P2-4. Опубликованная смена становится необратимой через UI

До публикации доступны Edit и Unassign. После публикации отображается `Published -- read-only`, а снять или исправить смену нельзя.

#### Как должно работать

Нужен контролируемый amendment flow:

- `Edit published shift`;
- причина изменения;
- подтверждение;
- audit log;
- уведомление затронутого Staff;
- версия расписания;
- возможность отменить ошибочно опубликованную смену без прямого доступа к БД.

Полная неизменяемость после Publish безопаснее хаотичного редактирования, но непригодна для реальной работы кафе.

---

### P2-5. В расписании Manager не видны часы смены

До открытия Edit ячейка показывает только:

- `Custom`;
- Draft/Published;
- Edit/Unassign.

Время 10:00–14:30 в самой таблице не показано.

#### Ожидаемое поведение

Ячейка должна показывать минимум:

- 10:00–14:30;
- тип смены;
- draft/published;
- конфликт preference;
- предупреждение о пересечении;
- общее количество часов.

---

### P2-6. Staff-сессия не показывает личность вошедшего сотрудника

Точная повторная авторизация доказала:

- Staff 1 корректно имеет пустые QA-списки;
- Staff 2 содержит fixtures 鈴木 健太;
- данные не потерялись;
- оба аккаунта визуально почти неразличимы.

Staff profile показывает только Barista / part_time / Active, но не имя. В расписании используются обезличенные `Me`, `Staff 1`, `Staff 2`. Без отдельного login/logout прохода невозможно было понять, какой Staff открыт.

#### Исправление

Показывать в Staff profile:

- имя;
- location;
- понятную роль;
- безопасно маскированный login identifier;
- кнопку Sign out;
- при нескольких memberships — текущий workspace/tenant switcher.

Для QA Preview полезна отдельная безопасная строка `Test account: Staff A`, но не internal UUID.

---

### P2-7. На рабочих страницах текущего Preview отсутствует Sign out

На `/staff` и `/manager` в live Preview кнопка выхода отсутствует. Для смены пользователя пришлось вручную открыть `/dashboard`, где `Sign out` доступен.

Это особенно критично для общего планшета/компьютера кафе:

- Staff может оставить сессию открытой;
- следующий сотрудник увидит чужие отчёты;
- Manager/Staff testing становится ошибкоопасным;
- пользователь вынужден знать технический маршрут.

В локальном `main` присутствует более новый commit с заявленным sign-out control, но его наличие в live Preview не подтверждено. До deployment и повторного browser QA проблему нельзя считать закрытой.

#### Как должно работать

- видимый Sign out в общем branded header всех рабочих страниц;
- после выхода — `/sign-in`;
- закрытие сессии на сервере;
- на общем устройстве — понятный текущий пользователь;
- никакого хранения пароля в браузерном UI приложения.

---

### P2-8. Auto-distribution непрозрачен и не готов к реальному использованию

UI сообщает о жёстком default: один Staff AM и один Staff PM каждый день. Settings screen отсутствует. Одновременно Shift Types не настроены.

Auto-distribution не запускался в финальном проходе, чтобы не создать 14 лишних назначений и не загрязнить общую Preview-базу.

#### Перед включением необходимо

- требования по количеству Staff на окно/день;
- доступность Staff;
- максимальные часы;
- запрет пересечений;
- роли/skills;
- равномерность нагрузки;
- объяснение результата;
- preview diff до применения;
- undo;
- отдельное Publish.

---

## 5. Визуальное сравнение: Mame To Cha → новая каноническая версия

### Что было сильнее в старой Mame To Cha

- отчётливый Cafe-бренд и визуальная идентичность;
- интерфейс воспринимался как отдельный продукт для кафе;
- продуманная композиция Manager и Staff экранов;
- более богатые карточки и визуальные состояния;
- отдельные management-компоненты для Staff, рецептов, inventory и shift types;
- route-specific skeletons, повторяющие будущую структуру страницы;
- более целостный mobile-first Staff experience;
- управление рецептами и категориями находилось внутри Manager flow;
- пользователь видел предметную область кафе, а не устройство платформы.

### Что стало хуже в новой версии

- generic cream/white admin shell без выраженного характера Cafe;
- много английских технических заголовков внутри JA-режима;
- raw values: `part_time`, slug, kind, module terminology;
- слабая визуальная иерархия;
- слишком много текстовых ссылок и одинаковых белых карточек;
- Manager schedule выглядит как широкая техническая таблица;
- на mobile японские имена и действия сжимаются до вертикального текста по одному символу;
- элементы управления часто ниже рекомендуемых 44×44 px;
- нет устойчивой нижней/верхней навигации по ключевым задачам;
- нет визуально сильных success/error/save states;
- пользователь попадает в platform hub вместо своего рабочего места;
- dashboard содержит обещания будущей разработки и disabled controls;
- рецепты выглядят как минимальный каталог, а не рабочая база знаний.

### Дизайнерская оценка

Новая версия архитектурно серьёзнее, но визуально выглядит как ранний internal MVP. Старую версию нельзя возвращать целиком, однако её дизайн-систему, информационную плотность, Cafe-бренд и task-oriented navigation следует перенести поверх канонического безопасного backend.

### Как должен выглядеть Staff mobile

- компактный branded header: имя, location, язык, sign out;
- bottom navigation: `Today`, `Schedule`, `Inventory`, `Recipes`, `More`;
- главный экран: сегодняшняя смена и ближайшее действие;
- one-tap Clock in/out, если функция входит в scope;
- status cards вместо широкой таблицы;
- расписание как список дней/смен, а не desktop-table внутри горизонтального scroll;
- sticky action для текущей формы;
- поля и кнопки минимум 44 px;
- никакого `Staff 1/Staff 2` без реальных имён и контекста.

### Как должен выглядеть Manager desktop/mobile

- branded workspace с постоянной навигацией;
- Today/Needs attention наверху;
- schedule board с видимым временем;
- отдельные вкладки Staff, Schedule, Attendance, Inventory, Recipes;
- mobile — карточки по дням или сотрудникам, а не сжатая desktop-таблица;
- опасные действия визуально отделены;
- все формы — modal/drawer с корректным focus trap и возвратом фокуса.

---

## 6. Локализация

### Подтверждённые проблемы

В JA остаются английскими или техническими:

- `Workforce staff` / `Workforce manager`;
- `Back to Workforce`;
- My staff profile / Position / Employment type / Status;
- `Barista`, `part_time`, `Active`;
- часть Manager table headings;
- weekdays в отдельных состояниях;
- Dashboard целиком;
- Inventory shell в зависимости от выбранного языка/перехода.

В EN остаётся японским recipe content.

### Требуемая модель

- единый locale на всю рабочую поверхность;
- перевод всех chrome labels;
- enum → localized label, без raw DB values;
- контентные переводы отдельно от UI i18n;
- locale сохраняется между `/staff`, `/manager`, `/recipes`, `/inventory`;
- fallback явно обозначается, а не молча показывает другой язык.

---

## 7. Mobile, accessibility и keyboard QA

### Подтверждено

- горизонтального overflow всей страницы в Staff не обнаружено;
- schedule использует внутренний horizontal scroll;
- Manager mobile table формально помещается через scroll, но практически плохо читается;
- многие controls меньше 44 px;
- JA/EN buttons около 30 px высотой;
- checkbox визуально около 13×13 px;
- часть ссылок недели около 40 px;
- submit buttons около 42 px;
- Add Staff Cancel возвращает focus на `BODY`, а не на кнопку открытия;
- inventory Add Item реализован inline, без семантики dialog;
- формы Staff после успешного submit остаются заполненными, что повышает риск повторной отправки.

### Что необходимо

- keyboard-only walkthrough всех flows;
- видимый focus ring;
- focus trap для modal/drawer;
- возврат фокуса инициатору после Cancel/Save;
- Escape закрывает диалог;
- aria-live для Saving/Success/Error;
- заголовки таблиц и accessible names;
- touch targets минимум 44×44;
- mobile-native представление расписания.

---

## 8. Loading, skeletons и perceived performance

### Факт

При точном входе под Staff 2 общий loading state был фактически виден в браузере:

- `Loading…`;
- `Preparing your workspace.`

Он оставался до завершения server data load, после чего целиком сменился Staff-страницей. Отдельных route-specific skeletons для Staff и Manager нет. При быстрой загрузке этот текст может быть почти незаметен; при медленной — пользователь видит абстрактную пустую оболочку, не похожую на будущий экран.

Старая Surface A имела отдельные skeleton layouts для Staff и Manager, повторяющие header, cards, schedule и actions.

### Как должно работать

- `/staff/loading.tsx` повторяет профиль, today card, schedule и forms;
- `/manager/loading.tsx` повторяет attention cards, roster и schedule;
- `/recipes/loading.tsx` показывает category/list skeleton;
- `/inventory/loading.tsx` показывает filter bar и item rows;
- размеры skeleton совпадают с конечным content, чтобы избежать layout shift;
- при server action используется локальное pending state, а не полностраничный placeholder.

---

## 9. Что прошло проверку

- Staff и Manager требуют аутентификацию;
- Staff не получил Manager/Admin доступ;
- Manager без Staff-профиля не получил чужую Staff-поверхность;
- tenant/location контекст отображается;
- Staff shift preference отправляется;
- Staff work report сохраняет введённые значения;
- correction request создаётся и виден Manager;
- Manager может создать Draft custom shift;
- Manager может изменить Draft shift;
- Manager может опубликовать schedule;
- fixtures корректно разделены между Staff 1 и Staff 2;
- Staff 2 после повторного входа видит preference, work report и Approved correction;
- Inventory shortage определяется: кофе 1 kg при target 5/reorder 2;
- Inventory item names имеют JA/EN перевод;
- Staff видит только опубликованные рецепты;
- All / Only me schedule filter работает;
- переходы по неделям работают;
- Manager attention показывает shortage;
- direct role access в основном fail-closed.

Эти PASS не отменяют release blockers.

---

## 10. Minor issues / P3

- Add Staff содержит одновременно Name, Family name и Given name — модель ввода дублируется и непонятна;
- формы Staff не очищаются после success;
- нет ясного toast/inline подтверждения многих операций;
- schedule row не показывает часы до открытия Edit;
- смешиваются тире, `Not set`, Draft и Published labels;
- week-navigation Manager занимала примерно 1.2–1.3 секунды в измеренном проходе; это не blocker, но переход должен иметь pending feedback;
- главная Staff-страница не показывает имя вошедшего сотрудника;
- post-login redirect для Staff и Manager ведёт на один технический `/dashboard`;
- Sign out отсутствует на live `/staff` и `/manager` и доступен только через `/dashboard`;
- title страницы остаётся общим `LINE Business OS`, без контекста Staff/Manager/Recipes;
- authenticated app почти не требует классического SEO, но нужны корректные title, description, robots/noindex policy и Open Graph для публичных страниц;
- внутренние рабочие маршруты не должны индексироваться поисковиками.

---

## 11. Рекомендуемая целевая функциональная модель

### Staff

Цель: сотрудник за 10–20 секунд понимает сегодняшнюю смену и следующее действие.

Функции:

- Today;
- опубликованный schedule;
- shift preferences;
- shift exchange;
- work report;
- structured correction;
- attendance/clock actions согласно product scope;
- быстрый inventory count;
- published recipes;
- язык JA/EN;
- notifications.

### Manager

Цель: Manager управляет сменой и исключениями без таблиц БД и помощи разработчика.

Функции:

- Needs attention;
- staff lifecycle: add/edit/deactivate/restore/access;
- shift types;
- preferences и conflict warnings;
- draft schedule;
- safe auto-distribution preview;
- publish/amend/notify;
- attendance review;
- structured corrections;
- inventory catalog/count history;
- recipe/category/translation lifecycle;
- audit trail.

### Founder/Tenant Admin

Цель: отдельная управленческая поверхность, не мешающая ежедневной работе Cafe.

Функции будущего этапа:

- locations;
- modules/entitlements;
- memberships/roles;
- billing;
- tenant settings;
- business analytics;
- integrations.

---

## 12. Архитектурные рекомендации

1. Сохранить канонические DB/RLS/server-action слои новой реализации.
2. Не восстанавливать Surface A как параллельный production backend.
3. Перенести сильные UX-компоненты старой реализации поверх канонических loaders/actions.
4. Ввести role-aware post-login routing.
5. Сделать `/recipes` каноническим alias/route, а не вложенным dashboard-путём.
6. Разделить Staff read/count inventory UI и Manager catalog UI.
7. Ввести structured correction schema и транзакционное применение.
8. Ввести schedule versioning/amendment и audit events.
9. Ввести translation state machine с source revision/hash.
10. Добавить route-specific loading, local pending states и error boundaries.
11. Добавить end-to-end acceptance tests для Manager и Staff в изолированных browser contexts.
12. Preview fixtures создавать через idempotent seed/rehearsal script с cleanup, а не вручную.

---

## 13. Порядок исправления

### Этап 0 — зафиксировать product contract

- утвердить прямые маршруты `/staff`, `/manager`, `/recipes`;
- утвердить разделение Worker / Manager / Founder;
- составить parity matrix старой и новой реализации;
- определить обязательный Cafe v2.1 scope.

### Этап 1 — стабилизация блокеров

1. исправить Inventory post-save crash;
2. реализовать structured correction и реальное применение Approve;
3. показать conflict Unavailable при назначении/публикации;
4. вернуть Manager recipe CRUD;
5. восстановить сохранённый EN translation flow.

### Этап 2 — правильные маршруты и навигация

1. добавить `/recipes`;
2. убрать обязательный переход через `/dashboard/workforce`;
3. role-aware redirect после login;
4. скрыть незавершённый admin shell от Staff/Manager;
5. добавить постоянную навигацию рабочих поверхностей.

### Этап 3 — визуальный parity/hardening

1. перенести Cafe brand tokens;
2. переработать Manager mobile schedule;
3. сделать Staff mobile task-first;
4. унифицировать cards/forms/dialogs;
5. исправить размеры controls и focus;
6. добавить route skeletons.

### Этап 4 — Inventory и schedule completeness

1. autosave или Save all с ясным состоянием;
2. All / Need reorder / OK / Search;
3. часы внутри schedule cells;
4. published amendment flow;
5. auto-distribution preview/undo/configuration.

### Этап 5 — полная локализация

1. убрать raw enums;
2. закрыть весь UI chrome JA/EN;
3. проверить recipe content fallback;
4. сохранять locale между маршрутами;
5. провести native Japanese copy review.

### Этап 6 — повторный Founder Acceptance

- два изолированных browser context: Manager и Staff;
- desktop + 375 px;
- новая disposable recipe с JA→EN lifecycle;
- полный CRUD/delete/archive;
- shift conflict/publish/amend;
- inventory save/autosave/filter/search;
- structured correction before/after;
- loading skeletons при искусственно замедленной сети;
- keyboard/focus;
- console/network error audit;
- cleanup всех fixtures.

---

## 14. Граница законченного Cafe v2.1

Cafe v2.1 считается законченным не тогда, когда страницы просто открываются, а когда Staff и Manager могут самостоятельно выполнить полный рабочий день кафе без помощи разработчика и без прямого доступа к базе данных.

### Входит в Cafe v2.1

- отдельный и понятный вход Staff и Manager;
- прямые рабочие маршруты;
- staff profile и безопасная идентификация текущего пользователя;
- Staff schedule;
- shift preferences;
- Manager draft/edit/unassign/publish/amend schedule;
- предупреждения о preference conflicts;
- work report;
- структурированные correction requests;
- Manager approve/reject с реальным применением;
- Inventory count, shortage, filters и search;
- Manager inventory catalog management;
- Recipe/category CRUD;
- Draft/Published/Archived lifecycle;
- JA→EN translation lifecycle;
- Staff published recipe view;
- desktop и mobile 375 px;
- JA/EN UI;
- loading, pending, success и error states;
- keyboard/focus basics;
- tenant/location/role isolation;
- audit evidence и очищаемые Preview fixtures.

### Не должно блокировать Cafe v2.1

Следующие Founder/platform функции могут быть отдельным этапом, если они не показываются Staff/Manager как неработающие обещания:

- billing;
- управление всеми tenant платформы;
- полный module marketplace;
- platform operator console;
- расширенная бизнес-аналитика;
- LINE notifications, если они ещё не включены в утверждённый v2.1 contract;
- сложная AI-оптимизация расписания;
- multi-location Founder dashboard.

### Главное правило scope

Нельзя маскировать отсутствие обязательной Cafe-функции будущей Platform Foundation. И наоборот, Cafe v2.1 не должен ждать реализации всей ORUWA-платформы.

---

## 15. Definition of Done

### Общий DoD релиза

Cafe v2.1 получает PASS только при одновременном выполнении всех условий:

1. Все P1 закрыты и повторно воспроизвести их невозможно.
2. Нет известных потерь/двойной записи данных.
3. Нет необработанных console errors в основных flows.
4. Staff видит каждую свою опубликованную смену с датой и временем.
5. Weekly total равен сумме видимых смен.
6. Approved correction изменяет фактические данные и сохраняет before/after audit.
7. Inventory save не падает и явно сообщает Saved/Error.
8. Manager создаёт, переводит, публикует, архивирует и удаляет disposable recipe.
9. Staff никогда не видит Draft/Archived recipe.
10. Повторное открытие EN recipe не запускает повторный AI translation.
11. Staff не получает Manager/Admin доступ; tenant A не видит tenant B.
12. Прямые `/staff`, `/manager`, `/recipes` работают и имеют Sign out.
13. После login пользователь попадает на правильный primary route.
14. JA и EN не содержат raw enums и случайно смешанных UI labels.
15. Desktop и 375 px проходят Founder Acceptance.
16. Все основные действия доступны с клавиатуры, а dialog focus возвращается инициатору.
17. Loading/pending state заметен и не вызывает layout jump.
18. CI: typecheck, lint, unit/integration tests и build — PASS.
19. Preview deployment — PASS, затем выполнен именно authenticated browser QA.
20. Все disposable fixtures удалены либо перечислены с ответственным и способом очистки.

### DoD Staff

- после login открыт `/staff`;
- видны имя, location, роль и язык;
- сегодняшняя/ближайшая смена понятна без горизонтального поиска;
- schedule показывает время и статус;
- preference сохраняется и виден после reload;
- work report сохраняется один раз и виден после reload;
- correction показывает Pending/Approved/Rejected и конечные значения;
- Inventory и Recipes доступны одним действием;
- Sign out доступен на странице;
- чужие draft shifts, reports и management actions недоступны.

### DoD Manager

- после login открыт `/manager`;
- Needs attention ведёт к конкретной проблеме;
- Staff CRUD и access flows понятны;
- расписание показывает время, conflicts и publication status;
- published shift можно безопасно amend/cancel;
- correction approval применяет новые значения;
- Inventory catalog и counts разделены логически;
- Recipe CRUD и translation lifecycle полностью доступны;
- Sign out доступен на странице;
- destructive actions требуют явного подтверждения и имеют audit trail.

### DoD Recipes

- канонический путь `/recipes`;
- Manager создаёт JA Draft;
- validation защищает от пустых/некорректных данных;
- ровно один перевод создаётся для текущей JA revision;
- EN сохраняется и редактируется;
- изменение JA помечает EN как stale;
- publish требует валидного JA и определённого translation policy;
- Staff видит только Published;
- long text не обрезается без возможности раскрытия;
- Archive/Restore работает;
- hard delete доступен только для разрешённых сущностей и подтверждается.

### DoD Inventory

- Staff быстро вводит count;
- Save/autosave имеет Saving/Saved/Error;
- reload подтверждает persistence;
- All / Need reorder / OK / Search работают совместно;
- shortage выделяется цветом и текстом, не только цветом;
- Manager может Add/Edit/Deactivate/Restore;
- units, thresholds и current quantity валидируются;
- ни один successful write не заканчивается error screen.

---

## 16. Практические пакеты реализации

Каждый пакет должен идти отдельным bounded PR. Нельзя объединять большой visual redesign, schema changes и исправление критического data flow в один PR.

### Work Package 0 — Product contract и маршруты

**Цель:** зафиксировать, какой продукт строится, до изменения UI.

**Работа:**

- утвердить route map `/staff`, `/manager`, `/recipes`;
- определить role-aware redirect;
- определить границу Founder/Admin;
- сделать parity checklist Mame To Cha → canonical;
- определить обязательные и deferred функции v2.1.

**Выход:** короткий ADR/product contract и acceptance matrix.  
**Проверка:** Founder письменно принимает структуру и scope.

### Work Package 1 — Inventory crash hotfix

**Цель:** убрать ситуацию «данные записались, UI упал».

**Работа:**

- исправить lifecycle form ref/reset;
- добавить success/error state;
- добавить regression test на successful action после rerender;
- проверить повторный submit и reload.

**Не включать:** filters, redesign, catalog changes.  
**Проверка:** Staff и Manager сохраняют count 10 раз без console error; DB/UI согласованы.

### Work Package 2 — Role routing, identity и Sign out

**Цель:** каждый пользователь сразу попадает в своё рабочее место и понимает текущую сессию.

**Работа:**

- post-login redirect по роли;
- прямые navigation links;
- `/recipes` route;
- Staff profile name/location;
- shared branded header;
- Sign out на всех рабочих страницах;
- скрыть незавершённый admin shell от Staff/Manager.

**Проверка:** последовательный login/logout Staff 1 → Staff 2 → Manager без ручного ввода технического URL.

### Work Package 3 — Schedule correctness

**Цель:** Staff и Manager видят одно и то же опубликованное расписание.

**Работа:**

- исправить custom shift date/time mapping;
- показывать часы в обеих таблицах;
- единый schedule view model;
- инвариант total hours = visible assignments;
- preference conflict warning;
- tests для timezone Asia/Tokyo;
- draft edit/unassign;
- published amendment/cancel с audit.

**Проверка:** создать shift 10:00–14:30, опубликовать, проверить Staff All/Only me/reload/mobile, затем безопасно изменить или отменить.

### Work Package 4 — Attendance corrections

**Цель:** Approved означает реально применённое исправление.

**Работа:**

- structured requested fields;
- before/after preview;
- transactional approve;
- reject reason;
- audit record;
- Staff final state;
- authorization and idempotency tests.

**Проверка:** 09:00–17:00 → request 17:15 → approve → Staff и Manager видят 09:00–17:15 после reload.

### Work Package 5 — Recipe management и translation lifecycle

**Цель:** вернуть обязательную функциональную полноту рецептов на канонической архитектуре.

**Работа:**

- Manager CRUD;
- categories;
- Draft/Published/Archived;
- canonical `/recipes`;
- translation revision/hash/state;
- saved EN;
- stale detection;
- error/retry;
- Staff published-only read;
- long-text/mobile hardening.

**Проверка:** новый уникальный JA recipe → Save → один EN translation → reload без нового вызова → edit JA → EN stale → retranslate → publish → Staff view → archive → restore → disposable delete.

### Work Package 6 — Inventory completeness

**Цель:** сделать Inventory быстрым ежедневным инструментом.

**Работа:**

- autosave с debounce либо согласованный Save all;
- filters All/Need reorder/OK;
- Search;
- Staff count mode;
- Manager catalog mode;
- mobile controls;
- update history.

**Проверка:** комбинированные filter/search cases, reload persistence, concurrent update и network error.

### Work Package 7 — Cafe UX parity и mobile

**Цель:** вернуть ощущение законченного Cafe-продукта без возврата старой небезопасной архитектуры.

**Работа:**

- Cafe brand shell;
- task-oriented navigation;
- Staff mobile cards;
- Manager responsive schedule;
- dialogs/drawers;
- 44×44 targets;
- focus management;
- route-specific skeletons;
- consistent empty/success/error states.

**Проверка:** visual comparison desktop/mobile, keyboard walkthrough и Founder review.

### Work Package 8 — i18n completion

**Цель:** полноценная японская рабочая версия и предсказуемый EN.

**Работа:**

- весь UI chrome;
- enum labels;
- weekdays/statuses/actions;
- locale persistence;
- content fallback policy;
- native Japanese copy review.

**Проверка:** полный сценарий сначала JA, затем EN без смешанного языка, кроме явно обозначенного fallback content.

### Work Package 9 — Final release gate

**Цель:** доказать готовность, а не предположить её по зелёному CI.

**Работа:**

- automated checks;
- Preview deployment;
- isolated Manager/Staff browser sessions;
- desktop/375;
- console/network audit;
- fixture cleanup;
- evidence report.

**Выход:** один Founder Acceptance документ с PASS/FAIL по каждому DoD пункту.

---

## 17. Regression risks

- возврат старых UI-компонентов может случайно вернуть preview-only actions или обход канонической авторизации;
- новый `/recipes` не должен ослаблять tenant/location/RLS boundaries;
- перевод не должен отправлять секреты или PII во внешний AI API;
- published schedule amendment требует audit trail и notification semantics;
- autosave может создавать гонки и лишние writes — нужен debounce/version handling;
- role-aware redirect не должен блокировать пользователей с несколькими ролями;
- Founder/Admin surface нельзя строить через frontend `service_role`;
- mobile redesign должен сохранить keyboard/table accessibility на desktop.

---

## 18. Итоговое решение

### Release decision

**FAIL / DO NOT RELEASE TO A REAL CAFE YET.**

### Почему

Критические ежедневные операции либо падают, либо отсутствуют, либо подтверждают действие без реального применения. Новая версия безопаснее и каноничнее на уровне платформы, но хуже прежней Mame To Cha как пользовательский продукт.

### Правильная стратегия

Не выбирать между «старой красивой, но preview-specific» и «новой безопасной, но сырой». Нужно объединить:

- каноническую multi-tenant/RLS архитектуру новой версии;
- предметный UX, функциональную полноту и Cafe-идентичность старой версии;
- прямые role-based маршруты;
- доказуемый Founder Acceptance до релиза.

Следующий практический шаг: утвердить Work Package 0 как product contract, затем выполнить отдельный Work Package 1 PR только для Inventory crash. После его независимого PASS переходить к маршрутам и schedule correctness.
