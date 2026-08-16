# ORUWA Foundation

## Status: ORUWA Foundation v1.0 — Frozen

The Foundation document set and accepted baseline are frozen. Items
explicitly marked OPEN QUESTION, GOVERNANCE RECOMMENDATION, HYPOTHESIS, or
FOUNDER REVIEW REQUIRED remain unresolved until a separate recorded Founder
decision.

As of 2026-08-06, this directory's document set is Frozen. See
[documentation-and-decision-hierarchy.md](documentation-and-decision-hierarchy.md) §8
(Foundation Freeze Rule) for the conditions under which a new file may be
added here. Routine product, architecture, and engineering work does not
belong in this directory — see the Freeze Rule for where it belongs instead.

## Purpose

This directory contains the highest-level normative documents governing ORUWA Business OS.

These documents define the platform's long-term principles, product laws, architectural doctrine, and decision framework. They exist above any single product, vertical, or technology choice, and above day-to-day product, architecture, and UX decisions.

## Document Priority

Foundation documents outrank every other document in this repository. Within the directory, priority is:

1. **Core Laws & Product DNA** (`core-laws-and-product-dna.md`) — accepted, normative. See its Decision Hierarchy (Section 4) for how it relates to Product Vision, Product DNA, Long-term SaaS Principles, Platform Architecture Principles, Vertical Product Constitution, Product Pillars, Experience Principles, Module Rules, Functional Requirements, UX decisions, Implementation Decisions, and Code/Infrastructure.
2. Product Constitution *(not yet created)*
3. Product Boundaries *(not yet created)*
4. Product Pillars *(not yet created)*
5. Experience Principles *(not yet created)*

Any lower-level decision — product strategy, architecture, module design, UX, or code — must comply with these documents. If a lower-level decision conflicts with a foundation document, the decision is changed, not the foundation document. Changing a foundation document itself requires the formal review process defined in its own Evolution Rules section.

## Relationship Between Documents

- **Core Laws & Product DNA** is the sole currently-accepted document in this directory and is the normative source of truth for everything else listed above.
- Documents such as Product Vision, Product Constitution, Product Boundaries, Product Pillars, Experience Principles, Commercial Claims Policy, and Validation Plan are named within the Core Laws' Decision Hierarchy but do not yet exist as standalone documents in this repository. When they are created, they belong either in this directory (if platform-wide and normative) or in `docs/product/` (if vertical- or product-specific), and must never contradict Core Laws.
- Vertical- or product-level principle documents (for example `docs/product/cafe-product-principles.md`) sit below this directory in priority. They may add product-specific rules but must not override or weaken a Core Law.

## Current Documents and Recommended Reading Order

This directory now also contains documents beyond Core Laws & Product DNA. Recommended reading order:

1. [core-laws-and-product-dna.md](core-laws-and-product-dna.md) — Accepted, normative.
2. [documentation-and-decision-hierarchy.md](documentation-and-decision-hierarchy.md) — Accepted; canonical map of documentation and conflict resolution.
3. [repository-maturity-roadmap.md](repository-maturity-roadmap.md) — Accepted; governance map of repository/platform maturity stages.
4. [platform-foundation-roadmap.md](platform-foundation-roadmap.md) — Accepted; engineering sequencing of platform components. Items within it marked OPEN QUESTION, GOVERNANCE RECOMMENDATION, HYPOTHESIS, or FOUNDER REVIEW REQUIRED are not approved by this acceptance.
5. [oruwa-portfolio-and-module-strategy.md](oruwa-portfolio-and-module-strategy.md) — Accepted; portfolio and module strategy. Items within it marked OPEN QUESTION, GOVERNANCE RECOMMENDATION, HYPOTHESIS, or FOUNDER REVIEW REQUIRED are not approved by this acceptance.
6. [oruwa-engineering-principles-and-governance.md](oruwa-engineering-principles-and-governance.md) — Accepted; engineering decision process. Items within it marked OPEN QUESTION, GOVERNANCE RECOMMENDATION, HYPOTHESIS, or FOUNDER REVIEW REQUIRED are not approved by this acceptance.

See [documentation-and-decision-hierarchy.md](documentation-and-decision-hierarchy.md) for how these documents relate to each other and to the rest of `docs/`, and for the Foundation Freeze Rule governing new additions to this directory.

## How New Documents Should Reference Core Laws

Any new document that sits below this directory in the Decision Hierarchy — Product Vision, Product Constitution, Product Boundaries, Product Pillars, Experience Principles, Commercial Claims Policy, Validation Plan, or any vertical/product principles document — must carry a short reference at the top of the file, immediately after its title, of the form:

```markdown
> Governed by ORUWA Core Laws & Product DNA (`docs/foundation/core-laws-and-product-dna.md`).
> This document must not contradict the Core Laws. Where a conflict exists, the Core Laws prevail.
```

This reference is additive only: it does not require rewriting the target document's content, and it does not grant the target document any authority over the Core Laws.
