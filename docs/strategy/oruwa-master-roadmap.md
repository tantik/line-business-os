# ORUWA Business OS — Founder-Approved Master Roadmap

> Governed by ORUWA Core Laws & Product DNA
> (`docs/foundation/core-laws-and-product-dna.md`) and by
> `docs/foundation/platform-foundation-roadmap.md` for Platform Foundation
> engineering sequencing. This document does not re-order or restate either
> — it is the top-level phase sequence they both slot into. Where a conflict
> exists, the Core Laws prevail, then the Platform Foundation roadmap for
> engineering-sequencing questions specifically.

## Document metadata

| Field | Value |
|---|---|
| Status | Founder-approved, current working roadmap |
| Owner | Founder |
| Recorded | 2026-08-25, verbatim Founder decision, reconciled against repo state same session |
| Supersedes | `docs/ai/current-task.md` §2.4's "Cafe Commercial Launch Readiness" step ordering (Platform Foundation was sequenced before Cafe Product Growth/v2.2 there — this document places Cafe v2.2 before Platform Foundation Reconciliation; see "Reconciliation notes" below) |
| Does not supersede | `docs/foundation/platform-foundation-roadmap.md` (engineering critical path for Platform Foundation itself, unchanged), `docs/strategy/go-to-market-roadmap.md` (commercial detail behind Phases 9-12 below, unchanged) |

## Why this document exists

Single source of truth for "what phase is the project in, and what comes
next" across the full arc from finishing Cafe v2.1 to a second vertical
product. Phase-numbered so a fresh session (or the Founder) can locate the
current position in one read. Does not authorize starting any phase beyond
the current one by itself — each phase transition is its own Founder gate.

## 0. Core architecture model (context for every phase below)

```
ONE ORUWA SaaS
 -> shared Platform Foundation
 -> reusable domain capabilities/modules
 -> vertical product/packages
 -> tenants
 -> locations
```

- No per-client repository or application fork. A new client is a new
  **tenant** inside the one shared platform, never a code copy.
- **Cafe is a vertical product/package, not a single domain module.** It is
  composed of multiple reusable domain capabilities (Workforce, Inventory,
  Purchases, Recipes/Knowledge, Notifications, and future capabilities).
  This matches `platform-foundation-roadmap.md` §4.3's existing "Vertical
  Products" tier exactly (Cafe = Workforce + Booking + Inventory schemas) —
  no change needed there, this is a restatement, not a correction.
- Target scale: 100+ tenants per successful vertical, multiple verticals
  (Cafe, Salon, future) on the same shared Core.
- The current shared PostgreSQL/Supabase multi-tenant architecture is not
  an immutable "one physical database forever" rule. Preserve the option to
  scale the data layer later without breaking the tenant model or product
  architecture. (No existing Core Law asserts single-database immutability
  — this is forward-looking preservation of optionality, not a change to
  current architecture.)

## Phase sequence

| # | Phase | Status as of 2026-08-25 |
|---|---|---|
| 1 | Cafe v2.1 Completion | **CURRENT** |
| 2 | Cafe v2.2 Product Research | Not started |
| 3 | Cafe v2.2 Implementation | Not started |
| 4 | Full Cafe v2.2 Acceptance | Not started |
| 5 | SaaS Hardening | Not started |
| 6 | Platform Foundation Reconciliation | Not started (forensic triage exists, see below) |
| 7 | Tenant Provisioning | Not started |
| 8 | Clean Tenant Acceptance | Not started |
| 9 | Commercial Infrastructure (Demo, Customer Portal, Founder Admin, Billing) | Not started |
| 10 | Go-to-Market Infrastructure | Not started |
| 11 | AI Sales System | Not started |
| 12 | Real Commercial Validation | Not started |
| 13 | Product #2 Research | Not started |
| 14 | Product #2 Development | Not started |

None of Phases 2-14 is authorized to start by this document alone. Each
begins only on a distinct Founder go-ahead.

### Phase 1 — Cafe v2.1 Completion (current)

1. Finish current Staff implementation.
2. Founder manually reviews Staff UX on Preview.
3. Fix Founder findings.
4. Final Integrated QA of Cafe as a whole system (not a new-feature pass) —
   AI CTO executes the technical QA; the Founder is not the QA engineer.
   Minimum scope: every Manager module (Staff management, Shift Types,
   Weekly Schedule, Shift Preferences, Attendance, Corrections, Shift
   Requests, Shift Exchange, Inventory, Purchases, Recipes/Manuals,
   Settings, Needs Attention) and every Staff module (Schedule, Work
   Status, attendance, correction requests, future shift requests,
   exchange, Inventory, Purchases, Recipes/Manuals), plus real
   Manager<->Staff cross-module chains (shift-type change propagates
   without F5; assignment appears to Staff; clock-in/out reflects to
   Manager; correction approval updates authoritative attendance and Staff
   sees the result; Inventory shortage -> Purchases -> Bought ->
   Inventory-quantity-change -> requirement recomputed). Also: loading/
   error UX, double-submit protection, mobile, desktop, JA/EN, permissions,
   Manager/Staff boundaries, tenant isolation regression, RLS regression,
   tests/typecheck/lint/build, obvious performance issues, no raw internal
   IDs/codes leaking, no obviously broken workflows.
5. Founder Acceptance — after technical PASS, the Founder's only remaining
   question is "is this actually pleasant to use," not re-verifying
   mechanics Claude already verified.

**Reconciliation note (2026-08-25):** this session's actual practice does
not yet match "AI CTO executes technical QA, Founder is not the QA
engineer" — this session had no browser-automation tool available, so the
entire Staff Shift Schedule v2 QA loop (see
`docs/ai/CAFE_STAFF_SHIFT_SCHEDULE_V2_HANDOFF_2026-08-25.md`) was
Founder-screenshot-driven. Phase 1 step 4 (Final Integrated QA) as
specified above assumes Claude can independently drive a real browser
against Preview. Whether that's true depends on what tooling a given
session actually has — this is an environment/session fact to check at the
start of Phase 1 step 4, not something this roadmap document can settle.
If no such tool is available, Phase 1 step 4 degrades to the same
screenshot-driven loop already used successfully this session, which is
slower and Founder-effort-heavier than the roadmap's stated intent.

### Phase 2 — Cafe v2.2 Product Research

Not started by feature-adding. A dedicated Product/Competitor Research
phase precedes v2.2 scope selection. **ChatGPT + Founder lead this
research; Claude does not self-select the product roadmap.** Research
categories: cafe/restaurant operations, workforce management, scheduling,
attendance, inventory, purchasing, tasks/checklists, SOP/manuals, staff
communication, restaurant management, AI operations, LINE-connected
business tools, adjacent SMB SaaS. Selection criteria: (A) fast to build on
existing ORUWA, (B) materially raises perceived value, (C) solves a real
frequent business problem, (D) raises retention, (E) helps sales, (F)
reusable for future verticals, (G) no unjustified architectural
complexity. Output: market map -> opportunity list -> Top 10 -> Top 5
recommendation -> Founder decision -> only then final Cafe v2.2 scope. Old
research is input, not automatically current — refresh at Phase 2 start.

### Phase 3 — Cafe v2.2 Implementation

Scoped only after Phase 2's Founder decision. Known candidates needing
re-evaluation at that point (not pre-authorized now): real Shift
Preferences persistence/backend, automatic scheduling, LINE notifications,
Email notifications, related workflows. Approved conceptual scheduling
priority model (already Founder-decided, holds regardless of Phase 2's
outcome): **Manual Manager Assignment > Manager-approved/locked preference
> Employee preference > Algorithmic fallback** — automation must never
silently overwrite a manual manager assignment.

### Phase 4 — Full Cafe v2.2 Acceptance

Central question: "can this be given to a real cafe and charged for?"
Real operational workflows, Manager + Staff, security, reliability,
mobile, JA, performance, data integrity. After PASS: Cafe is functionally
complete for its current commercial scope — stop feature creep. New Cafe
features after this point are critical fixes, validated customer needs, or
a separate future release only.

### Phase 5 — SaaS Hardening

Not new product features — a readiness audit for real customers and
scale. AI CTO executes the technical audit; Founder + ChatGPT (acting as
CTO/Product/Security reviewer) do the strategic review. Minimum scope:
**Security** (RLS, tenant isolation, location isolation, auth,
permissions, owner/manager/staff boundaries, service_role boundary,
secrets, exposed APIs/views, PII, auditability). **Architecture**
(hardcoded tenant/location, Cafe-specific hacks, duplicate
implementations, dead preview/demo code, incorrect shared abstractions,
temporary workarounds, coupling, reusable-module boundaries, migrations,
DB/API boundaries, technical debt). **Reliability** (race conditions,
double submit, retries, failures, partial writes, empty states, loading,
network errors, concurrency, idempotency where required). **Performance**
(Manager, Staff, Schedule, Inventory, Purchases, Recipes, major server/
data-loading paths). No refactoring for theoretical purity — every
proposed change needs evidence, risk, impact, priority, recommended
action, classified P0/P1/P2/Later-acceptable-debt. Founder approval still
required for any RED change this audit surfaces.

### Phase 6 — Platform Foundation Reconciliation

**Do not assume Platform Foundation doesn't exist. Do not assume the
existing Platform Foundation is correct. Do not rewrite it from scratch
before reconciling.** A forensic reconciliation (main vs dev vs current
Cloud/dev schema vs current authoritative architecture docs) is required
before any new Platform Foundation implementation — determine what
actually exists, what was only documented, what reached `main`, what
reached Cloud, what was reverted, what's obsolete, what's safe to reuse,
what should be retired, what needs redesign. Read-only: no `main`
modification, no migrations during this reconciliation.

**A prior triage already exists and is the starting point, not a fresh
investigation**: `docs/ai/PLATFORM_FOUNDATION_MAIN_DEV_RECONCILIATION_TRIAGE_2026-08-23.md`
found `main` carries the full Platform Foundation critical path (unmerged
into `dev`) since 2026-08-16, while `dev` independently accumulated 131+
commits of Cafe product work — neither branch's history knows about the
other's changes since the split. No current drift was found between
`dev`'s migration files and Supabase Cloud dev's ledger at that time (must
be re-verified, not assumed, once this phase actually starts — real time
will have passed). The engineering critical path itself remains as
documented in `docs/foundation/platform-foundation-roadmap.md` §7/§10
(Entitlements engine -> Module Registry -> Shared Navigation/Settings ->
Notifications -> Event Bus) — this phase is about reconciling *what of
that already exists on which branch*, not re-deriving the critical path.

### Phase 7 — Tenant Provisioning

After Hardening + Platform Foundation reconciliation/stabilization. Target:
new Cafe customer provisionable in ~1-5 minutes, no repository copy, no
per-client fork, no manual code editing. Flow: Create Tenant -> initial
Location -> Owner -> enable Cafe package -> enable purchased modules ->
apply defaults/configuration -> initialize required tenant data -> ready.
Must be repeatable, idempotent where appropriate, auditable, safe, tested,
configuration-driven. Architecture should target 100+ Cafe tenants and
future 100+ tenants per vertical. This is the same test already specified
in detail at `docs/strategy/go-to-market-roadmap.md` §7 ("New-Tenant /
One-Hour Provisioning Test") — that section's exact procedure and pass
condition (no application code changed to make the new tenant work) apply
here without restatement.

### Phase 8 — Clean Tenant Acceptance

Provision a genuinely new QA Cafe tenant using the same mechanism intended
for real customers — no special developer fixes after creation. Test from
zero: tenant -> owner -> location -> staff -> shifts -> schedule ->
attendance -> preferences -> inventory -> purchases -> recipes ->
notifications -> normal operation. Goal: prove a new customer can be
created and operate without developer intervention.

### Phase 9 — Commercial Infrastructure

**A. Sales Demo** — built on the same platform/provisioning model, not a
separate fake-architecture demo app.
**B. Customer Portal** — customer-facing account/company management
(company/account, plan, subscription, billing, locations, users, enabled
modules, settings, onboarding/status). Exact domain/IA designed separately.
`preview.oruwa.jp` is development/QA only, not assumed to be the Customer
Portal, unless separately changed.
**C. Founder / ORUWA Admin** — separate internal control surface (tenants,
status, plans, subscriptions, locations, users, modules, provisioning,
support state, audit, operational health, platform analytics). Not the
same security surface as the Customer Portal.
**D. Billing** — platform capability, not Cafe-specific code. Provider/
pricing/workflow require separate, current research and a Founder
decision (matches `go-to-market-roadmap.md` §5's existing `NEEDS
VALIDATION` note — not re-decided here).

### Phase 10 — Go-to-Market Infrastructure

Final `oruwa.jp` sales website, positioning, pricing/offer, sales
materials, demo flow, lead management, CRM/process, onboarding process,
support process. `oruwa.jp` (public commercial website), Customer Portal,
ORUWA Founder Admin, and the Business OS application itself are four
distinct surfaces — do not conflate them.

### Phase 11 — AI Sales System

Lead discovery -> qualification -> company research -> personalized
outreach prep -> response classification -> follow-up -> demo booking ->
proposal support -> human-controlled close -> customer onboarding ->
tenant provisioning. AI may automate research, qualification, drafting,
CRM updates, follow-up recommendations, operational assistance. **Must
not** autonomously send mass LINE broadcasts, mass email campaigns, make
binding commercial promises, execute billing actions, or sign contracts.
Sensitive external actions require human approval — same AI-proposes/
human-approves pattern already normative elsewhere in this platform
(`go-to-market-roadmap.md` §12, `PROJECT_BRIEF.md` §10, `AGENTS.md` §8).

### Phase 12 — Real Commercial Validation

Lead -> qualification -> demo -> pilot/offer -> payment/contract as
applicable -> provisioning -> onboarding -> real usage -> support ->
feedback. Measure real customer behavior. Do not declare product-market
fit from internal QA alone.

### Phase 13 — Product #2 Research

After Cafe is genuinely ready — fresh research, not automatic reuse of
prior Product #2 research. Broad vertical scan -> Top 10 -> Top 5 -> Top 3
-> Winner -> Founder decision. May run in parallel with Cafe commercial
validation (Phase 12) once Cafe/platform are stable enough.

### Phase 14 — Product #2 Development

Starts only after the shared platform, provisioning, and core architecture
are stable enough. Must reuse ORUWA platform capabilities — no independent
backend/platform unless explicitly justified. New vertical should
primarily require new vertical-specific capabilities, not rebuilding
tenants/auth/roles/billing/notifications/audit/admin/provisioning/shared
modules. Long-term target: 100+ customers per successful vertical.

## Branch / release governance (unchanged, restated for completeness)

`feature/fix branch -> review -> tests -> PR -> CI -> autonomous DEV merge
via scripts/ai-dev-merge.sh`. DEV merge does not require Founder
confirmation when existing gates pass. `main` remains Founder-controlled.
Production remains Founder-controlled. This document does not decide
dev->main merge timing or release strategy — that must be explicitly
reconciled before first commercial release. No direct push to `main`. No
production deploy without an explicit Founder-controlled release decision.
Matches `scripts/ai-dev-merge.sh`'s existing structural guardrail
(base=dev only, no override path to `main`) — no change needed.

## AI development governance (unchanged, restated for completeness)

Continue the existing AI Development Team model (AI CTO/Lead -> Engineer
-> Tests -> Independent Reviewer -> CTO decision -> PR -> CI -> DEV
merge). AI CTO autonomously handles approved LOW/STANDARD engineering work
inside an approved scope without per-step Founder confirmation. RED remains
Founder-controlled: `main`, production, production DB migrations,
destructive data operations, destructive Git/history rewrite, force push,
secrets, service_role boundary, billing/payment execution, mass external
communication, critical auth/RLS/tenant-isolation changes where governance
requires approval. Matches `docs/ai/oaes-project-profile.md`'s existing
authority-boundaries section — no change needed there.

## Progress visibility

After a significant milestone/mission/checkpoint closes, give a short
status block instead of a long report:

```
PROJECT STATUS
Current Phase: <number and name>
Current Mission: <what's being worked on>
Status: IN PROGRESS / PASS / PARTIAL / BLOCKED / WAITING FOR FOUNDER
Completed: <what finished>
Next: <specific next step>
Founder action: NONE / <what's specifically needed>
ChatGPT review: NOT NEEDED / RECOMMENDED / REQUIRED
Progress: <e.g. 4/7 work packages complete, only if objectively countable>
```

Do not invent artificial completion percentages that can't be objectively
determined.

## Claude vs ChatGPT vs Founder routing

**Claude does independently**: anything where the repository/code/runtime
is the source of truth — inspection, code analysis, implementation,
refactoring inside an approved scope, debugging, tests, typecheck, lint,
build, browser/Preview QA (when tooling is available — see Phase 1's
reconciliation note above for this session's actual gap), performance
investigation, application-architecture analysis, DB/RLS analysis,
regression testing, Engineer/Independent-Reviewer orchestration, PR, CI,
autonomous `dev` merge under existing policy, LOW/STANDARD implementation
decisions. Do not hand these to ChatGPT just because a technical decision
is involved.

**Recommend to Founder to hand to ChatGPT** when the next question needs
external research or a strategic choice, not repository implementation —
especially: world/competitor/Japanese-market product research, new
opportunity discovery, Cafe v2.2 / Product #2 feature-and-module selection,
pricing/packaging/monetization/positioning/go-to-market/sales strategy, AI
Sales architecture at the business level, comparing external SaaS
products, checking current external API/service/pricing facts, strategic
architecture trade-offs among genuinely different directions, independent
CTO review of a large technical report, or Hardening-report review before
a major architecture change. State it explicitly:

```
CHATGPT REVIEW RECOMMENDED
Topic: <what>
Why: <why ChatGPT fits better than continuing in-repo>
What to provide: <what Claude should hand over>
```

Claude prepares ChatGPT's input from the repository — the Founder should
not have to assemble technical context by hand when Claude can produce it.

**Founder decides**: product acceptance, UX preference among several
reasonable options, business priorities, commercial decisions, final
product-scope choices, RED actions, `main`/release/production,
destructive/security-sensitive decisions, billing/payment decisions, mass
external communication, and other existing Founder-controlled boundaries.
Do not use the Founder as a manual CI, QA engineer, Git operator, technical
confirmation button, or go-between for Engineer/Reviewer or Claude/
repository.

**Handoff for ChatGPT** — when recommending a handoff, prepare a
copy-pasteable block: (1) context, (2) current verified state, (3) what's
already been done, (4) the exact question needing analysis, (5) relevant
constraints, (6) known risks/gaps, (7) Claude's own technical opinion if
it has one, (8) what decision/result is needed back. After the Founder/
ChatGPT decision, Claude resumes as the implementation executor for any
resulting repository/code work.

**Routing principle**: repository truth/implementation -> Claude. External
truth/market/competitors/strategic research -> ChatGPT. Business/product
preference and RED authority -> Founder. Mixed question -> Claude gathers
verified technical facts first, prepares the ChatGPT handoff, ChatGPT
analyzes options, Founder decides if needed, Claude implements the
approved decision. Do not create unnecessary handoffs — if Claude can
safely resolve an ordinary technical question inside approved architecture,
resolve it directly.
