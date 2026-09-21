# Cafe v2.2 — Карта возможностей продукта (Feature Map), версия для Founder

Дата составления: 2026-09-21. Ветка: `docs/cafe-v2-2-full-integrated-acceptance`.
Трек A2 миссии Cafe v2.2 Full Integrated Acceptance.

## 0. Как читать этот документ

Что это. Описание того, что Cafe-продукт умеет СЕЙЧАС, составленное по КОДУ
(маршруты, серверные действия, миграции БД, словари переводов). Старые
документы использовались только для сверки (раздел 10).

Метка VIC = VERIFIED-IN-CODE: утверждение подтверждено чтением кода, путь к
файлу указан рядом. Это НЕ значит "проверено вживую в браузере" — живая проверка
делается в Track B.

Сокращения путей (чтобы не повторять длинные пути):

| Сокращение | Полный путь |
|---|---|
| `APP` | `apps/web/src/app/(protected)` |
| `LIB` | `apps/web/src/lib` |
| `MIG` | `supabase/migrations` |

Что документ НЕ утверждает (ограничения, важно):

- Какие модули включены у конкретного tenant в облачной БД — из кода не видно.
  Код показывает, что кнопка модуля появляется только если модуль включён
  (`listTenantModules`, например `APP/manager/page.tsx`), а данные защищены
  политиками БД (RLS). Реальное состояние `oruwa-cafe` проверяется живьём.
- Применены ли все миграции в облачной БД (0119, 0120, 0121 и др.) — из кода
  не видно. Важно: слияние миграции в git не применяет её к базе.
- Развёрнуты ли Edge Functions и фоновый worker — из кода не видно.

---

## 1. Короткая сводка для Founder

1. Продукт — это два рабочих экрана: `/manager` (для Manager, Owner, Admin) и
   `/staff` (для сотрудника). Всё остальное (Recipes, Inventory, Purchases,
   Operations, Issues, Weekly Review, Mail, Settings, управление сотрудниками)
   открывается как всплывающие окна (popups) внутри этих двух экранов.
2. Отдельных рабочих страниц для этих модулей "как приложений" практически
   нет: адреса
   `/inventory`, `/purchases`, `/recipes`, `/operations` перенаправляют
   Manager на `/manager?popup=...`, а сотрудника — на `/staff?popup=...`.
3. Технический экран `/dashboard` — это служебная оболочка платформы (English
   only, без ролей). Туда попадает пользователь, у которого нет ни роли
   Manager, ни профиля сотрудника.
4. Стоимость блюда (WP5) видит только тот, у кого есть право
   `workforce.recipe.manage` (Manager, Admin, Owner). Сотрудник её не видит:
   защита стоит в БД, а не только в интерфейсе (см. 5.5).
5. Уведомлений нет вообще (LINE push — пустая заглушка), автоматического
   списания склада нет, справочника поставщиков нет, цены и оплаты нет.
6. Найдены места, где код расходится с документами или содержит потенциальный
   дефект (раздел 10). Самые важные:
   - редактирование сотрудника через форму может стирать почасовую ставку и
     заметки (10.1);
   - у Manager нет кнопки "опубликовать" для авто-созданных смен: они
     становятся видимы сотрудникам только после ручного сохранения каждой
     ячейки (10.2);
   - документ `master-state.md` устарел про защиту `/dashboard/admin` (10.3).

---

## 2. Маршруты и структура навигации (IA)

### 2.1. Канонические точки входа

| Маршрут | Кто попадает | Что происходит | VIC |
|---|---|---|---|
| `/sign-in` | все | Вход по email + паролю. Уже вошедшего сразу отправляет в его рабочее место | `apps/web/src/app/sign-in/page.tsx` |
| `/manager` | Manager / Admin / Owner | Главный экран управляющего. Нужно право `workforce.staff.manage` на локации | `APP/manager/page.tsx`, `LIB/workforce/manager-access.ts` |
| `/staff` | сотрудник с профилем | Главный экран сотрудника | `APP/staff/page.tsx` |
| `/manager?popup=X` | Manager | Открывает сразу нужное окно: `inventory`, `recipes`, `purchases`, `operations`, `issues`, `weekly-review` | `APP/manager/page.tsx` |
| `/staff?popup=X` | сотрудник | То же: `recipes`, `inventory`, `purchases`, `operations`, `issues` (`weekly-review` для сотрудника нет) | `APP/staff/page.tsx` |

### 2.2. Правило выбора рабочего места после входа

VIC `LIB/auth/post-login-redirect.ts`:

1. Модуль `workforce` у tenant выключен — `/dashboard`.
2. У tenant ровно одна активная локация и у пользователя есть
   `workforce.staff.manage` — `/manager` (Manager приоритетнее Staff, если
   человек совмещает роли).
3. Иначе, если есть профиль сотрудника — `/staff`.
4. Иначе — `/dashboard` (технический экран).

Тот же выбор срабатывает, когда уже вошедший пользователь открывает `/sign-in`
(`apps/web/src/app/sign-in/page.tsx`). Если в ссылке есть безопасный
`returnTo`, приоритет у него.

### 2.3. Перенаправления (старые адреса, которые ещё работают)

| Старый адрес | Куда ведёт | VIC |
|---|---|---|
| `/inventory` | Manager: `/manager?popup=inventory`; сотрудник: `/staff?popup=inventory`; остальные видят саму страницу Inventory | `APP/inventory/page.tsx` |
| `/purchases` | то же для Purchases | `APP/purchases/page.tsx` |
| `/operations` | то же для Operations; у остальных — короткое сообщение | `APP/operations/page.tsx` |
| `/recipes` | Manager: `/manager?popup=recipes`; остальные видят саму страницу рецептов | `APP/recipes/page.tsx` |
| `/recipes/[recipeId]` | самостоятельная страница карточки рецепта (для не-Manager) | `APP/recipes/[recipeId]/page.tsx` |
| `/dashboard/workforce/manager` | `/manager` (query сохраняется) | `APP/dashboard/workforce/manager/page.tsx` |
| `/dashboard/workforce/staff` | `/staff` | `APP/dashboard/workforce/staff/page.tsx` |
| `/dashboard/workforce/recipes` и `/[recipeId]` | `/recipes` | `APP/dashboard/workforce/recipes/page.tsx` |
| `/dashboard/inventory` | `/inventory` | `APP/dashboard/inventory/page.tsx` |

### 2.4. Технические и устаревшие маршруты, которые всё ещё доступны

| Маршрут | Кто может открыть | Что показывает | VIC |
|---|---|---|---|
| `/dashboard` | ЛЮБОЙ вошедший член tenant (без проверки права) | English-only оболочка: имя tenant, список своих членств, локации, модули, переключатель tenant, ссылки | `APP/dashboard/page.tsx` |
| `/dashboard/workforce` | член tenant при включённом `workforce` | Карточки "Staff" / "Manager" (только если есть доступ) / "Recipes" | `APP/dashboard/workforce/page.tsx` |
| `/dashboard/admin` | только с правом `core.member.invite` (Owner, Admin) | Read-only таблица участников tenant | `APP/dashboard/admin/page.tsx`, `LIB/tenant/admin-access.ts` |
| `/dashboard/auth-boundary-smoke` | ЛЮБОЙ вошедший член tenant | Диагностика связи web -> apps/api ("Local/dev-only diagnostic"). Проверки окружения (dev/prod) в коде нет | `APP/dashboard/auth-boundary-smoke/page.tsx` |
| `/` | все, без входа | Главная-заглушка с двумя ссылками: `/workforce` и `/booking`. Ссылки ведут на несуществующий `/workforce` (страницы нет — 404) | `apps/web/src/app/page.tsx` (маршрута `/workforce` в `apps/web/src/app` нет) |
| `/booking` | все, без входа | Страница-заглушка "Booking"; ссылки `/booking/admin` и `/booking/new` ведут на несуществующие страницы | `apps/web/src/app/booking/page.tsx` |
| `/demo/cafe/**`, `/mame-to-cha/**` | все, без входа | Публичное демо на выдуманных данных, без tenant и сессии | `apps/web/src/app/demo/cafe/layout.tsx`, `apps/web/src/app/mame-to-cha/layout.tsx` |
| `/_client-preview/mame-to-cha/**` | внутренний адрес; на хосте `preview.oruwa.jp` `/mame-to-cha/*` подменяется на него (rewrite) | Отдельная витрина на реальных данных БД | `apps/web/next.config.mjs`, `apps/web/src/lib/preview/rewrite-config.mjs` |
| `/liff-entry`, `/auth/liff-callback` | все (LINE-вход) | Вход через LINE (LIFF) — код есть, нужна внешняя настройка LINE и Edge Function | `apps/web/src/app/liff-entry/page.tsx`, `apps/web/src/app/auth/liff-callback/route.ts` |
| `/auth/accept-invite`, `/auth/accept-invite/set-password` | по ссылке из письма-приглашения | Принятие приглашения и установка пароля | `apps/web/src/app/auth/accept-invite/route.ts` |
| `/api/health` | все | Проверка живости (без авторизации) | `apps/web/src/app/api/health/route.ts` |

Следствия для Founder:

- Обычный сотрудник или Manager технически может вручную набрать `/dashboard`
  и увидеть служебную страницу на английском (свои членства, модули).
  Данные чужих tenant там не видны (только свои членства), но экран не
  предназначен для клиентов.
- Явной защиты от открытия служебных страниц по адресу нет — они
  просто не связаны из рабочих экранов.

### 2.5. Общие свойства всех защищённых страниц

- Все страницы внутри `(protected)` требуют вход; без сессии — переход на
  `/sign-in` (VIC `APP/layout.tsx`, `LIB/auth/require-user.ts`).
- Баннер приглашения (`PendingInvitationBanner`) показывается на любой
  защищённой странице, если у вошедшего есть ожидающее приглашение
  (VIC `APP/layout.tsx`).
- Язык: японский по умолчанию, переключатель JA/EN в меню аккаунта; выбор
  хранится в `localStorage` браузера, НЕ в профиле пользователя (VIC
  `LIB/demo/cafe/i18n.tsx`, `APP/_ui/account-menu.tsx`).
  Экран входа, `/dashboard`, служебные сообщения об ошибках — только English
  (VIC `apps/web/src/app/sign-in/page.tsx`, `APP/dashboard/page.tsx`).
- Одна локация: `/manager` и `/staff` "закрываются" (сообщение вместо
  экрана), если у tenant 0 или больше 1 активной локации (для Manager) либо
  локация сотрудника недоступна (для Staff). Мульти-локация в каноническом
  интерфейсе НЕ поддерживается (VIC `APP/manager/page.tsx` "LOC-1",
  `APP/staff/page.tsx`).
- Переключатель tenant есть только на `/dashboard`; в `/manager` и `/staff`
  его нет (VIC `APP/dashboard/page.tsx` использует `TenantSwitcher`, в
  `APP/manager` и `APP/staff` он не используется).

---

## 3. Роли и права

### 3.1. Четыре системные роли и их ключи

Источник: `MIG/0008_rbac_seed.sql` (роли и базовые права), затем каждый модуль
добавляет свои ключи (`0020`, `0021`, `0035`, `0089`, `0100`, `0118`, `0119`).
Ключи продублированы в `packages/core/src/permissions.ts` (только часть — см.
3.3).

| Ключ права | Что разрешает | Owner | Admin | Manager | Employee (Staff) |
|---|---|---|---|---|---|
| `workforce.shift.read` | видеть смены | да | да | да | да (RLS показывает сотруднику только опубликованные) |
| `workforce.shift.write` | менять смены и настройки графика | да | да | да | нет |
| `workforce.attendance.manage` | учёт посещаемости / Mail | да | да | да | да (свои записи; Mail — только своя переписка по RLS) |
| `workforce.request.manage` | решать заявки, обмены, коррекции | да | да | да | нет |
| `workforce.staff.read` | читать профили | да | да | да | нет (имена коллег — через отдельное представление roster) |
| `workforce.staff.manage` | управлять сотрудниками, приглашениями, LINE; вход на `/manager` | да | да | да | нет |
| `workforce.recipe.read` | читать рецепты | да | да | да | да |
| `workforce.recipe.manage` | создавать/менять/удалять рецепты; видеть СТОИМОСТЬ | да | да | да | нет |
| `workforce.recipe.publish` | публиковать рецепты | да | да | да | нет |
| `inventory.item.read` | видеть склад | да | да | да | да |
| `inventory.count.write` | вносить остатки | да | да | да | да |
| `inventory.item.manage` | каталог склада, цена и аллергены | да | да | да | нет |
| `purchases.item.read` | видеть список закупок | да | да | да | да |
| `purchases.action.write` | Bought / Ordered / Received | да | да | да | да |
| `operations.task.read` | видеть задачи и чек-листы | да | да | да | да |
| `operations.task.execute` | выполнять задачи, сообщать о проблеме | да | да | да | да |
| `operations.template.manage` | шаблоны, пункты, расписания | да | да | да | нет |
| `operations.exception.resolve` | закрывать исключения | да | да | да | нет |
| `issues.report` | создавать проблемы / заметки передачи смены | да | да | да | да |
| `issues.manage` | подтверждать и закрывать проблемы | да | да | да | нет |
| `core.weekly_review.view` | Weekly Review | да | да | да | нет |
| `core.member.invite` | `/dashboard/admin` | да | да | нет | нет |
| `core.settings.manage` | настройки tenant (только в БД) | да | да | нет | нет |
| `core.role.manage`, `core.location.manage`, `core.line.manage` | платформенные (в интерфейсе экранов нет) | да | да | нет | нет |
| `core.audit.read` | чтение журнала аудита (экрана нет) | да | да | да | нет |
| `core.billing.manage` | биллинг (экрана нет) | да | нет | нет | нет |

VIC для матрицы: `MIG/0008_rbac_seed.sql`, `MIG/0020_workforce_staff_profile_extension.sql`,
`MIG/0021_workforce_recipes.sql`, `MIG/0035_inventory_stock_check.sql`,
`MIG/0089_purchases_module.sql`, `MIG/0100_operations_module_foundation.sql`,
`MIG/0118_issues_foundation.sql`, `MIG/0119_weekly_review_summary.sql`,
`MIG/0108_core_platform_foundation_navigation_settings.sql`.

Уточнение по Owner/Admin: в коде нет отдельного "экрана Owner". Owner и Admin
попадают на тот же `/manager` (у них есть `workforce.staff.manage`), плюс имеют
доступ к `/dashboard/admin`.

### 3.2. Три "лица" пользователя в продукте

| Кто | Как определяется | Куда попадает |
|---|---|---|
| Manager (включая Owner и Admin) | право `workforce.staff.manage` на единственной активной локации | `/manager` |
| Staff | есть строка `workforce.employees` (профиль сотрудника) | `/staff` |
| Нет роли (no-role / technical) | член tenant, но ни то, ни другое (например аккаунт платформы, либо `workforce` выключен) | `/dashboard` (техническая оболочка) |

### 3.3. Замечание про `permissions.ts`

`packages/core/src/permissions.ts` содержит только ключи `core.*`,
`workforce.*`, `booking.*`, `ai.*`. Ключей `inventory.*`, `purchases.*`,
`operations.*`, `issues.*` в этом TypeScript-файле НЕТ; приложение проверяет
их строками напрямую (например `LIB/inventory/items.ts`, `LIB/weekly-review/access.ts`).
Это не ошибка работы, но "единого списка прав в коде" нет — источник истины
БД (VIC `packages/core/src/permissions.ts` vs `MIG/*`).

---

## 4. Вход, приглашения, выход

| Что | Как работает | VIC |
|---|---|---|
| Вход | email + пароль; ошибка всегда общая ("Invalid email or password"), без подсказки, что именно неверно | `apps/web/src/app/sign-in/page.tsx`, `LIB/auth/actions.ts` |
| Выход | Sign out в меню аккаунта; сбрасывает сессию и ведёт на `/sign-in` | `LIB/auth/actions.ts`, `APP/_ui/account-menu.tsx` |
| Регистрация, сброс пароля самим пользователем, соцвход | НЕТ (на самой странице написано: "not available yet") | `apps/web/src/app/sign-in/page.tsx` |
| Приглашение сотрудника | Manager нажимает Invite в карточке сотрудника; Edge Function `invite-employee` шлёт письмо (проверяет `workforce.staff.manage`); сотрудник открывает ссылку, ставит пароль (минимум 8 символов) и принимает приглашение | `APP/manager/invitation-cell.tsx`, `LIB/workforce/invitation-actions.ts`, `apps/web/src/app/auth/accept-invite/route.ts`, `supabase/functions/invite-employee/index.ts` |
| Повторная отправка / отзыв приглашения / "восстановить доступ" | Есть три действия у Manager: Resend, Revoke, Recover (письмо для сброса пароля тем, кто не дошёл до установки пароля) | `APP/manager/invitation-cell.tsx`, `LIB/workforce/invitation-actions.ts` |
| Уже существующий пользователь ORUWA | Письмо не шлётся; принятие приглашения — через баннер внутри приложения | `apps/web/src/components/workforce/PendingInvitationBanner.tsx` |
| Вход через LINE (LIFF) | Код есть (`/liff-entry` -> Edge Function `liff-entry` -> `/auth/liff-callback`); зависит от внешних настроек LINE | `apps/web/src/app/liff-entry/page.tsx` |

Что НЕ построено: самостоятельная регистрация клиента, самостоятельный сброс
пароля, двухфакторная защита, социальный вход.

---

## 5. Модули: что умеют Manager и Staff

Формат каждого блока: что может / чего не может / право / данные / НЕ построено.
Общий принцип: кнопка модуля видна только при включённом модуле, а реальную
защиту даёт БД (RLS).

### 5.1. Экран Manager: состав (`/manager`)

Что сверху вниз (VIC `APP/manager/manager-dashboard-client.tsx`):

1. Шапка: название tenant и локации, меню аккаунта (имя, должность, язык,
   выход).
2. Панель кнопок-входов (Entry points): Recipes (всегда), Inventory (при
   включённом `inventory`), Manage staff (если удалось прочитать список),
   Purchases (тоже при `inventory`), Operations (при `operations`), Issues
   (при `issues`; красный счётчик = число ВАЖНЫХ открытых проблем), Weekly
   Review (только если есть `core.weekly_review.view`).
3. Панель внимания (Attention Panel, см. 5.10).
4. Недельный график смен (Weekly Schedule, см. 5.2).
5. Раздел Settings (см. 5.11).

Право на экран: `workforce.staff.manage` на локации. Сотрудник без него видит
"Unauthorized" ещё ДО чтения защищённых данных (VIC `APP/manager/page.tsx`,
тест `APP/manager/manager-page-authorization.test.ts`).

### 5.2. Недельный график и смены (Workforce / Weekly Schedule)

| Аспект | Manager | Staff |
|---|---|---|
| Что видит | Таблица "сотрудники x 7 дней" выбранной недели, навигация ±8 недель от текущей; маркер "!" в заголовке дня при нехватке людей; отметки в ячейках для коррекций/конфликтов; легенда типов смен; "Estimated labour cost" | Своя и коллег опубликованные смены; свои ячейки подсвечены; часы "запланировано на неделю"; "отработано в месяце" |
| Что может | Нажать ячейку: назначить сотрудника, изменить время/тип, переназначить, убрать смену; подтверждение перед изменением уже видимой сотруднику смены; для прошедших дат — пометка "исправление прошлого графика" | Нажать СВОЮ будущую смену: запросить обмен, изменение или отмену (см. 5.3); нажать свою прошедшую смену: увидеть факт и запросить коррекцию |
| Чего не может | Нельзя менять прошлое "молча" — есть предупреждение; нет массовой "публикации" (см. 10.2) | Не видит черновики; не может менять график сам |
| Право | `workforce.shift.write` (запись), `workforce.shift.read` | `workforce.shift.read` (RLS: только `published`) |
| Данные | `api.workforce_shift_assignments` (чтение/запись), `api.workforce_shift_types`, `api.workforce_schedule_settings` | те же представления, только чтение |
| Обновление | При смене недели — клиентская навигация; после записи `router.refresh()` | Автообновление недели каждые 2,5 секунды (`SCHEDULE_POLL_INTERVAL_MS`) |

VIC: `APP/manager/manager-dashboard-client.tsx`, `APP/manager/shift-cell-editor.tsx`,
`LIB/workforce/schedule-actions.ts` (`updateShiftAssignment`, `createShiftAssignment` — обе жёстко пишут `published: true`),
`APP/staff/staff-dashboard-client.tsx`, `LIB/workforce/shift-assignments.ts`.

Автосоздание графика:

- Кнопка "Создать график автоматически" в Settings (5.11): создаёт ЧЕРНОВИКИ
  (`published = false`) на видимую неделю, только будущие даты; учитывает
  предпочтения, нужное число людей по дням и лимит часов в месяц; повторный
  запуск заменяет прежние неподтверждённые автосмены; подтверждённые/ручные
  смены сохраняются; есть "Undo" в рамках той же сессии; после запуска
  показывается сводка (нехватки, не поставленные, не подавшие предпочтения,
  назначенные без предпочтения).
  VIC `LIB/workforce/schedule-actions.ts` (`runAutoDistribution`,
  `undoAutoDistribution`), `APP/manager/manager-dashboard-client.tsx`.
- Ежемесячное автосоздание: переключатель ON/OFF и день месяца (1-28) в
  Settings; фоновая работа на `apps/worker` (почасовой cron), создаёт черновики
  следующего месяца, ничего не публикует и не отправляет. Код есть; запущен ли
  worker в облаке — из кода не видно.
  VIC `apps/worker/src/jobs/auto-schedule-monthly.ts`, `apps/worker/src/index.ts`,
  `MIG/0114_workforce_schedule_settings_auto_create_enabled.sql`.

Не построено: пересчёт "затрат" по факту сверх "Estimated labour cost" (это
только оценка по отработанным часам и ставкам — см. 5.13 и 10.1), экспорт в
Excel/PDF, печать графика, шаблоны недели.

### 5.3. Заявки на смены: предпочтения, обмены, коррекции

Предпочтения на следующий месяц (Staff -> Manager):

- Staff: кнопка "Подать предпочтения на следующий месяц" открывает календарь
  следующего календарного месяца; по нажатию день переключается по кругу
  между типами смен и "пусто" (пусто = не работаю). Подача — вставка строк;
  уже поданный день блокируется, изменить его может только Manager
  (INSERT-only). Отдельного "недоступен" (unavailable) в текущем окне НЕТ:
  окно всегда отправляет `isUnavailable: false`.
  VIC `APP/staff/monthly-shift-preference-modal.tsx`, `LIB/workforce/schedule-actions.ts` (`submitMonthlyShiftPreferences`).
  Старая форма одного дня (`shift-preference-form.tsx`) с флажком "unavailable"
  существует в коде, но НЕ подключена ни к какому экрану (мёртвый код).
- Manager: Settings -> "Shift requests" -> "View requests" открывает
  просмотр предпочтений по месяцу и неделям. ВАЖНО: кнопки "Approve /
  Remove approval" в этом окне работают ТОЛЬКО как локальная отметка на
  экране (`approvedRequestIds` — состояние браузера) и НЕ пишутся в БД;
  "напомнить" — копирование текста в буфер обмена, а не отправка сообщения.
  VIC `APP/manager/shift-requests-review-popup.tsx` (комментарий в шапке файла
  и `useState<Set<string>>` без серверных вызовов).

Обмен, изменение, отмена смены (Staff -> Manager):

- Staff открывает свою будущую опубликованную смену и выбирает: "обмен" /
  "изменить тип смены" / "отменить". Заявка отправляется Manager. Нельзя
  подать вторую активную заявку на ту же смену.
  VIC `APP/staff/shift-exchange-request-form.tsx`, `LIB/workforce/shift-exchange-actions.ts` (`requestMyShiftExchange`).
- Manager: окно "Shift exchange requests" (открывается из Attention Panel или
  Weekly Review). Для "обмена" нужно назначить замену (searchable-список
  кандидатов, построенный из графика и предпочтений) — без замены "Approve"
  недоступен. Решение "Approve" в БД действительно меняет смену: обмен —
  переносит на замену; отмена — снимает сотрудника со смены; изменение —
  меняет тип и время смены. Проверка конфликта расписания замены — в БД.
  VIC `APP/manager/shift-exchange-requests-popup.tsx`, `MIG/0050_workforce_shift_change_requests.sql`
  (`api.decide_workforce_shift_exchange`), `MIG/0079_manager_assign_shift_exchange_replacement.sql`.
- Что в коде есть, но в каноническом интерфейсе НЕ подключено: принятие обмена
  коллегой (`acceptColleagueShiftExchange`) и отмена своей заявки сотрудником
  (`cancelMyShiftExchange`). Их нет ни на одном экране `/staff`. Значит,
  замену на обмен назначает только Manager.
  VIC `LIB/workforce/shift-exchange-actions.ts` (функции определены), поиск
  по `APP/**` не находит их вызовов.

Коррекция посещаемости (Staff -> Manager):

- Staff: в прошедшей смене кнопка "Запросить коррекцию": можно указать время
  входа, выхода и перерыв и обязательное сообщение (до 500 символов).
  VIC `APP/staff/correction-request-form.tsx`.
- Manager: окно "Correction requests" (из Attention Panel или из ячейки
  графика): Approve / Reject, история. Одобренная коррекция С ЗАПРОШЕННЫМИ
  часами действительно применяется к записи посещаемости (один раз; если
  применить не удалось — решение откатывается в "pending").
  VIC `LIB/workforce/shift-requests.ts` (`decideCorrectionRequest`,
  `applyApprovedCorrection`), `APP/manager/correction-requests-popup.tsx`.

Права: заявки создаёт сотрудник (самозапись по RLS), решает
`workforce.request.manage` (Manager/Admin/Owner). Данные:
`api.workforce_shift_requests`, `api.workforce_shift_exchanges`,
`workforce.attendance`.

### 5.4. Сотрудники: управление, приглашения, привязка LINE

| Действие | Кто | Что происходит | VIC |
|---|---|---|---|
| Список сотрудников с поиском и фильтром | Manager | Окно "Manage staff": имя, статус Active/Inactive, есть ли LINE, есть ли доступ (приглашение) | `APP/manager/manage-staff-popup.tsx` |
| Добавить / изменить сотрудника | Manager | Поля: имя, фамилия, имя (given), email, должность, при создании — LINE user id. "Employment type" в форме не показывается, но сохраняется скрытым полем | `APP/manager/staff-form.tsx`, `LIB/workforce/staff-actions.ts` |
| Деактивировать / активировать | Manager | Деактивация — с подтверждением; сотрудник пропадает из графика | `APP/manager/manager-dashboard-client.tsx`, `LIB/workforce/staff-actions.ts` |
| Удалить навсегда | Manager | В "danger zone"; блокируется, если у сотрудника есть история (`blocked_by_history`) | `APP/manager/manage-staff-popup.tsx`, `LIB/workforce/staff-actions.ts` |
| Привязать LINE user id | Manager | Вводится вручную вместе с Save; обратно значение не показывается — только состояние "привязан / не привязан"; есть "Unbind" | `APP/manager/line-link-form.tsx`, `LIB/workforce/employee-line-links.ts` |
| Приглашения, доступ | Manager | См. раздел 4 | `APP/manager/invitation-cell.tsx` |
| Карточка сотрудника (read-only) | Manager | Клик по имени в графике: часы за месяц, ставка, расчётный заработок, кнопка "Copy monthly report" (текст в буфер) | `APP/manager/staff-name-detail-popup.tsx` |

Защита данных: имя, фамилия, email, заметки шифруются на сервере перед
записью (VIC `LIB/workforce/employees.ts` `upsertWorkforceEmployee`).

Право: `workforce.staff.manage` (VIC `MIG/0022_workforce_staff_recipes_rls_policies.sql`).
Staff не имеет доступа к этим данным; имена коллег в его графике идут из
отдельного безопасного представления roster (VIC `APP/staff/page.tsx`
`listWorkforceStaffRoster`).

Не построено: импорт сотрудников, роли/права через интерфейс, история
изменений профиля, поле "заметки" и "почасовая ставка" в форме (см. 10.1).

### 5.5. Рецепты (Recipes) с WP5: стоимость и аллергены

| Аспект | Manager | Staff |
|---|---|---|
| Вход | Кнопка Recipes (`/manager`), всплывающее окно | Кнопка Recipes (`/staff`), то же окно |
| Что видит | Список с вкладками Published / Draft / Archived, поиск, карточка рецепта | Только Published, поиск, карточка |
| Тип содержимого | "Recipe" (рецепт) или "Instruction" (инструкция) | то же |
| Состав карточки | Ингредиенты (с количеством и единицей, если привязан к складу), аллергены, шаги, заметки, фото | то же |
| СТОИМОСТЬ | Показывается блок "Cost" | НЕ показывается |
| Создать / изменить / архивировать / удалить | Да (создание с фото до 2 MiB, статусы draft/published/archived) | Нет |
| Привязка ингредиента к складу | Да: выбор позиции склада, количество, единица | Нет |
| Переводы JA/EN | При сохранении рецепта автоперевод через DeepL (если ключ настроен), best-effort; в списке поддерживается язык интерфейса | Видит переводы; для перевода без готового — язык оригинала |
| Обновление списка | Живого опроса в окне нет (только на отдельной странице) | то же |

VIC: `APP/_ui/recipes-popup.tsx`, `APP/recipes/recipes-list-client.tsx`,
`APP/recipes/[recipeId]/recipe-detail-client.tsx`, `APP/recipes/recipe-form.tsx`,
`LIB/workforce/recipe-actions.ts` (`upsertRecipe`, `getRecipeDetailForPopup`,
`getRecipeCostSummaryAction`, автоперевод `autoTranslateRecipe`).

Как считается стоимость (WP5, VIC `MIG/0121_recipe_intelligence_lite.sql`):

1. Каждый ингредиент рецепта МОЖЕТ быть привязан к позиции склада + количество
   + единица (kg, g, L, mL, pcs). Привязка необязательна (простое текстовое
   название — тоже норма).
2. У позиции склада Manager может задать "справочную цену за единицу"
   (это ОЦЕНКА, не цена закупки и не бухгалтерия) и список аллергенов из 10
   кодов: egg, milk, wheat, buckwheat, peanut, shrimp, crab, walnut, soy,
   sesame.
3. Стоимость ингредиента = количество (пересчитанное в единицу позиции) x цена.
   Пересчёт умеет только kg<->g, L<->mL и совпадающие единицы; всё, что
   затрагивает штуки (pcs) или несовместимые единицы, даёт "нет цены", а не
   угаданное число.
4. Итог показывается как "известная сумма" только когда ВСЕ ингредиенты
   привязаны и имеют цену; иначе показывается сообщение "неполно: X из Y
   ингредиентов оценены" (правило "пропуск не равен нулю").
5. Аллергены: "не настроено" (значение отсутствует) и "нет известных аллергенов"
   (менеджер явно подтвердил пустой список) — это РАЗНЫЕ состояния; "не
   настроено" никогда не показывается как "нет аллергенов".

Почему Staff не увидит стоимость (защита на трёх уровнях):

- Функции БД `api.recipe_ingredient_cost_breakdown` и `api.recipe_cost_summary`
  сами проверяют право `workforce.recipe.manage` (через
  `workforce.can_manage_recipe`) и для сотрудника возвращают ошибку
  `permission_denied` (VIC `MIG/0121_recipe_intelligence_lite.sql` разделы 9-10).
- Цена хранится ТОЛЬКО в `inventory.items.reference_unit_price` и намеренно не
  проецируется ни в одно представление `api.*`, которое читает сотрудник
  (VIC `MIG/0121_recipe_intelligence_lite.sql` шапка, п.3; представление
  `api.workforce_recipe_ingredients` "Deliberately carries NO reference_unit_price").
- Интерфейс дополнительно показывает блок стоимости только при `canManage`
  (VIC `APP/recipes/[recipeId]/recipe-detail-client.tsx` строки с `canManage &&
  costSummary`).
- Аллергены Staff ВИДИТ (они нужны для безопасности): см. 5.5, состав карточки.

Не построено: цена продажи, маржа, себестоимость порции, калькуляция по
меню, категории рецептов в интерфейсе (у нового рецепта нет выбора категории;
рецепты создаются без категории), история изменений рецепта, автоматическое
списание ингредиентов со склада.
VIC: `LIB/workforce/recipe-actions.ts` (`upsert_workforce_recipe` не принимает
категорию), `MIG/0121_recipe_intelligence_lite.sql` ("Out of scope").

### 5.6. Склад (Inventory)

| Аспект | Manager | Staff |
|---|---|---|
| Вход | Кнопка Inventory на `/manager` | Кнопка Inventory на `/staff` |
| Что видит | Позиции с фильтрами All / Shortage / OK / Inactive, поиск, фото, "кто и когда пересчитал" | Позиции (активные), поиск, фото; имена пересчитавших НЕ показываются |
| Что делает | Вносит остатки; создаёт / меняет / деактивирует / реактивирует / удаляет навсегда позицию; задаёт нужное количество, точку заказа (reorder point), единицу, фото, порядок; справочную цену и аллергены (WP5) | Вносит остатки (автосохранение: 600 мс после ввода и по Enter) |
| Право | `inventory.item.manage` + `inventory.count.write` | `inventory.item.read` + `inventory.count.write` |

Правило "нехватка": позиция в статусе "shortage" при остатке <= точки заказа;
"нужно докупить" = нужное количество минус остаток (не меньше нуля).
Остатки — неизменяемый журнал (изменить или стереть запись нельзя).
Удаление навсегда допускается, если есть история (защищено функцией БД).
Единицы: kg, g, L, mL, pcs.

VIC: `APP/inventory/inventory-dashboard-client.tsx`, `APP/inventory/item-form.tsx`,
`APP/inventory/count-form.tsx`, `LIB/inventory/manager-actions.ts`,
`LIB/inventory/count-actions.ts`, `MIG/0035_inventory_stock_check.sql`,
`MIG/0046_inventory_reorder_levels.sql`, `MIG/0085_inventory_item_media.sql`.

Не построено: партии и сроки годности, штрихкоды/QR, списание/потери,
перемещения между локациями, аналитика, автоматическое списание по продажам
или рецептам (в `MIG/0035` шапка: "deferred supplier/purchase/cost/expiry/
batch/waste/QR/barcode/movement/analytics scope").

### 5.7. Закупки (Purchasing): Order / Receive / History

Закупки работают "поверх" склада: отдельного модуля-флажка нет, они идут вместе
с `inventory` (VIC `APP/purchases/page.tsx`, `APP/manager/page.tsx`).

| Аспект | Manager | Staff |
|---|---|---|
| Что видит | Список позиций, требующих закупки (в статусах pending / bought / ordered / received), вкладки-фильтры и вкладка History; имя того, кто выполнил действие | То же; имена исполнителей показываются только тому, у кого есть `inventory.item.manage` (обычно у Staff нет) |
| Bought | Да ("купил сразу", быстрая отметка) | Да |
| Ordered | Да (заказано, с информационным количеством) | Да |
| Received | Да (пришла поставка: ввести количество; оно ДОБАВЛЯЕТСЯ к остатку через ту же функцию учёта склада) | Да |
| Право | `purchases.action.write` | `purchases.action.write` |

Ключевые правила (VIC `MIG/0089_purchases_module.sql`, `MIG/0120_purchases_order_receiving.sql`):

- Действия Bought и Ordered НЕ меняют остаток склада. Меняет остаток только
  Received (через `api.record_inventory_stock_count`, в одной транзакции).
- Отметка "Bought/Ordered/Received" привязана к последнему пересчёту склада;
  как только кто-то вносит новый остаток, отметка "устаревает" и позиция
  снова "pending" (или пропадает, если запас уже в норме).
- Количество в Ordered — только справочное; лимита на приём нет.
- История (`purchase_actions`) — журнал только на добавление.

Не построено: справочник поставщиков (Supplier), заказ поставщику,
цены и суммы закупки, счета/накладные, согласование заказа, автозаказ,
запрет "принять больше, чем заказано". Это явно записано в шапке
`MIG/0120_purchases_order_receiving.sql` ("Explicitly NOT built").

### 5.8. Операции (Operations): Today / Templates / HACCP

Модуль `operations`, включается на tenant отдельно.

| Раздел | Manager | Staff |
|---|---|---|
| Окно | "Operations" (3 вкладки: Templates, Today, Attention) | "Operations": задачи на сегодня |
| Templates | Создать / изменить / вывести из использования шаблон (название, категория, описание, охват "весь tenant" или "одна локация"); пункты чек-листа: название, тип ответа (да/нет, число, текст), диапазон и единица для числа, флаги "critical" и "required", порядок; пункт можно заменить (для использованных); расписание: ежедневно или по дням недели, время выполнения, конец окна, дата начала; версия расписания, деактивация, отмена | Нет |
| Today | Только просмотр задач сегодняшнего дня по локации: состояние (не начата / в процессе / просрочена / выполнена) и число открытых исключений. Manager задачи НЕ выполняет | Выполняет чек-лист: записывает ответы по пунктам, сообщает о проблеме (с важностью), завершает задачу. После завершения задача только для чтения |
| Attention | Открытые исключения (группируются по задаче и источнику), можно закрыть с заметкой ("resolution note") | Нет |
| Право | `operations.template.manage`, `operations.exception.resolve`, `operations.task.read` | `operations.task.read`, `operations.task.execute` |

VIC: `APP/_ui/operations-manager-popup.tsx`, `APP/_ui/operations-staff-popup.tsx`,
`APP/operations/operations-manager-client.tsx`, `APP/operations/template-detail-modal.tsx`,
`APP/operations/item-form.tsx`, `APP/operations/schedule-form.tsx`,
`APP/operations/today-tasks-section.tsx`, `APP/operations/attention-section.tsx`,
`APP/operations/task-detail-modal.tsx`, `LIB/operations/*-actions.ts`,
`MIG/0100..0105_operations_*.sql`, `MIG/0115_*.sql`, `MIG/0116_operations_missed_critical.sql`.

Автоматические исключения (VIC `MIG/0101`, `MIG/0116`, `LIB/operations/exceptions.ts`):
число вне диапазона автоматически создаёт исключение (важность из флага
"critical": critical -> action_required, иначе warning); если у критичной
проверки закончилось окно без выполнения, исключение "critical_missed"
создаётся при следующем заходе Manager на `/manager`
(`flagMissedCriticalExceptions`).

HACCP — это набор ГОТОВЫХ ДАННЫХ, а не отдельный экран:

- HACCP-шаблоны (Opening Hygiene, Closing Hygiene, Daily Cleaning,
  Temperature Monitoring) устанавливаются скриптом
  `packages/db/scripts/cafe-haccp-presets-write.ts` (запись в БД только с
  флагом `--confirm-apply`) как обычные шаблоны Operations.
  VIC `packages/db/scripts/cafe-haccp-presets.ts`.
- Числовые пороги температуры в пресетах НАМЕРЕННО пустые (min/max = null):
  диапазон задаёт Manager/Owner. Пороги привязаны к шаблону; разных порогов
  для разных локаций одного общего шаблона нет (нужны отдельные копии).
- Это НЕ сертификация HACCP и не юридическое соответствие — только поддержка
  учёта (VIC там же, п.2).
- Отдельного экрана "HACCP" и слова HACCP в интерфейсе нет (поиск по
  `apps/web/src/app` не даёт совпадений).
- Пробел продукта (записан в коде): нельзя создать внеплановую повторную
  проверку в тот же день после нарушения; повтор — только в следующее
  регулярное время.

Не построено: фото-подтверждение выполнения, подпись, экспорт журнала для
инспекции, уведомления о просрочке, выполнение задач Manager-ом через
интерфейс, пороги на локацию поверх общего шаблона.

### 5.9. Проблемы и передача смены (Issues & Handover)

| Аспект | Manager | Staff |
|---|---|---|
| Окно | "Issues": вкладки Open / History | "Issues": кнопка "Сообщить" + плоский список открытых |
| Создать | Проблему или заметку передачи смены (тип, категория, важность, текст до 1000 символов) | То же; важность — одним флажком "important" |
| Категории | equipment, inventory, cleaning, facility, customer, operations, other | те же |
| Статусы | Подтвердить (open -> acknowledged), Закрыть с заметкой (resolved) | Нет; только чтение |
| Видит | Все открытые и историю по своей локации | Все открытые проблемы и заметки локации (в том числе написанные коллегами) |
| Значок на кнопке | Число открытых проблем важностью "important" | то же |
| Право | `issues.report` + `issues.manage` | `issues.report` |

Роль автора ("staff" или "manager") ставит БД по праву вызывающего — подделать
нельзя. Удаления нет: проблема проходит open -> acknowledged -> resolved.
Модуль не зависит от `workforce` и `operations`.

VIC: `APP/issues/issues-manager-body.tsx`, `APP/issues/issues-staff-body.tsx`,
`LIB/issues/issues-actions.ts`, `MIG/0118_issues_foundation.sql`.

Не построено: связь проблемы с исключением Operations (колонка
`operations_exception_id` существует, но никто её не заполняет — VIC
`LIB/issues/issues.ts`), вложения/фото, комментарии-ветки, назначение
ответственного, уведомления.

### 5.10. Панель внимания (Attention Panel), только Manager

Что входит (VIC `LIB/workforce/manager-attention.ts`, `APP/manager/attention-panel.tsx`):

| Категория | Важность | Что открывает |
|---|---|---|
| Ожидающие коррекции посещаемости | требует действия | окно Correction requests |
| Ожидающие обмены смен | требует действия | окно Shift exchange requests |
| Конфликт "недоступен" и назначенная смена | предупреждение | внутреннее окно конфликтов (переход к ячейке графика) |
| Нехватка склада (Inventory shortage) | предупреждение | Inventory с фильтром "Shortage" |
| Непрочитанные сообщения Mail | считается в общем итоге, не отдельная категория | окно Mail |

Есть общий итог ("N требуют внимания: X требуют действия, Y предупреждения"),
чипы-категории и кнопка "Review all" (сводный список по важности).

Чего в панели НЕТ: исключений Operations и проблем Issues — они показываются
только в своих окнах (у Issues ещё красный значок на кнопке).
Категория "конфликт недоступности" в практике почти не оживает: единственное
окно подачи предпочтений (5.3) не создаёт состояние "unavailable"; оно
появится только от старых записей.

У Staff отдельной панели внимания нет: только метки "!" на его ячейках графика
(есть ожидающая коррекция или обмен) и пояснение под графиком. Общий счётчик
"обновлений" в шапке Staff намеренно отложен (VIC `APP/staff/staff-dashboard-client.tsx`
комментарий рядом с `AccountMenu`).

### 5.11. Настройки (Settings), только Manager

Раздел под графиком (VIC `APP/manager/settings-section.tsx`,
`LIB/workforce/schedule-settings-actions.ts`):

- Нужное число людей по дням недели и максимум рабочих часов в месяц (с
  автосохранением).
- Типы смен: добавить (название, начало, конец), изменить, деактивировать,
  показать деактивированные, вернуть, удалить (блокируется, если типом уже
  пользовались: `blocked_by_history`).
- Автоматизация: кнопка "Создать график автоматически", результат последнего
  запуска, переключатель "Автоматический график" и день месяца, метка
  последнего месяца генерации.
- Ссылка "Shift requests" -> "View requests" (см. 5.3).

Право: `workforce.shift.write` (политики `wf_schedule_settings_write`, VIC
`MIG/0097_workforce_module_access_gate.sql`).

Чего НЕТ: настроек tenant (ключ `core.settings.manage` существует в БД, но
экрана не имеет), управления ролями, биллинга, журнала аудита, выбора языка
на уровне tenant, настройки локаций. VIC: поиск по `apps/web/src` не находит
использования этих ключей.

### 5.12. Weekly Review, только Manager/Admin/Owner

- Окно "Weekly Review" (кнопка только при праве `core.weekly_review.view`).
  Пять разделов только для чтения: Team (смены, обмены, нерешённые
  заявки), Operations (выполнено, пропущено критичных, открытые
  исключения), Issues (новые проблемы, новые заметки передачи, нерешённые,
  нерешённые важные, повторяющиеся категории), Purchasing (позиции в
  нехватке, закупки в "pending"). Переход по неделям Prev/Next, особое
  состояние "тихая неделя". Из окна можно перейти в нужные окна (заявки,
  обмены, Operations, Issues, Purchases, Inventory Shortage).
- Раздел показывается как "нет данных", если соответствующий модуль выключен
  (не как ноль).
- Права: `core.weekly_review.view`; функция БД `api.weekly_review_summary`
  дополнительно опирается на RLS. Отдельного модуля-флажка нет.
- Данные: пересчитывается при каждом открытии; ничего не сохраняется.

VIC: `APP/_ui/weekly-review-manager-popup.tsx`, `APP/weekly-review/weekly-review-manager-body.tsx`,
`LIB/weekly-review/weekly-review-actions.ts`, `LIB/weekly-review/access.ts`,
`MIG/0119_weekly_review_summary.sql`.

Отдельной страницы у Weekly Review нет (только окно). В сводке нет расходов,
выручки, оценки затрат на труд и сравнения недель.

### 5.13. Учёт времени работы (Staff): отметка прихода, статус работы, транспорт

| Что | Как | VIC |
|---|---|---|
| Карточка "Work status" | В верхней части `/staff`. Кнопка "Приход" фиксирует время приёма сервером; после прихода кнопка меняется на "Уход" | `APP/staff/work-status-card.tsx`, `LIB/workforce/attendance-actions.ts` (`clockIn`) |
| Уход | Обязательный выбор перерыва: 0 / 30 / 60 минут, затем подтверждение | `APP/staff/work-status-card.tsx`, `LIB/workforce/attendance-actions.ts` (`clockOut`) |
| Повторный приход в тот же день | Запрещён ("You have already clocked in today") | `LIB/workforce/attendance-actions.ts` |
| Транспорт | Отдельное поле "Transportation cost" на сегодня; автосохранение | `APP/staff/transport-form.tsx` |
| Отчёт о работе (дневное сообщение) | Форма `WorkReportForm` СУЩЕСТВУЕТ в коде, но не подключена ни к одному экрану; её роль заменили Mail (5.14) и карточка транспорта | `APP/staff/work-report-form.tsx` (нет импортов) |
| "Estimated labour cost" у Manager | Показывается под графиком: часы, уже отработанные к текущему моменту (по отметкам прихода/ухода), умноженные на ставку сотрудника; незакрытая смена считается до текущего момента | `LIB/workforce/labour-cost.ts`, `APP/manager/manager-dashboard-client.tsx` |
| "Estimated earnings" у Staff | Часы за месяц; ставка и сумма — только если у сотрудника есть ставка | `LIB/workforce/estimated-earnings.ts`, `APP/staff/staff-dashboard-client.tsx` |
| Ставка сотрудника (`hourlyWageYen`) | В форме Manager поля для ставки нет (см. 10.1) | `APP/manager/staff-form.tsx` |

Право: запись — `workforce.attendance.manage` (сотрудник, только свои
записи); данные — `workforce.attendance`. Записи нельзя менять задним
числом иначе как через коррекцию Manager (5.3).

### 5.14. Mail (сообщения Staff <-> Manager)

| Аспект | Staff | Manager |
|---|---|---|
| Вход | Кнопка Mail (со счётчиком непрочитанных) | Строка Mail в Attention Panel |
| Что видит | Свою единственную переписку с управляющим | Список сотрудников с непрочитанными, затем ветка конкретного сотрудника |
| Пишет | Да (до 500 символов) | Да (до 500 символов) |
| Прочитано / архив | Отметка прочтения; архивирование сообщения через меню "•••" | То же |
| Удалить | Нет (только архив) | Нет (только архив) |

Один тред на сотрудника, двусторонний. Отдельного нового права нет: Manager
использует `workforce.attendance.manage`, а доступ сотрудника только к
своей переписке обеспечивает RLS (VIC `MIG/0090_workforce_staff_messages.sql`).
Старое поле "дневное сообщение" в посещаемости оставлено только как история.

Уведомлений о новом сообщении НЕТ: вызов `queueLineNotification` — пустая
заглушка, которая ничего не отправляет и не записывает (VIC
`LIB/notifications/queue-line-notification.ts`, вызывается из
`LIB/workforce/staff-messages-actions.ts`, `schedule-actions.ts`,
`attendance-actions.ts`, `shift-exchange-actions.ts`, `recipe-actions.ts`).

VIC: `APP/manager/staff-messages-popup.tsx`, `APP/staff/staff-mail-popup.tsx`,
`LIB/workforce/staff-messages-actions.ts`.

### 5.15. Подсказки (Help popups)

Во всех окнах и ключевых карточках есть кнопка "?" (общий компонент
`HelpIconButton`), открывающая короткое пояснение на JA/EN. Точки (VIC
поиск `HelpIconButton` по `APP/**`):

- Manager: недельный график; Attention Panel (2); Manage staff; Settings (2);
  Shift requests; Correction requests; Shift exchange requests; Mail;
  Inventory; Purchases; Recipes; Operations; Issues; Weekly Review.
- Staff: график (2: график и обмен); Work status; Transport; Mail;
  ежемесячные предпочтения; Inventory; Purchases; Recipes; Operations; Issues.

Тексты подсказок описывают текущее поведение; одна подсказка расходится с
интерфейсом (публикация автографика — см. 10.2).

---

## 6. Экран Staff: состав (`/staff`)

Сверху вниз (VIC `APP/staff/staff-dashboard-client.tsx`):

1. Шапка: tenant и локация, меню аккаунта (имя, должность, язык, выход).
2. Карточка "Work status" с кнопкой прихода/ухода (5.13).
3. Кнопки-входы: Recipes (всегда), Inventory и Purchases (при `inventory`),
   Mail (всегда, со счётчиком непрочитанных), Operations (при `operations`),
   Issues (при `issues`, красный значок = число важных открытых проблем).
4. Недельный график (свои и коллег опубликованные смены), недельная навигация,
   часы недели, месяца, расчётный заработок.
5. Поле "Transportation cost" на сегодня.
6. Кнопка ежемесячных предпочтений.

Экраны без профиля: если у пользователя нет профиля сотрудника — сообщение
"ask your manager to add you" (JA + EN одновременно); если локация сотрудника
недоступна — соответствующее сообщение (VIC `APP/staff/page.tsx`).

Что Staff НЕ может увидеть или сделать (подтверждено кодом):

- `/manager` — нет права `workforce.staff.manage`, "Unauthorized".
- Weekly Review, Settings, Attention Panel, управление сотрудниками.
- Стоимость рецептов, справочную цену склада, шаблоны Operations, закрытие
  исключений, подтверждение/закрытие проблем.
- Чужие черновые смены; чужие заявки/сообщения (по RLS).

---

## 7. Технический экран без роли (no-role)

Кто: авторизованный член tenant, у которого нет ни права Manager, ни профиля
сотрудника (или у tenant выключен `workforce`).

Что он может:

- Попасть на `/dashboard` и `/dashboard/workforce`, увидеть служебные данные
  своего tenant (English-only).
- Открыть `/inventory`, `/purchases`, `/recipes`, `/operations` напрямую:
  вместо перенаправления он увидит саму страницу. Но данных не получит:
  права на чтение у него нет, RLS вернёт пустое (или ошибку доступа); страница
  Operations без профиля показывает "You do not have a staff profile".
- Открыть `/dashboard/auth-boundary-smoke` (диагностика).
- НЕ откроет `/manager` (Unauthorized), `/staff` (сообщение "нет профиля"),
  `/dashboard/admin` (Unauthorized, кроме Owner/Admin).

VIC: `LIB/auth/post-login-redirect.ts`, `APP/dashboard/**`, `APP/inventory/page.tsx`,
`APP/operations/page.tsx`.

В живой проверке (Track B) эта роль не воспроизводится, потому что в
единственном tenant `oruwa-cafe` нет второго аккаунта: покрывается только
pgTAP и разбором кода (DEBT-049).

---

## 8. Что НЕ построено (явный список)

| Область | Статус | Основание (VIC) |
|---|---|---|
| Уведомления (LINE push, email, in-app) | НЕТ. Заглушка `queueLineNotification` ничего не делает; в БД есть только outbox `core.notifications` без отправщика | `LIB/notifications/queue-line-notification.ts`, `MIG/0109_core_platform_foundation_notifications.sql` |
| Справочник поставщиков (Supplier CRM), заказ поставщику | НЕТ | `MIG/0120_purchases_order_receiving.sql` шапка |
| Цены и суммы закупок, счета, накладные, согласование заказа, автозаказ | НЕТ | там же |
| Автоматическое списание склада (по рецептам/продажам/закупкам) | НЕТ: остаток меняет только ручной пересчёт и Received | `MIG/0121_recipe_intelligence_lite.sql` "any automatic stock/inventory mutation ... out of scope", `MIG/0089` |
| Партии, сроки годности, штрихкоды, потери, перемещения | НЕТ | `MIG/0035_inventory_stock_check.sql` шапка |
| Цена продажи, маржа, себестоимость порции | НЕТ (только оценка стоимости ингредиентов) | `MIG/0121` |
| Мульти-локации в интерфейсе | НЕТ (fail-closed при 0 или >1 активной локации) | `APP/manager/page.tsx` "LOC-1" |
| HACCP как отдельный модуль/экран, сертификация | НЕТ (только пресеты данных) | `packages/db/scripts/cafe-haccp-presets.ts` |
| Повторная внеплановая проверка (recheck) | НЕТ | там же, п.3 |
| Пороги температуры на локацию поверх общего шаблона | НЕТ | там же, п.1a |
| Аналитика, отчёты, экспорт | НЕТ (Weekly Review — счётчики; labour cost — оценка) | `LIB/weekly-review/weekly-review.ts` |
| Самостоятельная регистрация, сброс пароля пользователем, соцвход | НЕТ | `apps/web/src/app/sign-in/page.tsx` |
| Управление ролями, биллинг, журнал аудита, настройки tenant в интерфейсе | НЕТ (права есть в БД) | поиск в `apps/web/src` |
| Привязка проблем Issues к исключениям Operations | НЕТ (колонка не заполняется) | `LIB/issues/issues.ts` |
| Bulk-публикация графика в каноническом Manager | НЕТ (`publishSchedule` не подключён) | `LIB/workforce/schedule-actions.ts`, поиск по `APP/**` |
| Принятие обмена коллегой, отмена своей заявки сотрудником | НЕТ на экранах (функции есть в коде) | `LIB/workforce/shift-exchange-actions.ts` |
| Утверждение предпочтений смен (Approve) с сохранением | НЕТ (только локальная отметка на экране) | `APP/manager/shift-requests-review-popup.tsx` |
| Отправка напоминаний сотрудникам | НЕТ (только копирование текста) | там же |
| Категории рецептов в интерфейсе, история рецепта | НЕТ | `LIB/workforce/recipe-actions.ts` |
| Booking (бронирование), AI-поддержка, CRM | Заготовки/планы; Booking — страница-заглушка | `apps/web/src/app/booking/page.tsx` |
| Платежи | НЕТ | поиск по `apps/web/src` |

---

## 9. Как данные хранятся (для понимания, без деталей)

| Домен | Схема БД и главные таблицы/функции (высокий уровень) |
|---|---|
| Сотрудники, смены, заявки, обмены, посещаемость, Mail, рецепты | схема `workforce`; чтение и запись через `api.workforce_*` |
| Склад | `inventory.items`, `inventory.stock_counts` (неизменяемый журнал), `api.inventory_item_status` |
| Закупки | `purchases.purchase_actions` (журнал только на добавление), `api.purchases_needed`, `api.record_purchase_*` |
| Operations | схема `operations`; `api.operations_*` |
| Issues | `issues.issues`, `api.issues_*` |
| Weekly Review | функция `api.weekly_review_summary` (ничего не сохраняет) |
| Tenant, права, модули | схема `core`: `core.tenant_modules`, `core.role_permissions`, `core.has_permission`, `core.has_module_access` |

Все таблицы защищены политиками RLS, работающими с правом и включённым модулем
(VIC `MIG/0093_core_has_module_access.sql` и "module access gate" `0094`-`0098`).

---

## 10. Расхождения между кодом и документами, а также находки

Формат: что говорит документ / что показывает код / вывод. Пункты 10.1 и
10.2 — потенциальные дефекты, найденные при чтении кода; их нужно подтвердить
живой проверкой (Track B), прежде чем считать их дефектами.

### 10.1. (Потенциальный дефект) Сохранение формы сотрудника стирает ставку и заметки

- Документы: форма сотрудника описана как полная, оценка затрат на труд
  ("Estimated labour cost") — Founder-принятая функция (`docs/project/master-state.md`).
- Код: `parseUpsertEmployeeInput` читает `hourlyWageYen` и `notes` из формы
  (`LIB/workforce/employees-input.ts`), но в форме `APP/manager/staff-form.tsx`
  таких полей нет (есть только name, familyName, givenName, email,
  positionLabel, скрытое employmentType, при создании — LINE id).
  При изменении `upsertWorkforceEmployee` пишет `hourly_wage_yen:
  input.hourlyWageYen ?? null` и `notes_encrypted` в null (VIC
  `LIB/workforce/employees.ts`, ветка `if (input.id)`).
- Вывод: (а) в интерфейсе НЕТ способа задать почасовую ставку; значит "Estimated
  labour cost" в каноническом Manager даёт 0, пока ставка не внесена вне UI
  (скрипт/БД); (б) если ставка внесена вне UI, первое же сохранение карточки
  сотрудника через форму, судя по коду, ставку обнуляет. В UI заметки тоже не
  видны и тоже обнуляются. Необходима живая проверка на тестовом сотруднике.

### 10.2. (Потенциальный дефект / продуктовый пробел) Автографик и "публикация"

- Документы и Help: текст Help для автографика говорит "содержимое вы
  проверяете и публикуете сами, как любой другой черновик"
  (`APP/manager/manager-dashboard-i18n.ts`, ключ `automationHelpBody`);
  `master-state.md` фиксирует "автосозданное невидимо для Staff, пока не
  проверено".
- Код: автосозданные смены — черновики (`published = false`). У Manager нет
  кнопки "Опубликовать": `publishSchedule` определён в `LIB/workforce/schedule-actions.ts`,
  но не импортируется ни одним экраном (поиск по `apps/web/src`: у демо-версии
  собственная функция с тем же именем, а сама серверная функция нигде не
  вызывается). Ячейка графика намеренно не показывает признак черновика
  (`APP/manager/manager-dashboard-client.tsx`, комментарий "no status dot,
  no badge"). Единственный путь опубликовать смену — открыть ячейку и
  нажать Save: `updateShiftAssignment` жёстко ставит `published: true`.
  Ячейки редактора вызывают запись даже без изменений (`doSubmit`).
- Вывод: чтобы сотрудники увидели автографик, Manager должен вручную открыть
  и сохранить каждую ячейку; отличить черновик от опубликованного в
  сетке нельзя. Это либо пробел UX, либо неточность подсказки.

### 10.3. `docs/project/master-state.md`: `/dashboard/admin` "NOT role-gated (Defect A)"

- Документ: таблица маршрутов (раздел 8): "thin member table, NOT role-gated".
- Код: страница защищена: `hasTenantAdminAccess` проверяет `core.member.invite`
  и для остальных отдаёт `UnauthorizedState`
  (`APP/dashboard/admin/page.tsx`, `LIB/tenant/admin-access.ts`, тест
  `APP/dashboard/admin/admin-page-authorization.test.ts`).
- Вывод: документ устарел, защита есть (Owner/Admin).

### 10.4. `docs/project/master-state.md`: "Purchases: shortage -> list -> Bought -> inventory quantity update"

- Документ: после "Bought" количество склада обновляется.
- Код: Bought и Ordered остаток НЕ меняют; остаток меняет только Received
  (через ту же функцию учёта) или обычный пересчёт склада; отметка Bought
  привязана к последнему пересчёту и устаревает после нового
  (`MIG/0089_purchases_module.sql`, `MIG/0120_purchases_order_receiving.sql`).
- Вывод: формулировка в документе неточна.

### 10.5. "Отчёт о работе" (work report) в Staff

- Документы миссии и старые отчёты v2.1 (`docs/product/cafe-package-v2-acceptance-report.md`,
  цели миссии: "work report") упоминают отправку work report.
- Код: отдельной формы отчёта на `/staff` нет; `WorkReportForm` — неиспользуемый
  файл. Есть отметка прихода/ухода и транспорт. Дневное сообщение заменено
  Mail (`MIG/0090` шапка).
- Вывод: пункт "work report" в плане Track B нужно проверять как "clock-in/out +
  transport + Mail", а не как отдельную форму.

### 10.6. Окно просмотра предпочтений: "Approve"

- Кнопка Approve/Remove approval выглядит как решение, но нигде не пишется в
  БД (`APP/manager/shift-requests-review-popup.tsx`). Оно исчезает при
  обновлении страницы. Комментарий в шапке файла это признаёт ("UI ONLY ... Real
  persistence ... are v2.2 scope").
- Вывод: Manager не должен считать эти отметки решением; на автографик они
  не влияют.

### 10.7. Главная страница и `/booking`

- Ссылки на `/workforce`, `/booking/admin`, `/booking/new` ведут на несуществующие
  страницы (в `apps/web/src/app` таких маршрутов нет). Не рабочие пути клиента,
  но видны по адресу `/` и `/booking`.

### 10.8. Мелкие наблюдения

- `packages/core/src/permissions.ts` не содержит ключей inventory/purchases/
  operations/issues (см. 3.3).
- Форма предпочтений одного дня и форма отчёта — неиспользуемый код (5.3, 5.13).
- Принятие обмена коллегой и отмена своей заявки реализованы в серверном
  коде, но не подключены к экранам (5.3).
- В каталоге `supabase/migrations` есть временные отладочные миграции
  `0086_debug_temp.sql` и `0087_debug_temp2.sql` (создают функции
  `api.debug_*`, доступные `authenticated`); они удаляются в
  `0088_inventory_media_fix_name_ambiguity.sql` (`drop function if exists`),
  так что после применения 0088 на базе их быть не должно. Стоит лишь
  убедиться, что 0088 применена на каждой базе.
- Иерархия: Owner и Admin "сливаются" с Manager в интерфейсе; отдельного
  экрана Owner нет.

---

## 11. Что нужно подтвердить живой проверкой (Track B)

Статус после живой приёмки 2026-09-21 (`docs/ai/CAFE_V2_2_FULL_INTEGRATED_ACCEPTANCE_REPORT_2026-09-21.md`):

1. Пункты 10.1 и 10.2 (ставка/заметки и публикация автографика) — **живой проверки не было** (для 10.1 подтверждено чтением кода при приёмке, DEBT-052; 10.2 — DEBT-057).
2. Модули `inventory`, `operations`, `issues` у `oruwa-cafe` включены — **ПОДТВЕРЖДЕНО живьём**: все три кнопки видны на `/manager` и `/staff`, а технический `/dashboard` показывает 5 включённых модулей (core, inventory, issues, operations, workforce).
3. У Staff нет блока стоимости, аллергены видны — **ПОДТВЕРЖДЕНО живьём** (карточка «カフェラテ», Staff) и в БД (42501 для Staff, ревью DB/security).
4. Weekly Review недоступно Staff — **ПОДТВЕРЖДЕНО**: кнопки у Staff нет (живьём), прямой вызов RPC закрыт `weekly_review_permission_denied` (ревью). Прямой `?popup=weekly-review` живьём не пробовали.
5. Переходы `/inventory`, `/purchases`, `/recipes`, `/operations` — **ПОДТВЕРЖДЕНО** как редиректы (в fetch-ответе Staff содержат `NEXT_REDIRECT`); вход в нужное окно живьём по прямой ссылке не проверялся.
6. Русские ярлыки не проверялись: интерфейс продукта — японский и английский;
   русского интерфейса в продукте нет.
