# Cafe v2.2 - Copy Audit (JA/EN), Track A1

Дата: 2026-09-21. Ветка: `docs/cafe-v2-2-full-integrated-acceptance`, база HEAD `a4eee49`.
Миссия: `docs/ai/CAFE_V2_2_FULL_INTEGRATED_ACCEPTANCE_MISSION_2026-09-20.md`, Track A1.
Связанный долг: DEBT-018 (I18N-JA-1, нативная проверка японского), DEBT-006 (все popup в двух языках; закрыт живой EN-проверкой приёмки 2026-09-21, строка удалена из реестра).
Тип аудита: **статический**. Браузер не запускался, живой QA этим документом не заменяется. Исходники не менялись.

## 1. Резюме для Founder

| Показатель | Значение |
|---|---|
| Словарных блоков `ja`/`en` найдено | 34 (1458 ключей на язык) |
| Из них на production-пути `(protected)` | 11 блоков, 1061 ключ |
| Из них demo / `_client-preview` (вне production-пути) | 23 блока, 397 ключей |
| Ключи только в одном языке | **0** (типы `Record<Lang, Dict>` плюс скрипт-проверка) |
| Расхождение плейсхолдеров / арности функций JA vs EN | 0 |
| Находки всего | 28 |
| P1 (ломает демо/релиз) | **0** |
| P2 (заметный дефект в обычном пути) | 12 |
| P3 (полировка, согласованность) | 16 |
| Класс A (блокер релиза/демо) | 9 (все P2) |
| Класс C (backlog) | 19 |

Главный вывод: сами словари чистые и симметричные. Проблемы находятся **вокруг** словарей:
(1) экраны, которые вообще не проходят через словарь (вход, общие state-заглушки, fallback-страницы);
(2) сообщения об ошибках сервера, которые доходят до пользователя на английском или как сырой текст БД;
(3) терминологический разнобой в японском (仕入れ/購入, 店長/マネージャー/管理者 и др.);
(4) сырые значения (`full_time`, число без ¥, ISO-даты).

P1 не найдено, но 9 пунктов класса A стоит закрыть или явно принять до показа настоящему японскому клиенту.

## 2. Метод и честные границы

| Что | Как | Уровень уверенности |
|---|---|---|
| Инвентаризация словарей, число ключей, симметрия JA/EN | TypeScript AST (компилятор TS) извлёк все объектные литералы с `ja:{}` и `en:{}`, затем сравнение ключей, плейсхолдеров `${}`, арности функций | Высокий (машинная проверка) |
| Ключи, не найденные нигде в коде (мёртвые) | Поиск по границе слова во всех `.ts/.tsx` вне файла словаря | Средний: динамическая сборка ключа даёт ложные срабатывания (отмечены) |
| Чтение всех 1458 пар JA/EN | Прочитаны глазами, суждения о качестве японского | Мой (не нативный) взгляд: это **первый проход**, финал остаётся за нативом |
| Захардкоженные строки в TSX | `grep` по JA-символам, по английским JSX-текстам, по атрибутам `aria-label/title/placeholder`, по тернарным `lang === 'ja'` | **Только grep-уровень**: строки, собранные динамически, и JSX-текст нестандартной формы могли не попасть |
| Сырые значения (UUID, snake_case, `undefined`) | grep по `{x.status}`, `{x.kind}`, `{x.*Id}`, `?? '-'`, `String(` | grep-уровень; шаблоны с возможным `undefined` в интерполяции не перебирались |
| Форматирование дат/чисел | grep по `toLocale*`, `Intl.*`, `toISOString().slice` | grep-уровень, поведение в браузере не проверено |
| Поведение в живом UI (переполнение, обрезка, порядок слов в подстановках) | **Не проверялось** | Нужен Track B |

Не охвачено: данные в БД (названия шаблонов HACCP, названия позиций Inventory, шаблоны рецептов), тексты Edge Functions / `apps/api`, письма Supabase Auth (приглашение, сброс пароля), LINE-сообщения, публичный `/demo/cafe`, `_client-preview/**` (dev-референс).
Внимание: в момент аудита ветка получила коммит `a4eee49` (PR #536, только `manager/page.tsx`, `staff/page.tsx`, тесты), номера строк ниже сверены с этим HEAD.

Шкала: **P1** = ломает демо/релиз или вводит в заблуждение; **P2** = заметный дефект на обычном пути; **P3** = полировка. **Класс A** = блокер демо/релиза (решить до показа), **C** = backlog.

## 3. Инвентарь словарей

Все ключи ниже присутствуют и в `ja`, и в `en`. Нативная проверка нигде не подтверждена.

### 3.1 Production-путь `apps/web/src/app/(protected)/**`

| Файл | Блок | Ключей (ja = en) | Тест-файл | Самопометка о машинном переводе |
|---|---|---|---|---|
| `dashboard/admin/admin-i18n.ts` | `dictionary` 26 + `tenantKindLabels` 3 + `membershipStatusLabels` 4 | 33 | да | нет |
| `dashboard/workforce/workforce-landing-i18n.ts` | `dictionary` | 18 | да | **да**, строки 12-14: "machine-translated by an AI agent and NEEDS NATIVE JAPANESE REVIEW" |
| `inventory/inventory-i18n.ts` | `dictionary` 89 + `ALLERGEN_LABELS` 10 | 99 | да | нет |
| `issues/issues-i18n.ts` | `dictionary` | 72 | да | нет |
| `manager/manager-dashboard-i18n.ts` | `dictionary` 300 + `employmentTypeLabel` 2 + `windowCodeLabel` 5 | 307 | да | **да**, строки 16-18, то же предупреждение |
| `operations/operations-i18n.ts` | `dictionary` (+ функция `formatTaskDueWindow`) | 188 | да | нет |
| `purchases/purchases-i18n.ts` | `dictionary` | 49 | **нет** | нет |
| `recipes/recipes-i18n.ts` | `dictionary` 73 + `ALLERGEN_LABELS` 10 | 83 | да | нет |
| `staff/staff-dashboard-i18n.ts` | `dictionary` 140 + `exchangeStatusLabel` 2 + `messages` 5 (+ функции `earningsEstimatedSuffix`, `existingExchangeMessage`, `describeExchangeError`) | 147 | да | нет |
| `weekly-review/weekly-review-i18n.ts` | `dictionary` | 53 | да | нет |
| `_ui/workforce-theme.ts` | `CORRECTION_STATUS_LABELS` 3, `ATTENDANCE_STATUS_LABELS` 4, `EXCHANGE_STATUS_LABELS` 5 | 12 | нет | нет |

Итого 1061 ключ. Замечание: только 2 файла честно помечены как непроверенный машинный перевод; остальные 9 не помечены, но японский в них написан тем же способом (AI), поэтому весь `ja` следует считать непроверенным.

Отдельные файлы `error-copy.ts` (сообщения об ошибках записи):

| Файл | Как устроен | Проблема |
|---|---|---|
| `manager/error-copy.ts` | 3 ключа из словаря + 4 inline-тернарника JA/EN | `default` возвращает `result.message` (строка 44), см. A-03 |
| `staff/error-copy.ts` | 7 inline-тернарников JA/EN | то же, строка 38 |
| `inventory/error-copy.ts` | ключи словаря | `unauthorized` возвращает `result.message` (строка 27) |
| `purchases/error-copy.ts` | ключи словаря | то же, строка 22 |
| `issues/error-copy.ts` | карта кодов на ключи | `result.message \|\| t('errorGeneric')` (строка 33) |
| `operations/error-copy.ts` | карта кодов на ключи | то же, строка 81 |

### 3.2 Общие компоненты и пакеты

| Путь | Содержимое | Замечание |
|---|---|---|
| `packages/ui/src/*` | строк для пользователя нет, подписи передаются пропами | единственный дефолт: `dialog.tsx:54` `closeLabel = 'Close'` |
| `apps/web/src/components/shared/design-kit/*` | дефолты `Modal.tsx:35` `closeLabel = 'Close'`, `Toast.tsx:96` `aria-label="Dismiss"`, `Lightbox.tsx:79` `aria-label="Close"` | английские дефолты, см. C-06 |
| `apps/web/src/components/states.tsx` | 7 состояний, только английский, без словаря | см. A-02 |
| `apps/web/src/components/sign-out-button.tsx` | дефолт `label = 'Sign out'` | вызывающие обычно передают подпись |
| `apps/web/src/components/tenant-switcher.tsx` | английский, сырой `locationId` | см. C-03 |
| `apps/web/src/components/demo/cafe/ShiftTable.tsx` | `CHROME_LABELS` 6 ключей (используется в `staff-dashboard-client.tsx`) | `customBadge`, `managerRole`, `correctionTooltip`, `messageTooltip` не используются |

### 3.3 Вне production-пути (для полноты)

`lib/demo/cafe/i18n.manager.ts` 131, `i18n.staff.ts` 96, `i18n.shiftExchange.ts` 34, `i18n.recipe-translation.ts` 29, `i18n.recipes.ts` 10, `helpContent.ts` 4 блока по 3 ключа, `lib/preview/*` 79. Обслуживают публичный `/demo/cafe` и dev-референс `_client-preview/mame-to-cha`, а не `/manager` и `/staff`. Не аудировались на качество, кроме терминов в сводной таблице 6.

## 4. Симметрия ключей JA/EN

Результат: **пропусков нет.** Проверено машинно по всем 34 блокам.
Особые случаи (все намеренные или безобидные):

| Где | Что | Вердикт |
|---|---|---|
| `inventory-i18n.ts:filterOk` | и `ja`, и `en` = `OK` | нормально |
| `manager-dashboard-i18n.ts:colLine` | оба = `LINE` | нормально |
| `operations-i18n.ts:taskWindowUntil` | JA `〜`, EN `until` | ключ не используется (см. 7) |
| `i18n.recipe-translation.ts:staffViewJapanese` | и `ja`, и `en` = `日本語原文` | намеренно: переключатель показывает целевой язык; только preview |
| `i18n.recipe-translation.ts:staffViewEnglish` | оба = `English` | то же |
| `i18n.staff.ts:monthSuffix` | JA `月`, EN пусто | корректно, суффикс не нужен в EN |
| `_ui/workforce-theme.ts`, `earningsEstimatedSuffix` | суммы форматируются `toLocaleString('ja-JP')` даже в EN | намеренно (иена), задокументировано в коде |

Тест-покрытие симметрии: у `purchases-i18n.ts` нет `*.test.ts` (C-18). Так как типы принудительно требуют одинаковые ключи, риск низкий.

## 5. Находки

### 5.1 Класс A (решить до показа / приёмки)

| ID | Sev | Где (file:line) | Проблема | Что делать |
|---|---|---|---|---|
| A-01 | P2 | `apps/web/src/app/sign-in/page.tsx:30,56,58,63,70`; `apps/web/src/app/sign-in/SignInForm.tsx:25,38,49` | Экран входа целиком на английском: "Sign in", "Sign in to LINE Business OS with your email and password.", "Invalid email or password. Please try again.", "Sign-up, password reset, and social login are not available yet.", подписи Email/Password/"Signing in…". Первый экран продукта для японского кафе, при этом `auth/accept-invite/set-password` и `liff-entry` уже на японском (нет единого подхода). Проверьте также Track B пункт 1 (вход). | Решение Founder: двуязычный вход (JA сверху, EN ниже, как в `staff/page.tsx:150-156`) или JA-only. Последняя строка про "not available yet" для клиента лишняя. |
| A-02 | P2 | `apps/web/src/components/states.tsx:22-80`; используется `(protected)/loading.tsx`, `(protected)/error.tsx:15`, `manager/page.tsx:194,503` (`UnauthorizedState`) | Общие состояния только на английском: "Loading…" / "Preparing your workspace.", "Something went wrong", "Access denied" / "You do not have access to this resource.", "Feature unavailable". Показываются при каждой навигации на медленной сети, при любой ошибке и когда Staff открывает `/manager`. Серверные компоненты не знают язык (он в `localStorage`, `LangProvider`). | Двуязычная пара JA/EN в одном блоке, либо клиентская обёртка, читающая `useLang`. |
| A-03 | P2 | `manager/error-copy.ts:44`, `staff/error-copy.ts:38`, `inventory/error-copy.ts:27`, `purchases/error-copy.ts:22`, `issues/error-copy.ts:33`, `operations/error-copy.ts:81`; источники: `lib/workforce/pg-error.ts:12-13,20`, `lib/operations/pg-error.ts:27,34`, `lib/issues/pg-error.ts:25,32` | Ветка `default` / `unexpected_error` / `unauthorized` отдаёт `result.message` как есть: это английская фраза сервера или **сырой `error.message` из Postgres/PostgREST**. Заголовки самих файлов утверждают обратное ("never a raw machine error code or an untranslated string reaches the UI", `issues/error-copy.ts:20`, `operations/error-copy.ts:46`, `inventory/error-copy.ts:7`, `purchases/error-copy.ts:5`). Конкретный пример на обычном пути Staff: повторный «Отработал» даёт `lib/workforce/attendance-actions.ts:124` -> `duplicate` -> `default` в `staff/error-copy.ts:38` -> UI показывает "You have already clocked in today." (вызов `staff/work-status-card.tsx:59,75`). Также "Invalid input.", "You have no staff profile in this tenant.", "Your staff profile has no assigned location." (`attendance-actions.ts:27-28,43,101`), "Not permitted to perform this action." (`pg-error.ts`). | Добавить в `describeWriteError` явные ветки для `duplicate`, `unexpected_error`, `config_error`, `unauthorized` с двуязычными фразами, никогда не показывать `message`. Логировать серверную строку отдельно. Связано с DEBT-034/CLK-1 (clock-in). |
| A-04 | P2 | `apps/web/src/app/(protected)/dashboard/workforce/workforce-landing-client.tsx:83` | `{profileResult.data.employmentType}` выводит сырое значение `full_time` / `part_time` в карточке "マイスタッフプロフィール". Соседняя карта `employmentTypeLabel` (`manager-dashboard-i18n.ts:1101`) для этого экрана не применяется. Экран достижим по ссылке "プラットフォームダッシュボード" (`backToWorkforce`). | Использовать `employmentTypeLabel[lang][...]` с запасным вариантом `notSet`. |
| A-05 | P2 | `manager/staff-name-detail-popup.tsx:46-49,87-89,71` | Popup сотрудника у Manager: время работы показывается числом без единицы, ставка и оценка выплаты без `¥`/`円` и без разделителя тысяч (на экране и в тексте, копируемом в буфер), «対象月» в копируемом отчёте = сырое `2026-09`, запасное значение `-` в ASCII, кнопка закрытия подписана `キャンセル` (`closeLabel={t('cancel')}`). Это деньги сотрудника, показ без валюты вводит в заблуждение. | Форматировать `¥1,250` / `円`, месяц как `2026年9月`, подпись закрытия `閉じる`. |
| A-06 | P2 | `issues/issues-i18n.ts:192,230,258` (JA) | Разные слова для одного понятия "Open": вкладка `viewOpen` = `対応中` (в работе), статус `statusOpen` = `未対応` (не начато). Вкладка «対応中» содержит также «確認済み». Ошибка `errNotOpen` = `この項目はすでに対応中ではありません。` фактически значит «уже решено», но читается как «уже не в работе». Основной экран модуля. | Согласовать: вкладка `未解決`, статус `未対応`, ошибка `この項目はすでに解決済みか、対応中ではありません` (нужен нативный). |
| A-07 | P2 | `manager-dashboard-i18n.ts:992` (`navPurchases` = `仕入れ`), `purchases/purchases-i18n.ts:114` (`pageTitle` = `購入`), `weekly-review-i18n.ts:198` (`sectionPurchasing` = `仕入れ`), `inventory-i18n.ts:288` (`購入(仕入れ)`) | Один модуль называется в меню `仕入れ`, а после клика заголовок страницы `購入`. Ещё в тексте `購入(仕入れ)` подряд. В модуле теперь есть заказ (`発注`) и приём (`入荷`), т.е. «仕入れ» по смыслу точнее. | Founder/нативный: выбрать одно название модуля. Переименовать во всех четырёх местах. |
| A-08 | P2 | `recipes/[recipeId]/recipe-detail-client.tsx:227`, `recipes/recipes-list-client.tsx:188` | Каноничные экраны рецептов берут только `resolveFieldDisplay(field, lang).text`, поле `marker` (`machine` / `reviewed` / `original`) выбрасывается. Метки «機械翻訳（未確認）» / «原文（日本語）» существуют, но выводятся лишь в dev-референсе `lib/preview/preview-recipe-detail-view.tsx`. В EN-режиме машинный перевод рецепта выглядит как утверждённый, а непереведённое поле молча показывается по-японски. Проверить вживую (Track B): статически только видно, что `marker` не используется. | Показывать маркер рядом с полем (материал уже есть в `i18n.recipe-translation.ts`). |
| A-09 | P2 | `recipes/recipes-i18n.ts:168` (EN) и `:244` (JA) | Разная сила утверждения об аллергенах: JA `アレルゲンなし（確認済み）` (утверждает «нет, проверено»), EN `No known allergens` (осторожно). Плюс перечень `ALLERGEN_LABELS` = 10 позиций (по памяти: 8 обязательных 特定原材料 + soy + sesame, остальные рекомендуемые не покрыты). Это самая рискованная категория текста в продукте. | Нативная и юридическая проверка формулировки и списка; выровнять JA и EN по смыслу. Не менять без решения Founder. |

### 5.2 Класс C (backlog)

| ID | Sev | Где | Проблема |
|---|---|---|---|
| C-01 | P2 | `manager/page.tsx:167,169,177-178`; `operations/page.tsx:75,79,104,109,121`; `inventory/page.tsx:75,79,155,159`; `purchases/page.tsx:73,77,125,129`; `staff/page.tsx:59` | Fallback-страницы ("No location is configured for this workspace yet.", "Back to dashboard", "Inventory is temporarily unavailable.", "You do not have a staff profile for this tenant yet.") только на английском, хотя JA-варианты уже лежат в словарях (`unavailable`, `noLocation`). `staff/page.tsx:150-156,183-190` делает правильно: JA сверху, EN снизу. Достижимо только при сбое/неполной настройке. |
| C-02 | P2 | `manager/page.tsx:56`; `operations/template-detail-modal.tsx:442,529` | Сбой чтения выводит `result.message` в красную плашку: английское "Unexpected error." или сырой текст БД (тот же механизм, что A-03, но в Manager Operations). |
| C-03 | P2 | `dashboard/page.tsx:65-329`; `components/tenant-switcher.tsx:51`; `dashboard/page.tsx:243,313` | Платформенный `/dashboard` целиком английский, выводит сырое `membership.status`, сырое `module.module`, а `TenantSwitcher` выводит `location: <UUID>`. Попасть сюда можно, если у пользователя нет staff-профиля (`lib/auth/post-login-redirect.ts:33,48`); Manager/Staff в нормальном пути идут в `/manager` `/staff`. Вероятно намеренно (admin-поверхность), но UUID пользователю показывать не стоит. |
| C-04 | P3 | `inventory/page.tsx:26`, `manager/page.tsx:62`, `operations/page.tsx:22`, `purchases/page.tsx:26`, `recipes/page.tsx:24`, `recipes/[recipeId]/page.tsx:24`, `staff/page.tsx:41`, `sign-in/page.tsx:30` | Заголовки вкладок браузера (`metadata.title`) только на английском ("Manager", "Staff", "Inventory"…). |
| C-05 | P3 | `staff/monthly-shift-preference-modal.tsx:91,118,130,141,144,148,151,184,222,226,232,237,243`; `staff/staff-mail-popup.tsx:68`; `components/demo/cafe/Modal.tsx:34` | Пары JA/EN написаны inline тернарником, мимо словаря (оба языка есть, поэтому не пропуск, но правка текста требует править код). В EN заголовок месяца выглядит как `Month 10` (строка 184) вместо названия месяца. |
| C-06 | P3 | `packages/ui/src/dialog.tsx:54`; `design-kit/Modal.tsx:35`, `Toast.tsx:96`, `Lightbox.tsx:79` | Английские дефолты подписей закрытия/скрытия. Экраны обычно передают свою подпись, но `Toast` и `Lightbox` фиксируют английское aria-label. |
| C-07 | P3 | JA: `manager-dashboard-i18n.ts:confirmDeleteStaffBody, confirmDeleteShiftTypeBody, automationHelpBody, autoCreateUndone, correctingPastScheduleNotice`; `weekly-review-i18n.ts:popupHelpBody`. EN: 14 строк | ASCII ` -- ` в середине предложения (6 JA, 14 EN). В EN одновременно используются ` -- ` и ` — ` (11 строк). DEBT-018 говорит «two strings» — фактически 6 японских: обновить реестр. |
| C-08 | P3 | `manager/attention-panel.tsx:230`; `correction-requests-popup.tsx:82,85-86,169`; `shift-exchange-requests-popup.tsx:180`; `staff-name-detail-popup.tsx:48-49,87-89`; `staff/correction-request-form.tsx:95`; `_ui/workforce-theme.ts:33,35`; `staff-dashboard-client.tsx:848-851`; `inventory-dashboard-client.tsx:271` | Заглушка пустого значения не единая: `-`, `—`, `–`, диапазоны времени через ` - `. Сами `--` в пользовательском тексте отсутствуют. |
| C-09 | P3 | `manager/attention-panel.tsx:160,183,206`; `correction-requests-popup.tsx:92,186`; `shift-exchange-requests-popup.tsx:180,183,325`; `issues/issues-manager-body.tsx:213`; `issues-staff-body.tsx:135`; `operations/attention-section.tsx:208`; `staff-messages-popup.tsx:203,228`; `manager-dashboard-client.tsx:839,1556` | Даты выводятся сырым ISO `2026-09-21` в Manager/Issues/Operations, а в других местах локализованно (`toLocaleString('ja-JP')`). Для японского пользователя ожидается `9月21日`. |
| C-10 | P3 | `issues/issues-manager-body.tsx:176`, `operations/attention-section.tsx:212` (`toLocaleString(locale)` без `timeZone`, оба `'use client'`); `operations/template-detail-modal.tsx:79` (`new Date().toISOString().slice(0,10)`) | В отличие от `inventory-dashboard-client.tsx:123` и `purchases-dashboard-client.tsx:39` (часовой пояс точки) время показывается в поясе браузера; риск расхождения при SSR. Плюс `scheduleState()` берёт «сегодня» по UTC: с 00:00 до 09:00 JST бейдж расписания (`active`/`scheduled`/`retired`) считается по вчерашней дате (той же природы баг уже исправлен PR #536 для `manager/page.tsx` и `staff/page.tsx`). Проверить в Track B. |
| C-11 | P3 | `staff/staff-dashboard-i18n.ts:513-514` | EN "A open exchange request already exists for this shift." (грамматика: `A open` / `A accepted`); JA `すでに受付中状態の…` (неестественно), `accepted` = `承認済み`, тогда как `_ui/workforce-theme.ts:249` даёт `承諾済み`, а `open` там `募集中`, здесь `受付中`. |
| C-12 | P3 | `operations-i18n.ts:attentionNoOpenExceptions, errExceptionNotFound, errExceptionAlreadyResolved`; `weekly-review-i18n.ts:labelOpenExceptions`; `manager-dashboard-i18n.ts:exchangeWaitingForCandidate, bind/binding/unbindLine` | EN-жаргон в UI: "exceptions", "candidate", "Bind/Unbind LINE". JA-стороне это `問題` / `交換相手` / `連携`. У `attentionNoOpenExceptions` EN длиннее JA на предложение "Everything looks fine.". |
| C-13 | P3 | см. раздел 6 | Терминологический разнобой (店長/マネージャー/管理者, 従業員/スタッフ, 交換/交代, 拠点/店舗, 無効化/休止/停止/廃止, 再開/再有効化, 自動割り当て/自動でシフトを作成/自動シフト作成, 手順書/インストラクション/マニュアル, 休み希望/勤務不可, メール/メッセージ, 不足/要補充/在庫不足). |
| C-14 | P3 | `manager-dashboard-i18n.ts:entryPointsHeading` и `staff-dashboard-i18n.ts:entryPointsHeading` (EN) | "Staff & recipe & Inventory management": неровный регистр и двойной `&`. Тот же заголовок стоит и на странице Staff, где «management» вводит в заблуждение. |
| C-15 | P3 | `staff-dashboard-i18n.ts:exchangeHelpBody` | Справка ссылается на подписи «交換希望» / 「変更」/ 「キャンセル」, а в форме опции названы `交換希望` / `別のシフト種別を希望` / `キャンセル希望`. Совпадает только первая. |
| C-16 | P3 | по 8 файлам | 71 ключ на production-пути, по всей видимости, не используются (кандидаты, возможны динамические обращения): inventory 6, issues 3, manager 20, operations 4, staff 29, weekly-review 9. Мёртвый текст тоже попадёт на нативную проверку. Полный список по запросу. |
| C-17 | P3 | `lib/workforce/shift-types.ts:60` | `shiftTypeDisplayLabel` возвращает `labelJa \|\| labelEn`, т.е. в EN-режиме показывается японское название вида смены. Данные, не код, но при «EN toggle» приёмке это будет замечено. |
| C-18 | P3 | `inventory-dashboard-client.tsx:586`, `purchases-dashboard-client.tsx:363`, `operations-manager-client.tsx:112`, `operations-i18n.ts:pageDescription`, `purchases-i18n.ts:pageDescription` | Подзаголовок собирается склейкой `"日次在庫確認 - " + tenant + " — " + location + "."`: ASCII-дефис, длинное тире и латинская точка в японской строке; в Operations разделитель `·`. Также `purchases-i18n.ts` без теста симметрии. Также `{n} {t('taskOpenExceptions')}` даёт `2 件の未解決の問題` с пробелом (`today-tasks-section.tsx:106`, `staff-operations-client.tsx:174`). |
| C-19 | P3 | `...` (16 японских строк) и `…` (11) вперемешку | Единый знак многоточия («保存中...» / «保存中…»). |

## 6. Сводка терминологии (JA, production-словари)

Число вхождений в значениях `ja` по production-файлам. Правило: один термин на одно понятие. Столбец «предложение» это мой первый вариант, не решение.

| Понятие | Варианты (частота) | Замечание | Предложение для нативного |
|---|---|---|---|
| Роль управляющего | マネージャー 17, 店長 13 (в основном справка и demo-словари), 管理者 1 (`operations-i18n.ts:thresholdNotConfiguredStaff`) | На кнопках `マネージャー`, в справках `店長`; в Operations `管理者` | Выбрать одно; UI-роль уже `マネージャー` |
| Закупки | 仕入れ 9, 購入 17 | см. A-07 | Одно название модуля |
| Работник | スタッフ 91, 従業員 2 (`inviteErrorNotFound`, `inviteErrorDuplicate`) | | `スタッフ` |
| Обмен сменой | 交換 31, 交代 3 (`weekly-review:labelShiftExchanges, viewShiftExchanges`) | | `交換` |
| Место | 拠点 12, 店舗 8 | `noLocation` содержит оба: «この店舗にはまだ拠点が…» | Одно слово |
| Выключить | 無効化 30, 休止 2, 停止 4, 廃止 16 | Operations: `廃止` (шаблон) и `停止` (расписание) при EN "Retire"/"Deactivate" | Свод по объектам |
| Включить обратно | 再有効化 1, 再開 2, 有効化 7 | Сотрудники/типы смен: `再開`; Inventory: `再有効化` | `再有効化` |
| Автосоздание смен | `自動割り当て` (workforce-landing), `自動でシフトを作成` (manager), `自動シフト作成` (demo) | EN: "auto-distribution" / "Create schedule automatically" / "Auto-create shifts" | Одно имя функции |
| Материал по рецепту | 手順書 3 (Recipes), インストラクション 2 (demo), マニュアル 2 | | Одно имя |
| Недоступность | 休み希望 3 (Staff), 勤務不可 4 (Manager), 不可 11 | Сотрудник пишет «休み希望», управляющий видит «不可» | Согласовать пару |
| Принятие обмена | `承認済み` (approved) и `承諾済み` (accepted) | В `staff-dashboard-i18n.ts` accepted = `承認済み` | Разделить: 承諾 / 承認 |
| Нехватка запаса | 不足 14, 要補充 3, 在庫不足 3 | EN: Shortage / Need reorder / Need restocking / Needs restock | `不足` в статусе, `要補充` только в фильтре |
| Сообщения | メール 13 (внутренний чат Staff↔Manager и письма Auth), メッセージ 17 | «メール» = электронная почта, а модуль это внутренние сообщения | Возможно `メッセージ` для чата |
| Категории проблем | `接客` (weekly-review) vs `お客様対応` (issues); `業務` vs `オペレーション` | Одни и те же категории в двух модулях названы по-разному | Одна таблица |
| Прямое обращение | `あなた` 3, `ご自身` 2 | `あなたが決めます`, `あなたの判断を待っています`: для японского UI жёстко | Нативный |

## 7. Пакет для внешнего японского ревьюера (ChatGPT), первый проход

Инструкция для рецензента (на английском, передаётся дословно):

> You are reviewing Japanese UI copy for a Japanese-first café management SaaS used by owners/managers and part-time staff. For each row below, judge the JA text (and whether the EN matches the meaning), and reply with: severity (blocker/should-fix/nit), a corrected JA string, and a one-line reason. Keep the same placeholders and formality (です・ます). Where a term is inconsistent across rows, propose ONE term for the whole product and list which rows change. Do not invent new features. All strings are generic UI text; there are no names, credentials or customer data in this packet.

Формат: `файл:ключ` (файлы относительно `apps/web/src/app/(protected)/`, если не указано иное).

### 7.1 Приоритет 1: смысл/риск (сначала эти)

| # | file:key | Current JA | Current EN | Concern |
|---|---|---|---|---|
| 1 | `recipes/recipes-i18n.ts:allergensNoneKnown` | アレルゲンなし（確認済み） | No known allergens | JA asserts "no allergens, confirmed"; EN is hedged. Food-safety wording: which is right? |
| 2 | `recipes/recipes-i18n.ts:allergensNotConfigured` | アレルゲン未設定 | Allergens not set | Is 未設定 clear enough as "not yet entered"? |
| 3 | `inventory/inventory-i18n.ts:allergensConfirmedCheckboxLabel` | この品目のアレルゲン情報を確認済み | Allergen information confirmed for this item | Natural wording for a manager's confirmation checkbox? |
| 4 | `issues/issues-i18n.ts:viewOpen` | 対応中 | Open | 対応中 means "in progress" but this tab lists everything not resolved (incl. 確認済み). |
| 5 | `issues/issues-i18n.ts:statusOpen` | 未対応 | Open | Same EN word maps to a different JA word than row 4. |
| 6 | `issues/issues-i18n.ts:errNotOpen` | この項目はすでに対応中ではありません。 | This item is no longer open. | Reads as "no longer being handled"; real meaning is "already resolved/closed". |
| 7 | `issues/issues-i18n.ts:errSeverityNotApplicableToHandover` | 申し送りメモには重要度がありません。 | A handover note does not have a severity. | Natural error wording? |
| 8 | `purchases/purchases-i18n.ts:pageTitle` | 購入 | Purchases | Menu label elsewhere is 仕入れ (see row 9). Choose one. |
| 9 | `manager/manager-dashboard-i18n.ts:navPurchases` | 仕入れ | Purchases | 仕入れ vs 購入 (also `weekly-review/weekly-review-i18n.ts:sectionPurchasing` = 仕入れ). The module has Order (発注) and Receive (入荷). |
| 10 | `inventory/inventory-i18n.ts:purchasedBadgeAriaLabel` | 購入(仕入れ)で購入済みとしてマークされています — 下の実数を更新すると解除されます | Marked as bought in Purchases — update the actual quantity below to clear this | Two terms in parentheses, half-width brackets, 解除 wording. |
| 11 | `weekly-review/weekly-review-i18n.ts:labelPendingPurchases` | 対応が必要な仕入れ | Pending purchases needed | Awkward; "needed" vs "pending" mismatch. |
| 12 | `weekly-review/weekly-review-i18n.ts:quietWeekTitle` | 穏やかな一週間でした | A quiet week | 穏やか may be too poetic for a business review; is there a more standard phrase? |
| 13 | `weekly-review/weekly-review-i18n.ts:labelShiftExchanges` | 今週作成された交代・修正申請 | Shift exchanges/corrections created this week | 交代 vs 交換 used elsewhere; 修正申請 here means attendance corrections. |
| 14 | `weekly-review/weekly-review-i18n.ts:labelOpenExceptions` | 現在未解決の対応事項（日付を問わず） | Still-open exceptions (any date) | EN "exceptions" is developer jargon; JA uses 対応事項 while other modules use 問題. |
| 15 | `operations/operations-i18n.ts:confirmRetireTemplateBody` | 廃止は今後に対して取り消せません。本日以降は新しいタスクが生成されなくなります。過去の履歴は保持されます。 | Retiring is permanent going forward: this template will stop generating new tasks after today. Past history is kept. | 「今後に対して取り消せません」 is stilted. |
| 16 | `operations/operations-i18n.ts:thresholdNotConfiguredStaff` | 管理者による基準値の設定が必要です | Threshold requires manager configuration | 管理者 vs マネージャー; 基準値 vs しきい値 (Manager view says しきい値未設定). |
| 17 | `operations/operations-i18n.ts:noLocation` | この店舗にはまだ拠点が設定されていません。 | No location is configured for this workspace yet. | 店舗 and 拠点 contradict each other in one sentence. |
| 18 | `operations/operations-i18n.ts:confirmDeactivateScheduleBody` | 指定した日以降、新しいタスクは生成されなくなります。過去の履歴は保持されます。 | This schedule will stop generating new tasks after the boundary date. Past history is kept. | "指定した日" refers to a date the dialog does not show; EN "boundary date" is jargon. |
| 19 | `operations/operations-i18n.ts:errItemDefinitionFrozen` | すでに使用されているため、この方法では変更できません。「回答形式を変更」をご利用ください。 | This has already been used, so it can no longer be changed this way. Use "Change response type" instead. | Clear enough? Subject missing. |
| 20 | `manager/manager-dashboard-i18n.ts:automationHelpBody` | 「自動スケジュール」をONにすると、下で設定した日（1〜28日）に、来月分のシフトを自動で作成します -- スタッフの希望・必要人数・…（long, ~10 sentences） | When "Automatic schedule" is ON, the system creates next month's schedule for you on the day you choose below (1-28) -- as a draft proposal… | Very long help in one paragraph, ASCII `--`, 「案」 as draft, 「あなたが決めます」. Suggest splitting into bullets and native phrasing. |
| 21 | `manager/manager-dashboard-i18n.ts:priorityExplainerBody` | スケジュール作成時の優先順位: 1. Weekly Scheduleで手動設定したシフト 2. スタッフが提出した希望（…） 3. 自動割り当て | Priority when building the schedule: 1. A shift set by hand in Weekly Schedule … | English UI name "Weekly Schedule" inside the JA text; the JA UI calls it 週間スケジュール / シフト表. |
| 22 | `manager/manager-dashboard-i18n.ts:shiftRequestsPopupHelpBody` | 来月のシフト希望を提出したスタッフと、未提出のスタッフを確認できます。赤色の名前を開くと、送信用のリマインダー文をコピーできます。「承認済み」は店長が確認した記録で、…「+」は希望未入力、「—」は勤務不可を表します。 | Check who has submitted next month's availability … | 店長 vs マネージャー; 勤務不可 here vs 休み希望 on the Staff side. |
| 23 | `manager/manager-dashboard-i18n.ts:attentionUnavailableConflictTitle` | 不可との重複 | Unavailable conflicts | Terse to the point of unclear (「不可」 = marked unavailable). Better label? |
| 24 | `manager/manager-dashboard-i18n.ts:attentionConflictSummary` | 「不可」と回答した日にシフトが割り当てられています | Assigned while marked unavailable | Same 不可 usage; natural? |
| 25 | `manager/manager-dashboard-i18n.ts:sendReminderBody` | このスタッフはまだシフト希望を提出していません。このメッセージをコピーして、ご自身で送ってください。 | This employee hasn't submitted shift preferences yet. Copy this message and send it yourself for now. | Fine, but EN says "employee" and "for now". |
| 26 | `manager/manager-dashboard-i18n.ts:reactivate` | 再開 | Reactivate | Elsewhere 再有効化 (inventory) / 有効化 (activate). |
| 27 | `manager/manager-dashboard-i18n.ts:exchangeWaitingForCandidate` | 交換相手を待っています | Waiting for candidate | EN "candidate" jargon; JA fine? |
| 28 | `manager/manager-dashboard-i18n.ts:mailChipTitle` | メール | Mail | 「メール」 normally means e-mail; this is an internal message thread. メッセージ? |
| 29 | `manager/manager-dashboard-i18n.ts:entryPointsHeading` | スタッフ・レシピ・在庫管理 | Staff & recipe & Inventory management | Also shown on the Staff page (`staff/staff-dashboard-i18n.ts:entryPointsHeading`), where "管理" misleads. |
| 30 | `manager/manager-dashboard-i18n.ts:confirmDeleteStaffBody` | この操作は取り消せません -- プロフィールは完全に削除されます。 | This cannot be undone — their profile will be permanently removed. | ASCII `--` in JA. |
| 31 | `manager/manager-dashboard-i18n.ts:autoCreateUndone` | 自動作成を取り消しました -- 作成されたシフトは削除されました。 | Automatic creation undone -- the shifts it created were removed. | ASCII `--` in JA. |
| 32 | `manager/manager-dashboard-i18n.ts:correctingPastScheduleNotice` | 過去のスケジュールを修正しています -- この日付はすでに過ぎています。 | Correcting past schedule — this date has already passed. | ASCII `--` in JA. |
| 33 | `manager/manager-dashboard-i18n.ts:autoCreateAssignedWithoutPreferenceHeading` | 希望未提出のまま割り当てたスタッフ | Assigned without a submitted preference (fallback) | Natural? |
| 34 | `staff/staff-dashboard-i18n.ts:preferenceUnavailableValue` | 休み希望 | Unavailable | Staff sees 休み希望; manager sees 勤務不可 / 不可. Pick a matched pair. |
| 35 | `staff/staff-dashboard-i18n.ts:exchangeHelpBody` | この操作は申請です。送信しただけではシフトは変わりません。「交換希望」は同僚に引き受けてもらう、または店長が交換相手を指名します。「変更」は…「キャンセル」は… | This submits a request -- it does not change your shift by itself. "Offer for exchange" asks a coworker to take it… | Quoted labels do not match the option labels 交換希望 / 別のシフト種別を希望 / キャンセル希望. |
| 36 | `staff/staff-dashboard-i18n.ts:existingExchangeMessage` (ja fn) | このシフトにはすでに受付中状態の交換リクエストがあります。 | A open exchange request already exists for this shift. | 「受付中状態の」 unnatural (EN also has "A open"). |
| 37 | `_ui/workforce-theme.ts:EXCHANGE_STATUS_LABELS.open` | 募集中 | Open | Staff dictionary uses 受付中 for the same status. |
| 38 | `_ui/workforce-theme.ts:EXCHANGE_STATUS_LABELS.accepted` | 承諾済み | Accepted | Staff dictionary uses 承認済み (which is "approved"). Keep 承諾 vs 承認 distinct. |
| 39 | `staff/staff-dashboard-i18n.ts:workStatusIdle` | 未出勤 | Not clocked in | Natural? |
| 40 | `staff/staff-dashboard-i18n.ts:reasonLabel` etc. `correctionMessageLabel` | 理由 | Reason | Fine; listed to confirm 「修正依頼」 vs 「修正申請」 (Manager uses 修正申請 in demo dict). |
| 41 | `dashboard/workforce/workforce-landing-i18n.ts:managerDescription` | スタッフ・シフト希望・週間スケジュールを確認し、自動割り当てとシフト公開を行います。 | Review staff, shift preferences, and the weekly schedule; run auto-distribution and publish shifts. | Feature named 自動割り当て here, 自動でシフトを作成 in Manager. File self-flags "machine-translated". |
| 42 | `dashboard/workforce/workforce-landing-i18n.ts:noProfile` | あなたのアカウントに紐づくスタッフプロフィールはまだありません。 | No staff profile linked to your account yet. | 「あなたの」 heavy; natural? |
| 43 | `recipes/recipes-i18n.ts:costIncompleteMessage` | 現時点の概算費用: {knownSubtotal}（{ingredientCount}個中{pricedCount}個が計算済み）。残りは価格未設定または単位換算不可です。 | Estimated cost so far: {knownSubtotal} ({pricedCount} of {ingredientCount} ingredients priced). Price not set or unit conversion not supported for the rest. | Counter 個 for ingredients, 「単位換算不可」 stiff; keep placeholders. |
| 44 | `recipes/recipes-i18n.ts:instructionBadge` | ⓘ 手順書 | ⓘ Instruction | Other UI (demo) says インストラクション; pick one. |
| 45 | `inventory/inventory-i18n.ts:referencePriceHint` | 1単位あたりの目安価格（円）。レシピの材料費目安にのみ使用され、仕入れや会計には使用されません。 | An estimate, in yen per 1 unit — used only for the Recipes estimated-cost feature, never for receiving or accounting. | JA says 仕入れ, EN says "receiving". |
| 46 | `inventory/inventory-i18n.ts:filterShortage` / `statusShortageBadge` / `footerNeedRestocking` | 要補充 / 不足 / 要補充 | Need reorder / Shortage / Need restocking | Three JA/EN pairs for one state. |
| 47 | `issues/issues-i18n.ts:kindIssue` | 問題（対応が必要な事項） | Issue (a problem) | EN and JA gloss differ; is the parenthetical needed? |
| 48 | `issues/issues-i18n.ts:categoryCustomer` vs `weekly-review/weekly-review-i18n.ts:categoryCustomer` | お客様対応 vs 接客 | Customer | Same category, two words. Same for categoryOperations: オペレーション vs 業務. |
| 49 | `manager/manager-dashboard-i18n.ts:inviteErrorNotFound` | 従業員が見つかりません。 | Staff member not found. | 従業員 vs スタッフ elsewhere. |
| 50 | `manager/manager-dashboard-i18n.ts:weekdayAriaSuffix` | 曜日の必要人数 | ` required headcount` | Screen-reader label built by concatenation with the weekday: check the assembled phrase reads correctly. |

### 7.2 Приоритет 2: строки вне словарей (для правки в коде, затем в пакет)

| # | file:line | Current JA | Current EN | Concern |
|---|---|---|---|---|
| 51 | `staff/monthly-shift-preference-modal.tsx:184` | `${monthLabel}月` | `Month ${monthLabel}` | EN pattern is unnatural ("Month 10"). |
| 52 | `staff/monthly-shift-preference-modal.tsx:226` | 色の付いた日はすでに提出済みで変更できません。 | Colored, non-tappable days already have a submitted preference and can no longer be changed here. | Inline, outside dictionary. |
| 53 | `staff/monthly-shift-preference-modal.tsx:91` | 勤務なし | Not working | Inline; compare 休み希望. |
| 54 | `app/auth/accept-invite/set-password/page.tsx:32-34` | ようこそ ORUWA へ / スタッフとしてログインするための、パスワードを設定してください。 | (no EN) | JA-only page; uses ログイン while the app elsewhere uses サインイン/サインアウト (see also `liff-entry/page.tsx:88` 「LINEでログイン」). |
| 55 | `apps/web/src/app/sign-in/page.tsx:56-70` | (none, English only) | Sign in / Sign in to LINE Business OS with your email and password. / Invalid email or password. Please try again. | Needs JA copy: propose 3 candidate lines (see A-01). Note ログイン vs サインイン must match the rest of the product. |
| 56 | `components/states.tsx:22-80` | (none, English only) | Loading… / Something went wrong / Access denied / No workspace yet / Feature unavailable … | Needs JA copy (see A-02). |

Что не вошло в пакет: имена людей, e-mail, ID арендаторов, данные Cloud DEV, ключи. Использовались только строки из репозитория.

## 8. Рекомендации по порядку работ

1. **Решение Founder до Track B**: A-01 (вход JA/EN/оба), A-07 (название модуля закупок), A-06 (словарь статусов Issues), A-09 (формулировка аллергенов). Это выборы терминов и рисков, кодом они не решаются.
2. **Малые кодовые правки класса A**, безопасные и локальные: A-03 (явные ветки `describeWriteError`), A-04 (`employmentTypeLabel`), A-05 (формат денег/месяца), A-02 (двуязычные state-заглушки), A-08 (показ маркера машинного перевода).
3. Отправить пакет (раздел 7) в ChatGPT, применить принятые правки одним PR «JA copy pass 1». Нативная проверка остаётся за DEBT-018 (не закрывать этим документом).
4. Обновить `docs/operations/deferred-debt-register.md`: DEBT-018 говорит «two strings use raw `--`», фактически 6 японских (C-07); добавить ссылку на A-01/A-02/A-03 (английские экраны и сообщения не значатся в реестре).
5. В Track B проверить вживую: A-08 (EN-режим рецепта), C-10 (время после полуночи по JST), порядок слов в склейках (`pageDescription`, `weekdayAriaSuffix`, счётчики), переполнение длинных JA-строк на мобильном.
