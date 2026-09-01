# ORUWA CTO Context

| Field | Value |
|---|---|
| Document role | Durable strategic memory for the ORUWA Founder and the CTO/AI partner — *why* ORUWA is built this way |
| Checkpoint | CTO Context #1 |
| Prepared | 2026-09-01 (Founder draft) |
| Reconciled & installed | 2026-09-01 — checked against `dev` `615925e`, current normative docs, and explicit Founder/CTO decisions |
| Status | **Canonical.** Update only on a durable strategic change (§15). |
| Companion | `docs/project/master-state.md` — the verified *what / where / next operationally* |

---

## 0. Purpose and authority

This document preserves the durable reasoning behind ORUWA Business OS:

- what the Founder intends to build;
- which strategic decisions are binding;
- why the product and architecture were chosen this way;
- what was rejected or deliberately deferred;
- how Founder, CTO/AI, implementation agents, reviewers, and QA work together;
- which actions always require human approval;
- how to forecast, commercialize, and expand ORUWA without losing platform direction;
- how a new CTO or AI session restores context.

This is **not**: a chat transcript; a changelog or PR history; a list of past
tasks; a replacement for architecture / security / product / runbook /
acceptance documents; proof that a capability is implemented; permission to
implement, deploy, migrate, publish, sell, or change commercial terms.

### Source-of-truth boundary

- `master-state.md` answers: **What exists now, what is verified, what is unfinished, what is next operationally?**
- `cto-context.md` answers: **Why are we building ORUWA this way, which decisions govern future work, and how should decisions be made?**
- Normative docs, ADRs, code, migrations, tests, runbooks, acceptance evidence remain the lower-level sources of truth.

**Recovery order:** `master-state.md` → `cto-context.md` → normative docs → code / migrations / tests.

If this document conflicts with verified current code, security policy, or an
explicit later Founder decision: **do not silently reconcile.** Record it,
identify the authoritative source, ask the Founder whether the strategic
context must be updated.

### Status vocabulary

- **FOUNDER DECISION** — binding until explicitly changed by the Founder.
- **CTO PRINCIPLE** — default decision rule; exceptions require written rationale.
- **CURRENT DIRECTION** — intended sequence, **not** implementation authorization.
- **WORKING HYPOTHESIS** — useful assumption that still needs evidence or a Founder decision.
- **DEFERRED** — consciously postponed; not forgotten, not rejected forever.
- **REJECTED FOR NOW** — should not reappear without a materially changed reason.

---

## 1. Founder intent

### FOUNDER DECISION — Build one business operating system, not a collection of client projects

ORUWA Business OS is a single multi-tenant SaaS platform for Japanese SMBs. It
connects everyday work otherwise fragmented across paper, spreadsheets, verbal
instructions, disconnected apps, and LINE conversations.

ORUWA helps a business move through one operational loop:

> **plan → execute → detect exception → resolve → review**

The long-term platform may include Core, Workforce, Booking, Operations,
Inventory, Purchases, Recipes/Knowledge, AI Support, CRM, Logistics, and other
reusable capabilities. These are **not** independent products with duplicated
foundations — they belong to one platform and are assembled into vertical
packages for specific business types.

### FOUNDER DECISION — Build First / Learn Along The Way

ORUWA is built through useful, testable product slices, not years of
speculative platform engineering. Each slice should: solve a real operational
problem; produce reusable platform capability where justified; be tested with
realistic roles and data boundaries; create learning for the next slice; avoid
locking the platform into one client's custom workflow.

Learning while building does **not** mean accepting unsafe shortcuts. Tenant
isolation, permissions, personal-data protection, auditability, recoverability,
and human approval are foundation requirements.

### Desired company outcome

A real, commercially sustainable SaaS business in Japan — not a technically
impressive demo. Product choices balance customer value and ease of adoption;
security and operational trust; speed to the first paying customers; low early
infrastructure and support cost; reuse across future verticals; and the
migration/rework cost of short-term decisions.

---

## 2. Current strategic direction

### CURRENT DIRECTION — Cafe is the first vertical package, not the whole ORUWA identity

ORUWA Cafe is the first proving ground because cafe operations expose many
reusable platform needs: staff roles, locations, schedules, attendance,
procedures, recurring tasks, inventory, purchasing, exceptions, handover,
manager review.

Cafe must validate both a **sellable outcome for a real Japanese cafe** and
**reusable platform foundations for later vertical packages**.

The master brand is **ORUWA**. **ORUWA Cafe** is a package built on ORUWA
Business OS. Public identity and architecture must not imply the platform is
permanently limited to cafes. *(Repo note: older docs still use the earlier
name "LINE Business OS"; that is legacy wording, not a competing decision —
`master-state.md` Appendix C tracks it.)*

### CTO PRINCIPLE — Finish connected operational loops before adding isolated feature breadth

New work connects existing modules into useful daily workflows. Prefer a
coherent owner/manager/staff loop over a larger menu of disconnected pages. For
Cafe, the differentiated value is not another POS — it is reliable execution
and management visibility around work POS systems do not coordinate well.

### CURRENT DIRECTION — Product truth before product theatre

Claims shown to customers must correspond to implemented and accepted
behaviour. A design, prototype, roadmap item, green CI run, merged PR,
successful deployment, or generated mockup is not by itself proof the
end-to-end product works. Label mockups as mockups. Do not invent customers,
testimonials, certifications, performance figures, integrations, prices, or AI
capabilities.

---

## 3. Binding Founder decisions

Not reopened in routine implementation work without new evidence or an explicit
Founder request.

### 3.1 One SaaS and shared foundation

**DECISION:** One multi-tenant ORUWA platform, reusable modules, vertical packages.
**WHY:** Rebuilding tenancy, identity, RLS, permissions, audit, billing,
localization, deployment, and common UX per vertical multiplies cost and risk.
**CONSEQUENCE:** Every client/vertical requirement is first classified as:
reusable platform capability · vertical configuration/package capability ·
genuinely client-specific extension · out of scope.
**REVISIT WHEN:** a future vertical has a fundamentally incompatible security,
data, compliance, deployment, or interaction model, or the Reuse/Gap Analysis
shows forcing it into ORUWA creates more coupling than reuse.

### 3.2 Tenant and location are first-class boundaries

**DECISION:** Every business object has an explicit ownership/access model.
Business tables require `tenant_id`; physical-site data also requires
`location_id` (or a documented equivalent scope).
**WHY:** Multi-tenant isolation cannot depend on UI filtering or developer discipline.
**CONSEQUENCE:** Schema, API, server actions, background jobs, exports,
analytics, caches, logs, and AI retrieval must preserve tenant/location scope.

### 3.3 PostgreSQL RLS is a security boundary

**DECISION:** Database-enforced isolation and least privilege. Do not expose
`service_role` or the privileged secret key to frontend code. Do not bypass RLS
to simplify implementation.
**WHY:** Application-only filtering is too fragile for a multi-tenant SaaS
handling staff and business data.
**CONSEQUENCE:** Direct-DML paths, views/functions, server code, tests, and
Cloud behaviour are checked — not only the intended UI path.

### 3.4 Modules must be composable

**DECISION:** Capabilities are enabled through a coherent
package/module/entitlement/permission model, not hard-coded per customer.
**WHY:** ORUWA sells different vertical packages and plans without forking.
**CONSEQUENCE:** A disabled module is unavailable through UI, API, server
actions, **and direct data paths**. Entitlement is not a cosmetic navigation
toggle. *(Implemented today: `core.has_module_access` ANDed with permission on
gated product schemas.)*

### 3.5 LINE is a channel, not the operational source of truth

**DECISION:** LINE Official Account, Messaging API, and LIFF may reduce friction
for notifications, quick actions, customer contact, or staff access. Canonical
operational records remain in ORUWA.
**WHY:** Critical workflow state must be structured, auditable, permissioned,
recoverable; chat history alone cannot provide that.
**CONSEQUENCE:** Do not force a LINE integration into a slice unless it
materially improves adoption or workflow. The web product must remain operable
and truthful without an unimplemented LINE dependency.

### 3.6 AI assists; accountable people decide

**DECISION:** AI may summarize, translate, classify, draft, retrieve knowledge,
highlight anomalies, and propose actions. It must not silently make high-impact
operational or commercial decisions.
**WHY:** Early ORUWA data is incomplete; hallucination, tenant leakage, poor
explainability, and inappropriate automation damage customer trust.
**CONSEQUENCE:** Recommendations show basis, uncertainty, and data freshness.
Manager approval is required before consequential actions. AI forecasting is
deferred until reliable historical data exists.

### 3.7 Production and external actions remain Founder-controlled

**DECISION:** Implementation readiness is not authorization to change production
or communicate externally.
**CONSEQUENCE:** The approval boundaries in §8 are mandatory.

### 3.8 Staff identity invariants

**DECISION (pointer — enforced in schema, migrations `0062`–`0064`):** one
Supabase Auth user maps to at most one `workforce.employees` row **per tenant**;
changing an employee's contact email must never mutate their Auth login email;
an invite to an email that already belongs to an Auth user sends no new email
(the person accepts via the in-app banner); no LINE Login in the staff-auth
provisioning scope.

---

## 4. Architecture reasoning

### 4.1 Minimum now, professional foundation, scalable path — CTO PRINCIPLE

For a major choice evaluate three levels: **Minimum** (fastest safe MVP,
low cost, low irreversible commitment), **Professional** (correct default for a
real SaaS — security, tests, observability, maintainability), **Scalable**
(what changes at 300+ customers or materially larger workloads).

Do not build the scalable version prematurely; do not choose an MVP shortcut
whose migration cost is predictably disproportionate. **Record the upgrade
trigger** when intentionally choosing Minimum. For fast-moving external
tech/APIs, check current official documentation before deciding.

### 4.2 Prefer explicit boundaries over hidden conventions

Boundaries visible in schema, types, policies, interfaces, and tests: tenant
and location scope; role and permission; module entitlement; app-facing vs
internal data access; authoritative vs derived data; manual vs confirmed
values; draft/approved/active/completed/cancelled/archived state; who changed
what and when.

### 4.3 App-facing and internal data surfaces

Where it improves security and change control, separate stable app-facing
API/view/function surfaces from internal core tables — especially where Supabase
Data API exposure, privileged operations, or future schema evolution could
widen access accidentally. *(Implemented today: the `api.*` facade —
`SECURITY DEFINER` RPCs / `security_invoker` views — is the app write/read path,
called under the caller's own JWT with RLS; `core.*` and the product schemas
are not PostgREST-exposed.)* This is a decision tool, not a command to wrap
every table in abstraction.

### 4.4 Auditability and operational evidence

For consequential actions ORUWA preserves enough evidence to answer: who
performed/approved; for which tenant and location; what changed; when; what
source/workflow initiated it; whether it can be corrected/reversed. Logs must
not leak secrets or unnecessary personal data. An application log is not
automatically a business audit record.

### 4.5 Migration discipline

Database/environment changes require: a bounded change proposal; impact and
tenant-isolation analysis; forward migration + realistic rollback/recovery
thinking; local tests including pgTAP where applicable; verification of direct
and bypass-prone paths; **separately authorized** Cloud application; post-change
acceptance in the actual target environment. A committed migration file does
not prove Cloud received it. A successful Cloud command does not prove
authenticated product behaviour.

### 4.6 Cost discipline

Prefer a small number of well-understood services and simple workflows. Add
queues, agent frameworks, complex event systems, additional databases, or heavy
orchestration only when a **measured** bottleneck, reliability requirement, or
cost model justifies them.

---

## 5. Product reasoning

### 5.1 The job ORUWA Cafe should do

Help owners and managers know that essential work is planned, performed,
recorded, escalated, and reviewed — without relying on memory or fragmented
messages. Staff receive clear, low-friction work guidance. Managers see
exceptions early and resolve them. Owners see meaningful operational patterns,
not a wall of raw events.

### 5.2 Cafe v2.2 — canonical work packages (FOUNDER / CTO DECISION 2026-09-01)

The direction is to connect Workforce, Inventory, Purchases, Recipes/Manuals,
and daily operations around the operational loop. This decision **supersedes**
the two earlier unratified sketches. The live per-WP status and the full
operational step list are in **`master-state.md` §7 / §14** — this section
records only the decision and the *why*.

| WP | Name | Why bounded this way |
|---|---|---|
| **WP1** | **Operations + Cafe HACCP** | Daily Operations is a **reusable generic module**; Cafe HACCP is a Cafe-specific configuration/package **over** the reusable core — not a `haccp` module or capability. ORUWA may support procedures, plans, scheduled checks, boolean/numeric/text records, thresholds, evidence, corrective actions, history, export. It must **not** claim to certify a business or guarantee legal compliance. Regulatory claims and current Japanese guidance are verified against current official sources before any dependent decision. |
| **WP2** | **Issues & Handover** | Structured operational issue capture + shift/day handover. Not a generic issue tracker. |
| **WP3** | **Owner Weekly Review** | Deliberately bounded management workflow: **what happened → what needs attention → what repeats → what action is required**. **Do not expand into a generic large dashboard / "Control Center".** |
| **WP4** | **Purchasing v2** | Bounded core: supplier records; item↔supplier mapping; pack/unit/lead-time; draft→approval flow; ordered / expected / partially-received / received / variance / closed states; linkage to inventory recount. **Not** invoices, payments, accounting, supplier APIs, warehouse management, or autonomous AI ordering (later, only if separately approved). |
| **WP5** | **Recipe Intelligence Lite** | Recipe↔Inventory ingredients/BOM with controlled units and package quantities; allergens; **estimated operational cost**. Price precedence: **confirmed receiving price → manual default price → unknown**. Missing price must **never** appear as zero. Manual estimates must **not** be presented as accounting-exact financial cost — operational cost guidance, not accounting. |

**Operations and Purchasing must not be combined into one oversized
workstream.** Phase 2 Cafe v2.2 Product Research (ChatGPT + Founder-led) may
refine scope *within* a WP boundary; it does not reopen the WP list or order.

### 5.3 Cafe v2.2 acceptance model (FOUNDER / CTO DECISION 2026-09-01)

**Both levels apply, no conflict:** a bounded **WP acceptance gate after each of
WP1…WP5** (role-aware, tenant-aware, environment-aware runtime verification —
not just CI), then a single **Full Cafe v2.2 Integrated Acceptance** after WP5
(master-roadmap Phase 4).

### 5.4 Scheduling priority (FOUNDER DECISION)

**Manual Manager Assignment > Manager-locked/approved preference > Employee
preference > Algorithmic fallback.** Automation must never silently overwrite a
manual manager assignment.

### 5.5 Deliberate non-goals

ORUWA does not currently try to become a competing POS platform, payroll
system, accounting suite, full reservation marketplace, mobile-order platform,
warehouse-management system, or autonomous purchasing agent. Integrate or
interoperate later where that produces customer value; do not rebuild mature
categories without a strong differentiating reason.

---

## 6. Rejected and deferred approaches

- **REJECTED FOR NOW — Separate SaaS or repository per client.** Destroys
  reuse, complicates security updates, turns ORUWA into custom-development
  maintenance.
- **REJECTED FOR NOW — Product #2 as an independent greenfield application.**
  The second vertical begins with a Vertical Blueprint and Reuse/Gap Analysis
  and reuses the ORUWA foundation wherever sound (§12).
- **REJECTED FOR NOW — Platform-first overengineering.** Do not build every
  future module, a generic workflow engine, a marketplace, an event bus, or an
  agent framework before a real product slice needs it.
- **REJECTED FOR NOW — A standalone "finish all Platform Foundation wiring"
  project.** *(FOUNDER / CTO DECISION 2026-09-01.)* The Foundation critical
  path is structurally present. Each unwired service (entitlement enforcement at
  the module gate, registry-driven navigation, notification dispatcher,
  event-bus consumers) is completed **only when a real consumer needs it** —
  Cafe, SaaS Hardening, Billing, provisioning, Product #2, or another
  demonstrated consumer. Do not complete abstractions for architectural
  completeness.
- **REJECTED FOR NOW — Green CI or merged PR as acceptance.** Necessary
  evidence, not final acceptance. High-risk features require role-/tenant-/
  environment-aware runtime verification.
- **DEFERRED — AI demand forecasting and autonomous ordering.** Require
  sufficient sales/usage history, reliable inputs, explainability, error bounds,
  and Manager approval.
- **DEFERRED — Heavy multi-agent orchestration.** Use a direct prompt,
  checklist, script, scheduled job, webhook, or small workflow when it solves
  the problem. Introduce CrewAI / LangGraph / AutoGen / complex MCP networks /
  large n8n systems only when coordination complexity is real and measurable.
- **DEFERRED — Broad environment cleanup bundled into feature work.**
  Environment consolidation and deprecated-compat cleanup are bounded
  **separately** from product development. `MAME_TO_CHA_*` cleanup and ENV
  Cleanup & Consolidation are **two distinct bounded tasks** — do not combine
  them (FOUNDER / CTO decision 2026-09-01).
- **DEFERRED — `dev → main → production` release governance.** Not designed
  yet. **P1 before the first production release.** `main` merge and production
  deploy remain two separate Founder gates.
- **DEFERRED — Product #2 selection and implementation.** Not started until the
  Founder chooses the target vertical and the Cafe/platform reuse readiness
  evidence exists.
- **OPEN — Surface A retain vs retire.** The `%5Fclient-preview/mame-to-cha/**`
  preview tree's long-term status is an outstanding Founder decision.

---

## 7. Development philosophy and quality gates

### 7.1 Small, reviewable slices

Prefer one coherent change with explicit acceptance criteria over a large mixed
initiative. Do not mix unrelated features, refactors, environment changes, and
production operations in one approval or commit unless unavoidable.

### 7.2 Audit before risky implementation

For security / database / deployment / billing / stale-context work: verify
repository, branch, HEAD, sync, working-tree state → inspect current code and
normative documents → identify conflicts and stale assumptions → propose a
bounded plan → obtain the required approval → implement on a feature branch →
run proportionate checks → independent review and acceptance.

### 7.3 Test the boundary, not only the happy path

Where relevant, acceptance includes: Manager allowed / Staff denied; tenant A
cannot access tenant B; location scope enforced; module disabled means
unavailable; direct DML or alternate API path cannot bypass policy; invalid /
expired / boundary-time / duplicate / retry behaviour; immutable fields stay
immutable; errors do not leak secrets or personal data; authenticated runtime
works after deployment.

### 7.4 Evidence labels

Reports distinguish **CONFIRMED** (directly verified here), **REPORTED**
(supplied by another actor, not independently verified here), **INFERRED**
(conclusion from evidence, reasoning stated), **UNVERIFIED** (plausible, not
checked), **BLOCKED** (needs access, approval, or an external action). Never
promote reported/inferred to confirmed without verification.

### 7.5 Definition of done

"Code complete" is not "product accepted." Depending on risk, done may require:
typecheck, lint, unit/integration tests, build; database reset + pgTAP;
security review; migration review + separately authorized Cloud application;
Preview deployment health; authenticated Manager and Staff checks;
mobile/tablet, keyboard, focus, console validation; explicit Founder
acceptance.

---

## 8. Security and human-approval boundaries — CANONICAL

The following actions must not be automated or executed solely because the code
is ready. They require explicit human/Founder approval for the specific target
and scope:

- production deployment;
- production database migration or schema change;
- destructive or bulk data modification;
- enabling, disabling, rotating, exposing, or changing credentials/secrets/keys;
- billing, subscription, price, or payment changes;
- legal documents or compliance claims;
- mass email, LINE broadcast, or customer-facing messages;
- real invitations or actions that send email / create operational records when
  the task was intended to be read-only;
- access-role, permission, RLS, or security-policy changes;
- personal-data exports, transfers, or use in AI systems;
- publication of a website, sales material, pricing, pilot terms, or a public
  product claim;
- changes to Production Supabase, Vercel, LINE, domain/DNS, or other external
  services;
- merging into `main`; designing `dev → main → production` release governance.

Before approval the executor states: (1) exact environment and target;
(2) exact action and expected side effects; (3) data/security/customer impact;
(4) verification and rollback/recovery plan; (5) whether any irreversible or
external communication occurs.

### Secret-handling rule

Do not print, paste, log, commit, screenshot, or transfer secret values, JWTs,
cookies, passwords, or privileged credentials. Prefer variable names and
categorical test results. Never obtain a user's authenticated session by
extracting credentials when a human can safely perform the check in an existing
browser session.

*(Machine-enforced today: `.claude/settings.json` denies raw `gh pr merge*`;
`scripts/ai-dev-merge.sh` refuses PRs touching `supabase/migrations/**` or
secret/env/key material; the ESLint guard blocks privileged-key `process.env`
reads in app code.)*

---

## 9. Founder ↔ CTO ↔ AI development workflow

### 9.1 Responsibilities

**Founder** — owns product direction, scope, commercial terms, risk acceptance,
production and external approvals; supplies business priorities; makes final
decisions when trade-offs materially affect company direction.

**CTO / main strategic AI conversation** — protects long-term product and
architecture coherence; translates Founder intent into bounded decisions and
implementation prompts; challenges unsafe or weak assumptions; separates fact /
inference / proposal / decision; reviews evidence from implementers and QA;
updates strategic direction only after an explicit decision.

**Claude Code / repository implementation agent** — audits the actual
repository before acting; plans and implements only the approved scope; works
through feature branches and appropriate tests; reports files, checks, risks,
and unresolved evidence honestly; does not redefine product strategy or
silently expand scope.

**Reviewer / Security / QA agent** — independently checks the diff and relevant
attack/failure paths (tenant, location, permission, RLS, module, personal-data,
regression); returns actionable findings with evidence; does not approve its own
assumptions because tests are green.

**Browser / Work QA** — validates the actual deployed experience with the
appropriate existing session and role; checks runtime behaviour, navigation,
responsive layout, accessibility, console/network symptoms, realistic data
visibility; avoids edits or side effects when acceptance is read-only.

### 9.2 Normal delivery loop

> Founder intent → CTO framing → repository audit → bounded plan → Founder
> approval where required → implementation → automated checks → independent
> review → deployed/runtime acceptance → CTO synthesis → Founder decision

Every handoff contains: objective and non-goals; evidence baseline; exact
allowed scope; files/areas likely involved; security and approval boundaries;
required checks; expected deliverable; stop conditions.

### 9.3 Branch and merge authority (FOUNDER DECISION)

- `feature/* → review → tests → PR → CI → **autonomous merge into `dev`**`.
- Merges into `dev` are performed **only** via `scripts/ai-dev-merge.sh <PR>`
  (re-verifies base=`dev`, OPEN, not-draft, MERGEABLE, CI all-pass; **refuses a
  RED path** — `supabase/migrations/**`, secrets/env/key material — in which
  case that PR needs Founder approval even though it targets `dev`). Raw
  `gh pr merge` is denied.
- **`dev` is the authoritative lineage.** `main` still carries historical
  Platform Foundation migrations; `main` reconciliation is a separate future
  task.
- Merging into **`main`** always requires the Founder's explicit confirmation.
  Deploying to **production** is a *further* separate Founder decision. The two
  are distinct approval boundaries.
- Documents that define canonical project context (`master-state.md`,
  `cto-context.md`) are **not** auto-merged — returned for Founder/CTO review.

### 9.4 Communication language (FOUNDER DECISION)

All CTO/Lead-Agent communication addressed to the Founder is in **Russian** —
explanations, questions, conclusions, plans, progress/completion reports,
approval requests, risk descriptions, relayed subagent findings. Never
machine-translate machine-readable content: source code, identifiers,
SQL/DB names, filenames/paths, CLI commands, API/library/framework names, Git
branch names, exact error messages. Subagents may use technical English
internally; only the Lead Agent's Founder-facing output is subject to this rule.

### 9.5 Context and memory discipline

Agents must not treat old summaries, `MEMORY.md`, handoffs, phase documents, or
chat statements as authoritative current repository state. Use them as leads,
then verify.

Do not store an entire conversation in repository memory. Preserve decisions in
this form when useful:

```text
DECISION:      What was chosen.
WHY:           The durable rationale.
CONSEQUENCE:   What future work must do differently.
REVISIT WHEN:  The evidence or trigger that justifies reopening the decision.
```

---

## 10. Forecasting policy — CTO PRINCIPLE

### Forecast ranges, not promises

For meaningful work, communicate three estimates when useful:

- **Best case** — dependencies ready; no material findings or rework;
- **Working estimate** — the planning baseline, with normal review and correction;
- **Risk range** — credible delay if security, migration, environment,
  acceptance, or scope problems appear.

Every forecast states: included and excluded scope; assumptions and
dependencies; approval and external-access dependencies; confidence level; the
next point at which the estimate is recalculated.

Do not convert the best case into the public plan. Re-estimate when scope
changes, previously unknown technical debt appears, an acceptance gate fails, or
an external dependency blocks progress. Separate **coding time /
review-fix time / deployment lead time / authenticated acceptance time /
Founder decision time**. An incomplete evidence base should **lower
confidence**, not produce a more precise number. Do not reuse the retired
"~8 weeks" figure.

---

## 11. Commercial path

### 11.1 Sell owner outcomes, not architecture

Lead with outcomes: clearer manager visibility; easier staff self-service;
fewer missed recurring tasks; retained procedures and handover knowledge;
earlier awareness of inventory and operational exceptions. Tenant isolation,
RLS, architecture, and AI are trust foundations that **support** the
owner-value story, not replace it.

### 11.2 Path to first customers

Define and verify Product Truth → ensure the core Cafe scenario is accepted
with realistic roles → prepare self-explanatory Japanese-first sales material →
focused owner diagnosis → bounded **paid pilot under Founder-approved terms** →
measure operational adoption and outcomes → convert learning into product
improvements without turning the platform into one-client custom software →
expand only after repeatable value is clear.

### 11.3 What must be ready before selling

An honest, bounded product offer; a reliable core workflow and support path;
known security and data-handling boundaries; clear onboarding and pilot
responsibilities; a realistic environment and acceptance process; no
unsupported claims, fake screenshots, or implied certifications.

### 11.4 What must NOT delay first sales

The first commercial conversations do not require every planned ORUWA module, a
mature AI agent platform, autonomous forecasting, a full accounting/POS
replacement, or Product #2.

### 11.5 Platform billing vs merchant payments (FOUNDER DECISION)

ORUWA platform subscription billing and the end-customer payments of the
business are **different domains** — different data models, risks,
integrations, compliance boundaries, permissions, and financial flows. Do not
mix SaaS entitlement with merchant commerce without a formal source. Billing
provider selection, Japanese tax/invoice requirements, and pricing are
`NEEDS VALIDATION` — Founder-decided from current sources, never copied from a
historical figure.

### 11.6 Commercial truth is Founder-controlled

Pricing, package names, pilot scope, guarantees, public capability claims,
customer names, metrics, and publication status are revalidated from current
Founder-approved sources.

---

## 12. Product #2 strategy

### FOUNDER DECISION — Product #2 extends ORUWA; it does not fork ORUWA

Before implementation, create a **Vertical Blueprint**: target Japanese
business segment and its painful recurring jobs; actors, roles, locations,
customer/staff interactions; daily/weekly operational loop; required records and
evidence; regulations / sector risks to verify; required modules and
integrations; what is shared with ORUWA Cafe/Core; what must be
vertical-specific; explicit out-of-scope; commercial hypothesis and onboarding
model.

Then a **Reuse/Gap Analysis**: reusable unchanged · reusable with extension ·
new generic platform capability · new vertical-only capability · harmful
coupling/mismatch · expected reuse ratio with the calculation explained. Do not
use an arbitrary percentage as the only decision — reuse quality matters more
than cosmetic reuse. A low reuse result may indicate the wrong vertical or a
real platform boundary.

**Entry gate:** Founder-selected segment; evidence of a valuable problem;
current Platform Foundation audit; Vertical Blueprint; Reuse/Gap Analysis;
bounded MVP and non-goals; security/data-model review; commercial learning
objective; explicit Founder approval. Product #2 does not begin merely because
Cafe work feels long.

---

## 13. Current strategic sequence — CURRENT DIRECTION

This section is directional, **not** implementation authorization. The
**operational step list and live status live in `master-state.md` §14** — this
section records only the reasoning and the open decisions.

- **DONE — canonical project checkpoint.** `master-state.md` (PR #478,
  `615925e`) and this document establish the recovery entry points. The
  Supabase Cloud DEV API-key migration is **CONFIRMED closed** (legacy
  `anon`/`service_role` disabled, new model mandatory, Production untouched,
  JWT signing keys untouched); ENV cleanup, deprecated-Mame cleanup, and Cafe
  v2.2 continuation had **not** started at checkpoint time.
- **NEXT — two separate bounded cleanup tasks, before feature work:**
  deprecated `MAME_TO_CHA_*` cleanup (verify runtime references, preserve
  recoverability), then ENV Cleanup & Consolidation. **Do not combine them; do
  not mix either with feature development or Production changes. Do not extend
  the `MAME_TO_CHA_*` convention.**
- **THEN — resume Cafe v2.2** through the acceptance-gated slices in §5.2 / §5.3
  (Operations Cloud smoke → Operations UI → HACCP presets → WP1 gate → WP2 …
  WP5 → Full Integrated Acceptance). Each slice on its own Founder prompt.
- **LATER** — commercial pilot execution and learning; platform hardening
  triggered by real usage; Product #2 Vertical Blueprint and selection;
  integrations, AI recommendations, and scale architecture only when evidence
  justifies them.

### Open decisions that must remain open

Until explicitly decided, do not invent answers for: the final Product #2
vertical; the Product #2 start date; final Cafe v2.2 scope *beyond* the approved
WP boundaries; production rollout dates; `dev → main → production` release
governance; current public prices or pilot scope; whether a particular AI or
LINE capability belongs in the sellable package; infrastructure changes for
300+ customers before measured need; Surface A retain vs retire.

---

## 14. Context recovery instructions

A new CTO, architect, or AI session restores context in this order:

1. Read `docs/project/master-state.md` — verified current operational state.
2. Read `docs/project/cto-context.md` — durable decisions and rationale.
3. Read the normative product / architecture / security / tenancy-RLS /
   permissions / module-entitlement / AI-governance / deployment / commercial
   documents referenced by `master-state.md`.
4. Inspect the current repository branch, HEAD, working tree, recent relevant
   changes, code, migrations, tests before proposing implementation.
5. Check the current task/roadmap only after determining whether it is fresh and
   authoritative.
6. Classify inherited statements as CONFIRMED / REPORTED / INFERRED /
   UNVERIFIED / stale.
7. Summarize the recovered position to the Founder: current verified state;
   binding decisions; current approved objective; unresolved conflicts;
   approval boundaries; smallest safe next step.
8. Do not start implementation until the task and authorization are clear.

Suggested recovery prompt:

```text
Read docs/project/master-state.md and docs/project/cto-context.md first.
Treat them as the operational and strategic entry points, not as substitutes
for current code or lower-level normative evidence. Verify repository, branch,
HEAD, working tree, relevant implementation, migrations, tests, and current
normative documents. Identify conflicts or stale claims explicitly. Then report
the current ORUWA position, binding Founder decisions, approval boundaries,
open decisions, and the smallest safe next step. Do not modify anything until
the requested scope and authorization are clear.
```

---

## 15. Maintenance policy

Update this document only when a durable strategic decision, rationale, working
model, product boundary, approval boundary, forecasting rule, commercial
direction, Product #2 rule, or strategic sequence materially changes. Do not
update it for every PR, bug fix, migration, test result, or deployment.

Decision rule:

- current project state changed → update `master-state.md`;
- strategy or durable reasoning changed → update `cto-context.md`;
- detailed architecture/security behaviour changed → update the appropriate
  normative document or ADR;
- nothing durable changed → update neither checkpoint.

When updating: preserve the decision and its rationale, not the conversation;
record what superseded an old decision; keep unresolved questions visibly
unresolved; re-check linked factual claims against the repository; obtain
Founder approval for material strategic changes; keep the document readable in
~10–15 minutes.

---

## Closing principle

ORUWA should grow by turning real operational learning into a secure, reusable
platform — without confusing speed with recklessness, architecture with
customer value, automation with authority, or a first vertical with the whole
company.
