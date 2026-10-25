# Salon package (beauty / hair) with LINE booking — product and architecture plan

Status: **DRAFT — planning only, not approved, nothing built.** Written 2026-10-25
by the Lead Agent at the Founder's request ("future third vertical: a beauty /
hair salon with appointment booking via LINE"). It does not start the vertical:
per `docs/foundation/repository-maturity-roadmap.md` a vertical starts only
after a recorded Founder Product Review, and per
`docs/architecture/platform-packages-model.md` §2 the second package is the
buyer mini-package / cleaning, so Salon is the **third**.

## Кратко (RU)

- **Что было в salon01.** Supabase-проект `line-app-prod-salon01` — бэкенд
  старого прототипа `tantik/line-app` (публичный GitHub, апрель–май 2026):
  LIFF-запись в салон (услуга → мастер → дата/время → имя+телефон), админка на
  ванильном JS (записи, мастера, услуги, график салона, блокировки), Postgres
  RPC для слотов и создания записи, подтверждение/отмена через LINE postback,
  напоминания (`reminder_jobs`, за 24 ч и за N ч), статус `risk` для
  неподтверждённых записей, лиды для продаж. Мульти-тенантность по `salon_id`,
  но в «демо-режиме» RLS ослаблен, ПДн клиентов хранятся открытым текстом.
- **Что уже есть в ORUWA.** Схема `booking.*` (0010) + module gate (0096),
  права `booking.*` (0008), роль `client`, контракты `@line-os/booking`,
  заглушка `/booking`, скелет воркера напоминаний, реестр LINE-каналов
  (0004), outbox уведомлений (0109, без отправки), LIFF-вход (Edge Function
  `liff-entry`), полноценный Workforce (сотрудники, смены, заявки).
  Бизнес-логики записи нет: ни RPC слотов, ни защиты от двойной записи, ни UI.
- **Где мы выигрываем.** LINE-native запись + смены/посещаемость мастеров в
  одной системе (у японских конкурентов это разные продукты или платные
  опции), цена для малого салона без процента с записи.
- **MVP.** Меню/опции/длительность, мастера = сотрудники Workforce,
  доступность из опубликованных смен, запись из LIFF с 指名 или «любой
  мастер», защита от двойной записи на уровне БД, подтверждение/отмена и одна
  напоминалка через LINE (только после явного решения Founder по отправке),
  простая карточка клиента. Позже: предоплата, 回数券, баллы, отзывы,
  синхронизация с Hot Pepper.
- **Главные риски.** Двойная запись с Hot Pepper Beauty (публичного API у
  SALON BOARD мы не нашли), стоимость push-сообщений LINE (200 бесплатных в
  месяц на бесплатном плане OA), ПДн клиентов (APPI), отсутствие хотя бы
  одного реального salon-пилота.
- **salon01.** Перед удалением сохранить: дамп схемы (в живой БД есть
  объекты, которых нет в репозитории прототипа), список Storage-бакетов,
  Edge Functions/cron, настройки Auth, скриншоты. Удаляет Founder сам после
  релиза ORUWA (DEBT-125).

---

## 1. Inputs and evidence

### 1.1 What the `line-app-prod-salon01` prototype contained

The Supabase project `line-app-prod-salon01` is the backend of the legacy repo
`tantik/line-app` (public on GitHub, created 2026-03-19, last push
2026-05-18, ~100+ commits). Evidence:

- `.cursor/rules/05-legacy-migration-boundaries.mdc` maps `tantik/line-app` to
  the **Booking** module as a source reference only.
- `packages/booking/src/index.ts`, `supabase/migrations/0010_booking.sql`,
  `docs/product/modules.md` all cite `tantik/line-app` ("salon logic / LINE /
  Supabase concepts").
- `docs/phase-1l-4-cloud-dev-sync-completion-report.md` and
  `docs/operations/deferred-debt-register.md` DEBT-125 name the project and note
  the repo guard treats it as the production project ref.
- The prototype's own README seeds `'demo-salon', 'Mirawi Demo Salon'` — the
  same demo name used by `packages/db/scripts/seed.ts` (`DEMO_SALON`) and
  `docs/product/demo-vs-client-template.md`.

Source files read (read-only, via the GitHub API; nothing copied into this repo):
`README.md`, `REQUIREMENTS.md`, `TODO.md`, `reliz.md`, `reshenie.md`,
`supabase/migrations/001_saas_foundation.sql`, `add_available_slots_v2.sql`,
`api/line-webhook.js`, `api/process-reminders.js`,
`api/send-booking-confirmation.js`, `api/send-admin-booking-notification.js`,
`api/create-sales-lead.js`, `admin.js`, `line-booking/*`, commit history.

No local copy, dump or screenshot of salon01 was found in
`D:\Dev\old21062026` (an old static marketing site), `D:\Dev\oruwa-archive`
(one Mame To Cha smoke archive), `D:\Dev\oruwa-backups` (ORUWA Cloud DEV dumps,
2026-08-26 / 2026-08-29 — contain ORUWA's own `booking` schema, not salon01),
`D:\Dev\best` (unrelated tooling) or `D:\Dev\lbo-baseline-check` (empty).
The Supabase project itself was **not** inspected (out of scope: no Cloud
access in this task).

**Features (prototype, per README / REQUIREMENTS / commits):**

| Area | What it did |
|---|---|
| Customer booking (LIFF, vanilla JS, Vercel) | 3 screens: service → optional stylist (only stylists mapped to that service) → 14-day calendar with live slots, free stylists for a chosen time → name + phone → 「確定」 → thank-you screen |
| Slot engine | Postgres RPC `available_slots` / `available_slots_v2`: salon business hours ∩ stylist working hours / `work_days` ∩ service duration, minus existing bookings and blocked slots |
| Booking creation | `create_public_booking` (SECURITY DEFINER): validates stylist↔service mapping, no past bookings, booking window (default 30 days), duplicate-submit protection (same LINE id/phone within N minutes), overlap check vs bookings and blocked slots, writes `booking_events`, enqueues reminder jobs |
| Confirm / cancel | Public token RPC `public_change_booking_status`; LINE webhook postback buttons (confirm / cancel); admin cancel notifies the customer; reminder jobs closed on cancel / complete |
| No-show reduction | `pending → risk` status via `mark_booking_risk()` when still unconfirmed N minutes before start; risk badges in admin |
| Reminders | `reminder_jobs` (`confirmation_request`, `day_before`, `hours_before`), Vercel cron + Edge Function `process-reminders`, LINE push; requirement "3 h before, but not before 09:00"; stale-job guard |
| Admin (vanilla JS) | Bookings list/realtime, stylists (photo, hours, slot interval, services), services (code, category, duration, price, icon), salon weekly schedule, blocked-slot create/delete |
| LINE | Messaging API webhook on Vercel with signature verification; follow / text / postback handlers; per-env single channel (`LINE_CHANNEL_*` env vars) |
| Sales | Lead forms (demo + site) → `leads` / `sales_leads`, e-mail notification |

**Data model (repo migration `001_saas_foundation.sql`):** `salons` (slug,
timezone, brand colours, `line_channel_id`), `profiles`, `salon_members`
(enum `super_admin | salon_admin | manager | staff`), `salon_settings`
(require_confirmation, risk threshold, duplicate window, booking window, max
bookings/day), `services`, `staff` (single start/end time, slot minutes,
`line_user_id`), `staff_service_map`, `business_hours`, `blocked_slots`,
`leads`, `bookings` (customer name/phone/email/LINE id **in plain text**,
`public_token`, status enum incl. `risk`, `risk_score`), `booking_events`,
`reminder_rules`, `reminder_jobs`, view `admin_booking_view`, RLS policies by
`salon_id`. The frontend also queries `salon_business_hours`, `sales_leads`,
`staff.work_days`, `services.icon_url` and a Storage bucket `salon-assets`,
which are **not** in the repo migration — the live salon01 schema has drifted
from the repo (see §9).

**Known weaknesses (do not repeat):** overlap check is a `SELECT … then
INSERT` (race-prone, no exclusion constraint); customer PII in plain text;
"demo mode" anon policies (`reliz.md` lists them as must-remove); a single
global LINE channel per deployment; service_role used from Vercel functions;
slot RPC return shape inconsistent (`reshenie.md`).

**Ideas worth re-implementing (concepts only, per rule 05):**
1. Service → stylist filter via a stylist↔service map; "any stylist" option.
2. Slot engine in Postgres (one source of truth for UI and for the write path).
3. Duplicate-submit window and booking window as tenant settings.
4. Public token for confirm / cancel without sign-in (we will prefer LINE
   identity, keep the token for e-mail / non-LINE customers).
5. `pending → confirmed` via LINE button; `risk` flag for still-unconfirmed
   bookings close to start; reminder jobs cancelled on cancel / complete.
6. Quiet-hours rule for reminders (not before 09:00 local).
7. `booking_events` timeline per booking (ORUWA already has the table).

### 1.2 What LINE Business OS already has

| Capability | Where | State |
|---|---|---|
| Booking schema: services, staff, business_hours, blocked_slots, bookings (encrypted PII + blind index), booking_events | `supabase/migrations/0010_booking.sql` | scaffold, no RPC / api view / UI |
| Booking module-OFF gate | `0096_booking_module_access_gate.sql` | live |
| Permissions `booking.booking.read`, `booking.booking.write`, `booking.service.manage`; `client` role with `booking.booking.read` | `0008_rbac_seed.sql` | seeded; client RLS ("own bookings only") not implemented |
| Contracts `BookingStatus`, `Service`, `PublicBookingInput`, routes | `packages/booking/src/index.ts` | draft |
| `/booking` route | `apps/web/src/app/booking/page.tsx` | placeholder text |
| 24 h reminder job | `apps/worker/src/jobs/booking-reminders.ts` | skeleton, sends nothing |
| LINE channels per tenant (encrypted secrets, `liff_id`), LINE accounts (hashed user id) | `0004_line_registry.sql` | live |
| LINE Messaging client (push / reply), webhook verification | `packages/line/src/messaging.ts`, `webhook.ts` | library, used by Workforce |
| LIFF sign-in (ID token → tenant via channel id → magic link) | `supabase/functions/liff-entry` | live for staff only |
| Notification outbox (idempotency key, template key, no PII text) | `0109_core_platform_foundation_notifications.sql` | table only, **no dispatcher** |
| Workforce: employees (encrypted names, `user_id`), shifts (published), shift types, requests, leave, attendance, schedule settings, auto-schedule | `0009`, `0025`–`0126` | production depth (Cafe) |
| Packages / modules registry, provisioning | `0107`, `0129`, `0133`, `provision-tenant` | live |
| Realtime live updates | `docs/architecture/realtime-live-updates.md` | live for Workforce |

Gap summary: the platform has all the *plumbing* (tenant, RBAC, module gate,
LINE channel registry, LIFF, outbox, staff and shifts) but none of the
*booking behaviour* (availability, safe writes, customer identity, dispatch).

## 2. Market analogues

Prices are only what the cited source says on 2026-10-25; anything from a
third-party aggregator is marked *(3rd-party)*; anything not found is marked
**unverified**.

### 2.1 Japan

| Product | Core | Pricing (source) | LINE |
|---|---|---|---|
| **Hot Pepper Beauty + SALON BOARD** (Recruit) | Dominant salon marketplace; SALON BOARD = free schedule/ledger for listed salons, manages stylists **and** equipment (beds, chairs), Airレジ POS link, auto-registration of customers | SALON BOARD free **but requires a Hot Pepper listing**; listing fee "varies by area and plan, ask sales" ([SALON BOARD FAQ via atsoho](https://atsoho.com/blog/hot-pepper-listing-fees-expensive), [salonboard.com/faq](https://salonboard.com/faq/)); points/coupon cost **unverified** | Not native; marketplace app |
| **minimo** (MIXI) | Per-stylist booking app (個人指名), 8 M+ downloads; joint project with Nailie (2026-06) | **unverified** ([App Store](https://apps.apple.com/jp/app/id719858778), [zaikei](https://www.zaikei.co.jp/releases/3467891/)) | No |
| **LINE公式アカウント「LINEで予約」** | Booking inside LINE via partner systems | "予約手数料0円", may vary by partner; partner list is **restaurant-only** — no beauty partner listed ([lycbiz reservation](https://www.lycbiz.com/jp/service/line-official-account/reservation)) | Native |
| **LINE OA plans** (cost driver for us) | Push/multicast/broadcast count as messages; **reply API, chat, auto-reply, greeting do not count** | Communication ¥0 / 200 msgs; Light ¥5,000 / 5,000; Standard ¥15,000 / 30,000 + pay-as-you-go from ~¥3; extra-message pricing revised 2026-10-01 (new tiers not readable) ([lycbiz plan](https://www.lycbiz.com/jp/service/line-official-account/plan/)) | — |
| **STORES予約** (ex-Coubic, クービック株式会社) | Generic booking, tickets/月謝, customer mgmt, prepayment | Free (50 bookings/mo) → Small ¥9,790–12,980 → Team ¥19,690–22,880 (3 staff) → Business ¥28,600–31,790; **LINE Mini App add-on ¥4,400/mo**; card prepayment 3.3–5.2% ([stores.fun pricing](https://stores.fun/reserve/pricing)); Coubic link: [paymentnavi](https://paymentnavi.com/?p=99790) | Paid add-on |
| **RESERVA** | Generic booking, salon templates, coupons, shift mgmt | Free + paid, e.g. ~¥3,850–5,500/mo, LINE option ~¥3,300/mo *(3rd-party, possibly stale)* ([atsoho](https://atsoho.com/blog/hair-salon-booking-system)) | Paid option |
| **Airリザーブ** (Recruit) | Generic booking | Free plan; Basic ¥5,500/mo; online payment 3.24% *(3rd-party)*; LINE only via external tools (e.g. Lステップ) ([imitsu](https://saas.imitsu.jp/cate-reservation/service/2734/price), [aurant](https://aurant-technologies.com/blog/line-beauty-reservation-automation/)) | External |
| **Square 予約** | Booking + POS + payments | Free / Plus ¥3,000 / Premium ¥8,000 per store; in-person 2.5%~ ([Square JP](https://squareup.com/jp/ja/townsquare/appointment-system-pricing)) | No (unverified) |
| **BeautyMerit** (株式会社サインド) | Salon booking, multi-channel ledger, rank-based points, in-app shop; LINE Mini App package; "BeautyMerit Pay" cancellation fee from stored card | LINE Mini App package: initial from ¥100,000, monthly from ¥20,000 ([lycbiz package](https://www.lycbiz.com/jp/service/line-mini-app/package/beauty-merit)); other figures ¥150,000 / ¥35,000 *(3rd-party)* ([imitsu](https://saas.imitsu.jp/cate-reservation/service/6003/price)); Hot Pepper sync **unverified** | Native (Mini App) |
| **リピッテ (Repitte Beauty)** (コネクター・ジャパン) | LINE-OA-based salon booking, everything in LINE, first-time registration | "from ¥2,000/mo" in a 2022 deck *(stale)* ([atsoho](https://atsoho.com/blog/repitte)) | Native |
| **KaKuMei** | **Not found** under this name — **unverified** (name may differ) | — | — |

Similar "LINE + karte" products exist (e.g. オモテナAppo, KaruteKun with LINE
booking as a ¥5,500–11,000 add-on *(3rd-party)*,
[issoh](https://www.issoh.co.jp/column/details/15205/)).

### 2.2 Global

| Product | Pricing (source) | Notes |
|---|---|---|
| **Fresha** | US $19.95/mo independent, $14.95 per team member; 20% (min $6) on marketplace new clients *(3rd-party)* ([pabau](https://pabau.com/blog/fresha-review/)) | Marketplace + free-ish software; was famously "free" until recently |
| **Booksy** | $29.99/mo + $20 per extra member; Boost 30% of first new-client visit ($10–100) ([biz.booksy.com](https://biz.booksy.com/blog/best-salon-software-2026)) | Marketplace + software |
| **Vagaro** | ~$24–30/mo, +$10 per user, many add-ons *(3rd-party)* ([schedulingkit](https://schedulingkit.com/pricing-guides/vagaro-pricing)) | All-in-one incl. payroll add-on |
| **Square Appointments** | Free / Plus / Premium per location, regional prices (e.g. UK £29 / £69) ([square.com/gb](https://square.com/gb/en/appointments/pricing)) | Payments-led |
| **Mindbody / Booker** | $139–599/mo tiers, renamed 2026-02 *(3rd-party)* ([costbench](https://costbench.com/software/salon-spa/booker-mindbody)) | Upmarket, multi-location |
| **Treatwell** | 35% on new marketplace clients, 0% repeat, 2% prepayment fee (partner page; another source says 25%) ([treatwell.co.uk/partners](https://www.treatwell.co.uk/partners/)) | European marketplace |
| **Phorest** | Custom pricing, annual contract *(3rd-party)* ([capterra](https://capterra.com/p/113530/Phorest-Salon-Software/)) | Retention marketing focus |
| **Timely** | ~$26–29/mo entry, per-staff tiers, SMS extra *(3rd-party)* ([schedulingkit](https://www.schedulingkit.com/pricing-guides/timely-pricing)) | NZ, salon-focused |

### 2.3 What a Japanese salon actually needs (from the analogues)

| Need | Who has it | MVP? |
|---|---|---|
| 指名 (choose stylist) + 指名料, or "おまかせ" | everyone; minimo is built on it | **MVP** (指名料 = later price modifier) |
| メニュー + オプション, 所要時間 per menu (and per stylist rank later) | SALON BOARD, RESERVA, STORES | **MVP** (menu + options with added minutes / price) |
| Equipment / seat (席, シャンプー台, bed) as a resource | SALON BOARD manages stylists **and** equipment | later (MVP = stylist only; seats count as a cap) |
| 当日枠 / booking cut-off (e.g. until 1 h before), booking window | STORES, prototype | **MVP** (tenant settings) |
| キャンセルポリシー text + online cancel until X | most | **MVP** (text + cut-off); fees later |
| 事前決済 / cancellation fee from stored card | STORES (3.3–5.2%), BeautyMerit Pay, Airリザーブ | later (payments are a platform decision) |
| リマインド (LINE / mail / SMS) | STORES (mail; SMS add-on), Repitte (LINE) | **MVP: one LINE reminder** (gated, §6) |
| カルテ / 顧客管理 (visit history, notes, photos) | SALON BOARD, KaruteKun, Omotena | MVP = minimal customer card + visit list; photos later |
| 回数券 / サブスク | STORES | later |
| ポイント / 会員ランク | BeautyMerit, Hot Pepper points | later |
| 口コミ | Hot Pepper, marketplaces | later / maybe never (Hot Pepper owns reviews) |
| Hot Pepper 連携 / 二重予約防止 | SALON BOARD (internal only); third parties claim "一元管理" | **open risk** (§7.1) |

## 3. Positioning

Who we are **not**: a marketplace (Hot Pepper, minimo, Fresha, Booksy,
Treatwell). We bring no new customers and take no commission. Salons will keep
Hot Pepper for acquisition; we are the salon's **own** channel for repeat
customers (who already follow the salon's LINE OA) and the salon's **back
office**.

Where we win:
1. **LINE-native without a paid add-on.** Booking, confirm/cancel, reminder
   all inside the salon's own LINE OA (LIFF), included in the package — STORES
   charges ¥4,400/mo extra for the LINE Mini App, RESERVA ~¥3,300 *(3rd-party)*,
   Airリザーブ needs external tools; BeautyMerit-class LINE apps start at
   ¥20,000/mo + ¥100,000 setup.
2. **Booking + shifts + attendance + staff comms in one system.** Stylist
   availability comes from the same published shifts staff already see in
   ORUWA; leave approval removes slots automatically. Competitors either do
   booking only, or do shifts as a separate product.
3. **Japanese SMB pricing.** One flat monthly price per salon, no per-booking
   or per-new-client fee (Cafe's draft anchor is ¥4,980/mo,
   `docs/sales/cafe-workforce-pricing-notes.md`; Salon price is an open
   question). Reply-based LINE flows keep the salon on the free LINE OA plan
   longer (§7.2).
4. **Multi-package.** A salon that also sells retail can add Inventory /
   Purchases (existing modules) — no new product.

Where we lose (accept): no marketplace traffic, no reviews, no Hot Pepper
sync at MVP, no payments at MVP.

## 4. Scope

### 4.1 MVP ("Salon v1")

Customer (LINE / LIFF, no ORUWA password):
- Open the salon's rich-menu link → LIFF → choose menu (+ options) → stylist
  or 「指名なし」 → date → free start times → confirm (name + phone on first
  visit, prefilled after) → booking `pending` or `confirmed` per tenant setting.
- My bookings: list, cancel until the cut-off, re-book same menu.
- Confirmation message (reply API where possible) with 「確認」/「キャンセル」
  buttons; one reminder (default day before, quiet hours) — **dispatch only
  after the Founder approves customer messaging, §6**.

Salon (Manager = 店長 / Owner, existing ORUWA roles):
- Menus: category, name, duration, price, options (+min, +¥), which stylists
  can perform it, active flag, sort order.
- Booking ledger: day view per stylist (columns), week view; create a phone /
  walk-in booking; move, cancel, mark completed / no-show; booking timeline.
- Booking settings: booking window, cut-off, slot granularity, require
  confirmation, cancellation-policy text, buffer between bookings.
- Customer card: name, phone, LINE linked yes/no, visit history, free-text
  note, no-show count.
- Stylist availability = published Workforce shifts minus approved leave minus
  manual blocks (no second schedule to maintain).

Staff (stylist): see own bookings for today / this week inside the existing
`/staff` page.

### 4.2 Later (ordered by expected value)

1. Equipment / seat resources and multi-resource bookings (colour processing
   frees the stylist while the seat stays occupied).
2. 指名料 and stylist-rank pricing / durations.
3. Prepayment and cancellation fees (needs a platform payments decision).
4. Hot Pepper coexistence beyond manual blocks (§7.1).
5. 回数券 / subscriptions, points / ranks.
6. Karte photos and treatment notes (colour formulas) — sensitive data review.
7. Waitlist / 空き通知, re-visit nudges (marketing pushes = paid messages and
   "mass messaging" gate).
8. Reviews, analytics (repeat rate, no-show rate, stylist utilisation).

## 5. Core reuse vs new

| Capability | Reuse | New |
|---|---|---|
| Tenant, location, module gate, package registry, provisioning | as is | `salon` package row + starter data (menu categories, vocabulary 「スタイリスト」「メニュー」) |
| RBAC | `booking.*` permissions, Owner / Manager / Employee / Client roles | possibly `booking.customer.manage`; client RLS "own bookings only" |
| Staff | `workforce.employees` = stylists | replace `booking.staff` with a link to employees (see §6 data model) |
| Availability | `workforce.shifts` (published), `leave_requests`, `schedule_settings` | availability function (shift ∩ business hours − bookings − blocks), slot granularity |
| Booking engine | `booking.bookings`, `booking_events`, `blocked_slots`, `business_hours` | menus/options, booking items, exclusion constraint, RPCs (`available_slots`, `create_booking`, `cancel_booking`, `confirm_booking`), api views |
| Customer identity | `core.line_accounts` (hashed LINE id), LIFF ID-token verification pattern from `liff-entry`, PII encryption + blind index | `booking.customers` (tenant-scoped, encrypted), customer LIFF entry that issues **no** staff session (anonymous-but-verified LINE identity → server RPC), consent record |
| Messaging | `packages/line` client, `core.line_channels`, `core.notifications` outbox | outbox **dispatcher** (platform-level, shared with Workforce), templates, quiet hours, per-tenant monthly cap |
| Realtime | existing Realtime pattern | booking ledger subscription |
| UI | `@line-os/ui`, design-kit, Manager / Staff shells | ledger (day / week by stylist), LIFF booking flow, menu editor |
| Payments | — | later, platform-level (not a Salon feature) |

The Booking module stays a **generic capability** (Clinic, Cleaning visits,
consultations may reuse it); everything salon-specific (vocabulary, starter
menus, 指名 wording, default settings) is package configuration, per
`platform-packages-model.md` §1.

## 6. Data model sketch (tenant-scoped, RLS)

All tables: `tenant_id not null`, `location_id` where physical, RLS via
`core.has_permission(...) and core.has_module_access(tenant_id, 'booking')`,
writes through SECURITY DEFINER RPCs with explicit `search_path`, `api.*`
read views, audit to `booking_events`. Forward-only migrations amending 0010
(no rows exist in any tenant — 0096 header — so restructuring is cheap now).

```
booking.settings          (tenant_id, location_id PK) booking_window_days,
                          cutoff_minutes, slot_minutes, buffer_minutes,
                          require_confirmation, cancel_cutoff_minutes,
                          cancellation_policy_text, reminder_offset_minutes,
                          quiet_hours_start/end
booking.menu_categories   (id, tenant_id, name, sort_order)
booking.menus             (= today's booking.services, renamed or extended)
                          id, tenant_id, location_id?, category_id, name,
                          duration_minutes, price_yen, is_active, sort_order
booking.menu_options      (id, tenant_id, menu_id?, name, extra_minutes,
                          extra_price_yen, is_active)
booking.menu_staff        (tenant_id, menu_id, employee_id) -- who can perform
booking.customers         (id, tenant_id, name_encrypted, name_hash,
                          phone_encrypted, phone_hash, email_encrypted?,
                          line_account_id -> core.line_accounts, note,
                          no_show_count, consent_at, consent_version,
                          created_at) unique(tenant_id, phone_hash)
booking.bookings          (existing) + customer_id, employee_id (replaces
                          staff_id), source ('liff'|'staff'|'phone'|'hotpepper_block'),
                          total_price_yen, confirmed_at, cancelled_at,
                          cancelled_by, public_token (non-LINE customers);
                          EXCLUDE USING gist (tenant_id WITH =, employee_id WITH =,
                          tstzrange(starts_at, ends_at) WITH &&)
                          WHERE (status in ('pending','confirmed'))
booking.booking_items     (booking_id, tenant_id, menu_id | option_id,
                          price_yen, minutes) -- snapshot of what was booked
booking.blocked_slots     (existing) employee_id instead of staff_id; reason
                          incl. 'external' (Hot Pepper manual block)
booking.business_hours    (existing) + is_closed / special dates table later
core.notifications        (existing outbox) module='booking',
                          idempotency_key = booking_id:kind
```

Key decisions:
- **Double booking is prevented by the database** (gist exclusion constraint,
  `btree_gist`), not by a pre-check as in the prototype. "Any stylist"
  bookings pick a concrete stylist inside the RPC under the same constraint.
- **Stylist = `workforce.employees` row.** `booking.staff` (0010) is dropped or
  turned into a view; a salon must never maintain two staff lists.
- **Customer PII** follows the existing pattern: encrypted + blind-index hash
  (`PII_ENCRYPTION_KEY` / `PII_HASH_PEPPER`), decrypted only server-side.
  The LINE user id lives only in `core.line_accounts` (hashed).
- **Customer is not an ORUWA user** at MVP: LIFF ID token is verified
  server-side (tenant from `aud` = channel id, as `liff-entry` does) and the
  RPC acts for that LINE identity; no Supabase Auth account, no password. The
  existing `client` role / `booking.booking.read` stays for a later "customer
  portal" if ever needed.
- **Client RLS** ("own bookings only") is enforced by the RPC layer, never by
  trusting a client-supplied customer id.

### Messaging approval rule

Sending LINE messages to a salon's customers is "messages to real people" and,
for anything multi-recipient, "LINE broadcast / mass messaging" — both
Founder-gated (`CLAUDE.md` highest-risk constraints). Therefore:
1. Building the outbox dispatcher and templates is development work; turning
   dispatch **on** for any real tenant needs explicit Founder approval.
2. Only **transactional, one-to-one** messages in MVP (booking confirmation,
   cancel acknowledgement, one reminder). No broadcast, no marketing, no
   re-visit nudges without a separate decision.
3. Prefer the Reply API (free, not counted) for anything answering a customer
   action; push only for the reminder and salon-initiated changes.
4. Per-tenant monthly push cap + quiet hours; dev/test tenants send only to
   allow-listed test LINE ids.

## 7. Risks

### 7.1 Double booking with Hot Pepper Beauty
Most target salons already take bookings via Hot Pepper / SALON BOARD. We
found **no public SALON BOARD API**; third-party "一元管理" products exist but
the mechanism is **unverified** (scraping or private agreements would be a
legal / ToS risk). MVP mitigation: the salon blocks the slot in SALON BOARD
when a LINE booking arrives and creates an `external` block in ORUWA for Hot
Pepper bookings (quick "block" action); the database constraint guarantees no
double booking *inside* ORUWA. Positioning: ORUWA for repeat customers, Hot
Pepper for new ones. Revisit if a pilot salon needs real sync.

### 7.2 LINE messaging cost and limits
Push messages count against the salon's OA quota: Communication plan = 200
free messages / month, no overage; Light ¥5,000 = 5,000; Standard ¥15,000 =
30,000 + pay-as-you-go ([lycbiz plan](https://www.lycbiz.com/jp/service/line-official-account/plan/)).
A salon with ~300 bookings / month sending 1 reminder each already exceeds the
free plan. Mitigations: reply API for confirmations; one reminder by default;
e-mail fallback; show the salon its monthly push count; the OA cost is borne
by the client (as in Cafe pricing notes). The 2026-10-01 tier change must be
re-checked before pricing.

### 7.3 PII / APPI
Customer name, phone, LINE id, visit history, and later karte notes / photos
are personal information under APPI (個人情報保護法; regulator:
[PPC](https://www.ppc.go.jp/)). Needs: purpose statement and consent at first
booking, salon = data controller / ORUWA = processor terms, retention and
deletion (links to the deferred permanent-delete purge), no PII in logs or
notification payloads (outbox already stores ids only). Health-adjacent notes
(allergies, scalp conditions) may be sensitive — out of MVP. Legal review is
**not done** and is a Founder input.

### 7.4 Other
- **No validated demand** — no salon interview or pilot is recorded
  (`oruwa-portfolio-and-module-strategy.md` §2.3). Biggest risk.
- **Generalising too early** — keep Booking generic but build only what Salon
  v1 needs (`platform-packages-model.md` §3).
- **Per-tenant LINE channel setup** is manual today (LIFF id, channel secret);
  onboarding cost per salon.
- **Scale** — a public LIFF booking page adds anonymous traffic to Vercel /
  Supabase (DEBT-097 / DEBT-124 already flag per-request costs); slot queries
  must be one RPC per day view, cached briefly.
- **Abuse** — public booking needs rate limiting and duplicate-submit window
  (prototype idea) and no-show blocking.

## 8. Phases (rough sizes; Lead + engineer agents; after prod pack)

| Phase | Content | Size |
|---|---|---|
| S0 Validation | 3–5 salon interviews (Founder network), confirm Hot Pepper usage, price point, LINE OA plan in use; Founder Product Review selects Salon | Founder, 1–2 weeks calendar |
| S1 Booking engine | migrations (menus, options, menu_staff, customers, settings, exclusion constraint, employee link), availability + create/cancel/confirm RPCs, pgTAP incl. concurrency + cross-tenant tests, DB/security review | L (≈5–7 days) |
| S2 Salon back office | menu editor, booking ledger day/week by stylist, phone/walk-in booking, customer card, settings; stylist view in `/staff`; JA/EN; UX review | L (≈6–8 days) |
| S3 LINE customer flow | customer LIFF entry (verified ID token, no staff session), LIFF booking UI, my bookings, consent | M–L (≈4–6 days) |
| S4 Messaging | platform outbox dispatcher (shared with Workforce), templates, quiet hours, caps, reply-API confirmations; **dispatch enabled only after Founder approval** | M (≈3–4 days) |
| S5 Package + pilot | `salon` package, starter menus/vocabulary, provisioning path, demo tenant (rename Mirawi Demo Salon seed out of `cafe`, DEBT-107), pilot runbook | M (≈3 days) |
| Later | seats/equipment, 指名料, payments, Hot Pepper coexistence, tickets, points, karte photos | per item |

Total MVP ≈ 4–6 weeks of Lead-orchestrated work, not counting S0.

## 9. salon01 decommission (Founder deletes the project himself)

Context: DEBT-125 — the Supabase project `line-app-prod-salon01` is treated by
the repo guard as the production ref; Founder plans to delete it after the
ORUWA release. Deletion is irreversible and production-gated; this plan
**only lists** what to keep. Nobody but the Founder touches the project.

Export / keep before deletion (list only):
1. **Schema dump** (schema only, no data) — the live DB has objects not in
   `tantik/line-app/supabase/migrations/001_saas_foundation.sql`
   (`salon_business_hours`, `sales_leads`, `staff.work_days`,
   `services.icon_url`, `available_slots_v2`, any later RPCs / policies).
2. **Data decision**: check whether any real customer data exists (bookings
   with real names / phones / LINE ids, real sales leads). Demo data: no export
   needed. Real PII: do not copy it anywhere; real sales leads: export only
   the leads the Founder wants to keep, into the company CRM, then delete.
3. **Storage inventory**: bucket list (`salon-assets`), object count; keep
   only demo images the Founder wants for marketing.
4. **Edge Functions + cron**: list (`process-reminders`, any pg_cron jobs);
   source already in the GitHub repo.
5. **Auth settings**: providers, redirect URLs, SMTP; list of admin users
   (to know who loses access).
6. **Secrets / keys**: confirm no other system (Vercel project of
   `line-app`, LINE webhook URL, website forms) still points at salon01; plan
   key revocation and the LINE webhook / Vercel env clean-up.
7. **Screenshots** of the LIFF booking flow and admin (for design reference
   of a working salon flow) — optional.
8. **Repo-side follow-up after deletion**: update the guard hook
   (`scripts/ai-hooks/guard-supabase-cloud.mjs`) and
   `docs/operations/deployment-checklist.md` to the new production ref; close
   DEBT-125. Consider archiving `tantik/line-app` on GitHub (do not delete —
   it is the rule-05 reference for Booking).

## 10. Open questions for the Founder

1. Is Salon really the third package, and do you have 3–5 salons to
   interview (hair / nail / eyelash / relaxation)?
2. Target segment: 1–3 chair independent salons, or 5–15 stylist salons?
   (Changes seats/equipment priority.)
3. Do target salons use Hot Pepper? Is "manual block" acceptable for v1?
4. Price point and whether Salon includes Workforce (shifts / attendance) or
   sells it as an add-on.
5. Approve customer-facing transactional LINE messages (confirmation, one
   reminder) for pilot tenants, and on whose LINE OA plan?
6. Payments: which provider (Stripe JP / Square / PAY.JP / KOMOJU) and when —
   needed for prepayment and cancellation fees.
7. Legal: APPI privacy notice / processor terms for salon customers — who
   drafts them?
8. salon01: does it hold any real customer or lead data that must be kept?

## 11. Not verified in this plan

- Live contents of the salon01 database / storage / functions (no Cloud access).
- Hot Pepper listing prices, points cost, any SALON BOARD integration API.
- minimo salon-side fees; KaKuMei (not found under that name); current RESERVA,
  Airリザーブ, Repitte, Vagaro, Timely, Phorest, Mindbody prices (3rd-party or stale).
- LINE OA extra-message prices after the 2026-10-01 revision.
- APPI obligations specific to salon karte data (needs legal review).
