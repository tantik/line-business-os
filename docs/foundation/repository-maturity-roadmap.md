# ORUWA Repository Maturity Roadmap

> Governed by ORUWA Core Laws & Product DNA (`docs/foundation/core-laws-and-product-dna.md`).
> This document must not contradict the Core Laws. Where a conflict exists, the Core Laws prevail.

## Document Metadata

| Field | Value |
|---|---|
| Version | 1.0.1 |
| Status | Accepted |
| Owner | Founder |
| Scope | ORUWA Business OS repository and platform maturity |
| Nature | Governance map, not execution roadmap |
| Last Updated | 2026-08-06 |
| Foundation Status | Frozen |
| Supersedes | None |

## Related Documents

- [docs/foundation/documentation-and-decision-hierarchy.md](documentation-and-decision-hierarchy.md) — companion document; together these two close ORUWA Foundation v1.0.
- [docs/foundation/platform-foundation-roadmap.md](platform-foundation-roadmap.md) — execution-level engineering roadmap for Core Platform / Platform Services; governs Platform work identified in this document.
- [docs/foundation/oruwa-portfolio-and-module-strategy.md](oruwa-portfolio-and-module-strategy.md) — governs vertical/module sequencing decisions.
- [docs/foundation/core-laws-and-product-dna.md](core-laws-and-product-dna.md) — normative source; in particular §3.3 (what ORUWA is not), §21.4 (Vertical Applicability Check), Law 9 (Progressive Complexity), Anti-Principle 12.1 (Feature Factory) and 12.5 (Custom Fork Per Client).
- [docs/ai/current-task.md](../ai/current-task.md) — current verified stage of the active vertical (Cafe).
- Cafe's commercial state (Mame To Cha pilot outcome): Founder-confirmed project fact; repository evidence record pending. Not sourced to any temporary handoff document — a temporary handoff MUST NOT be a normative source for Frozen Foundation content.

## Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| 1.0.0 | 2026-08-06 | Initial accepted version. Closes ORUWA Foundation v1.0 together with `documentation-and-decision-hierarchy.md`. | Claude (agent), for Founder review |
| 1.0.1 | 2026-08-06 | Removed reliance on `ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md` as a normative citation (a temporary handoff document); replaced with "Founder-confirmed project fact; repository evidence record pending" markers, per Founder decision. No decision content changed. | Founder |

---

## 1. Purpose and Non-Purpose

**Purpose.** This document prevents premature complexity by giving a single governance map of where ORUWA the repository and the platform currently stand, what evidence is required to move to the next stage, what must not be built ahead of that evidence, and which existing lower-level roadmap governs the concrete work for a given stage.

**This document is not:**

- a feature backlog;
- a calendar plan or release schedule;
- a promise to any client;
- a replacement for the [ORUWA Platform Foundation Roadmap](platform-foundation-roadmap.md);
- a replacement for the [ORUWA Portfolio & Module Strategy](oruwa-portfolio-and-module-strategy.md);
- a replacement for any Cafe-specific roadmap or product document.

Where this document and a lower-level roadmap could both be read for a concrete task, the lower-level roadmap governs the task; this document only tells you which one to open.

## 2. Maturity Dimensions

ORUWA can be mature on one dimension and immature on another at the same time — for example, technically deep on Cafe while commercially unproven. This document tracks the following independent dimensions, and no others:

1. **Foundation / Governance maturity** — do the normative documents (Core Laws, decision hierarchy, engineering governance) exist and are they followed.
2. **Core Platform maturity** — is the shared Core (Tenant/Identity/RBAC/Audit) production-grade and vertical-agnostic.
3. **Vertical Product maturity** — is the first vertical (Cafe) technically complete and accepted.
4. **Commercial maturity** — does a paying, signed customer relationship exist for any vertical.
5. **Production / Operations maturity** — are deployment, monitoring, incident response, and backup/DR actually exercised in production, not just documented.
6. **Delivery Factory maturity** — can a new client be onboarded to an existing vertical repeatably, in bounded time, without bespoke engineering per client.
7. **Multi-product maturity** — does the Platform Foundation (Entitlements, Module Registry, Notifications, Billing, Customer Portal, etc., per the Platform Foundation Roadmap) exist to support a second vertical safely.
8. **Scale maturity** — does the platform operate correctly under real multi-tenant load, with hardened shared services.

## 3. Maturity Stages

| Stage | Name |
|---|---|
| 0 | Foundation Defined |
| 1 | First Vertical Technical Baseline |
| 2 | First Vertical Commercial Readiness |
| 3 | Repeatable Customer Delivery |
| 4 | Platform Foundation Ready for Multiple Products |
| 5 | Second Vertical Validated |
| 6 | Multi-product Commercial Operation |
| 7 | Scale Hardening |

These stage names and this order are not confirmed by any single existing document as an accepted numbered sequence; they are constructed here from the dependency order already established across Core Laws §4 (Decision Hierarchy), the Platform Foundation Roadmap §7/§10 (build sequence and critical path), and the Portfolio & Module Strategy §9 (vertical sequencing) and §11 (risks of building out of order). Treat the stage **order** as derived from those accepted sources; treat the specific stage **numbering and naming** as a Governance Recommendation, not itself a separately Founder-approved artifact.

There is no Enterprise stage and no Enterprise end-state in this list. ORUWA targets Japanese SMBs; enterprise ERP is an explicit non-target (Core Laws §3.3; Portfolio & Module Strategy §3, "Enterprise ERP: Reject as an ORUWA product").

## 4. Entry and Exit Evidence

### Stage 0 — Foundation Defined

- **Goal**: a normative basis exists so later decisions are not made ad hoc.
- **Must exist**: Core Laws & Product DNA at Accepted status; a documentation/decision hierarchy; an engineering governance process.
- **Evidence**: `docs/foundation/core-laws-and-product-dna.md` (Status: Accepted); this document and `documentation-and-decision-hierarchy.md`.
- **Source of truth**: `docs/foundation/core-laws-and-product-dna.md`.
- **Still forbidden**: none — this is the entry stage.
- **Next allowed transition**: Stage 1, already underway in parallel (see Section 6).

### Stage 1 — First Vertical Technical Baseline

- **Goal**: one vertical is built to a production-quality technical standard, proving the Core Platform and the modular pattern.
- **Must exist**: a working Core (multi-tenancy, RBAC, audit), one vertical with real depth, passing tests, accepted architecture review.
- **Evidence**: Cafe Package Workforce/Booking/Inventory modules, `docs/product/cafe-package-v2-acceptance-report.md`, `docs/ai/current-task.md` verified baseline, pgTAP suite passing.
- **Source of truth**: `docs/ai/current-task.md`, `docs/foundation/platform-foundation-roadmap.md` §6.
- **Still forbidden**: treating technical completeness as commercial proof.
- **Next allowed transition**: Stage 2, once a real commercial engagement exists for that vertical.

### Stage 2 — First Vertical Commercial Readiness

- **Goal**: the first vertical is proven with a real, paying or committed customer, not only technically complete.
- **Must exist**: a signed or actively piloting customer; commercially honest claims (Core Laws Law 14).
- **Evidence needed but not yet confirmed as met**: the Portfolio & Module Strategy §2.2 records that the first named pilot customer (Mame To Cha) declined due to delays, and that Cafe currently has **no active paying customer** — pricing (¥4,980/month) is stated for a not-yet-signed design partner.
- **Source of truth**: `docs/product/mvp-roadmap.md`, Portfolio & Module Strategy §2.2 (pilot outcome cited there as Founder-confirmed project fact; repository evidence record pending).
- **Still forbidden**: starting a second vertical on the assumption that Cafe is commercially validated; making public commercial claims not backed by a signed customer.
- **Next allowed transition**: Stage 3, once at least one repeat or additional paying customer exists on the same package.
- **Numeric gates** (customer count, revenue, conversion rate): **FOUNDER REVIEW REQUIRED before adopting a numeric gate** — none is recorded in any source document.

### Stage 3 — Repeatable Customer Delivery

- **Goal**: onboarding a new client to the first vertical is a bounded, repeatable process, not bespoke engineering per client.
- **Must exist**: a client-template tenant flow, bounded onboarding time, sales materials, a demo-to-live rehearsal.
- **Evidence**: `docs/product/mvp-roadmap.md`'s stated sequence (sync public demo, bring onboarding to ≤2 hours) is the only dated sequence in the repository for this stage; it is not yet confirmed complete.
- **Source of truth**: `docs/product/mvp-roadmap.md`; AGENTS.md's demo-vs-client-template distinction.
- **Still forbidden**: building Platform Foundation multi-product infrastructure before repeatable single-vertical delivery is proven — doing so risks generalizing from one data point (Platform Foundation Roadmap §9, "third vertical before Notifications" class of risk applies by analogy to building shared infra before a repeatable first case exists).
- **Next allowed transition**: Stage 4, once the Platform Foundation Roadmap's critical path is undertaken deliberately, not as a side effect.

### Stage 4 — Platform Foundation Ready for Multiple Products

- **Goal**: the shared platform layer required for a second vertical exists, so the second vertical does not each reinvent access control, notifications, or navigation.
- **Must exist**: per Platform Foundation Roadmap §10 critical path — Entitlements engine, Module Registry, Shared Navigation/Settings, Notifications as a shared service, Event Bus.
- **Evidence**: Platform Foundation Roadmap §6 records these as **not yet built** ("нужно построить с нуля"); only Core Platform itself is marked "построен" (built), and that section further notes hardening-only status.
- **Source of truth**: `docs/foundation/platform-foundation-roadmap.md` §7, §10.
- **Still forbidden**: starting a second vertical's implementation before this critical path closes (Platform Foundation Roadmap §9, risk table).
- **Next allowed transition**: Stage 5, gated on a separate Founder Review and a separate Product Review selecting the second vertical (Platform Foundation Roadmap §11).

### Stage 5 — Second Vertical Validated

- **Goal**: a second vertical is built on the shared Platform Foundation and reaches technical and commercial validation comparable to Stage 1–2 for the first vertical.
- **Must exist**: an explicit Product Review selecting the vertical (Salon and Cleaning are both recorded candidates — see Portfolio & Module Strategy §2.9 — with the choice between them marked as an open Founder decision, not resolved by this document).
- **Evidence**: none yet — Portfolio & Module Strategy explicitly treats no vertical beyond Cafe as begun.
- **Source of truth**: `docs/foundation/oruwa-portfolio-and-module-strategy.md` §2, §9.
- **Still forbidden**: starting a third vertical before the second is validated (Portfolio & Module Strategy §11 risk discussion); treating Salon or Cleaning as chosen without a recorded Founder decision.
- **Next allowed transition**: Stage 6.

### Stage 6 — Multi-product Commercial Operation

- **Goal**: more than one vertical operates commercially at once, each drawing on the same Platform Foundation.
- **Must exist**: Platform Billing, Customer Portal (Platform Foundation Roadmap §10, Level 2 items 6–7), at least two verticals with paying customers.
- **Evidence**: none — not reached.
- **Source of truth**: `docs/foundation/platform-foundation-roadmap.md`, `docs/foundation/oruwa-portfolio-and-module-strategy.md`.
- **Still forbidden**: a third vertical before this stage's commercial evidence exists.
- **Next allowed transition**: Stage 7.

### Stage 7 — Scale Hardening

- **Goal**: the platform is hardened for observed multi-tenant load and operational scale, per ADR 0009's 300+ tenant target.
- **Must exist**: production monitoring, load-tested shared services, hardened security posture at scale.
- **Evidence**: none — not reached; ADR 0009 records the target, not current achievement.
- **Source of truth**: `docs/adr/0009-safe-growth-and-module-rollout.md`, `docs/operations/*`.
- **Still forbidden**: scale infrastructure investment ahead of observed load (Section 8 below).
- **Next allowed transition**: none defined beyond this stage in current sources.

## 5. Current State Assessment

| Dimension | Status | Evidence |
|---|---|---|
| Foundation / Governance maturity | **Current** | Core Laws Accepted; three further foundation-level documents exist at Draft for Founder Review; this document and its companion close Foundation v1.0. |
| Core Platform maturity | **Partially met** | Platform Foundation Roadmap §10 records Core Platform (Level 1) as "построен" (built), hardening-only — but Platform Services (Entitlements, Module Registry, Notifications, Event Bus) needed to safely support a second vertical are recorded as not yet built (§6, §7). |
| Vertical Product maturity (Cafe) | **Partially met** | Workforce is staffed/complete, Booking is a stub, Inventory is partial (migrations 0035–0038) per Portfolio & Module Strategy §2.2; v2.1 operator UX is in local QA per `docs/ai/current-task.md`, not yet accepted (Preview Cloud deploy and visual acceptance are the next gate). |
| Commercial maturity | **Not met** | No confirmed active paying customer for any vertical; the one named pilot (Mame To Cha) declined (Portfolio & Module Strategy §2.2). |
| Production / Operations maturity | **Unknown** | Runbooks exist (`docs/operations/*`), but `docs/ai/current-task.md` records "Production remains separately gated and was not enabled" — production operation is not confirmed exercised. |
| Delivery Factory maturity | **Not met** | `mvp-roadmap.md`'s onboarding-time and public-demo-sync steps are the only recorded sequence for this and are not confirmed complete by any source read for this document. |
| Multi-product maturity | **Not met** | Entitlements, Module Registry, Notifications-as-a-service, Event Bus, Platform Billing, Customer Portal are all recorded as not yet built (Platform Foundation Roadmap §6). |
| Scale maturity | **Not met** | ADR 0009 records a 300+ tenant target; no evidence reviewed for this document shows that target has been reached or load-tested. |

A second vertical is **not** treated as started: Portfolio & Module Strategy §2.3–2.7 records Salon and Cleaning as candidates with supporting architecture (Booking module, demo seed data) but explicitly not begun as a chosen, funded vertical, and the choice between them is recorded as requiring Founder Review.

## 6. Transition Gates

| Transition | Blockers | Mandatory evidence | Founder approval boundary | Governing document |
|---|---|---|---|---|
| Technical Baseline → Commercial Readiness | No paying/committed customer | A signed customer or an active pilot with committed terms | Founder confirms the engagement is real and commercially honest (Core Laws Law 14) | `docs/product/mvp-roadmap.md` |
| Commercial Readiness → Repeatable Delivery | Onboarding still bespoke; no rehearsed demo-to-live flow | Bounded onboarding time achieved and demonstrated at least once | Founder confirms repeatability, not just a single successful case | `docs/product/mvp-roadmap.md` |
| Repeatable Delivery → Multi-product Platform | Platform Foundation critical path (Entitlements → Module Registry → Shared Navigation/Settings → Notifications → Event Bus) not closed | Each critical-path item passes Core Compliance Review (Core Laws §20) per Platform Foundation Roadmap §11 | Founder Review confirms critical path closed before a second vertical is authorized | `docs/foundation/platform-foundation-roadmap.md` §10–11 |
| Platform readiness → Second Vertical implementation | No Product Review has selected the second vertical | A separate Product Review (Product Vision/Constitution level) naming the vertical | Founder selects between recorded candidates (Salon vs. Cleaning); this roadmap does not select for the Founder | `docs/foundation/oruwa-portfolio-and-module-strategy.md` §2.9, §9 |
| Multi-product operation → Scale Hardening | No observed multi-tenant load approaching ADR 0009's target | Production usage data showing load characteristics | Founder/CTO confirm hardening investment is justified by observed, not projected, load | `docs/adr/0009-safe-growth-and-module-rollout.md` |

## 7. Premature Work Guardrails

The following are guardrails against building ahead of the evidence in Section 5. Each is marked by how firmly it is supported.

| Guardrail | Status | Source |
|---|---|---|
| Do not start a third vertical before the second is validated | FACT | Portfolio & Module Strategy §11 (risk of expanding portfolio on unconfirmed demand) |
| Do not build Enterprise ERP | FACT | Core Laws §3.3; Portfolio & Module Strategy §3 |
| Do not build complex billing before the commercial model is settled | GOVERNANCE RECOMMENDATION | Inferred from Platform Foundation Roadmap §9 risk row "Billing до Entitlements" and Law 7 (One Operational Truth); no document states a commercial-model gate explicitly |
| Do not build autonomous AI (AI acting without human approval) | FACT | Core Laws Law 4 (Trust Before Automation), Law 6 (Human Authority at High-Risk Boundaries); AGENTS.md "AI never writes business data directly" |
| Do not build tenant-specific forks | FACT | Core Laws Anti-Principle 12.5 (Custom Fork Per Client) |
| Do not build complex shared services before a second confirmed consumer exists | FACT | Platform Foundation Roadmap §8 ("Integrations framework — DEFER до появления второго типа внешней интеграции"), applied here by the same logic to other shared services |
| Do not invest in scale infrastructure ahead of observed load | GOVERNANCE RECOMMENDATION | Inferred from Filter 15 (Cost of Ownership) and Progressive Complexity (Law 9); no document sets a specific scale-investment gate |
| Do not make public commercial claims without evidence | FACT | Core Laws Law 14 (Commercial Honesty) |

## 8. Relationship to Existing Roadmaps

This document routes work to the roadmap that governs it; it does not contain the work itself.

| Kind of work | Governing document |
|---|---|
| Platform Foundation build-out (Entitlements, Module Registry, Notifications, Event Bus, Billing, Customer Portal, etc.) | [docs/foundation/platform-foundation-roadmap.md](platform-foundation-roadmap.md) |
| Choice or sequencing of verticals/modules | [docs/foundation/oruwa-portfolio-and-module-strategy.md](oruwa-portfolio-and-module-strategy.md) |
| Cafe implementation detail | `docs/product/cafe-*` documents, e.g. `cafe-product-principles.md`, `cafe-v2-2-candidate-backlog.md`, `cafe-package-v2-1-acceptance-report.md` |
| Architecture change | `docs/adr/` (new ADR) or `docs/strategy/` (RFC) |
| Concrete execution / current work | `docs/ai/current-task.md` and feature-scoped phase plans |
| Production operation | `docs/operations/*` runbooks |

## 9. Next Authorized Focus

Based on the current-state evidence in Section 5, and cross-checked against the most recent recorded Founder-facing plan (`docs/product/mvp-roadmap.md`, `docs/ai/current-task.md`):

- **Primary focus**: complete Cafe Package technical and commercial readiness — closing v2.1 acceptance (Preview Cloud deploy, authenticated Manager/Staff/Recipes visual acceptance per `docs/ai/current-task.md`), then evaluating v2.2 candidate features strictly by Purchase Probability per `docs/product/cafe-v2-2-candidate-backlog.md`.
- **At most one parallel track**: production-factory and sales-readiness preparation (demo sync, sales kit, onboarding-time rehearsal) as recorded in `docs/product/mvp-roadmap.md`, so that a "client agrees → ready version in about an hour" rehearsal becomes possible once Cafe reaches commercial readiness.

Platform Foundation work, hardening, and second-vertical selection follow only after this focus and its exit evidence (Section 4, Stage 2–3) are met, per the sequencing already fixed in Section 6.

Where `docs/product/mvp-roadmap.md`'s sequencing and the Portfolio & Module Strategy's vertical-timing signals (Salon vs. Cleaning readiness, Portfolio & Module Strategy §2.7) appear to disagree on what comes immediately after Cafe, this document does not resolve that disagreement — Portfolio & Module Strategy §2.7 already records it as **FOUNDER REVIEW REQUIRED**, and this document defers to that.

## 10. Freeze Statement

This document completes the ORUWA Foundation documentation set v1.0, together with `docs/foundation/documentation-and-decision-hierarchy.md`.

It does not authorize automatic creation of new foundation-level documents. All further project changes — platform work, vertical work, architecture changes, product decisions, operational changes — go through the existing lower-level mechanisms listed in Section 8, governed by the conflict-resolution and freeze rules in `documentation-and-decision-hierarchy.md` §4 and §8.

---

**Foundation Status: Frozen as of 2026-08-06.**
