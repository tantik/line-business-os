# Phase 1J-2 Cafe Workforce Public Demo Closeout Report

Status: **Phase complete. Sales/demo-ready public proof of concept, not a production Workforce module.**
Branch reviewed: `docs/phase-1j-2-cafe-workforce-closeout-report` (docs-only; no code changed by this report).

Read with: [`phase-1j-2-cafe-workforce-demo-to-production-plan.md`](./phase-1j-2-cafe-workforce-demo-to-production-plan.md)
(the detailed technical record of what was built and the production migration
checklist), [`product/mvp-roadmap.md`](./product/mvp-roadmap.md),
[`product/demo-vs-client-template.md`](./product/demo-vs-client-template.md),
[`architecture/overview.md`](./architecture/overview.md).

---

## 1. Executive Summary

Phase 1J-2 delivered a public, unauthenticated, sales-facing demo of a cafe
workforce mini-OS ("LINEで使えるカフェ運営ミニOS"), built entirely inside
`apps/web` under `/demo/cafe*`. Across four merged PRs it produced:

- A **public cafe workforce demo** — three interactive demo screens plus a
  guide page, reachable with no login.
- A **staff mobile demo** (`/demo/cafe`) — clock in/out, break tracking, a
  swipeable weekly shift table, transportation cost, daily messages, a
  next-month shift-preference calendar, and a work-report/correction-request
  flow.
- A **recipe sharing demo** (`/demo/cafe/recipes`) — a scannable recipe grid
  with JA/EN detail content, aimed at onboarding and foreign-staff use cases.
- A **manager dashboard demo** (`/demo/cafe/manager`) — a weekly shift table,
  要確認 alerts, shift editing, a monthly report CSV mock, and staff/recipe
  management mocks.
- A **manager correction detail fix** (PR #75) — the "!" alert on a flagged
  cell now opens a report showing the actual staff correction-request text,
  instead of a generic placeholder.
- **Help popovers** (PR #76) — inline contextual help across staff, recipe,
  and manager screens, so a first-time viewer does not need a live walkthrough
  to understand the UI.
- A **premium demo guide page** (`/demo/cafe/guide`, PR #77) — a LINE-first
  marketing/explainer page with real screenshots, direct links into the three
  demo screens, and an explicit demo-vs-production disclaimer.
- **No backend, no Supabase writes, no LINE integration** exist anywhere in
  this surface. Everything is client-side React state and hardcoded mock
  data; nothing persists across a page reload, and staff/manager views do not
  share state.

**Key conclusion: this phase completed a sales/demo-ready public proof of
concept, not a production Workforce module.** It is suitable for showing to
prospective cafe clients today, but every write action in it is a mock, and
none of the multi-tenant, RLS, audit, or persistence guarantees the rest of
the platform requires (see [`architecture/overview.md`](./architecture/overview.md))
apply to it yet.

## 2. Merged PRs

| PR | Title | Merge commit | Head commit |
| --- | --- | --- | --- |
| #73 | feat(web): add cafe workforce public demo | `943342b` | `60df232` |
| #75 | fix(web): show manager correction request details | `7604b24` | `a56d33e` |
| #76 | feat(web): add cafe demo help popovers | `654a922` | `9ac4173` |
| #77 | docs(web): redesign cafe demo guide | `eb52687` | `c991480` |

Notes:

- PR #73's head commit (`60df232`, `feat(web): add cafe workforce public
  demo`) is visible in local history directly beneath its merge commit
  `943342b`. It introduced all four demo routes, the shared `lib/demo/cafe`
  and `components/demo/cafe` code, and the original
  `phase-1j-2-cafe-workforce-demo-to-production-plan.md`.
- PR #75 (`a56d33e`) touched `ManagerReportModal.tsx`, `data.ts`, `types.ts`,
  and the manager page — 86 lines changed.
- PR #76 (`9ac4173`) added `DemoHelpButton.tsx` and `helpContent.ts`, and wired
  help affordances into the staff, recipe, and manager pages — 370 lines
  changed.
- PR #77 (`c991480`) added `apps/web/src/app/demo/cafe/guide/page.tsx`
  (1,193 lines) plus 21 real screenshot assets under
  `apps/web/public/demo/cafe/guide/screenshots/`.

## 3. Current Demo Surface

| Route | Target user | Purpose |
| --- | --- | --- |
| `/demo/cafe` | Cafe staff | Mobile-first clock in/out and weekly shift app |
| `/demo/cafe/recipes` | Cafe staff (incl. new/foreign hires) | Recipe reference app |
| `/demo/cafe/manager` | Cafe manager/owner | PC-first shift, staffing, and reporting dashboard |
| `/demo/cafe/guide` | Prospective client (sales-facing) | Marketing/explainer page tying the three demos together |

**`/demo/cafe` (staff mobile demo).**
Purpose: show what a shift worker actually opens from a LINE Rich Menu each
day. Demonstrates: two-button clock state (出勤/退勤, 休憩開始/休憩終了), a
swipeable/paged weekly shift table with a legend, transportation cost and a
daily message field, and a next-month shift-preference calendar. Demo-only:
all mutations are local React state; no session, no Supabase call, no LINE
user. Matters for sales because it is the artifact a cafe owner can hand a
staff member's phone to and have them "just use it" without explanation.

**`/demo/cafe/recipes` (recipe sharing demo).**
Purpose: show a lightweight, LINE-native alternative to printed recipe binders
or ad hoc messaging. Demonstrates: a scannable ~20-item recipe grid, JA/EN
toggle, ingredient/step detail, and an optional supplemental memo block.
Demo-only: content is a hardcoded array, not a CMS; there is no per-tenant
recipe table. Matters for sales because recipe/procedure sharing is an easy,
low-risk feature to sell before touching payroll-adjacent shift data.

**`/demo/cafe/manager` (manager dashboard demo).**
Purpose: show the owner/manager side of the same operation — the value case
that actually justifies a paid module. Demonstrates: 要確認 alerts, the weekly
shift table with auto-schedule and an advisory 概算人件費合計 line, a
per-day report/correction-detail view, a monthly CSV report mock, and
staff/recipe management mocks. Demo-only: every action (shift edit,
auto-schedule, CSV export, staff/recipe add-edit-delete) is local-state only
and resets on reload. Matters for sales because it is the screen that answers
"what does the manager get for their money," distinct from the staff-facing
novelty.

**`/demo/cafe/guide` (premium guide page).**
Purpose: a single link a salesperson can send before or during a client
conversation, explaining the product story and linking into the three demos.
Demonstrates: LINE-first positioning copy, real screenshots of each demo
screen, and a dedicated "本番導入時にできること" (what production adds)
section. Demo-only: it is a static marketing page with no forms wired to any
backend. Matters for sales because it turns three disconnected routes into
one coherent pitch artifact with an explicit, honest scope disclaimer instead
of relying on a live walkthrough.

## 4. What Exists Now

### Staff Mobile Demo

- Clock in/out and break start/end via a two-button `ClockPanel` (not four
  separate buttons).
- Weekly shift view, paged by 前の週/今日/次の週 and by hand-swipe
  (`WeekCarousel`), rendered in a compact mode that fits a 375px viewport with
  no horizontal scroll.
- All-staff vs. own-shift is implicit in the single-staff demo identity
  (`CURRENT_STAFF_ID`); the manager view is the one that sees all staff.
- Transportation cost and a daily message field, shown alongside the shift
  table.
- Next-month shift-preference request via a full calendar-grid modal
  (`ShiftPreferenceModal`), cycling through the same shift types the table
  uses; submission only flips a local "提出済み" flag.
- Work report / correction request flow: tapping an eligible own past cell
  opens the 勤務記録 (`WorkReportModal`); its own action button opens
  `CorrectionRequestModal`. There is no separate standalone correction button.
- JA/EN UI toggle (`LangToggle`, `i18n.staff.ts`) for the staff screen; the
  manager screen is intentionally Japanese-first only.
- Help popovers (`DemoHelpButton`, PR #76) on the clock panel and other staff
  UI elements.

### Recipe Sharing Demo

- A recipe list/card grid (~20 sample items, ~3.5 cards per row at 375px, an
  intentional "this scrolls" affordance), popular (人気) items sorted first.
- Recipe detail view: title, badges, category, description, ingredient pills,
  numbered steps.
- An optional titled memo/supplemental-notes block (e.g. 抹茶液の作り方 for
  抹茶ラテ) for extra prep detail beyond the basic steps.
- JA/EN UI and content — all 20 recipes carry parallel manually authored
  English fields (no auto-translation, no external API call).
- Help popovers on the recipe detail view (PR #76).
- Value for onboarding/new-staff/foreign-staff: a text/instruction-first
  reference (no photo-heavy checklist UI) that a new or non-Japanese-fluent
  hire can use standalone via the LINE Rich Menu, without asking a coworker.

### Manager Dashboard Demo

- Weekly shift table (PC-first, non-compact, with hand-scroll on tablet
  widths and a subtle zebra-row tint), ordered above the management sections
  as the most-used block.
- 要確認 alerts summarizing flagged cells and staffing shortages.
- Correction detail modal (`ManagerReportModal`, fixed in PR #75): clicking a
  past-day "!" cell opens a read-only report showing the actual staff message
  (原文) and, where seeded, 自動翻訳（デモ） — never a generic placeholder.
- Shift edit demo (`ShiftEditModal`) for future/today cells, plus
  auto-schedule (`AutoScheduleModal`) for unscheduled future days.
- Monthly report CSV demo (`MonthlyReportModal`): a per-staff monthly summary
  table with a `CSVダウンロード（デモ）` button that only flips a local
  confirmation flag — it does not generate a real file or call a backend.
- Staff management demo (`StaffManagementModal`) and recipe management demo
  (`RecipeManagementModal`): list → add/edit form → save, entirely in local
  component state, seeded from the same mock data the public screens use but
  not wired back to it.
- Settings panel (`SettingsPanel`) for shift-type definitions, read by the
  same `SHIFT_TYPES` source the legend uses.
- Help popovers (PR #76) on manager alerts, settings, and other panels.

### Premium Guide Page

- LINE-first positioning: framed around staff opening the product from a LINE
  Rich Menu rather than installing a new app.
- Direct links into `/demo/cafe`, `/demo/cafe/recipes`, and
  `/demo/cafe/manager`.
- Real screenshots (21 PNGs under
  `apps/web/public/demo/cafe/guide/screenshots/`) of actual demo states —
  clock in/out, shift views, correction requests, manager alerts, recipe
  management, settings, etc. — not mockups.
- Product value explanation sections for staff, recipe sharing, and manager
  use cases.
- An explicit demo-scope disclaimer: "このデモはブラウザ上で動作する確認用デモです"
  and "LINE連携、実データ保存、権限管理、認証、店舗別データ管理は本番導入時に設計します。"
- A dedicated production-implementation-direction section
  (`ProductionSection`, "本番導入時にできること") describing what production
  adds without over-promising it exists today.
- A final CTA tying the page back to a real sales conversation.

## 5. Specialist Review

### CTO / Software Architect Review

The demo architecture is clean and correctly isolated: everything lives under
`apps/web/src/app/demo/cafe/`, `components/demo/cafe/`, and
`lib/demo/cafe/`, entirely outside the `(protected)` route group, with no
Supabase client, no `service_role`, and no shared code imported by the
authenticated app. This matches the platform's core principle from
[`architecture/overview.md`](./architecture/overview.md) that every module
lives inside the shared Core rather than as an isolated project — the demo
is additive and does not fork the app.

The main architectural risk is time, not design: the longer this demo stays
static and well-received in sales conversations, the stronger the temptation
to keep bolting UI onto it (as PRs #75–#77 already did) instead of starting
the real persisted Workforce slice. Each additional demo-only feature (CSV
mock, management modals) raises the surface area that must eventually be
reconciled against real `tenant_id`/`location_id`-scoped tables per
[`phase-1j-2-cafe-workforce-demo-to-production-plan.md`](./phase-1j-2-cafe-workforce-demo-to-production-plan.md)
§6, and none of it should be mistaken for progress on the actual Workforce
module. The next production architecture direction should follow the
existing plan: extract the domain logic already drafted in `lib/demo/cafe/data.ts`
(`generateAssignments`, `autoScheduleFutureAssignments`,
`computeManagerAlerts`) against the tenant-scoped schema already scaffolded in
`supabase/migrations/0009_workforce.sql`, rather than starting from zero or
lifting the mock code as-is.

### Product Manager Review

Problem-solution fit looks strong on paper: shift confusion, missed clock-ins,
and ad hoc recipe/procedure sharing are common, real pain points for small
cafes, and the demo speaks directly to all three through a channel (LINE)
Japanese staff already use daily. The demo is clear enough to self-explain
now that help popovers (PR #76) and the guide page (PR #77) exist — a
salesperson no longer has to narrate every screen live.

MVP packaging is currently three separate demo screens plus a guide page, not
a single package with a name and price. Before showing this to a first real
cafe owner/manager, the priority is validating: (1) whether the manager
dashboard's shift/staffing/cost view is the actual reason they'd pay, versus
the staff app being a "nice to have"; (2) whether the correction-request flow
matches how they actually handle late/mistake reporting today; and (3)
whether recipe sharing is valued independently or only as an add-on. Features
that are sales-critical now: the staff clock/shift app and the manager
alerts/shift view (these carry the core value story). Features that can wait
for later validation: the monthly CSV report, staff/recipe management UI
polish, and JA/EN toggle depth — useful, but secondary to proving the core
loop with one real client.

### UI/UX Review

Strengths: a coherent warm/cafe-appropriate visual theme fully decoupled from
the dashboard's dark palette, consistent compact shift tables that avoid
horizontal overflow on mobile, and now (post PR #76) contextual help that
reduces onboarding friction without cluttering the UI. The manager
correction-detail fix (PR #75) closed a real credibility gap — a demo alert
that resolved to a generic placeholder message would have undercut trust in
front of a client.

Weaknesses: the mobile staff app is strong (two-button clock state,
swipeable week view), but the manager dashboard is dense — alerts, shift
table, cost summary, and two management sections stacked vertically means a
first-time viewer scrolls a lot on a laptop screen before reaching
settings. The guide page reaches a genuinely premium bar (real screenshots,
clear sectioning, an honest disclaimer) — that is the standout piece of this
phase's UI work. Improvements to defer rather than do now: tightening the
manager dashboard's information density, adding a lightweight onboarding tour
overlay, and any further visual redesign — none of these are needed to run a
first client conversation.

### Backend / Supabase / Database Review

The current state is confirmed static demo-only: no `supabase/migrations/*`
changes, no `apps/api` calls, and no Supabase client instantiated anywhere
under `demo/cafe` (verified in
[`phase-1j-2-cafe-workforce-demo-to-production-plan.md`](./phase-1j-2-cafe-workforce-demo-to-production-plan.md)
§5). `supabase/migrations/0009_workforce.sql` already scaffolds
tenant/location-scoped tables for shifts, employees, attendance, and
requests — production work should extend that schema rather than invent a
parallel one.

Required production tables (from the existing plan, §6): persisted shift
assignments, attendance/clock records, shift/correction requests, a
tenant-scoped recipe table, and a tenant-scoped staff/employee table. Every
one of them needs `tenant_id uuid not null`, with `location_id` where data is
branch-scoped, per the platform's data-ownership rule
([`architecture/overview.md`](./architecture/overview.md)). RLS must enforce
tenant isolation in the database itself, not be re-derived from the demo's
client-side `CURRENT_STAFF_ID` constant. Every mutation (shift edits,
auto-schedule runs, correction requests, settings changes) needs an audit-log
entry (actor, tenant, module, entity, action, before/after) once real. Reads
and writes must go through the existing app-facing `apps/api` service-role
boundary — never a generic decrypt-by-id call for PII-bearing fields like
employee names — matching the platform's existing request-flow pattern.

Risk before production: none of the domain logic currently in
`lib/demo/cafe/data.ts` has been tenant-scoped or RLS-tested; it should be
treated as a first draft of business rules, not production-ready code to
lift wholesale.

### Security Review

Confirmed: no `service_role` usage anywhere in the frontend demo code, and no
real personal data exists in the demo — all staff names, messages, and
recipes are fictional, generated deterministically from
`lib/demo/cafe/data.ts`. This is a materially lower-risk surface than any
authenticated part of the product.

Future risks to plan for once this becomes real: staff work-report text and
correction-request messages are exactly the kind of free-text field that can
end up containing real personal complaints or health/leave information —
these need the platform's existing PII-handling and encryption-at-rest
posture, not casual storage. LINE user IDs, once linked, are themselves
sensitive identifiers and must be scoped per-tenant with no cross-tenant
lookup path. Tenant isolation must be enforced by RLS, not client-side
`CURRENT_STAFF_ID`-style constants, before any real staff ever uses this.
Secrets handling: no new secrets exist yet, but a production translation
integration or LINE webhook will introduce API keys that must live
server-side only, never in `apps/web`. Audit and permissions: every real
mutation (clock state, correction approval, shift edits) must be
permission-checked server-side (per `packages/core/src/permissions.ts`) and
audit-logged — currently RBAC-like behavior (e.g. "staff can't see other
staff's reports") is enforced only by which cells the UI makes clickable,
which is not a security boundary.

### AI Solutions / Automation Review

Plausible, additive AI support later: recipe translation assistance
(replacing the current static hand-authored JA/EN pairs with a real
translation pipeline, human-reviewed before publish); shift anomaly detection
(flagging unusual patterns beyond the current fixed shortage rule); a manager
summary/digest of the week's alerts and corrections; a staff-facing FAQ/chat
assistant answering "how do I request a shift change" style questions; and an
onboarding assistant that walks a new hire through the recipe/procedure
content.

What should explicitly not be automated yet: payroll decisions (the demo's
概算人件費合計 is already deliberately kept advisory-only, and that
constraint should carry into production); mass LINE messages (no broadcast
capability should be added without a separate, deliberate product/legal
decision); direct production data changes by an AI agent; and approving
correction requests without human review — the correction-request flow's
entire point is that a manager looks at and judges the actual message, not
that it gets auto-resolved.

### DevOps / QA Review

Current verification style (documented in
[`phase-1j-2-cafe-workforce-demo-to-production-plan.md`](./phase-1j-2-cafe-workforce-demo-to-production-plan.md)
§8/§10.1) has been manual-but-rigorous: `tsc --noEmit`, `eslint` scoped to the
demo paths, `next build` confirming static prerendering, and Playwright-driven
manual passes checking for horizontal overflow, DOM state, and specific demo
copy at multiple viewport widths. This is solid for a UI-only surface with no
backend, but it is not automated regression coverage — it depends on a human
re-running the same manual script each time.

Needs before this scales further: a lightweight automated smoke check (even a
simple Playwright script committed to the repo, not just documented as having
been run manually) so a future unrelated change to shared `apps/web` code
(theme tokens, layout) can't silently break `/demo/cafe/*` without a human
happening to notice. Screenshot regression testing is reasonable for later,
once the guide page's screenshots are more likely to go stale from real UI
changes. E2E candidates for the future production Workforce module: real
sign-in → tenant context → shift CRUD → RLS-cross-tenant-denial, following the
same "own-tenant, cross-tenant, anon, no-JWT" verification pattern already
required elsewhere in this platform's RLS practice. Production deployment
safety for this surface specifically is low-risk (no migrations, no API,
static prerendered pages) — the deployment risk only appears once this demo
is replaced by real persisted endpoints.

### Sales / Go-To-Market Review for Japan

What can be shown to a first cafe today: all three demo screens and the guide
page, as a coherent "here's what this could look like for your shop" pitch.
The guide page's honest disclaimer language is a real asset here — it lets a
salesperson show something polished without needing to verbally caveat every
screen.

What should be explained carefully, even though the guide page already states
it: that no data persists, that this is not yet connected to LINE, and that
a real pilot would start from a clean/small feature set, not everything shown
in the demo at once. Pricing/package assumptions: nothing in this repo
implies a price point yet, and none should be committed to before a first
real conversation — the roadmap's own "First Client Readiness Checklist"
([`product/mvp-roadmap.md`](./product/mvp-roadmap.md)) has several gates
(RLS verification, audit logs, deployment checklist) that must close before
any pilot goes live, not just before pricing.

Best first-pilot approach: pick one willing cafe, scope the pilot to the
smallest real slice (see §9, Phase 1L), and treat the existing demo purely as
the conversation-starter, not as the delivered product. Risk in overpromising:
LINE integration, AI features, and "production readiness" are all easy to
imply are close because the demo looks finished — sales conversations should
explicitly separate "what you're looking at" from "what we'd build for you,"
using the guide page's own disclaimer as the anchor for that conversation.

## 6. What Is Good Enough Now

Do not over-invest further before client validation:

- The four public demo routes (`/demo/cafe`, `/demo/cafe/recipes`,
  `/demo/cafe/manager`, `/demo/cafe/guide`) as they stand.
- The guide page's positioning, screenshots, and disclaimer copy.
- The help popover coverage added in PR #76.
- The static recipe demo (~20 items, JA/EN).
- The static manager dashboard, including the correction-detail fix from
  PR #75.
- The current visual quality/theme across all four routes.

## 7. What Can Be Improved Later

- **UI polish**: manager dashboard information density, a lightweight
  onboarding tour overlay, further mobile refinements.
- **Product flow**: cross-screen state sharing (staff and manager views are
  currently single-tab, non-live), a leaner MVP feature package.
- **Data model**: real tenant-scoped tables for shifts, attendance, staff,
  and recipes, replacing every hardcoded array in `lib/demo/cafe/data.ts`.
- **LINE integration**: Rich Menu, LIFF entry, LINE user linking — currently
  documented-only (§7 of the production plan), not implemented anywhere.
- **AI features**: recipe translation assistance, anomaly detection, manager
  summaries, staff FAQ/onboarding assistant (see §5 above for the boundary on
  what not to automate).
- **Analytics**: any usage/engagement tracking on the demo or the future
  production module.
- **Onboarding**: a guided first-run experience for a real tenant's first
  manager/staff member.
- **Sales material**: a short demo script, Japanese pitch notes, and a
  first-client interview checklist (see Phase 1J-3 below).

These are explicitly later-stage items, not immediate blockers to using the
current demo for validation.

## 8. What Must Be Improved Before Production MVP

- A real tenant model (not the demo's implicit single "Mirawi Cafe" identity).
- `tenant_id`/`location_id` on every Workforce table, per
  [`architecture/overview.md`](./architecture/overview.md)'s data-ownership
  rule and the scaffolding already in `supabase/migrations/0009_workforce.sql`.
- A real auth and role model distinguishing staff vs. manager server-side,
  not via a client-side `CURRENT_STAFF_ID` constant.
- Staff/member mapping into `core` schema memberships.
- LINE user mapping (LINE user ID ↔ tenant member), scoped per-tenant.
- RLS enforced at the database layer for shifts, attendance, requests,
  recipes, and staff records.
- Audit logs for every real mutation (shift edits, auto-schedule runs,
  correction requests, settings, staff/recipe changes).
- Persisted work reports (currently local React state only).
- Persisted shift requests (the next-month shift-preference flow currently
  just flips a local flag).
- Real recipe CRUD persistence (currently a hardcoded array plus a
  disconnected local-state-only management mock).
- A real manager approval workflow for corrections (currently read-only
  detail display with no approve/reject action at all).
- CSV export generated server-side from real attendance data (currently a
  confirmation-only mock button).
- Error handling for real network/auth/permission failure states (largely
  moot in a mock-only demo today).
- A data deletion/export policy for staff PII once real data exists.
- Backup/recovery coverage for Workforce tables, per the platform's existing
  backup/DR runbooks.
- A basic operational admin flow for a manager to manage their own tenant's
  staff/settings safely.

## 9. Recommended Next Phases

### Phase 1J-3 — Sales Validation Package

Goal: prepare to show this demo to a first real cafe.

- Create a short demo script (screen order, talking points per screen).
- Create Japanese pitch notes aligned with the guide page's existing copy.
- Create a first-client interview checklist (what to ask, what to observe).
- Define pilot scope (which features are in/out for a first real deployment).
- Define, in writing, what is demo vs. production for that specific
  conversation — reusing the guide page's disclaimer as the baseline.

### Phase 1K — Workforce Production MVP Architecture

Goal: design the real Workforce module architecture.

- Finalize tables, extending `supabase/migrations/0009_workforce.sql` rather
  than starting fresh.
- Design RLS policies for own-tenant, cross-tenant, anon, and no-JWT cases.
- Define the `apps/api` service boundary/view surface for Workforce reads and
  writes.
- Finalize the tenant/location model for a multi-location cafe chain.
- Define staff vs. manager roles through `packages/core/src/permissions.ts`.
- Define audit event shapes for Workforce mutations.
- Plan pgTAP tests for RLS and permission enforcement.
- Write the migration plan (order, rollback, seed data).

### Phase 1L — First Real Workforce MVP Slice

Goal: implement the smallest real persisted Workforce slice.

- Tenant location.
- Staff profile (real, persisted, tenant-scoped).
- Shift preferences (real submission and manager visibility).
- Work reports (real persistence, replacing local React state).
- Manager read view over real data.
- Explicitly no payroll calculation.
- Explicitly no full auto-shift generation yet — carry the demo's
  auto-schedule as a later addition, not part of this slice.

### Phase 1M — LINE Entry Integration

Goal: connect a LINE Official Account / LIFF entry safely.

- LIFF route for the staff app entry point.
- LINE user linking into `core` membership.
- Tenant/location routing from the LINE entry point.
- A Rich Menu plan following the existing "only two buttons" constraint
  (勤務アプリ / レシピ) documented in the production plan §7.
- Explicitly no mass/broadcast messaging capability.

## 10. Risk Register

| Risk | Severity | Why it matters | Mitigation |
| --- | --- | --- | --- |
| Demo mistaken for production | High | A prospect or internal stakeholder could assume data persists or LINE is already connected, leading to a broken first impression or a premature sales commitment. | Keep the guide page's disclaimer visible and repeat it verbally in every sales conversation; do not remove or soften it. |
| Overpromising LINE integration | High | No real LINE/LIFF/Rich Menu integration exists (§7 of the production plan); implying otherwise sets an unmet expectation with a paying client. | Scope Phase 1M explicitly as future work in every external-facing conversation; never demo it as "already working." |
| Tenant data leakage | High | Production Workforce tables will hold real staff PII across multiple tenants; a missing or misconfigured RLS policy would leak one cafe's data to another. | Enforce RLS at the database layer from the first real table (Phase 1K), verify own-tenant/cross-tenant/anon/no-JWT cases before any pilot. |
| `service_role` misuse | High | `service_role` bypasses RLS; any accidental frontend exposure would defeat tenant isolation entirely. | Keep `service_role` confined to `apps/api`, as already enforced for the rest of the platform; the current demo already has zero `service_role` usage — do not introduce it when wiring the real API. |
| Payroll/legal risk | Medium-High | The demo's 概算人件費合計 is explicitly advisory/non-payroll; if production ever computes real pay from this data without proper review, it becomes a labor-law/legal liability in Japan. | Keep the non-payroll disclaimer pattern in production; route any real payroll calculation through a deliberate, separately reviewed feature, not an extension of this cost summary. |
| Japanese personal data handling | Medium-High | Real staff names, work reports, and LINE IDs are personal data under Japanese privacy expectations; the demo currently has none, but production will. | Apply the platform's existing PII-handling/encryption posture and the roadmap's "Japanese legal/privacy review" gate before handling real customer PII at scale. |
| Scope creep before first client validation | Medium | Each additional demo-only feature (already: correction detail, help popovers, monthly CSV, management modals) raises the surface to eventually migrate and delays getting real feedback. | Follow §6/§9: treat the current demo as "good enough," move to Phase 1J-3 (validation) before further demo feature work. |
| UI polish consuming too much time | Medium | The demo has already been through two follow-up UI/UX passes (production plan §8.1, §10.2); a third round without new client feedback has diminishing sales value. | Cap further UI work until after first-client interviews (Phase 1J-3) surface concrete gaps. |
| No real user feedback yet | Medium | All product decisions so far (feature set, information density, correction flow) are internal judgment calls, not validated with an actual cafe owner/manager. | Prioritize Phase 1J-3's first-client interview checklist over any further build-out. |

## 11. Final Recommendation

- **Do not keep polishing the demo UI immediately.** It has already had two
  follow-up UI/UX passes and is good enough to show a client today (§6).
- **Use the current demo for validation, not as the product.** Show it to a
  first real cafe as a conversation-starter, with the guide page's
  disclaimer as the honest framing for what is real vs. illustrative.
- **Prepare a sales validation package next (Phase 1J-3)** — a demo script,
  Japanese pitch notes, and a first-client interview checklist — before
  writing more demo code.
- **Then design the production Workforce MVP architecture (Phase 1K)** and
  build the smallest real persisted slice (Phase 1L), extending the schema
  already scaffolded in `supabase/migrations/0009_workforce.sql` rather than
  lifting the demo's mock logic wholesale.
- **Keep the production backend secure from day one**: tenant isolation via
  RLS, no `service_role` in the frontend, audit logs on every real mutation,
  and human-in-the-loop review for corrections and any AI-assisted feature —
  none of this can be retrofitted safely after the fact.
