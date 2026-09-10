# ORUWA Design System — Technical Audit (Mission 1)

**Дата:** 2026-09-10
**Тип:** доказательный технический аудит (READ-ONLY, без изменений production/frontend)
**Фаза:** ORUWA Product Quality Foundation → стадия «Design System Audit»
**Статус:** ФИНАЛ (независимая проверка — PASS, см. Приложение A). Передать в отдельный CTO/Product chat и сопоставить с независимым Browser Visual/UX Audit из Work. Founder Decision о Design System v1 принимается только после сопоставления.

Ветка `dev` @ `4fc2cba`. Ничего в коде не менялось. Все цифры получены `ripgrep`/`git` по `apps/web/src`; там, где у шаблона есть риск ложных срабатываний, это помечено.

---

## 1. EXECUTIVE VERDICT

**Что сейчас не так.** ORUWA-фронтенд визуально приличный, но держится на механизме, который структурно не даёт выполнить собственный charter. Стилизация — это **инлайновые `style={{…}}`** (1 942 литерала в 155 из ~189 `.tsx`-файлов) плюс три конкурирующих `theme.ts`-файла (~300 продублированных строк, включая **два разошедшихся алгоритма цвета shift-чипов** — один и тот же тип смены может отрисоваться разным цветом в preview и в проде). Инлайновые стили физически не умеют выражать `:hover`, `:focus-visible`, `@media` — именно поэтому в коде появились 7 `*.module.css`, глобальный `button:focus-visible`-фолбэк в `globals.css` и ~174 нативных `title=`-тултипа вместо компонента. Общего слоя атомарных примитивов (Button, Input, Select, Checkbox, Badge, Card, Tabs, Field) **нет вообще**: 296 «сырых» `<button>`, ~183 «сырых» поля ввода, 124 вызова badge-хелперов. Плюс **три параллельных дерева UI для одних и тех же экранов** (demo — ~29 компонентов, `_client-preview` — 35, реальный продукт) — почти тройное дублирование.

**Насколько серьёзно.** Средне-высоко, но **не катастрофа и не повод переписывать фронтенд**. Хорошая новость: (а) архитектурно чистый Phase 0 `@line-os/tokens` уже в `dev`; (б) уже есть работающий общий слой оверлеев `components/shared/design-kit/` (Modal, ConfirmDialog, ActionsMenu, EmptyState, Skeleton, Toast, Lightbox) с реальным охватом ~43 файла; (в) семантической грязи «JA+EN в одной строке» в живом UI практически нет. Плохая новость: **сегодня продукт не может заявлять WCAG AA** — токен `text-muted` (#8B7C64) даёт контраст ≈3.7:1 на ivory-фоне / ≈4.1:1 на белом (норма AA — 4.5:1) и используется повсеместно для вторичного текста, лейблов форм и таймстампов; текст в badge и неактивные вкладки тоже не проходят AA. Это чистые токен-правки.

**Нужно ли менять foundation.** Нет — Phase 0 в основном **KEEP**. Нужно его **достроить** (реально загрузить шрифт, добавить семантический слой elevation и недостающие токены, усилить drift-тест) и поставить над ним настоящий слой компонентов.

**Рекомендуемая архитектура (OPTION C, в лёгком варианте).**
1. **Tailwind CSS v4** как механизм стилизации для нового `@line-os/ui` и для нового/мигрируемого кода. Tailwind v4 — CSS-first (`@theme`), нативно работает на CSS-переменных, а `@line-os/tokens` уже эмитит `--oruwa-*`. Официально поддерживается Next 15. Существующие инлайновые стили с ним **сосуществуют** — миграция инкрементальная, не big-bang.
2. **Radix Primitives** (унифицированный пакет `radix-ui`) как **a11y-движок под** ORUWA-компонентами: Dialog, AlertDialog, DropdownMenu, Popover, Tooltip, Tabs, Checkbox, RadioGroup, Switch, Select, Form. Radix **не навязывает внешний вид** (unstyled) — красим своими токенами. Закрывает ровно те P1-дыры, которые дорого и рискованно писать самим (focus-trap, scroll-lock, вложенный Escape, ARIA-связки форм, клавиатура меню).
3. **Radix Themes — отклонить** (OPTION D): навязывает собственную систему токенов и визуальный язык, низкий потолок кастомизации, конфликтует с тёплой ivory-идентичностью и плотной японской эстетикой ORUWA.
4. **`@line-os/ui`** переписать по-настоящему в том же `packages/ui`: Tailwind-preset + Radix-примитивы + перенос туда `design-kit`. Здесь живут Button, Field, Badge, Modal (API сохраняем, движок меняем).

**Что это даёт против «просто нормализовать» (OPTION A):** A не устраняет корневой дефект — невозможность выразить состояния интеракции и адаптив в инлайновых стилях. A = продолжать подпирать костылями (module.css + глобальные фолбэки + `title=`).

**Границы v1:** без dark mode, без Storybook/Chromatic, без animation-фреймворка, без token-management-платформы, без cross-repo publishing, без миграции demo/preview деревьев, без полного истребления инлайновых стилей. Всё это — DEFER с явным обоснованием (см. §22).

---

## 2. VERIFIED CURRENT STATE (только доказанные факты)

### 2.1 Технологический стек
| Инструмент | Версия | Источник |
|---|---|---|
| Next.js | 15.5.19 (declared `^15.0.0`) | `apps/web/node_modules/next/package.json` |
| React / React-DOM | 18.3.1 | lockfile |
| TypeScript | 5.9.3 (web) | node_modules |
| Node | `>=20` | root `package.json` |
| Монорепо | pnpm 9.12 + Turbo 2 | root `package.json` |
| LINE | `@line/liff` 2.30.0 | `apps/web/package.json` |

### 2.2 Где вообще есть UI
Только **`apps/web` + `packages/ui` + `packages/tokens`**. `apps/api` (NestJS) и `apps/worker` (cron) UI не содержат. Доменные пакеты (`workforce`, `booking`, `core`, `db`, `line`, `ai`, `config`) не зависят от `react`.

### 2.3 CSS-архитектура (факт)
- **Tailwind отсутствует полностью.** `grep -c tailwind pnpm-lock.yaml` → 0. Нет `tailwind.config.*`, нет `postcss.config.*`, нет `@tailwind`-директив. `button.tsx` в `packages/ui` прямо содержит комментарий, что Tailwind-классы там были «dead and misleading» и удалены.
- **CSS-in-JS отсутствует.** `styled-components`, `@emotion`, `cva`, `clsx`, `classnames` → 0 вхождений.
- **Реальный механизм:** инлайновые `style={{…}}` объекты (1 942 литерала / 155 файлов) + style-объекты из 3 `theme.ts` + 7 `*.module.css` (366 строк суммарно) + один `globals.css` (93 строки) + 6 инлайновых `<style>`-блоков в `.tsx`.
- **`@line-os/tokens`:** `dist/tokens.css` `@import`-ится в `globals.css`, эмитит ~85 `--oruwa-*` переменных; **на уровне компонентов не потребляется вообще** (`var(--oruwa-*)` → 0 вхождений в компонентах; используются 4 не-oruwa кастом-проперти для адаптива). JS-литералы токенов импортируются в 3 файлах.

### 2.4 Компонентная система (факт)
| Слой | Есть? | Охват | Вердикт |
|---|---|---|---|
| `@line-os/tokens` | да, CSS эмитится | 3 JS-импорта, 0 call-site потребления CSS-vars | присутствует, ~0% потреблён |
| `@line-os/ui` (Button, Card) | заглушка | **0 импортов во всём репо** | мёртвый код |
| `components/shared/design-kit/` (оверлеи/фидбэк) | да, работает | ~43 файла | реальный, частичный |
| Атомарные примитивы (Button/Input/Select/Checkbox/Badge/Card/Tabs/Field) | **нет** | 296 `<button>`, 183 поля, 124 badge-вызова | отсутствует |
| Layout-примитивы (PageShell/Header/Nav/FormField) | нет, только функции-хелперы | `pageStyle` ×3 копии | отсутствует |
| Источник темы | **3 конкурирующих файла** (797 строк, ~300 дублей) | — | фрагментирован |
| Параллельные деревья UI одних экранов | demo (~29) + preview (35) + продукт | — | ~3× дублирование |

### 2.5 i18n (факт)
Библиотеки нет. `lib/demo/cafe/i18n.tsx` — `makeTranslator` над `{ja:{}, en:{}}`-словарями, по одному на поверхность (`operations-i18n.ts`, `i18n.manager.ts`, `staff-dashboard-i18n.ts`, …). Нет ICU, интерполяции, плюрализации (подстановка переменных — через функции-значения на язык). `<html lang="ja">` статичен (`app/layout.tsx:22`), тумблер языка его не обновляет. **Строк вида «オープニング（Opening）» в живом UI нет** (только seed-данные демо и легитимные пояснения в скобках).

---

## 3. UI DEBT INVENTORY (количественно)

| Позиция долга | Число | Риск ЛП |
|---|---|---|
| `.tsx`-файлов с инлайновым `style={{` | **155 / ~189** | низкий |
| Инлайновых `style={{`-литералов | **1 942** | низкий |
| «Сырых» `<button>` | **296 / 97 файлов** | низкий |
| «Сырых» `<input>/<textarea>/<select>` | **~183 / 49 файлов** | низ-сред |
| Хардкод hex в ts/tsx | **97 / 45 файлов** (концентрация в 3 theme-файлах + 1 guide-странице) | средний |
| Хардкод hex в css | ~45 / 8 | низкий |
| «Голых» числовых spacing-литералов в стилях | **~1 000–1 500** | **высокий** (порядок величины) |
| Call-sites badge/chip-хелперов | **124 / 42 файла** | низкий |
| Различных источников badge/chip-стиля | 3 badge + 2 chip-color (**расходятся**) | низкий |
| Самопальных overlay-диалогов вне design-kit | **3** (`lib/preview/*`, `position:fixed`) | низкий |
| Нативных `title=`-тултипов (без компонента) | **~120–174** | низкий |
| `onClick` на не-кнопке | **6** (+4 `role="button"`) — *лучше типичного* | низкий |
| Всего `aria-*` во всём приложении | **127** | низкий |
| `@media`-правил | **16 / 14 файлов** | низкий |
| Responsive-хуков в JS | **5 / 2 файла** | низкий |
| Theme-хелпер-файлов / дублированных строк | 3 файла / **~300 строк** | средний |
| Параллельных деревьев cafe-компонентов | **3** (~29 + 35 + продукт) | низкий |
| Реальных экранов | ~31 (35 `page.tsx` − 4 redirect-заглушки) | низкий |
| Экранов, использующих `@line-os/ui` | **0** | — |
| Не-тестовых `.tsx` LOC в `apps/web/src` | 30 919 | низкий |

**Крупнейшие структурные находки:**
1. **Три дерева UI** для одних и тех же экранов Manager/Staff/Recipe/Inventory/Shift. Схлопывание — самый крупный рычаг (~64 дубля до всякого ретрофита).
2. **Три theme-файла**, из них два расходящихся `shiftChipColors` (видимый glitch-риск).
3. **Нет атомарных примитивов** — весь Button/Badge/Field собирается вручную на каждом экране.

Честные оговорки по ЛП: ~1 500 spacing-литералов — наименее надёжная цифра (regex ловит и TS-типы, и индексы); берите «≥1 000». `style={` = 2 608 включает легитимный проброс `style={ref}` — доверять надо числу `style={{` = 1 942. Hex (97) слегка раздут не-цветовыми `#` и сконцентрирован в 4 файлах — палитра централизованнее, чем кажется по «сырому» числу.

---

## 4. PHASE 0 / PR #514 REVIEW

Полный аудит `@line-os/tokens` (primitives → semantic → generated CSS). Общий вывод: **годная основа, KEEP, но достроить перед Phase 1.**

| # | Решение Phase 0 | Класс | Комментарий |
|---|---|---|---|
| A | Слои primitives → semantic → generated CSS | **KEEP** | Чисто, утечек нет. Но семантический слой есть **только у color**; всё остальное прыгает из primitive прямо в потребителя. |
| B | primitives vs semantic разделение | **KEEP WITH CHANGE** | `shadow.*` лежит в primitives, но каждое значение — ролевое решение («тень карточки», «тень оверлея»). Нужен семантический слой `elevation`. `control.*` — то же в меньшей степени. |
| C | Механизм генерации CSS (`build-css.mjs`) | **KEEP** | `dist/tokens.css` закоммичен корректно (глобальный `.gitignore` на `dist/`, ре-инклюд ровно этого файла). Drift ловится sync-тестом при условии, что таск `test` пакета в Turbo-графе (по коммиту — да). |
| D | Drift-тест (`tokens.test.ts`) | **KEEP WITH CHANGE** | Проверяет: формат имён, что semantic-значения — литералы (не `var()`), пин `accent-text === '#3B5C3E'`, посимвольное вхождение каждого токена в CSS + равенство числа строк. **НЕ проверяет:** реальный контраст (только пин magic-строки), порядок/форматирование CSS, что файл — именно то, что сгенерил бы билд, монотонность шкал. Рекомендация: заменить пин на реальную проверку relative luminance / контраста и делать regenerate-and-`assert.equal` целиком. |
| E | Экспорты / двойное потребление | **KEEP WITH CHANGE** | `"type":"module"`, чистый ESM, без CJS/сборки. Работает без бандлера **только** с TS-лоадером (`--import tsx` / `transpilePackages`). Формулировка «imported by plain node --test (no bundler)» неточна — нужен `tsx`. В репе все потребители TS-совместимы, так что это doc-nit. Внешний потребитель (marketing repo) сможет взять только `tokens.css`. |
| F | Потребление из apps/web | **KEEP WITH CHANGE** | `lib/ui/theme.ts` — байт-в-байт, проверено (bg `#FAF3E7`, text-muted `#8B7C64`, danger-text `#A6402F`). `lib/demo/cafe/theme.ts` **мигрирован наполовину**: `borderStrong:'#D8C6A4'`, `todayBg:'rgba(79,122,82,.10)'`, `gold:'#C0983F'` — литералы, которые токен уже покрывает; «gold» демо ≠ «warning» семантики (два разных золотых). |
| G | Качество/полнота нейминга | **KEEP** | Нейминг консистентен и хорош. `normalizeKey` корректно обрабатывает `2xl`/dotted-ключи. |
| H | Покрытие токенами | **KEEP WITH CHANGE** | Есть: spacing, typography, color, radii, shadow, motion, z-index, breakpoints, control-heights, focus-ring-**цвет**. **Нет для v1:** `focus-ring-width`/`-offset` (charter требует «2px, 2px offset» — токенизирован только цвет), `opacity.disabled`, `border-width` (1px хардкодится в button/card), `color.overlay` (скрим модалки — при том что `z-overlay`/`z-modal` есть), `warning-text`, `info-muted`/`info-text`, icon-sizes. |
| I | Значения, кодирующие визуальные решения (должны быть semantic) | **KEEP WITH CHANGE** | `shadow.*` (сильнейший случай), `fontSize.base = .875rem` (решение «body = 14px» закодировано в primitive `base`), `control.height-md`. `accent-subtle` vs `accent-muted` (0.10 vs 0.12) — наоборот, хороший пример правильной семантической дизамбигуации. |
| J | Breakpoints / typography / motion / z-index | **KEEP** | Breakpoints исключены из `flatTokens` и JS-only — **правильно** (`@media (min-width: var(--x))` невалиден). Motion (120/160/240 + 2 easing) точно по charter §4. z-index — чистая монотонная шкала 1000-шагов. |
| K | Семантические статус-цвета; `success` = алиас `accent` | **KEEP WITH CHANGE** | `success === accent` — осознанный риск: зелёная кнопка «Сохранить» и зелёный тост «Успех» неразличимы; при смене accent «success» молча поедет следом. Дать `success` свой primitive, чтобы алиас был *подтверждённым выбором*, а не структурным замком. У `warning` **нет** `warning-text` (#B8863B на белом ≈2.6:1 — провал AA для текста); у `info` нет ни `-text`, ни `-muted`. |
| L | Готовность к dark mode (хотя dark НЕ v1) | **KEEP** | Структура **готова**: единый `:root`, роли уже семантические (`color.bg`, не `color.white`). Dark = чисто аддитивно (второй проход генератора + dark-primitives), контракт токенов не меняется. Оговорка: apps/web читает JS-литералы через `theme.ts`, а не CSS-vars — рантайм-переключение темы всё равно потребует Phase 3 миграции на `var(--oruwa-*)`. |
| M | Пригодность японской типографики | **RECONSIDER** | **Noto Sans JP объявлен (`layout.tsx:25`), но нигде не загружается** — нет `next/font`, нет `@font-face`, нет `<link>` на Google Fonts, нет self-hosted WOFF. На большинстве устройств (Windows, Android; iOS/macOS его тоже не поставляют) браузер молча падает на `system-ui`. Заявленная «выгода #2 — консистентные японские глифы» **не достигается**; на меньшинстве машин, где шрифт есть, получаем неконсистентный раскол. Нужно `next/font/google` (subset + `display:swap` + сабсеттинг весов) вместе с/до Phase 1, **или** откатить дельту шрифта. `fontFamily.latin` (Inter) — та же проблема, не используется ничем. |
| N | Изменения packages/ui Button/Card | **KEEP** (удаление верное) + флаг: компоненты **полностью мёртвые** | Импортов `@line-os/ui` в приложении — **ноль**. Tailwind для `packages/ui` **никогда не был активен** — классы `bg-emerald-700` были мёртвыми строками, никогда не компилировались. Удалить и перекрасить от токенов — правильно и дёшево. Nit: `button.tsx:41` хардкодит `lineHeight: 1.35` вместо токена в том самом файле, что должен демонстрировать токены; добавлен `className="oruwa-button"` без единого CSS-правила под него. |
| O | Риск визуальной регрессии от Phase 0 как смёржено | **KEEP** (риск минимален) | `packages/ui` — 0 риска (не используется). `theme.ts` ре-вайринг — 0 (байт-в-байт). `accent-text` `#4F7A52`→`#3B5C3E` — только для текста/ссылок, контраст 4.4→7.0 (улучшение). Шрифт — на большинстве устройств визуально ничего не меняет (и выгода тоже не реализуется, см. M). «No screen layout changes» — подтверждено. |

**Что сделать перед Phase 1 (не откатывать ничего в этой миссии):** (1) реально загрузить Noto Sans JP или откатить дельту шрифта; (2) добавить семантический слой elevation, вынести `shadow` из primitives; (3) добавить недостающие v1-токены (focus-ring width/offset, opacity-disabled, border-width, color-overlay, warning-text, info-muted/text); (4) усилить drift-тест реальными проверками контраста; (5) дозакончить миграцию demo-темы или задокументировать, почему литералы остаются; (6) решить судьбу `@line-os/ui`; (7) дать `success` собственный primitive.

---

## 5. CURRENT COMPONENT ARCHITECTURE (что есть и насколько переиспользуемо)

**Работает как общий слой (`components/shared/design-kit/` + `components/ui/loading/`):**
- `Modal` — `role="dialog"` + `aria-modal`, фокус в панель при открытии, Escape, клик по бэкдропу, **restore focus** через `useRestoreFocusOnClose`. Боттом-шит < 640px. Охват — ~40 фич-файлов (через design-kit + shim `demo/cafe/Modal`). **Дыры:** нет focus-trap (Tab уходит за пределы), нет scroll-lock body, Escape слушается на `window`/`document` без проверки «верхний ли слой» → вложенный `ConfirmDialog` внутри `Modal` закрывает оба.
- `ConfirmDialog` — `role="alertdialog"`, `pending`-состояние блокирует dismiss. Хардкод `id="shared-confirm-dialog-title"` (дубль id при двух диалогах сразу).
- `ActionsMenu` (•••), `EmptyState`, `Skeleton`/`SkeletonLines`, `Toast` (`ToastProvider`/`useToast`), `Lightbox`, `HelpIconButton`, `BrandLoader`, `LoadingButton`, `LoadingPage`, `PendingOverlay`.
- Суммарный охват общего кита: ~49 фич-`.tsx` (214 вхождений импортов).

**Отсутствует как компонент (собирается вручную):** Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Badge/Status/Chip, Card, Alert (inline), Field (label+hint+error), Tabs/SegmentedControl, Table-примитивы, PageShell, Header, Nav, ListRow, Tooltip, Popover, DatePicker.

**Таблица примитивов (реализаций / переиспользование / дублирование):**

| Примитив | Реализаций | Стилизация | Переисп. | Дубль |
|---|---|---|---|---|
| Button | ~5+ (`@line-os/ui` мёртвый; 3 style-объекта в theme-файлах; `LoadingButton`; **296 сырых `<button>`**) | inline + module hover-классы + globals-фолбэк | низкий как компонент | **высокий** |
| Card | 4 (`@line-os/ui` мёртвый; `theme.card`; `cafe.card`; `workforce.primaryCard`) | inline | style-объекты | высокий |
| Dialog/Modal | ~5 (design-kit `Modal` — реальный; 2 shim; **3 самопальных overlay-диалога** `position:fixed` (не `createPortal`) в `lib/preview`) | inline + portal | шелл в основном консолидирован | средний |
| Input/Textarea/Select | 3 style-объекта + **~183 сырых элемента** | inline | низкий | высокий |
| Checkbox/Radio | только `checkboxInput`/`checkboxLabel` style-объекты | inline | низкий | средний |
| Switch/Toggle | 0 примитива (bespoke пары кнопок) | inline | нет | низкий |
| Badge/Status/Chip | **3+ `badgeStyle` + 2 `shiftChipColors` (разные хэш-алгоритмы) + 2 `shiftChipStyle`** | inline | 124 call-sites | **высокий** |
| Alert | `alertDanger` + `cafe.alertWarningBg/DangerBg` | inline | низкий | средний |
| Toast | **1** (design-kit) | context + inline | средний | нет ✅ |
| Tooltip | **0 компонентов** — только нативный `title=` (~120–174) | браузер | — | a11y-дыра |
| Dropdown/Menu | 2 (`ActionsMenu` + собственное `account-menu`) | portal | низ-сред | низкий |
| Tabs | **0 реальных** | inline | нет | нет |
| Table | `tableHeaderCell`/`tableCell` ×2 + `responsive-table.module.css` (2 импортёра) + ручные `<table>` | inline + 1 module | низкий | высокий |
| Form field | нет `<Field>` — label+input+error собирается вручную в ~20 форм-файлах | inline | нет | высокий |
| Date/time | нативный + **3 кастомных календаря/пикера** | inline | нет | средний |
| Nav/Sidebar/Header | общего шелла нет; каждый экран строит хедер инлайном (страницы 400+ строк) | inline | нет | высокий |
| Page shell | `pageStyle()` во **всех 3** theme-файлах | inline | средний (хелпер) | высокий |
| Empty / Loading / Confirm | по 1 общему (`EmptyState`/`Skeleton`+loading/`ConfirmDialog`) | inline | средний | нет ✅ |

---

## 6. ACCESSIBILITY FINDINGS

### P0 — блокирует заявление WCAG AA
- **P0-1. `text-muted` #8B7C64 не проходит AA (≈3.7:1 на ivory, ≈4.1:1 на белом; норма — 4.5:1).** Используется повсеместно для вторичного текста 12–14px: `EmptyState`, все лейблы форм Operations, описания страниц, таймстампы, подсказки. Charter §8 обещает 4.5:1. **Только это уже означает: продукт сегодня не может заявлять AA.** Правка — чистый токен.
- **P0-2. Текст в badge не проходит AA.** `badgeStyle()` рисует 12px текст в `#4F7A52` на 12%-зелёной подложке; `tokens.md` **сам документирует** `#4F7A52` на белом как «~4.4:1». Тёмный `accent-text` `#3B5C3E` существует ровно для этого, но `badgeStyle` его не берёт. Badge — основной статус-канал в Operations.
- **P0-3. Неактивные лейблы вкладок/тумблеров** рисуются `text-muted` 13px (`operations-manager-client.tsx` секции и фильтр, языковой тумблер).

### P1 — серьёзно
- **P1-1. У общего `Modal` нет focus-trap.** Есть restore, нет containment-петли Tab/Shift-Tab. Та же дыра в `ConfirmDialog`, `ActionsMenu`, `account-menu`, `Lightbox`.
- **P1-2. Нет scroll-lock body** при открытой модалке (страница скроллится за диалогом).
- **P1-3. Вложенные оверлеи: один Escape закрывает все слои.** `Modal` слушает `window`, `ConfirmDialog` — `document`, никто не проверяет «верхний ли», никто не делает `stopPropagation`. Реальные кейсы: `ConfirmDialog` внутри `TemplateDetailModal`; help-`Modal` внутри Operations-попапа; чек-лист Staff глубоко внутри `OperationsStaffPopup`.
- **P1-4. Ошибки валидации не анонсируются.** Кастомные ошибки рисуются `<div style={alertDanger}>` **без `role="alert"`/`aria-live`** и **без `aria-describedby`** к полю. ~15 мест в одном Operations.
- **P1-5. `Toast` собран, но нигде не смонтирован** (`ToastProvider` — 0 call-sites вне самого файла). Общего канала успех/ошибка в проде нет; фидбэк — ad-hoc `setBanner` или молчаливый `router.refresh()`. **В Operations подтверждения успеха нет вообще.**
- **P1-6. Строки списков — `<li role="button">`** (Operations, manage-staff, recipes). Ручной keydown есть, но это большой одиночный tab-stop, оборачивающий вложенные интерактивные элементы; у строки шаблона Manager **нет hover-фидбэка вообще**.
- **P1-7. `:focus-visible` есть только у `button`.** У `<input>`/`<select>`/`checkbox` кастомного focus-ring нет — падают на дефолтный браузерный outline. Charter §5 обещает focus-visible «каждому интерактивному элементу».
- **P1-8. Цвет focus-ring захардкожен `#4f7a52` в 5 местах**, не `var(--oruwa-color-focus-ring)` — молча не поедет за токеном.

### P2
- 44px тач-таргет применён частично (кнопки/инпуты — да; close-кнопка модалки 32×32, `ActionsMenu`-триггер 36×36, `HelpIconButton` 24×24, вкладки Operations `minHeight:36`). Проходят новый WCAG 2.5.8 (24px), но не собственные 44px charter'а.
- `badgeStyle('warning')` рисуется **красным** (маппится на danger-токены); настоящий янтарный `warning` (#B8863B) фактически не используется. «Просрочено», «критично пропущено», «порог не настроен», «N исключений» — всё выглядит одинаково красным. Словарь из 4 тонов (`active|inactive|neutral|warning`) слишком мал для Operations.
- Нет `<nav>` нигде в `(protected)`, нет skip-link, тонкие лендмарки. `<h1>` отсутствует в embedded/popup-режиме Operations.
- `<html lang>` не меняется с тумблером языка.
- `ConfirmDialog` без `aria-describedby` для тела.

### Improvements
- `Skeleton` — `aria-hidden` без обёртки `aria-busy` (скринридер не слышит загрузку).
- `BrandLoader` инжектит полный `<style>` на каждый инстанс.
- Manager weekly `<table>` — сотни tab-stop'ов (кнопка в каждой `<td>`), нет roving tabindex, нет `<caption>` (но `aria-label` на ячейку — тщательный).

### Кто что чинит
| Класс | ORUWA-компонент | Radix (лучше) | Остаётся за ORUWA |
|---|---|---|---|
| Семантика диалога (P1-1/2/3, P2 id) | trap + scroll-lock + stack в один `Modal` | `radix Dialog`: trap, scroll-lock, `labelledby/describedby`, **вложенный dismiss только верхнего слоя**, portal, `Description` — обкатано | визуальный шелл, размеры, боттом-шит, JA-копирайт |
| `role="button"` строки (P1-6) | обернуть в настоящий `<button>` | не кейс Radix | «строка-таргет vs явная кнопка Open»; hover/press-токены |
| Меню/дропдауны | roving focus, typeahead вручную | `radix DropdownMenu`/`Popover`: полная клавиатура, collision-aware позиционирование (заменяет ручной `getBoundingClientRect` + scroll-close хак) | таксономия пунктов (••• для редких/опасных), danger-стиль |
| focus-visible на инпутах (P1-7/8) | одно глобальное `:focus-visible` для `input,select,textarea,[role]` + токенизировать цвет | n/a (CSS) | значение токена, offset, forced-colors |
| Анонс ошибок форм (P1-4) | `Field`-обёртка: `<label>` + id + `aria-describedby` + `role="alert"`-слот | `radix Form` даёт ровно эту связку | копирайт ошибок, поле-vs-форма |
| Тосты (P1-5) | смонтировать существующий `ToastProvider` в `(protected)/layout.tsx` | `radix Toast` (свайп, таймеры, pause-on-hover) | маппинг тонов, JA-копирайт |
| Контраст (P0) | сменить токены на AA-совместимые | n/a (Radix unstyled) | чисто токен-решение |
| Тач-таргеты (P2) | вшить `min-height:44` в общую кнопку/icon-button | Radix не задаёт размеры | политика 44/40/36 по роли/контексту |
| Вкладки (Operations) | обобщить в `SegmentedControl` | `radix Tabs` (это view-switcher'ы) — `role="tablist"`, стрелки, `aria-controls` | pill-визуал, JA-лейблы, счётчик-суффикс |

---

## 7. RESPONSIVE / JA-EN FINDINGS

### Responsive
- **Механизмы:** (1) CSS-кастом-проперти, переключаемые 2 медиа-запросами в `globals.css` (`--page-padding` 32→4px на `max-width:640px`), читаются из инлайновых стилей через `var()`; (2) серверный swap таблица↔карточки `responsive-table.module.css` на `max-width:767px` (2 импортёра); (3) 4 крошечных компонентных `.module.css`; (4) **один** `matchMedia`-хук (`staff/use-compact-schedule.ts`, `max-width:480px`); (5) доминирующая тактика — `flex-wrap:wrap` + `flex-basis` в инлайновых стилях.
- **Всего 16 `@media` в репе. Все — `max-width`.** `min-width`-авторинга нет нигде → Staff **не** написан mobile-first в CSS-смысле. Оба режима — один набор инлайновых стилей, перетекающий через `flex-wrap`, с `max-width`-твиками сверху. Charter §6 (Manager desktop-first / Staff mobile-first / общий компонент с density-инпутом) — **пока декларация, не реализовано.** Общего «role/density»-компонента нет.
- **Manager weekly-таблица @390px:** горизонтальный скролл 7-колоночной сетки `<button>`-ячеек, без sticky первой колонки (имя сотрудника уезжает). Scroll-within-scroll. Manage-staff и списки — нормальный card-view < 767px. **Operations вообще без таблиц** (flex-wrap карточки) — чисто схлопывается в одну колонку @390px, единственная реальная сильная сторона его вёрстки.
- **LIFF / LINE in-app browser:** `@line/liff` есть, `lib/liff/`, `liff-callback`, `liff-entry` существуют. Charter §6 требует работы Staff внутри LINE-webview. **Компонентных accommodations нет:** нет `100dvh`/`svh` под нижнюю панель LINE, нет safe-area, `Modal` использует `maxHeight:'90vh'` (`vh` в LINE-webview ненадёжен — нужен `dvh`/`svh`). Нужен явный LIFF-проход.

### JA-EN (технически)
- **Библиотеки нет** (см. §2.5). Нет ICU/плюрализации; подстановка — через per-language функции-значения. `Lang`-стейт в React-контексте с `localStorage`, дефолт `'ja'`, по одному независимому `LangProvider` на поверхность.
- **Захардкоженного «JA+EN в одной строке» в живом UI практически нет.** `grep` находит только seed-данные демо и 2 легитимных пояснения в скобках. **Риск в коде сегодня отсутствует** — это здоровое состояние.
- **Импликации для DS (forward-looking, реальные):**
  - `fontFamily.base` (Noto Sans JP) для всего; отдельный `fontFamily.latin` (Inter) **не используется**. EN-UI рисуется латиницей Noto Sans JP — приемлемо, не оптимально; механизма смены стека по `lang` нет.
  - CJK без пробелов → защитные `whiteSpace:'nowrap'` + `flexShrink:0` на кнопках (документировано как фикс реального бага «один символ на строку») и `overflowWrap:'anywhere'` на именах — реактивно per-site, не системно. `Text`-примитив с `word-break: keep-all` (CJK) vs `normal` (латиница) по `lang` убрал бы «whack-a-mole».
  - EN-строки в ~1.5–2× шире JA. Badge-ряды Operations уже `flex-wrap`; **сегментные вкладки Operations `flex-wrap` НЕ делают**, фиксированный `padding` — три EN-лейбла (`Templates / Today / Attention (3)`) на 320–360px переполнятся/сожмутся. Политики max-width/truncation для badge/tab-лейблов нет.
  - Узкий мобайл: нет `clamp()`-типографики; фикс 12px badge / 13px tab + длина EN — самое узкое место.

---

## 8. TECHNOLOGY COMPARISON

Шкала: 🟢 хорошо / 🟡 средне / 🔴 плохо. «Migration effort» — усилие внедрения В ДОПОЛНЕНИЕ к базовым правкам токенов.

| Критерий | **A. Normalize current** (inline + tokens + `@line-os/ui`) | **B. ORUWA DS + headless-only** (текущая стилизация + Radix точечно) | **C. ORUWA DS + Tailwind v4 + Radix Primitives** ✅ | **D. Radix Themes широко** |
|---|---|---|---|---|
| Визуальное качество / контроль | 🟡 сохраняет как есть, но состояния и адаптив по-прежнему костыльные | 🟢 полный контроль | 🟢 полный контроль, + системные варианты/состояния | 🔴 навязанный визуальный язык, тёплую ivory-идентичность придётся ломать через override |
| Единообразие | 🔴 три theme-файла и inline остаются; дисциплина только на ревью | 🟡 примитивы дают единообразие, стилизация всё ещё inline-объектами | 🟢 utility-классы + примитивы + lint | 🟢 (но не ORUWA-единообразие, а Radix-Themes) |
| Убирает ad-hoc UI | 🔴 почти нет — inline остаётся законным | 🟡 частично (примитивы да, layout/spacing нет) | 🟢 да: lint против нового inline, варианты в одном месте | 🟢 да, но ценой ухода в чужую систему |
| Ускоряет WP2–WP5 | 🟡 немного (общие style-объекты) | 🟢 да | 🟢 да, сильнее всего (варианты + utility + a11y из коробки) | 🟢 быстрый старт, 🔴 потолок кастомизации бьёт позже |
| Accessibility | 🔴 всё пишем сами (trap, scroll-lock, меню, формы) | 🟢 Radix решает движок | 🟢 Radix решает движок | 🟢 Radix Themes несёт a11y |
| Кастомизация | 🟢 полная (свой код) | 🟢 полная | 🟢 полная (unstyled Radix + свои токены) | 🔴 низкий потолок (props: accentColor/radius/scaling) |
| Maintainability | 🔴 3 theme-файла, 1 942 inline | 🟡 лучше, но два механизма (примитивы + inline) | 🟢 один механизм для нового кода, токены-native | 🟡 зависимость от релиз-цикла Radix Themes |
| Reuse будущими вертикалями (Salon/Retail/Clinic) | 🟡 style-объекты копируются | 🟢 `@line-os/ui` переиспользуем | 🟢 `@line-os/ui` + Tailwind-preset переиспускаемы как пакеты | 🔴 привязка всех вертикалей к Radix Themes и его эстетике |
| Manager (плотный desktop) | 🟡 | 🟢 | 🟢 (density-варианты примитивов, utility для сеток) | 🟡 Radix Themes тяготеет к «воздушному», scaling-проп грубоват |
| Staff (мобайл, LIFF) | 🟡 | 🟢 | 🟡 **риск: CSS-baseline Tailwind v4 в LINE-webview — проверить** (Safari 16.4+/Chrome 111+) | 🟡 + вес рантайма Radix Themes на low-end Android |
| Скорость первичного внедрения | 🟢 ничего ставить не надо | 🟡 Radix-обёртки | 🟡 Tailwind-wiring + Radix-обёртки + примитивы | 🟢 самый быстрый «день 1», 🔴 дорогой «месяц 3» |
| Migration effort (сверх токен-правок) | 🟢 ~0 | 🟡 средний | 🟡 средний (+риск LIFF-проверки) | 🔴 высокий (ре-платформа на чужую систему) |
| Риск | 🔴 не решает корневой дефект; долг растёт | 🟡 два стайлинг-механизма надолго | 🟡 два механизма на время миграции + LIFF-проверка | 🔴 потолок кастомизации + лок-ин всех вертикалей |

**Вывод:** **C** — единственный вариант, который (а) устраняет корневой дефект (невыразимость состояний/адаптива в inline), (б) не навязывает чужой визуальный язык, (в) даёт переиспользуемые пакеты будущим вертикалям, (г) не требует переписывать существующий фронтенд (Tailwind сосуществует с inline, миграция on-touch). Главный минус C — необходимость ранней проверки CSS-baseline Tailwind v4 в LINE-webview; при провале — откат на официальный путь Tailwind v3 (Next поддерживает оба).

### FACT / INFERENCE / RECOMMENDATION (research)
- **FACT.** Tailwind CSS v4.0 — стабильный (релиз 2025-01-22), CSS-first `@theme`, все токены авто-экспонируются как CSS-переменные, официально документирован для Next.js App Router (`pnpm add -D tailwindcss @tailwindcss/postcss`, `@import "tailwindcss"`). Требует современный CSS (cascade layers, `color-mix()`, `@property`) — практически Safari 16.4+ / Chrome 111+ / Firefox ~128+ (точную нижнюю границу перепроверить перед фиксацией). Для старых браузеров есть отдельный официальный путь Tailwind v3.
- **FACT / INFERENCE.** Radix Primitives — унифицированный пакет `radix-ui` (с 2025-01). Совместим с React 18 **и** 19; `use client`-директивы для RSC добавлены; Next App Router поддерживается; unstyled — визуал не навязывает (FACT). Конкретная дата последнего релиза и текущий номер версии — INFERENCE, перепроверить на момент старта миссии.
- **FACT.** Radix Themes — pre-styled библиотека, кастомизация через props (`accentColor`, `grayColor`, `radius`, `scaling`) + токен-система; полный рестайл «с нуля» не предусмотрен; документация не описывает сосуществование с внешней токен-системой.
- **INFERENCE.** Tailwind v4 utility-классы и существующие инлайновые `style={{}}` — разные механизмы, конфликта специфичности между ними нет; риск — не технический, а дисциплинарный (два механизма надолго).
- **INFERENCE.** LINE in-app WebView обычно несёт свежий Chromium (Android) / WebKit (iOS), т.е. CSS-baseline Tailwind v4 скорее всего проходит — но это **не проверено на реальном устройстве** и должно быть гейтом.
- **RECOMMENDATION.** OPTION C: Tailwind v4 (CSS-first, питается от `--oruwa-*`) + Radix Primitives под ORUWA-компонентами. Radix Themes — нет.

---

## 9. RECOMMENDED ORUWA DESIGN SYSTEM V1 ARCHITECTURE

### Слои и ответственность
| Слой | Что | Где | Правило |
|---|---|---|---|
| **1. Primitive tokens** | сырые шкалы (`green-500`, `space-4`, `radius-md`) | `packages/tokens/src/primitives.ts` | значения; никаких ролей |
| **2. Semantic tokens** | роли (`color.bg`, `elevation.card`, `text.body`, `focus.ring-width`) | `packages/tokens/src/semantic.ts` (+ новые группы elevation/typography-roles) | только маппинг role→primitive; ни одного сырого hex/px; эмитятся как `--oruwa-*` |
| **3. UI primitives** | Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Field, Badge, InlineAlert, Card, Modal, ConfirmDialog, ActionsMenu, Tooltip, Tabs/SegmentedControl, Toast, EmptyState, Skeleton, Table-parts, PageShell | `packages/ui` (`@line-os/ui`), Tailwind v4 + Radix движок | без доменных знаний; варианты/состояния/density как props; каждый в галерее `/_design` |
| **4. ORUWA components** | составные, но всё ещё вертикально-нейтральные: `ListRow`, `AttentionItemCard`, `DataToolbar`, `FormActions`, `DetailPanel`/`WizardModal` | `apps/web/src/components/patterns/` (промотировать в пакет позже) | собираются только из слоя 3 + токенов |
| **5. Product patterns** | конфигурация/пресеты над слоями 3–4 (Cafe-специфика: HACCP-badge-набор, shift-чипы) | фич-папки / `lib/*` | никогда не изобретают цвет/radii/badge/modal-поведение |
| **6. Feature / screens** | экраны | `app/(protected)/**` | только композиция слоёв 3–5; новый экран = DS или задокументированное исключение |

**Жёсткое правило:** слои 5–6 не изобретают цвета, radii, badge, кнопки, поведение модалок. Но и слой 3 не превращается в abstraction-framework — если примитива нет в галерее, это не примитив.

### Repository boundaries
- `@line-os/tokens` — **оставить** в `packages/tokens`. Достроить (см. §4).
- `@line-os/ui` — **оставить путь `packages/ui`, переписать по-настоящему:** Tailwind v4 preset + Radix-примитивы + перенос `components/shared/design-kit/` сюда. Именно здесь Button/Field/Badge/Modal.
- Слой 4 (patterns) — пока в `apps/web/src/components/patterns/` (одно приложение). Промотировать в `@line-os/patterns`, когда появится вторая вертикаль.
- Фич-компоненты — в своей route-папке.
- Дизайн-доки — `docs/design/` (уже есть).
- **oruwa.jp marketing — отдельный репозиторий. Cross-repo token publishing сейчас ПРЕЖДЕВРЕМЕННО.** Ничего не публиковать. Если маркетингу когда-нибудь понадобятся токены ORUWA — вручную скопировать `dist/tokens.css` или позже опубликовать `@line-os/tokens` в приватный registry. Не строить pipeline сейчас.

---

## 10. V1 COMPONENT LIST

**MUST в v1** (обоснованы находками §5–§7):
- **Слой 3:** Button, IconButton, Input, Textarea, Select (Radix), Checkbox (Radix), Radio/RadioGroup (Radix), Switch (Radix), **Field** (label+hint+error, ARIA-связка — закрывает P1-4), Badge/Status (тоны `neutral|info|success|warning|critical|muted`, каждый AA + иконка/форма на алертных — P0-2/P2), InlineAlert (`role` по тону), Card, **Modal** (API сохранить, движок Radix Dialog — P1-1/2/3), ConfirmDialog (Radix AlertDialog), ActionsMenu (Radix DropdownMenu — клавиатура), Tooltip (Radix — заменяет ~150 `title=`), Tabs/SegmentedControl (Radix Tabs — Operations), **Toast (смонтировать!** — P1-5), EmptyState, Skeleton (+ `aria-busy`-обёртка), Table-parts (header/row/cell + responsive card-swap), PageShell + AppHeader.
- **Слой 4:** ListRow (6 почти одинаковых ручных строк Operations → один примитив), FormActions (footer `Primary + Cancel`, ~10 копий в Operations), AttentionItemCard.
- **Глобальные правки:** `:focus-visible` для всех контролов через `var(--oruwa-color-focus-ring)` (P1-7/8); `<html lang>` следует за тумблером (P2); body scroll-lock через Radix.
- **Инфраструктура:** Tailwind v4 preset, питающийся от `--oruwa-*`; один ESLint-rule («no new inline `style={{}}` литералов» — warn; «no raw hex вне tokens» — warn); route `/_design` — живая галерея (НЕ Storybook).

**NOT в v1 / DEFER** (см. §22).

### Минимальный контракт состояний v1
| Компонент | Обязательные состояния |
|---|---|
| Button | rest, hover, active, focus-visible (токен), disabled (встроенный, не от вызывающего), **loading** (spinner + `aria-busy` + auto-disable — свернуть `LoadingButton`), интенты `primary/neutral/destructive`; `min-height:44` вшит, `sm` держит 44px прозрачную hit-зону |
| Input/Textarea/Select | rest, hover, focus-visible (тот же токен), disabled, **invalid** (`aria-invalid` → красная рамка + связь с id ошибки), read-only |
| Checkbox/Radio | rest, focus-visible, checked, indeterminate (checkbox), disabled, invalid; 44px кликабельный ряд лейбла |
| Dialog | `role` (`dialog`/`alertdialog`), `labelledby` + `describedby` (генерируемые id), focus-trap, focus-restore, Escape **только верхнего слоя**, backdrop-dismiss (opt-out для `alertdialog`), body scroll-lock, stack-aware, `pending` блокирует dismiss; размеры `form/wide/sheet` |
| Badge/Status | тоны `neutral/info/success/warning/critical/muted`; каждый тон — AA-текст; **иконка/форма в дополнение к цвету** на 3 алертных; `sm/md` |
| Alert (inline) | `info/success/warning/critical`; `role="status"` (info/success) или `role="alert"` (warning/critical); опц. title + слот действия |
| Toast | смонтировать один раз; `success/error/info`; `aria-live`; таймаут + ручной dismiss (уже собрано) |
| Row actions | primary = кнопка на всю строку ИЛИ явная «Open» (одна политика); secondary/destructive → `ActionsMenu` (•••); никогда голый `<li role="button">` вокруг других контролов |

---

## 11. OPERATIONS PILOT PLAN (без реализации)

**Почему Operations:** уже production-shaped поверхность (Manager templates/items/scheduling + Staff task execution + Attention feed, отрисованы как dashboard-попапы, PR #509), без таблиц (чисто схлопывается в мобайл), с уже правильной дисциплиной read-error vs empty-list. Идеальный первый потребитель.

**Что заменяется общими примитивами:** шесть почти идентичных ручных `<li>`-строк → `ListRow`; внутренний `useState<View>`-роутер в `TemplateDetailModal`/`TaskDetailModal` → `WizardModal`/stack-API (−~200 строк каждый); footer `LoadingButton + Cancel` (~10 копий) → `FormActions`; ручные `<div flex-wrap>` badge-групп → `BadgeGroup`; `{error ? <div alertDanger>}` (~15×) → `<InlineAlert>`; сегментный контрол (2× в одном файле) → `Tabs`; три редактора response-type → `ResponseField`.

**Что сохранить:** `embedded`-проп + `Body`/`Client`-split (переиспользуется Purchases/Inventory); разделение read-error и empty; flex-wrap карточки без таблиц; confirm-on-soft-violation; `statePriority`-сортировка «самое актуальное вверх».

**UX-находки для evidence-based улучшений (разрешены в пилоте, БЕЗ изменений бизнес-логики/DB/RPC/RLS):**
- **Слишком вертикально:** `TaskDetailModal` — для чек-листа из 5 пунктов на телефоне это очень длинный скролл; per-item «Report a problem» дублирует футерный. `TemplateDetailModal` overview — всё в одну колонку; Items и Schedules должны быть табами/аккордеоном.
- **Слабая визуальная иерархия:** строки списка все одного веса (одинаковый фон/паддинг); просроченная и завершённая задача отличаются одним badge-тоном (оба не проходят контраст); завершённые строки Staff не приглушаются (хотя retired-шаблоны — `opacity:0.65`). Секционные `<h3>` = 15px, почти не отличаются от 14px body.
- **Слишком много badge:** до 4 на строку Staff, до 5 на строку item; due-time и категория — это метаданные, не статус, их надо текстом, не pill'ом. Резервировать badge под state + exceptions.
- **Неясная иерархия действий:** `Edit/Replace/Retire` тремя равновесными кнопками инлайн; `Retire` имеет danger-*стиль* но secondary-*hover* (копипаст-слип). `Replace`/`Retire`/`Deactivate`/`Revise` → в `ActionsMenu` (который есть в ките и Operations им не пользуется).
- **Мобайл-плотность:** badge-wrap растит строки до 3–4 линий на 375px. Сегментные вкладки не переносятся и рискуют клипаться < 360px на EN.
- **Manager desktop мог бы быть плотнее:** попап `min(960px)` под **одноколоночный** список шаблонов — океан пустоты; шаблоны → таблица (name/category/scope/status/schedule-count) или 2–3-колоночная сетка. Manager, разбирающий 20 исключений, хочет плотную сортируемую таблицу, а не стопку карточек.

**Гейт пилота:** полный live Preview Browser QA Manager+Staff, JA+EN; Phase-0-style theme-diff проверка (значения байт-идентичны); `turbo` зелёный; независимое ревью. **Никаких изменений схемы/RPC/RLS без отдельного Founder Gate.**

Browser Visual/UX Audit из Work делается отдельно; Founder сопоставит два результата.

---

## 12. MIGRATION STRATEGY (инкрементально, НЕ big-bang)

1. **Foundation (без изменений экранов, кроме глобальных дешёвых).** Токен-правки §4 → Tailwind v4 wiring → **LIFF CSS-baseline gate (реальное устройство)** → Radix install → примитивы `@line-os/ui` слоя 3 → галерея `/_design`. Плюс сразу глобально: P0-контраст (значения токенов), `:focus-visible` для всех контролов, монтаж `ToastProvider`, `<html lang>` за тумблером. Эти правки — глобальные и дешёвые, риск регрессии низкий.
2. **Operations pilot.** Миграция Operations на DS + `ListRow`/`Tabs`/`FormActions` + evidence-based UX §11 + полный QA. Валидирует DS под реальной поверхностью.
3. **Regression gate.** Operations JA/EN Manager+Staff Preview QA + theme-diff.
4. **WP2–WP5 на DS v1 по умолчанию.** Дыры DS, найденные по ходу WP, закрываются в `@line-os/ui`, не локально.
5. **Product-surface consistency sweep.** Button/Badge/Field/Card по ~31 каноническому `(protected)`-экрану. Механически, высокая ценность. **НЕ редизайн** — только подмена примитивов. Это главный драйвер стоимости (charter требует live Preview QA на каждое UI-изменение — рассмотреть per-batch QA для механических подмен).
6. **Legacy per-screen deep migration.** On-touch, пост-v2.2, приоритет по трафику/ценности. Деревья `demo/` и `_client-preview/` — **заморозить** (без DS-миграции) до отдельного решения «схлопнуть деревья».

**Единицы миграции:** экран (канонический продукт) → потом фича-папка. **Порядок:** foundation → пилот → регрессия → WP-дефолт → sweep → on-touch. **Compat-слой:** старые `theme.ts` остаются работать во время миграции; примитивы читают токены; никакого «дня X». **Deprecation:** `theme.ts`-хелперы помечаются `@deprecated` по мере переноания их потребителей. **Enforcement:** ESLint-rule (сначала warn, потом error), галерея как контракт, лёгкое PR-ревью на изменения `@line-os/ui`, правило «новый экран = DS или `// ds-exception: <причина>`».

---

## 13. ESTIMATE

Оценка в **инженеро-неделях** (один сфокусированный инженер + Claude-сессии + Founder QA). Включает: архитектуру, реализацию компонентов, миграцию, тесты, visual-regression, browser QA, a11y-фиксы, проверку адаптива, интеграцию, запас на переделку/риск. **Не только время написания компонентов.**

| Блок | BEST | WORKING | RISK | Что раздувает RISK |
|---|---|---|---|---|
| **A. Design System v1 foundation** (токен-правки §4, Tailwind v4 wiring, LIFF-gate, Radix, ~20 примитивов слоя 3, консолидация 3 theme-файлов, галерея, lint) | 3 нед | **5–6 нед** | 9–10 нед | LIFF-gate провал → откат на Tailwind v3; консолидация `shiftChipColors` требует Founder-решения; примитивы «почти готовы» дольше, чем кажется |
| **B. Operations pilot migration** (миграция ~13 файлов, `ListRow`/`Tabs`/`FormActions`, a11y-фиксы, evidence-based UX §11, полный Manager+Staff QA JA+EN, регрессия) | 1.5 нед | **3 нед** | 5 нед | поведение Radix Dialog тонко отличается от текущего `Modal`; UX-правки расползаются в редизайн |
| **C. Adoption во время WP2–WP5** (маржинальная стоимость строить WP-UI на DS вместо ad-hoc) | +0 (чистая экономия) | **+1–2 нед** суммарно (закрытие дыр DS) | +4 нед | DS оказывается недостаточен под нужду WP → редизайн примитива на ходу |
| **D. Product-surface primitive sweep до закрытия v2.2** (~31 канонический экран: Button/Badge/Field/Card + глобальные P0 a11y — НЕ полное истребление inline, НЕ деревья demo/preview) | 4 нед | **8 нед** | 14 нед | per-screen live QA (charter) — реальный драйвер; консолидация цветов даёт видимые изменения → доп. раунды Founder-QA |

**Итого до закрытия Cafe v2.2** (A + B + C-маржа + D):
- **BEST: ~9–10 недель**
- **WORKING: ~16–19 недель** ← планировать по этому
- **RISK: ~28–32 недели**

**Почему неопределённость высокая:** (1) неизвестен исход LIFF-gate (бинарная развилка Tailwind v4 vs v3); (2) `charter` требует live Preview QA на каждое UI-изменение — при ~31 экране это доминирующая, плохо сжимаемая статья; (3) неизвестно, сколько дыр DS вскроют WP2–WP5; (4) консолидация двух `shiftChipColors` и badge-тонов = одноразовые видимые изменения цвета → непредсказуемое число раундов Founder-приёмки.

**Полная legacy-миграция всех 3 деревьев** (не рекомендуется, не входит в v2.2): ещё ~2.5× от D. Рекомендация — сначала отдельная миссия «схлопнуть 3 дерева» (~64 дубля), либо заморозка demo/preview.

---

## 14. RISKS

1. **Два стайлинг-механизма навсегда** (inline + Tailwind), если дисциплина миграции просядет. → lint-rule + правило on-touch + WP-дефолт + галерея-контракт.
2. **LINE LIFF WebView не тянет CSS-baseline Tailwind v4.** → **обязательная ранняя проверка на реальном устройстве как гейт** до коммита в архитектуру. Фолбэк: официальный путь Tailwind v3 (Next поддерживает) или PostCSS-preset-env полифиллы.
3. **Вес/рантайм Radix на Staff-мобайле** (LIFF, low-end Android). → замерить; Radix tree-shake'ится по примитиву, оверхед умеренный; бюджет производительности в галерее.
4. **Консолидация двух `shiftChipColors`** меняет цвет части типов смен. → нужна Founder-подпись, какой алгоритм побеждает (видимое одноразовое изменение).
5. **Оценка D раздувается** из-за per-screen QA. → батчить по экранам; рассмотреть per-batch QA для чисто механических подмен примитивов; принять, что это реальный драйвер, а не резать угол.
6. **Scope creep «раз уж мы здесь — давайте редизайн».** → пилот UX-правки разрешает; sweep — НЕТ. Жёсткое правило.
7. **`Modal` API vs Radix Dialog** — тонкие отличия backdrop/вложенности. → адаптационный слой в обёртке, зафиксировать в галерее.
8. **Токены читаются как JS-литералы**, не CSS-vars → рантайм-темы (в т.ч. будущий dark) требуют миграции на `var(--oruwa-*)`. Не блокер v1, но назвать зависимостью.
9. **Заморозка demo/preview деревьев** оставляет их дрейфовать от продукта. → приемлемо, если demo/preview официально не «референс», а маркетинг/акцептанс-песочница (что и так близко к текущему статусу).

---

## 15. WHAT NOT TO DO

- **НЕ** big-bang-мигрировать все 155 файлов / 1 942 инлайновых стиля.
- **НЕ** брать Radix Themes (OPTION D) — чужой визуальный язык, низкий потолок кастомизации, лок-ин всех вертикалей.
- **НЕ** строить сейчас Storybook + Chromatic/Percy — хватит галереи `/_design` + существующего Preview QA.
- **НЕ** тащить animation-фреймворк (Framer Motion) — CSS-transitions + motion-токены достаточны (charter §4).
- **НЕ** строить token-management-платформу (Style Dictionary / Tokens Studio) — ручной генератор на этом масштабе адекватен.
- **НЕ** строить cross-repo publishing для marketing-сайта — преждевременно.
- **НЕ** мигрировать деревья `demo/` и `_client-preview/` — сначала решить их судьбу.
- **НЕ** редизайнить экраны во время consistency sweep.
- **НЕ** блокировать старт WP2 полной legacy-миграцией.
- **НЕ** вводить второй рантайм-стайлинг (styled-components/emotion).
- **НЕ** давать «DS v1» распухнуть в dark mode / анимацию / white-label / десятки вариантов.
- **НЕ** откатывать что-либо из Phase 0 в этой миссии (только достроить в следующей).

---

## 16. DECISIONS REQUIRED FROM FOUNDER

1. **Технология.** Утвердить **OPTION C** (Tailwind v4 + Radix Primitives под ORUWA-компонентами) против A (только нормализация), B (headless без Tailwind), D (Radix Themes). Рекомендация — **C**.
2. **LIFF-гейт.** Санкционировать раннюю проверку CSS-baseline Tailwind v4 в реальном LINE-webview как **гейт до фиксации архитектуры**; при провале — Tailwind v3.
3. **Scope для закрытия v2.2.** Подтвердить, что закрытие Cafe v2.2 требует: DS v1 + Operations pilot + WP2–WP5 на DS + product-surface primitive sweep (~31 экран) + глобальные P0 a11y-токен-правки — **но НЕ** полное истребление инлайновых стилей и **НЕ** миграцию деревьев demo/preview.
4. **Три параллельных дерева UI.** Утвердить **заморозку** `demo/` и `_client-preview/` (без DS-работ, возможная ретирация позже), чтобы усилие DS било только в канонический продукт. Полное «схлопнуть деревья» = отдельная миссия.
5. **`shiftChipColors`.** Принять, что консолидация двух алгоритмов **изменит цвет части типов смен** (одноразовое видимое изменение); выбрать, какой алгоритм канонический.
6. **`@line-os/ui`.** Переписать в существующем `packages/ui` (рекомендация) vs новый пакет.
7. **Носитель шрифта.** Утвердить загрузку Noto Sans JP через `next/font/google` (subset + сабсеттинг весов) как часть foundation, либо откат дельты шрифта Phase 0.

---

## 17. RECOMMENDED NEXT MISSION (НЕ начинать)

**«ORUWA Design System v1 — Foundation & Operations Pilot»**, две стадии, обе внутри существующих per-WP гейтов (без новых гейтов приёмки):

- **Стадия 1 — Foundation.** Токен-ремедиация §4 (elevation-слой, недостающие токены, drift-тест, загрузка шрифта) → Tailwind v4 wiring, питающийся от `--oruwa-*` → **LIFF CSS-baseline gate** → Radix Primitives → примитивы `@line-os/ui` слоя 3 + перенос `design-kit` → галерея `/_design` → ESLint-rule → глобальные дешёвые правки (P0-контраст, `:focus-visible` всем контролам, монтаж Toast, `<html lang>`). Гейт: `turbo` зелёный, галерея покрывает контракт §10, theme-diff байт-идентичен, независимое ревью.
- **Стадия 2 — Operations pilot.** Миграция Operations на DS + `ListRow`/`Tabs`/`FormActions` + evidence-based UX §11 (без изменений бизнес-логики/DB/RPC/RLS) + полный Manager+Staff Preview QA JA+EN + регрессия + независимое ревью.

Далее по roadmap: WP2–WP5 на DS v1 → product-surface sweep → Copy Audit / Feature Map / Demo Readiness → один Phase-4 Integrated Acceptance → Cafe v2.2 CLOSED.

---

## Приложение A — независимая проверка

**Вердикт независимого fresh-context ревьюера: PASS** (с мелкими не-блокирующими правками, применены в этой версии).

Ревьюер самостоятельно (собственный ripgrep/git по `dev @ 4fc2cba`, без доверия к цифрам отчёта) переподтвердил: отсутствие Tailwind/CSS-in-JS; 0 импортов `@line-os/ui`; 0 потребления `var(--oruwa-*)` на call-site; `style={{` = 1 942 / 155 файлов (точно); `<button>` = 296 / 97 (точно); три параллельных дерева UI; три theme-файла + два расходящихся `shiftChipColors` (preview рисует через demo-тему, прод — через workforce-тему → один тип смены разного цвета); `design-kit` состав; Next 15 / React 18.3. Phase 0: Noto Sans JP объявлен и нигде не загружается (0 `next/font`/`@font-face`/google-fonts) — подтверждено; `dist/tokens.css` закоммичен; охват `tokens.test.ts` описан точно (пин `#3B5C3E`, не вычисление контраста); `lib/demo/cafe/theme.ts` мигрирован наполовину. A11y: `Modal` без focus-trap и scroll-lock — подтверждено чтением файла; `ToastProvider` нигде не смонтирован — подтверждено; `:focus-visible` только у button-ролей — подтверждено. Research по Tailwind v4 / Radix — точен. **OPTION C — обоснован, не переусложнён**; отказ от Radix Themes оправдан; LIFF-гейт — реальная необходимость (iOS LINE = WKWebView, привязан к версии Safari ОС). Оценка 16–19 нед (WORKING) — честная, не фантастически-оптимистичная с учётом истории репозитория; ревьюер советует ещё сильнее де-акцентировать колонку BEST. Слоистая архитектура §9 — соразмерна (фактически 3 новых понятия, не abstraction-framework). Ускорение WP2–WP5 и reuse будущими вертикалями — credible.

Применённые не-блокирующие правки: (1) контраст `text-muted` уточнён до ≈3.7:1 / ≈4.1:1 (вывод «провал AA» не меняется); (2) demo-дерево ~29 `.tsx` (не 33); (3) «rogue portal» → «самопальные overlay `position:fixed`» (не `createPortal`); (4) `title=` верхняя граница ~174; (5) пост-cutoff специфика Radix (дата релиза/версия) переразмечена FACT → INFERENCE. Архитектурных ошибок и ошибок суждения ревьюер не нашёл.
