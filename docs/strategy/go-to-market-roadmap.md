# Go-to-Market Roadmap

**Status: Strategy / Planning Reference / Not Yet Founder-Accepted**

> Governed by ORUWA Core Laws & Product DNA (`docs/foundation/core-laws-and-product-dna.md`)
> and by `docs/foundation/platform-foundation-roadmap.md` for engineering sequencing.
> This document must not contradict either. Where a conflict exists, the Foundation prevails.

This document is a planning reference only. It does not authorize building
any specific feature, choosing a billing provider, committing to a price, or
starting outreach. It exists so the commercial path from "Cafe v2.1 closed"
to "first paying customers" and "Product #2 selection" is not lost or
reinvented from scratch in a future session, and so it can be checked
against the engineering sequencing already accepted in
[`../foundation/platform-foundation-roadmap.md`](../foundation/platform-foundation-roadmap.md).

Origin: drafted from a Founder/ChatGPT strategy session (2026-08-16),
reconciled against this repository's actual accepted documents and current
`origin/dev` state before being recorded here. Sections marked
`NEEDS VALIDATION` are hypotheses, not decisions.

## 1. Relationship to Existing Documents

This document does **not** replace or duplicate:

- [`../ORUWA-info.md`](../ORUWA-info.md) §15 "Future Product / Capability Roadmap" —
  the canonical short-form horizon table (A–F). This document is the
  expanded, commercial-focused detail behind Horizons C (Platform
  Foundation, partially), E (Product #2), and a new go-to-market layer that
  table does not itself carry.
- [`../foundation/platform-foundation-roadmap.md`](../foundation/platform-foundation-roadmap.md) —
  the accepted engineering critical path for Platform Foundation
  (Entitlements engine → Module Registry → Shared Navigation/Settings →
  Notifications → Event Bus, with Billing/Customer Portal/Platform
  Admin/AI Platform explicitly off the critical path). Any engineering
  sequencing in this document defers to that one; this document only adds
  the commercial/sales layer that sits on top of and after it.
- `docs/sales/*` — existing Cafe-specific sales collateral (pilot package,
  pricing notes, demo script). Those stay product-level; this document is
  platform-level go-to-market sequencing.

## 2. High-Level Milestones

| Milestone | Result |
|---|---|
| M1 — Reference Product | Cafe v2.1 fully accepted (Final Founder Acceptance recorded, no open P0/P1) |
| M2 — SaaS Foundation | Account + Admin + onboarding + billing + entitlements + support, built in the order `platform-foundation-roadmap.md` already specifies |
| M3 — Commercial System | Website + demo + offer + sales process + AI-assisted outreach |
| M4 — Market Validation | Real paying Cafe customers and confirmed unit economics |
| M5 — Portfolio Expansion | Product #2 selected and started |

**Gate**: Product #2 is not started because Cafe is technically ready. It is
started once ORUWA has demonstrated it can convert a new tenant into a
paying, supported customer — not only that it can build software. This is
the single most important sequencing rule in this document.

## 3. Sequencing Relative to Platform Foundation

`platform-foundation-roadmap.md` §7 already fixes the engineering order for
M2. This document does not re-order it. The commercial layer below depends
on that engineering work reaching specific points, not on all of it:

- **Customer Onboarding** (§4 below) needs Entitlements + Module Registry +
  Shared Navigation/Settings (critical-path items 1–3) at minimum — it
  cannot configure a tenant against modules that have no plan/limit model.
- **Billing** (§5) needs Entitlements (critical-path item 1), per that
  document's explicit dependency.
- **Platform Admin / Support inbox** (§6) is explicitly off the critical
  path and can be built in parallel without blocking a new vertical.
- Website, sales pipeline, and AI Sales Assistant (§7–9) have no dependency
  on Platform Foundation internals — they can be drafted earlier, but
  should not go live promising functionality (self-service signup, instant
  onboarding) that Entitlements/Billing/Onboarding do not yet support. This
  is the same constraint `platform-foundation-roadmap.md` §9 calls
  "Customer Portal before Billing/Entitlements risks Commercial Honesty
  (Law 14)" — it applies equally to marketing claims.

## 4. Customer Onboarding

Target flow once Entitlements + Module Registry + Shared Navigation exist:

```
oruwa.jp → package/contract → Owner account → tenant
→ entitlements → business setup → locations
→ Manager/Staff invitations → package configuration → first value
```

Collect the minimum needed for first value; use presets/templates over
free-form data entry. Self-service and ORUWA-assisted setup must drive the
same underlying state, not two separate implementations, so that a
Founder can complete setup on a customer's behalf (e.g. against a paid
setup fee) without a parallel code path. Full detail and approval already
exists at `../ORUWA-info.md` §7 — this section only restates it for
sequencing context, not as a new decision.

## 5. Billing

`NEEDS VALIDATION`: provider selection, Japanese tax/invoice requirements,
and payment-retry policy are out of scope for this document — they require
a dedicated, dated market check before any Architecture/Product Review, per
`../ORUWA-info.md` §9. This document only records the sequencing
constraint: Billing depends on Entitlements, and ORUWA SaaS billing must
stay a separate domain from any future merchant/customer-commerce payments
inside a tenant's own business (e.g. a cafe charging its own customers).

## 6. Platform Admin & Support

Founder-facing internal console: customers/tenants, MRR, failed payments,
new customers, support queue, per-tenant detail (company, package, users,
locations, subscription, onboarding progress, system status, audit). May
use a Founder-preferred internal language. This is the same scope already
recorded at `../ORUWA-info.md` §8 — restated here only to place it in the
commercial sequencing, not to re-approve it (`platform-foundation-roadmap.md`
already marks it off the critical path, buildable in parallel).

Support intake: Owner/Manager submits `bug` / `question` / `feature
request` / `billing issue` / `other`; ORUWA attaches safe technical context
(tenant, location, user, role, page, version, timestamp) automatically
where available. AI-assisted triage/classification is a later enhancement,
not part of the first version.

## 7. New-Tenant / One-Hour Provisioning Test

Only run this after M2 (SaaS Foundation) is functionally in place, and keep
it separate from ordinary Cafe development — mixing the two was an already-
identified process mistake for this project. Procedure:

1. Create a genuinely new, empty tenant (not the reference tenant used for
   QA/acceptance) — e.g. a second QA Cafe tenant, never the production
   reference tenant.
2. Start a timer at Owner signup/purchase-state entry.
3. Walk the real path: purchase/subscription state → onboarding → tenant →
   location → Manager → Staff → module configuration → first login →
   ready.
4. **Pass condition**: no application code was changed to make this tenant
   work. If VS Code had to be opened to hand-configure anything, Platform
   Foundation is not yet productized enough — this is a fail regardless of
   how long it took.
5. Record the actual elapsed time as a data point, not as a target to hit.
   Do not make a public "one-hour onboarding" commercial claim before a
   successful rehearsal (already a standing constraint —
   `../ai/current-task.md` §3).

## 8. ORUWA Website

`NEEDS VALIDATION`. Directional structure only, not an approved sitemap:

```
oruwa.jp
├── Product → /cafe (later: /salon, ...)
├── How it works
├── Pricing
├── Demo
├── FAQ
├── Contact
└── Login
```

Primary CTA is a conversation-oriented action (demo request / consultation
request), not an assumed self-service purchase flow — Japanese SMB buying
behavior for this category has not been validated either way. Do not build
self-service checkout ahead of that validation.

## 9. Commercial Package

Before any sales activity, define (each is `NEEDS VALIDATION`, not decided
here): target customer, problem solved, Cafe package contents, plan/tier,
setup fee (if any), subscription terms, trial/pilot policy, onboarding
inclusion, support terms, cancellation policy, and specific commercial
claims (subject to the Commercial Claims Policy referenced in
`../foundation/documentation-and-decision-hierarchy.md` §2, once that
document exists). Existing draft pricing in `docs/sales/` is not
automatically current truth for this — see that folder's own notes.

## 10. Sales Pipeline

Simple pipeline, not a bespoke internal CRM at this stage — prefer an
existing tool or a minimal internal workflow until volume justifies
building one:

```
Lead → Contacted → Demo → Interested → Pilot/Proposal
→ Customer → Onboarding → Active
```

## 11. Sales Channels

`NEEDS VALIDATION` — do not commit to a single channel (e.g. Instagram)
without a dated channel check for the Japanese B2B cafe segment. Candidates
to evaluate: direct outreach, Google Maps prospecting, referrals, local
business communities, Instagram, LINE, website/SEO, partnerships, and
direct visits where the unit economics justify it.

## 12. AI Sales Assistant

If built, the first version stays human-approval-gated, consistent with
Core Laws Law 4/Law 6 (AI proposes, human approves) already enforced
elsewhere in this platform for business data:

```
Lead → AI research → lead qualification → personalized draft
→ HUMAN APPROVAL → message sent → reply classification → follow-up recommendation
```

AI may research, draft, classify, summarize, and remind; it does not send
outreach autonomously or at scale until message effectiveness has been
proven with human-approved sends. This mirrors the AI-first principle
already stated in `../../PROJECT_BRIEF.md` §10 and `AGENTS.md` §8, applied
to sales instead of business-data mutation.

## 13. First Real Customers

Goal is not a specific customer count; it is measuring what actually
happens with a live customer before deciding what to build next: time to
onboard, Founder time per customer, support tickets per customer,
daily/weekly usage, which modules are actually used, sales conversion rate,
setup effort, and actual objections/willingness to pay. Cafe v2.2 scope
(`../ai/current-task.md` §3) is selected from this evidence, not from
internal preference.

## 14. Product #2 Selection Gate

Run as an explicit, separate Product Selection Gate — do not pre-select a
winner. Evaluate against: Japan market size, pain intensity, willingness to
pay, competition, sales accessibility, regulatory burden, setup complexity,
required new capabilities vs. reusable ORUWA capabilities, retention, and
support cost. Weight reuse heavily: the more of Core Platform + Platform
Services + existing modules (Workforce, Inventory, Manuals, Attention,
Operations) a candidate can reuse against real customer pain, the more
attractive it is versus a candidate that requires largely new
infrastructure. This is the same portfolio discipline already recorded in
[`../foundation/oruwa-portfolio-and-module-strategy.md`](../foundation/oruwa-portfolio-and-module-strategy.md);
this section does not add new criteria beyond applying it at
Product #2 selection time.

## Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| 0.1.0 | 2026-08-16 | Initial draft, reconciled from a Founder/ChatGPT strategy session against this repository's accepted documents and `origin/dev` state. Not yet Founder-reviewed. | Claude (agent), for Founder review |
