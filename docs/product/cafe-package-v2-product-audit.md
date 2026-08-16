# Cafe Package v2.0 Product Audit

Date: 2026-07-30
Status: **Complete — decision document for Final Improvements**

## 1. Executive decision

Cafe Package v2.0 is no longer a UI demo. After PR #141 it is an
authenticated, DB-backed, reusable Cafe product candidate with:

- tenant- and location-isolated Workforce and Inventory data;
- Manager scheduling, publishing, staff management, attendance correction,
  recipe management, and stock catalog controls;
- Staff schedule, attendance, work report, correction, recipe, and stock-count
  workflows;
- JA/EN interface localization;
- Japanese-original to English recipe-content translation with manual review,
  stale detection, and a server-only optional DeepL provider;
- append-only Inventory count history and server-computed shortage status.

The product should **not** expand into POS, payroll, accounting, procurement,
or full food-cost management before the first sales cycle. Those categories
are mature suites with much larger scope.

The approved product direction is:

1. add one compact **Today / 要確認** operational overview;
2. make Daily Stock Check a complete, auditable opening/closing workflow rather
   than only a set of independent latest values;
3. finish the sales-ready onboarding package and prove a prepared tenant can be
   launched in no more than two hours;
4. run a final mobile/accessibility/reliability acceptance pass;
5. declare Cafe Package v2.0 Product Freeze.

Everything else in this report is either post-freeze roadmap or a separate
platform initiative.

## 2. Audit basis and boundaries

This audit uses:

- the merged implementation in PR #141;
- the authenticated Preview acceptance report;
- the current Preview route and service code;
- the Inventory and content-translation implementation report;
- existing product, sales, security, onboarding, and deployment documents;
- current official competitor product pages checked on 2026-07-30.

This is a product and architecture audit. It does not approve Production,
apply Cloud migrations, enable tenant modules, configure secrets, publish
pricing, or deploy any environment.

The current accepted Preview routes remain:

- `/mame-to-cha` — Staff;
- `/mame-to-cha/recipes` — Recipes;
- `/mame-to-cha/manager` — Manager.

There must not be a separate discoverable Staff destination.

## 3. Current product coverage

| Area | Current capability | Audit result |
|---|---|---|
| Identity and tenancy | Authenticated tenant context, location context, RBAC, PostgreSQL RLS | Strong foundation |
| Manager scheduling | Weekly schedule, staff availability/preferences, assignments, auto-distribution, publish state | Commercially useful |
| Staff scheduling | Published self-scoped schedule and preference submission | Commercially useful |
| Attendance | Clock-in/out, daily report, transport/message data, correction requests and Manager decisions | Useful MVP; payroll/compliance export is not complete |
| Staff administration | Manager-only staff directory and safe server-side PII handling | Strong boundary |
| Recipes and manuals | Published recipe list/detail, categories/content types, structured ingredients/steps/notes | Strong operational differentiator |
| Interface localization | Reachable DB-backed Preview UI works in Japanese and English | Strong for foreign-staff use |
| Content translation | Current translation → legacy `*_en` → Japanese original; machine/manual/reviewed/stale states | Distinctive capability |
| Inventory | Manager catalog/par level, Staff actual count, shortage, append-only history, responsible staff | Valuable first capability |
| Manager attention | Pending correction alerts and local shortage indication exist in separate sections | Fragmented; no single daily command view |
| Daily completion | Latest stock value exists per item | Gap: no explicit count session, opening/closing completion, or overdue state |
| Reporting | Operational data exists | Gap: no concise daily/weekly management summary or export suitable for payroll/accounting |
| LINE/LIFF | Architecture exists in project direction | Not part of accepted Cafe v2.0 product flow |
| Onboarding | Deterministic local and Preview onboarding work exists | Not yet proven as a repeatable ≤2-hour sales operation |
| Billing | Not implemented | Correctly deferred to ORUWA Platform Foundation |

## 4. Competitive benchmark

This is not a claim that every listed product is a direct substitute for
ORUWA. Each is used as a benchmark for a product category.

### Japan

**Airシフト** is the nearest workforce benchmark. Its official product
material emphasizes availability collection, schedule creation and sharing,
staff communication, time clocking, estimated labor cost, reminders, and
links to the wider Air ecosystem. It also emphasizes simplicity for users who
are uncomfortable with digital tools. This confirms that low-training mobile
workflows and a clear exception queue matter more than adding many settings.

Source:
[Airシフト official product page](https://airregi.jp/shift/),
[Airシフト time-card features](https://airregi.jp/shift/function/timecard/).

**Smaregi** is a Japanese POS/inventory ecosystem benchmark rather than a
direct workforce competitor. Its official inventory material covers stock
history, stocktaking, receiving/shipping, inter-store movement, and low-stock
alerts. ORUWA's Daily Stock Check is intentionally smaller; its advantage must
be faster adoption and a workflow fitted to a small cafe rather than breadth.

Source:
[Smaregi retail/inventory functions](https://smaregi.jp/price/retail.php),
[Smaregi low-stock alerts](https://smaregi.jp/product/alert.php).

### United States

**7shifts** demonstrates the value of a restaurant-specific team operating
system: scheduling, availability, clocking, communication, and recurring or
one-time tasks with instructions and completion evidence. Its task product
shows a particularly relevant gap for ORUWA: managers need to see what is done,
who did it, and what remains outstanding.

Source:
[7shifts task management](https://www.7shifts.com/task-management/),
[7shifts time clocking](https://www.7shifts.com/time-clocking-software-7punches/).

**Toast** and **Restaurant365** benchmark the mature suite end of the market.
Their official materials connect inventory counts to invoices, suppliers,
recipes, sales/POS, actual-versus-theoretical usage, food cost, forecasting,
accounting, and payroll. These are strategically relevant but are not sensible
pre-sales scope for ORUWA.

Source:
[Toast inventory management](https://pos.toasttab.com/products/inventory-management),
[Restaurant365 inventory](https://www.restaurant365.com/inventory/),
[Restaurant365 platform overview](https://www.restaurant365.com/blog/how-does-r365-work/).

### Europe

**Planday** confirms the expected workforce baseline: mobile schedules,
availability, leave, shift swaps, clocking, and team communication. ORUWA
already covers the core schedule/attendance path but lacks polished shift
swap/open-shift and communication workflows.

Source:
[Planday employee app](https://www.planday.com/how-it-works/app/for-employees).

**Apicbase** is a multi-site food-operations benchmark. Its official pages
connect recipes, inventory, procurement, supplier orders, forecasting, waste,
food cost, traceability, and integrations. This validates ORUWA's reusable
Recipe and Inventory architecture, but also shows that full back-of-house
inventory is a separate multi-phase product, not one more Cafe v2.0 screen.

Source:
[Apicbase inventory management](https://get.apicbase.com/restaurant-inventory-management-software/),
[Apicbase platform](https://get.apicbase.com/).

### Ukraine

**Poster POS**, a Ukraine-origin restaurant platform, is a useful small-
restaurant benchmark. Its official inventory product includes counts,
supplies, deductions, transfers, manufacturing, shortages/surpluses, costs,
and reports. It reinforces that ORUWA should preserve an extension path from
simple checks to movements and purchasing, while not building that entire
scope before validating sales.

Source:
[Poster inventory management](https://joinposter.com/en/tour/inventory),
[Poster inventory help](https://help.joinposter.com/en/collections/2995003-inventory-and-stock-reports).

## 5. ORUWA positioning

ORUWA should not currently sell itself as an all-in-one restaurant ERP or POS.
The credible first position is:

> A bilingual daily operations system for small Japanese cafes: schedules,
> attendance, staff requests, recipes/manuals, and daily stock checks in one
> simple mobile-friendly workspace.

The strongest differentiators are:

- Japanese-first operation with practical English support for foreign staff;
- translation of business-authored recipe content, not only interface labels;
- a focused Manager/Staff split;
- reusable tenant/location security suitable for a real SaaS;
- a lighter operational workflow than POS/accounting suites;
- future LINE entry and notifications without requiring a separate employee
  app as the long-term direction.

The current weakness is that the capabilities look like adjacent modules
rather than one daily operating loop. The Final Improvements should solve
that presentation and workflow gap.

## 6. Customer pain coverage

| Customer pain | Current coverage | Remaining gap |
|---|---|---|
| Shift collection and schedule creation take too long | Preferences, schedule grid, auto-distribution, publishing | Reminders, swaps/open shifts, labor-cost view |
| Staff do not know today's work or changes | Published self-scoped schedule | Unified Today view and notifications |
| Clock/report corrections are lost in chat | Structured attendance, reports, correction queue | Summary/export and stronger reminder path |
| Recipes differ by staff member or language | Structured recipes plus reviewed JA→EN translation | Version acknowledgement/training proof later |
| Required supplies run out | Par level, actual count, shortage | Completed daily count session and purchase/restock workflow |
| Manager checks many places to find problems | Individual alerts and module badges | One exception-first Manager overview |
| New software takes too long to configure | Reusable modules and onboarding tooling | Sales-ready template/import/runbook with measured ≤2-hour rehearsal |

## 7. Prioritized feature matrix

Estimates are implementation ranges for one experienced developer/AI-assisted
workflow after the current architecture is understood. They are planning
ranges, not promises; Cloud approval and manual acceptance add elapsed time.

| Priority | Capability | Customer value | Sales impact | Complexity | Estimate | Decision |
|---|---|---:|---:|---:|---:|---|
| P0 | Manager Today / 要確認 overview | Very high | High | Medium | 3–5 days | Build before freeze |
| P0 | Opening/closing Inventory count sessions with completion state | Very high | High | Medium | 4–7 days | Build before freeze |
| P0 | Sales-ready tenant bootstrap, template data/import, verification report | Very high | Very high | Medium | 4–8 days | Build before freeze |
| P0 | Final authenticated mobile/accessibility/error-state acceptance | High | High | Low–medium | 2–4 days | Required gate |
| P1 | Staff Today view combining shift, clock state, required checks, and recipes | High | High | Medium | 3–5 days | Include only if P0 remains compact |
| P1 | CSV attendance/payroll export | High | Medium | Medium | 3–6 days | Validate with first customers |
| P1 | LINE reminders/deep links | High in Japan | High | Medium–high | 1–2 weeks | Post-freeze/first pilot |
| P1 | Shift swaps/open shifts | Medium–high | Medium | Medium–high | 1–2 weeks | Post-freeze |
| P1 | Waste/write-off tracking | High for food cost | Medium | Medium | 1–2 weeks | Inventory v2 |
| P2 | Suppliers, receiving, purchase orders | High for mature operations | Medium | High | 3–6 weeks | Later module phase |
| P2 | Recipe costing and theoretical stock deduction | High for margin control | Medium–high | Very high | 4–8 weeks | Requires validated POS/purchasing strategy |
| P2 | POS integration | Potentially high | High | Very high | 1–3+ months/provider | Partner-led roadmap |
| P2 | Payroll/compliance suite | High but regulated | Medium | Very high | Multi-month | Integrate, do not build first |
| P2 | Forecasting/automatic purchasing | Valuable with sufficient data | Medium | Very high | After transaction history | Later |
| P2 | Platform billing/customer portal | Platform-critical | Enables sales | High | Separate phase | ORUWA Platform Foundation |

## 8. Approved Final Improvements scope

### Slice A — Daily Operations Overview

Create one Manager overview that answers, without scrolling through every
module:

- Are there pending attendance/correction requests?
- Is the current schedule unpublished or understaffed?
- Is today's opening/closing stock check incomplete?
- Which items are below required stock?
- Are recipe translations missing or stale for published staff content?

The overview should be exception-first, location-scoped, JA/EN, accessible,
and link to the existing working surfaces. It must not duplicate business
logic in the browser.

Optionally add a small Staff Today card containing only today's shift, current
clock state, required stock-check state, and direct actions. This remains part
of Slice A only if it can reuse existing data without widening the schema.

### Slice B — Inventory Check Sessions

Add a minimal auditable session around existing append-only counts:

- check type: opening or closing;
- business date and location;
- started/completed state;
- expected active items captured for the session;
- per-item count completion;
- completed by and completed at;
- Manager visibility of incomplete/late sessions;
- existing shortage calculation remains server-owned;
- old item history remains intact.

Do not add suppliers, purchase orders, cost, expiry, batches, barcode, or
automatic ordering in this slice.

### Slice C — Sales-ready onboarding

Turn existing onboarding foundations into a measured product operation:

- versioned Cafe Package tenant template;
- deterministic module enablement;
- location, roles, users, shift types, recipe, and Inventory import/template;
- redacted verification report;
- dry-run and fail-closed behavior;
- no secrets in input/output;
- a timed local rehearsal and later a separately approved Cloud rehearsal;
- a clear list of steps that still require a human.

The KPI is **≤2 hours for a prepared new customer**, not zero-click
provisioning.

### Slice D — Final acceptance and Product Freeze

- authenticated Manager and Staff mobile browser smoke;
- JA/EN UI and recipe-content smoke;
- keyboard/focus and non-color status checks;
- slow/error/empty-state checks;
- tenant/location/role negative checks;
- build, unit tests, Server Action boundary tests, local reset, and pgTAP;
- final Preview acceptance after separately approved Cloud changes;
- Product Freeze declaration.

## 9. Architecture and security decision

Current architecture is suitable for the next slices:

- Inventory is a top-level module, not tenant-specific code;
- counts are append-only and shortage is server-computed;
- content translation is cross-module and source-hash aware;
- Preview actions re-resolve tenant/location/permission server-side;
- `service_role` and provider credentials are not client-side;
- reviewed translations require explicit overwrite confirmation.

Requirements for Final Improvements:

- all new business tables include `tenant_id`;
- physical-store records include and validate `location_id`;
- composite tenant/entity integrity follows existing conventions;
- Manager overview reads app-facing facades, not internal schemas;
- session completion is transactional and server-authoritative;
- no client-provided completion totals or shortage values are trusted;
- staff cannot complete or edit another location's session;
- no production, Cloud, billing, secrets, or permission-policy changes without
  a separate human approval gate;
- only new forward-only migrations may be added.

## 10. Product and commercial risks

### High

- **No real paying-customer validation.** Architecture quality does not prove
  willingness to pay. The first sales conversations must validate the Today,
  schedule, recipe-language, and stock-check value propositions.
- **Scope expansion.** Competing with POS/accounting suites before sales would
  delay launch without proving demand.
- **Production readiness remains separate.** Preview acceptance cannot be
  treated as approval for real customer PII or payments.

### Medium

- **Manual data burden.** Inventory remains useful only if staff complete the
  check. Sessions, clear responsibility, and exception visibility are more
  important than analytics at this stage.
- **Translation provider dependency.** Manual fallback is mandatory; automatic
  translation must remain optional and cost-controlled.
- **Weak external notification path.** Web-only workflows may reduce daily
  adoption in Japan; validate LINE reminders during pilots before building a
  broad integration.
- **Pricing remains unvalidated.** Existing internal price hypotheses must not
  be published as market facts.

## 11. Success metrics for the first pilots

Measure outcomes, not feature usage alone:

- Manager prepares and publishes a weekly schedule in under 30 minutes.
- At least 90% of staff availability submissions arrive before the deadline.
- At least 95% of required opening/closing checks are completed on time.
- Manager identifies shortages and pending corrections in under one minute.
- English-speaking staff can execute a selected recipe without separate chat
  translation.
- A prepared new tenant is configured and verified in no more than two hours.
- No cross-tenant/location/role data exposure occurs.
- Weekly support burden stays low enough for founder-led operation.

## 12. Official sequence after this audit

1. Complete Manager Today / 要確認.
2. Complete manager-approved automated shift exchange.
3. Complete Opening/Closing Inventory Sessions.
4. Make sales-ready onboarding repeatable and measure the ≤2-hour KPI.
5. Run final automated and authenticated browser acceptance.
6. Declare Cafe Package v2.0 Product Freeze.
7. Sync the public `/demo/cafe` from the frozen DB-backed Product Preview.
8. Start **ORUWA Platform Foundation**:
   - Organization;
   - Customer Portal at `account.oruwa.jp`;
   - Platform Billing;
   - Product Entitlements;
   - separately bounded Merchant Payments architecture.
9. Start Cleaning Package on the shared platform.

Platform Billing is money paid by an ORUWA customer to ORUWA. Merchant
Payments is money collected by an ORUWA customer from its own customers. They
must remain separate products, data flows, provider accounts, ledgers, and
permission boundaries.

## 13. Explicitly not approved by this audit

- Production deployment or Production database creation;
- Cloud migration/application or tenant mutation;
- billing provider selection or configuration;
- Merchant Payments implementation;
- secrets changes;
- legal/privacy claims;
- public pricing publication;
- POS, payroll, accounting, supplier, or automatic-ordering implementation;
- broad AI features without a validated operational problem.

## 14. Final Improvements closeout

Status: implemented and locally accepted on
`feature/cafe-v2-final-improvements`.

Completed:

- Manager Today / 要確認 aggregates existing operational exceptions;
- manager-approved shift exchange covers request, colleague acceptance,
  approval/rejection, atomic schedule reassignment, overlap recheck, and
  visible staff result history;
- opening/closing Inventory sessions snapshot active items, require every
  count, append stock history atomically, and surface shortages;
- Cafe Package onboarding has a versioned, non-secret template contract and a
  measured operator checklist with a target of no more than two hours for a
  prepared customer;
- JA/EN schedule weekday chrome follows the selected language;
- Staff and Manager mobile layouts were manually checked at 390 x 844 with no
  page-level horizontal overflow.

Local acceptance evidence:

- production build and Server Action route-boundary verification pass;
- monorepo typecheck/lint/unit suite passes;
- a clean local database reset applies all 45 migrations;
- all 17 pgTAP files pass, including tenant/location/role isolation, immutable
  exchange fields, conflict recheck, empty-session rejection, and atomic stock
  append;
- authenticated browser smoke completed the opening count and the full
  Staff → colleague → Manager → updated schedule → Staff result workflow.

No Cloud database, production deployment, billing, provider secret, or real
customer data was changed. Cloud Preview acceptance remains a separately
approved release operation after merge.

## 15. Product Freeze decision

After this branch passes PR CI and merges to `dev`, Cafe Package v2.0 enters
**Product Freeze**:

- permitted before sales: bug fixes, security fixes, accessibility,
  localization corrections, and release/onboarding polish;
- not permitted without a new product decision: open-ended features, POS,
  suppliers/purchase orders, payroll, accounting, forecasting, broad AI, or
  tenant-specific forks.

The next product delivery step is **Demo Sync** from the frozen DB-backed
Preview. After Demo Sync and a separately approved live onboarding rehearsal,
work proceeds to ORUWA Platform Foundation and then Cleaning Package, following
the sequence in section 12.
