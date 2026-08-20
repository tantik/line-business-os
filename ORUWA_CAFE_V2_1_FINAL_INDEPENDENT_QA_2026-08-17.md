# ORUWA Cafe v2.1 — независимый финальный QA после PR #273–#284

**Дата:** 2026-08-17  
**Среда:** `https://preview.oruwa.jp`  
**Проверяющий:** независимый Founder Browser QA  
**Сравнительный прототип:** `/demo/cafe/manager`, `/demo/cafe/staff`, `/demo/cafe/recipes`  
**Итог:** **FAIL — основные P1 исправлены, но Cafe v2.1 ещё нельзя считать полностью законченным**

---

## 1. Executive summary

После merge PR #273–#284 продукт стал значительно лучше предыдущего состояния:

- post-login routing отправляет Manager на `/manager`, Staff на `/staff`;
- Inventory Save больше не падает после записи;
- структурированная correction действительно меняет рабочее время;
- custom shift показывает реальное время Staff и Manager;
- Inventory filters/search работают;
- Recipe Manager CRUD появился;
- JA↔EN translation создаётся автоматически и обновляется после изменения source;
- route-specific skeletons присутствуют;
- Sign out появился на `/manager` и `/staff`;
- основные controls увеличены;
- Add/Edit Inventory корректно закрываются по Escape и возвращают focus;
- Recipe Draft/Publish/Archive/Restore и published-only Staff access работают.

Но финальный Founder Acceptance всё ещё не проходит по совокупности следующих причин:

1. `Delete forever` для реально созданного и переведённого Archived recipe не завершился после двух подтверждённых попыток; объект остался в Preview.
2. Требуемый прямой путь `/recipes` по-прежнему возвращает 404.
3. Manager mobile 375 px остаётся практически непригодным: имена и заголовки сжимаются в колонки 33–34 px и становятся вертикальными.
4. Staff mobile расписание функционально работает, но заметно хуже прототипа и требует горизонтальной прокрутки.
5. Escape закрывает Add Staff и Shift Cell Editor, но focus остаётся на `<body>`.
6. В EN Inventory названия товаров остаются японскими.
7. Sign out отсутствует на Recipes и Inventory; пользователю приходится возвращаться на `/staff` или `/manager`.
8. Staff profile по-прежнему не показывает имя вошедшего сотрудника.
9. `/dashboard/workforce` остаётся лишним platform hub между ежедневными Cafe-экранами.

### Release recommendation

Cafe v2.1 можно считать **functional beta**, но не законченной коммерческой версией для реального кафе. Для завершения нужен короткий функциональный hardening и отдельное Founder-решение по mobile/design parity.

---

## 2. Что было проверено независимо

### Учётные роли

Проверены последовательные login/logout сессии:

- Manager;
- Staff 1;
- Staff 2.

Пароли и email в отчёт не включены.

### Текущие рабочие маршруты

- `/sign-in`;
- `/manager`;
- `/staff`;
- `/dashboard/workforce`;
- `/dashboard/workforce/recipes`;
- `/dashboard/workforce/recipes/[recipeId]`;
- `/dashboard/inventory`;
- `/recipes`.

### Прототипы для визуального сравнения

- `https://preview.oruwa.jp/demo/cafe/manager`;
- `https://preview.oruwa.jp/demo/cafe/staff`;
- `https://preview.oruwa.jp/demo/cafe/recipes`.

Эти demo-страницы используют фиктивные данные Mirawi Cafe и не являются DB-backed acceptance environment. Их назначение в этом отчёте — UI/UX/product reference.

### Desktop и mobile

- normal desktop viewport;
- requested mobile override 375×812;
- фактический Chromium `innerWidth` в используемой среде составил 416 px, а document width — 400 px;
- поэтому mobile-находки относятся к реальному rendered breakpoint этой среды и должны быть повторены на физическом 375 px устройстве перед релизом.

### Реальные действия

- Recipe Create;
- автоматический перевод;
- Recipe Edit;
- повторный перевод после изменения source;
- Draft → Published;
- Staff published-only view;
- Published → Archived;
- Staff archived-hidden view;
- Archived → Restore → Draft;
- повторный Publish;
- повторный Archive;
- две попытки Delete forever;
- Inventory search/filter;
- Inventory Save с тем же count;
- Draft shift Assign;
- Draft shift Edit;
- Draft shift Unassign;
- Staff/Manager role isolation;
- JA/EN switching;
- Escape/focus для Add Staff, Shift Cell Editor, Add/Edit Inventory;
- console error checks в основных переходах.

### Не выполнялось сознательно

- Auto-distribution: создаёт широкий набор смен без preview/undo и загрязняет общую Preview DB;
- реальный Staff Create/Invite/Permanent Delete: форма требует настоящий email и может отправить invitation;
- существующие Staff Deactivate/Delete: нельзя использовать реальные fixture-профили как disposable данные;
- новый shift-exchange lifecycle: оставляет дополнительную историю без безопасного cleanup;
- изменение/удаление ранее опубликованной смены 10:00–14:30: UI делает её read-only;
- production, migrations, RLS и secrets не изменялись.

Это не скрытые PASS: перечисленные сценарии имеют статус **NOT VERIFIED / требуется отдельный disposable fixture gate**.

---

## 3. Проверка заявлений Claude Code

| Заявление | Независимый результат |
|---|---|
| Inventory filters/search | PASS |
| Inventory hydration fix | PASS в проверенных переходах; React #418 не появился |
| 44 px controls | PARTIAL PASS: основные buttons/inputs около 44 px; обычные links и checkbox меньше |
| Add/Edit Staff focus restore | FAIL для Add Staff: после Escape focus на BODY |
| Add/Edit Inventory focus restore | PASS |
| Sign out на Manager/Staff | PASS |
| Page chrome/profile localization | PASS для labels; Barista/part_time остаются исходным свободным текстом |
| Route-specific skeletons | PASS по live RSC/loading evidence и source |
| Escape закрывает формы | PASS |
| Shift Cell Editor focus restore | известный FAIL подтверждён: BODY |
| Recipe auto-translation | PASS для Create и повторного Edit |
| Recipe Archive/Delete cleanup | Archive PASS; Delete forever FAIL/INCOMPLETE |
| Mobile Inventory/Recipes | PASS по функциональности и ширине |
| Mobile Manager tables | FAIL по usability, как и указано Claude Code |

---

## 4. Подтверждённые PASS

### Authentication и routing

- Manager после login перенаправлен на `/manager`.
- Staff после login перенаправлен на `/staff`.
- Staff при прямом переходе на `/manager` получает Access denied.
- Manager без связанного Staff profile не получает чужой Staff-контекст.
- Sign out на `/manager` и `/staff` завершает сессию и возвращает `/sign-in`.

### Schedule

- опубликованная custom-смена 鈴木 健太 показывается Manager как `10:00 - 14:30`.
- Staff 2 видит эту же смену в Monday cell.
- weekly total Staff 2 = 4.5h, что совпадает с видимой сменой.
- All и Only me не скрывают собственную смену.
- Draft shift 09:00–13:00 был создан для 佐藤 陽介.
- Draft был изменён до 09:00–13:30.
- Unassign успешно удалил disposable Draft без console error.
- существующая published shift отображается read-only.

### Attendance correction

- Staff 1 показывает изменённый work report `09:00–17:15`.
- Manager показывает Approved structured request `09:00–17:15`.
- старый legacy correction без structured requested values остался Approved, но не изменил 09:00–17:00 — это ожидаемая историческая fixture, а не доказательство регрессии нового flow.

### Inventory

- Save count завершился без fatal error.
- current quantity сохранилась как 3 kg.
- timestamp обновился.
- console error отсутствовал.
- Search `コーヒー` показал только coffee item.
- Need reorder при достаточных остатках показал пустой набор.
- OK показал coffee и milk.
- Add/Edit Inventory закрываются по Escape.
- focus возвращается на `＋ 商品を追加` или соответствующую `編集`.

### Recipes и translation

Создан disposable recipe:

`CODEX QA Vanilla Hojicha Latte 20260817`

Проверено:

- original language EN;
- Draft creation;
- натуральный JA translation title/description/ingredients/steps/notes;
- EN source не был простой копией JA;
- source Edit до `... EDITED 20260817`;
- после Edit JA title/description автоматически обновились;
- Publish;
- Staff видит published recipe;
- Staff не видит Manager controls;
- JA и EN detail корректны;
- Archive скрывает recipe от Staff;
- Restore возвращает recipe в Draft;
- повторный Publish снова делает recipe видимым Staff;
- повторный Archive делает доступным Delete forever.

### Console и automated checks

- в проверенных обычных Manager/Staff/Inventory/Recipe переходах console errors не обнаружены;
- typecheck: 11/11 packages PASS;
- lint: 19/19 tasks PASS;
- tests: PASS, включая web 1101/1101;
- build: 14/14 tasks PASS;
- Next.js production build завершился успешно;
- GitHub PR #284 checks: CI PASS, Vercel PASS.

---

## 5. Release blocker / P1

### P1-1. Recipe Delete forever не завершает удаление

#### Воспроизведение

1. Manager создаёт recipe.
2. Recipe получает translation.
3. Manager архивирует recipe.
4. Нажимает `Delete forever`.
5. Подтверждает browser confirm.
6. Действие не завершает ожидаемую навигацию.
7. После повторного открытия списка Archived recipe всё ещё присутствует.
8. Повторная подтверждённая попытка дала тот же результат.

#### Ожидалось

- pending state;
- guarded RPC удаляет recipe и зависимые ingredients/steps/notes/translations/media;
- возврат к list page;
- recipe отсутствует;
- success feedback;
- повторный detail URL возвращает Not found.

#### Фактически

- confirm был принят;
- browser flow зависал/не завершался в разумное время;
- recipe остался Archived;
- disposable fixture не удалось очистить через UI.

#### Severity

P1 для заявленного полного CRUD и Preview cleanup. Archive позволяет убрать recipe от Staff, поэтому ежедневный Staff flow не остановлен, но promised destructive flow не работает.

#### Вероятно затронутые файлы

- `apps/web/src/app/(protected)/dashboard/workforce/recipes/[recipeId]/recipe-detail-client.tsx`;
- `apps/web/src/lib/workforce/recipe-actions.ts`;
- `apps/web/src/lib/workforce/recipes.ts`;
- RPC `api.permanently_delete_recipe` / migration 0057;
- FK/cascade/delete order для translations, ingredients, steps, notes и media.

#### Что проверить разработчику

1. Воспроизвести в authenticated Preview вручную.
2. Проверить Network request Server Action: pending/status/response.
3. Проверить server/Vercel logs по recipe id из QA evidence, не выводя его клиенту.
4. Вызвать RPC в безопасной Preview SQL-сессии сначала read-only inspect, затем только с disposable fixture.
5. Проверить блокировки/history/FK и delete order.
6. Добавить timeout/error mapping: UI не должен бесконечно ждать.
7. Добавить integration/E2E: translated archived recipe → delete → list/detail absence.
8. После исправления удалить оставшийся Archived QA recipe.

---

## 6. Major issues / P2

### P2-1. `/recipes` всё ещё 404

Фактически проверено после PR #284:

`https://preview.oruwa.jp/recipes` → `404 This page could not be found`.

Рабочий URL:

`/dashboard/workforce/recipes`

#### Почему это важно

- пользователь и Founder ожидают короткий product route;
- Staff/Manager не должны знать внутреннюю Platform Foundation hierarchy;
- ссылку трудно запомнить и использовать в LINE/закладках;
- route architecture расходится с согласованной моделью `/staff`, `/manager`, `/recipes`.

#### Исправление

- создать canonical `/recipes` route либо permanent redirect;
- сохранить role-aware controls;
- обновить links из Staff/Manager/Workforce;
- добавить route tests и authenticated browser acceptance;
- canonical metadata/noindex для authenticated app.

### P2-2. Manager mobile table usability остаётся плохой

На requested mobile override текущий Manager показал:

- имя header cell `氏名` шириной 34 px;
- staff name cells шириной 33–34 px;
- высота одной staff row до 447 px;
- schedule staff-name column 33 px;
- несколько таблиц шириной 532–722 px внутри контейнера около 298 px;
- японские имена и actions визуально идут по одному символу вертикально.

#### Сравнение с прототипом

Reference:

`https://preview.oruwa.jp/demo/cafe/manager`

На том же viewport prototype Manager использует таблицу около 531 px с внутренним horizontal scroll и не сжимает ни одну проверенную cell ниже 50 px. Это не делает прототип идеальным mobile UI, но он не ломает японские имена вертикальной колонкой.

#### Решение

Рекомендуемый вариант: card/list mobile layout при `< 768px`, desktop table выше breakpoint.

Mobile cards Manager:

- Staff name одной строкой;
- position/status badges;
- compact actions menu;
- schedule переключается `by day` / `by staff`;
- время смены крупно;
- conflict/status отдельной строкой;
- correction cards вместо 8-column table.

Минимальный hotfix до redesign:

- `min-width` для name/action columns;
- `white-space: nowrap` для имён;
- horizontal scroll container;
- сокращённые mobile headings;
- sticky first column только если остаётся table.

### P2-3. Staff mobile уступает прототипу

Текущий Staff функционально показывает смену и total, но schedule остаётся широкой таблицей с внутренним scroll.

Reference:

`https://preview.oruwa.jp/demo/cafe/staff`

Prototype Staff на том же rendered width помещает schedule table примерно в 363 px без horizontal overflow всей таблицы и показывает имя сотрудника в branded header.

#### Целевое решение

- mobile week list/card, а не desktop roster table;
- today/next shift наверху;
- имя Staff в header;
- bottom navigation: Today, Schedule, Inventory, Recipes, More;
- coworker schedule — отдельный expandable view;
- 44 px interactive targets;
- checkbox clickable area не меньше 44 px через label wrapper.

### P2-4. Focus restore неполный

#### PASS

- Add Inventory → Escape → focus на Add item;
- Edit Inventory → Escape → focus на исходной Edit.

#### FAIL

- Add Staff → Escape → `<body>`;
- Shift Cell Editor → Escape → `<body>`.

#### Вероятная причина Add Staff

`requestAnimationFrame(() => addStaffButtonRef.current?.focus())` вызывается раньше, чем opener повторно смонтирован/доступен после state update, либо ref не привязан к фактической локализованной кнопке при текущем render path.

#### Исправление

- хранить `document.activeElement` opener перед open;
- после close восстанавливать focus в layout effect после commit;
- для Shift Cell Editor передавать opener ref/element;
- добавить browser-level test, а не только component/unit assertion;
- проверить Save и Cancel, Escape и pointer-close отдельно.

### P2-5. Inventory content остаётся японским в EN

После явного JA → EN:

- UI chrome стал English;
- item names остались `コーヒー豆`, `牛乳`;
- `Coffee` и `Milk` не появились.

Это не raw enum, а бизнес-контент каталога. Для англоязычного Staff это такое же требование content translation, как Recipes.

#### Исправление

- определить source language item;
- хранить/резолвить item translations;
- fallback должен быть явно обозначен;
- Manager edit должен показывать source/translation state;
- добавить tests JA item → EN display.

### P2-6. Sign out покрывает не все рабочие поверхности

Sign out присутствует на `/manager` и `/staff`, но отсутствует на:

- `/dashboard/workforce/recipes`;
- recipe detail;
- `/dashboard/inventory`.

Пользователь вынужден вернуться на Staff/Manager либо технический Dashboard.

#### Исправление

Вынести role-aware Cafe header в общий layout для Staff/Manager/Recipes/Inventory.

### P2-7. Staff profile не показывает имя

Staff 1 и Staff 2 визуально почти неразличимы:

- Position;
- Employment type;
- Status;
- но нет имени.

Prototype reference `/demo/cafe/staff` показывает `鈴木 舞 さん` в header.

#### Исправление

- показывать display name;
- location;
- role;
- безопасный account label;
- не показывать internal UUID;
- при multi-role/multi-tenant предусмотреть workspace/account switcher.

### P2-8. `/dashboard/workforce` остаётся лишним ежедневным hub

Для Cafe нужны прямые рабочие поверхности:

- `/staff`;
- `/manager`;
- `/recipes`;
- `/inventory` либо понятный Cafe route.

Workforce hub может существовать для платформенной модульности, но не должен быть обязательной точкой возврата. Сейчас `Back to Workforce` сохраняет внутреннюю архитектуру в пользовательском интерфейсе.

### P2-9. Published shift нельзя изменить или отменить

Существующая 10:00–14:30 shift показывает `Published -- read-only`.

Для реального кафе нужен controlled amendment flow:

- Edit/cancel published shift;
- обязательная причина;
- audit before/after;
- уведомление Staff;
- conflict recheck;
- schedule version/republication.

Полная неизменяемость защищает от тихой правки, но не решает реальные ошибки и болезни сотрудников.

### P2-10. Preference conflict не влияет на assignment

У 鈴木 健太 есть `Unavailable` на 2026-08-17, но опубликованная shift на тот же день существует. В текущем Manager attention экран показывает `Nothing needs your attention right now`.

Нужны:

- conflict badge в cell;
- conflict section в Needs attention;
- publish warning;
- explicit override reason;
- audit/notification.

---

## 7. Prototype parity matrix

| Область | Prototype URL | В прототипе | В текущем Cafe v2.1 | Решение |
|---|---|---|---|---|
| Manager identity/brand | `/demo/cafe/manager` | Cafe header, tenant context | generic platform shell | общий Cafe layout |
| Needs attention | `/demo/cafe/manager` | corrections, missing preferences, shortage | блок есть, но conflict Unavailable пропущен | расширить attention rules |
| Schedule | `/demo/cafe/manager` | shortage markers, shift codes, visible grid | реальные times, но плохой mobile | card layout/mobile min widths |
| Labour estimate | `/demo/cafe/manager` | monthly estimated labour | отсутствует | подтвердить scope; вернуть позже либо обозначить deferred |
| Staffing requirements | `/demo/cafe/manager` | weekday requirements settings | fixed hard-coded auto distribution | settings + preview/undo |
| Shift types | `/demo/cafe/manager` | create/edit/delete types | no configured types, limited UI | вернуть Manager lifecycle |
| Staff header | `/demo/cafe/staff` | brand + employee name | нет имени | display name + shared header |
| Clock in/out | `/demo/cafe/staff` | one-tap state | только manual work report | Founder решает: v2.1 scope или deferred |
| Staff schedule mobile | `/demo/cafe/staff` | compact table fits | horizontal roster table | mobile cards/list |
| Recipe catalog | `/demo/cafe/recipes` | богатый branded catalog/manuals | 2 production recipes, generic cards | seed/content strategy + visual parity |
| Direct Recipe route | `/demo/cafe/recipes` | короткий URL | `/recipes` 404 | canonical route |
| Recipe management | prototype Manager | management integrated | CRUD теперь есть | исправить Delete forever и навигацию |
| Language | все три | consistent branded JA/EN | UI лучше, но inventory content mixed | content i18n policy |

---

## 8. Minor issues / P3

- `Barista` и `part_time` остаются исходным свободным текстом; это не кодовый enum-баг, но Manager должен понимать язык вводимого значения.
- обычные Back links имеют высоту около 19–22 px; для touch желательно 44 px clickable wrapper.
- checkbox визуально 20×20; label может расширять clickable area, но это нужно подтвердить hit-target test.
- Recipe/Inventory используют `Back to Workforce`/`Back to dashboard` непоследовательно.
- page title остаётся общим `LINE Business OS`, а не `Manager — ORUWA Cafe` / `Recipes — ORUWA Cafe`.
- Recipe Published state не показывает отдельный Published badge, тогда как Draft/Archived badges видны; состояние можно понять только по отсутствию badge.
- после actions server pending иногда длится более секунды; нужен ясный локальный feedback и timeout/error recovery.
- full authenticated app должен иметь explicit `noindex` policy; классический SEO для внутренних страниц не является product priority.

---

## 9. Cleanup status

### Успешно очищено

- disposable Draft shift 09:00–13:30 для 佐藤 陽介 — Unassign PASS, в Manager больше не отображается.

### Не удалось очистить через UI

- `CODEX QA Vanilla Hojicha Latte EDITED 20260817` — остался Archived из-за Delete forever FAIL/timeout.

### Не трогались

- existing published custom shift 鈴木 健太 10:00–14:30;
- existing approved correction fixtures;
- real Staff fixtures;
- coffee/milk Inventory items.

Inventory coffee count был повторно сохранён как то же значение 3 kg; изменился только last-updated timestamp.

---

## 10. Пошаговый план завершения Cafe v2.1

### WP-A — Recipe Delete forever hotfix

**Цель:** полный CRUD и очищаемые Preview fixtures.

Работа:

1. воспроизвести translated Archived recipe delete;
2. проверить Server Action request и Vercel logs;
3. проверить RPC/FK/delete order;
4. вернуть bounded timeout/error;
5. success navigation и toast;
6. integration + authenticated E2E;
7. удалить оставшийся QA recipe.

Acceptance:

- delete завершается менее чем за согласованный timeout;
- list/detail не содержат recipe;
- translations/media удалены согласно contract;
- повторный delete idempotent/not-found;
- console/network clean.

### WP-B — Canonical Cafe navigation

**Цель:** ежедневные маршруты не раскрывают Platform hierarchy.

Работа:

- `/recipes` route/redirect;
- согласовать `/inventory`;
- shared Cafe header;
- Sign out на всех рабочих страницах;
- role-aware home/back links;
- не вести Staff/Manager через `/dashboard/workforce`.

Acceptance:

- Staff и Manager выполняют все ежедневные задачи без `/dashboard`;
- direct links работают после login и reload;
- role isolation сохраняется.

### WP-C — Focus/accessibility completion

**Цель:** закрыть заявленный keyboard contract.

Работа:

- Add/Edit Staff opener focus;
- Shift Cell opener focus;
- Escape/Cancel/Save matrix;
- 44 px link wrappers/checkbox hit area;
- aria-live pending/success/error.

Acceptance:

- после каждого close `document.activeElement` = opener;
- keyboard-only walkthrough PASS;
- no focus lost to BODY.

### WP-D — Manager mobile redesign

**Рекомендованный Founder choice:** card-based layout.

Работа:

- Staff cards;
- schedule by day/by staff;
- correction cards;
- action overflow menu;
- keep desktop tables unchanged;
- prototype visual reference `/demo/cafe/manager`.

Acceptance:

- 375 px physical device;
- ни одно имя не рендерится вертикально;
- нет row высотой сотни px из-за wrapping;
- основные actions доступны без сложной горизонтальной прокрутки.

### WP-E — Staff mobile/product shell

Работа:

- employee name in header;
- today/next shift card;
- mobile week list;
- bottom navigation;
- decide Clock in/out scope;
- prototype reference `/demo/cafe/staff`.

Acceptance:

- Staff за 10 секунд находит следующую смену;
- schedule читается одной рукой;
- identity/session очевидны.

### WP-F — Inventory content i18n

Работа:

- source/translation model для item name;
- JA/EN resolver;
- fallback badge;
- Manager translation editing;
- tests.

Acceptance:

- `コーヒー豆` ↔ `Coffee beans`;
- `牛乳` ↔ `Milk`;
- filters/search работают на выбранном языке.

### WP-G — Schedule operational completeness

Работа:

- Unavailable conflicts;
- Needs attention;
- publish warning/override reason;
- published amendment/cancel;
- notification/audit;
- auto-distribution settings + dry-run preview + undo.

Acceptance:

- конфликт нельзя пропустить;
- published mistake исправляется безопасно;
- auto distribution ничего не записывает до подтверждения preview.

### WP-H — Disposable acceptance fixtures

Работа:

- отдельные safe test emails;
- idempotent seed;
- Staff/Inventory/Recipe/Shift fixture manifest;
- cleanup script;
- запрет production target;
- evidence summary без secrets/PII.

Acceptance:

- полный CRUD можно тестировать без реальных аккаунтов;
- cleanup возвращает Preview в исходное состояние;
- повторный прогон идемпотентен.

---

## 11. Final Definition of Done

Cafe v2.1 получает Founder PASS, когда:

1. Recipe Delete forever работает и QA fixture удалён.
2. `/recipes` работает как canonical route.
3. Manager mobile не превращает японский текст в вертикальные колонки.
4. Staff mobile проходит согласованный task-first design.
5. Add Staff и Shift Editor возвращают focus.
6. Inventory item content переводится либо fallback явно принят Founder.
7. Sign out доступен на всех рабочих поверхностях.
8. Staff понимает, под каким именем вошёл.
9. Unavailable conflict виден до Publish.
10. Published schedule имеет safe amendment flow либо это явно принято как ограничение beta.
11. Auto-distribution имеет безопасный test/preview contract либо скрыта до готовности.
12. Staff Create/Delete и Inventory lifecycle проходят на disposable fixtures.
13. typecheck/lint/test/build PASS.
14. authenticated Manager + Staff desktop/mobile acceptance PASS.
15. console/network errors = 0.
16. все disposable fixtures очищены.

---

## 12. Итоговый вердикт

### Что можно принять

Основные ранее найденные P1 — Inventory crash, correction apply, invisible custom shift и auto-translation — исправлены и независимо подтверждены.

### Что нельзя принять как «всё готово»

- Delete forever не прошёл live acceptance;
- прямой Recipes route отсутствует;
- mobile Manager остаётся хуже prototype;
- focus/accessibility закрыты частично;
- navigation/product shell всё ещё platform-first;
- часть content localization неполна.

### Решение

**Cafe v2.1: FUNCTIONAL BETA / RELEASE GATE FAIL.**

Следующий bounded шаг: WP-A Recipe Delete forever hotfix. После него — WP-B navigation и WP-C focus. Mobile redesign должен быть отдельным Founder-approved WP, используя `/demo/cafe/manager` и `/demo/cafe/staff` как видимый reference, но сохраняя каноническую multi-tenant/RLS архитектуру новой версии.
