# ORUWA platform / modules / packages model (Founder-approved 2026-10-19)

Status: **APPROVED** by the Founder on 2026-10-19 (three-layer model,
package concept in Stage 4B-1, several packages per client, risk rules).
Restates and sharpens `docs/strategy/oruwa-master-roadmap.md` §0 and
AGENTS.md "What this is"; adds no exception to them.

## 1. Three layers

| Layer | What | Examples | Sold? |
|---|---|---|---|
| **Platform** | what every package needs | sign-in and registration, tenants, roles/permissions, plans and billing, notifications (LINE / email), audit, ORUWA admin console, provisioning, languages | no, always included |
| **Modules** (capabilities) | reusable business capabilities, one code base | shifts & attendance, inventory, purchasing, recipes, checklists (Operations), issues & handover, booking, CRM, logistics, reports | inside packages, and as add-ons |
| **Packages** (products) | a set of modules **plus** industry configuration | Cafe, a buyer mini-package, Salon, Cleaning, Construction | yes |

A package = (1) a list of modules, (2) starter templates (shift types,
checklists, categories), (3) industry vocabulary on screens, (4) home screen
and navigation. The same module serves several industries through
configuration (Operations = HACCP in Cafe, a site cleaning report in
Cleaning, a safety check in Construction).

## 2. Founder decisions (2026-10-19)

1. Three-layer model: **approved**; this document is the basis.
2. The package concept is built into Stage 4B-1: **approved**.
3. One client may hold several packages and switch individual suitable
   modules on/off, add-ons at an extra price: **approved**.
4. Risk rules (below): **approved**.
5. Second package: the fastest one to build, chosen with a market check;
   Founder candidates: a buyer mini-package (for a cafe/restaurant that does
   not buy the full Cafe package), cleaning companies. If the buyer
   package is about +2 days on top of the package framework, launch with
   two packages.
6. Trial 30 days, no card; then 7 days read-only; data kept 90 days. One
   plan at launch, all Cafe modules, no limits (see
   `tenant-provisioning-plan-2026-10-18.md` §8).

## 3. Risk rules (approved)

- Do not generalise early: build for the package at hand, but put every
  industry-specific decision into **package configuration**, never into
  shared module code.
- One successful package before many: each package costs sales, support,
  Japanese copy and templates.
- Never a separate site, back end or code copy per package: the same
  platform and the same sign-in.

## 4. What is missing (VERIFIED 2026-10-19) → tasks

Facts: `core.module_registry` has workforce, inventory, operations, issues,
booking, core, ai (+ logistics, crm planned); `core.module_dependencies`
exists but is **empty**; plans `trial`/`standard`/`custom` exist but do not
define modules; "Cafe" exists only as `packages/db/scripts/cafe-package-template.ts`
(`cafe-v2`); Purchasing rides the `inventory` flag, recipes live inside
`workforce`; navigation is hand-built for Cafe (DEBT-044).

| # | Task | Done when | Size |
|---|---|---|---|
| P1 | Package in the database: `core.packages` (code, names JA/EN, version, status), `core.package_modules`, `core.tenant_packages` (several per tenant) + add-on modules; `core.tenant_modules` stays the single gate the RLS reads, kept in sync by one RPC; Cafe package v3 as data | migration + pgTAP (sync, several packages, add-on, removal keeps data), Cloud DEV | 1–2 d |
| P2 | Module dependencies filled and enforced (purchasing → inventory, recipe cost → inventory prices) | enabling without the dependency is refused with a clear message; pgTAP | 0.5 d |
| P3 | Purchasing and Recipes as their own modules (`purchases`, `recipes` module codes), RLS gates switched, existing tenants back-filled with no access change | pgTAP for every gate, live check | 2–3 d |
| P4 | Navigation from the registry: Manager / Staff home shows only enabled modules, in package order | live check with a reduced tenant | 1–2 d |
| P5 | Package vocabulary: screen words overridable per package, Cafe = default | unit tests; one override demonstrated | 1 d |
| P6 | Industry-specific out of shared modules (allergens, HACCP ranges, cafe wording) into Cafe package configuration | audit list + moves; no behaviour change | 1 d |
| P7 | Module-OFF states on every screen (DEBT-049 partly) | live QA on a reduced test tenant | 1 d |

Then: regression QA (QA4 on the new structure) → Stage 4B provisioning
(target: new client ready in 2–5 minutes) → LINE notifications (Stage 4A)
→ 6-tenant test (4C). Order rationale: LINE needs the Founder's LINE Official Account (lead time), and its onboarding step slots into the provisioning wizard once provisioning exists.
