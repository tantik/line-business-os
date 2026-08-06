# ORUWA Documentation and Decision Hierarchy

> Governed by ORUWA Core Laws & Product DNA (`docs/foundation/core-laws-and-product-dna.md`).
> This document must not contradict the Core Laws. Where a conflict exists, the Core Laws prevail.

## Document Metadata

| Field | Value |
|---|---|
| Version | 1.0.1 |
| Status | Accepted |
| Owner | Founder |
| Scope | ORUWA Business OS repository documentation |
| Last Updated | 2026-08-06 |
| Foundation Status | Frozen |
| Supersedes | None |

## Related Documents

- [docs/foundation/core-laws-and-product-dna.md](core-laws-and-product-dna.md) — Section 4 (Decision Hierarchy) is the normative source this document maps to real files; this document does not add a new hierarchy level, it indexes the existing one.
- [docs/foundation/README.md](README.md) — directory-level priority statement this document elaborates.
- [docs/README.md](../README.md) — top-level shape of `docs/`.
- [docs/foundation/repository-maturity-roadmap.md](repository-maturity-roadmap.md) — companion document; together these two close ORUWA Foundation v1.0.
- [docs/foundation/platform-foundation-roadmap.md](platform-foundation-roadmap.md), [docs/foundation/oruwa-portfolio-and-module-strategy.md](oruwa-portfolio-and-module-strategy.md), [docs/foundation/oruwa-engineering-principles-and-governance.md](oruwa-engineering-principles-and-governance.md) — mapped in Section 4 below; each now carries `Status: Accepted` (Founder acceptance, 2026-08-06). Acceptance does not approve content within them explicitly marked OPEN QUESTION, GOVERNANCE RECOMMENDATION, HYPOTHESIS, or FOUNDER REVIEW REQUIRED.

## Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| 1.0.0 | 2026-08-06 | Initial accepted version. Closes ORUWA Foundation v1.0 together with `repository-maturity-roadmap.md`. | Claude (agent), for Founder review |
| 1.0.1 | 2026-08-06 | Updated status references for `platform-foundation-roadmap.md`, `oruwa-portfolio-and-module-strategy.md`, `oruwa-engineering-principles-and-governance.md` from Draft for Founder Review to Accepted, per Founder acceptance. Clarified Freeze statement wording; no new sections added, no Core Laws changed. | Founder |

---

## 1. Purpose

This document is a short, canonical map of ORUWA's documentation and how conflicts between documents are resolved. It exists for the Founder, AI agents, the Product Manager, the CTO, and developers, so that:

- anyone can find the authoritative document for a given decision without guessing;
- conflicts between two documents are resolved by a fixed procedure, not by whichever document is open at the time;
- no one selects a convenient document after the fact to justify a decision already made (Core Laws §4.3, Anti-Circular-Reasoning).

This document is **not** a new philosophical or architectural document. It does not restate the content of Core Laws & Product DNA, the Engineering Principles & Governance document, the Portfolio & Module Strategy, or the Platform Foundation Roadmap. It only maps where those documents sit and how to act when they appear to disagree.

## 2. Canonical Entry Points

The following files exist in this repository today and are the entry points into ORUWA documentation. This list does not invent new files; every path below was confirmed to exist before this document was written.

| Entry point | Role |
|---|---|
| [CLAUDE.md](../../CLAUDE.md) | Pointer for Claude Code agents; states the read order and highest-risk constraints, defers detail to AGENTS.md and `.cursor/rules/*`. |
| [AGENTS.md](../../AGENTS.md) | Operating rules for AI agents and contributors; states the read order for a session and the non-negotiable engineering rules. |
| [docs/README.md](../README.md) | Shape of the `docs/` tree and the priority rule between `docs/foundation/` and everything else. |
| [docs/foundation/README.md](README.md) | Purpose and internal priority of the `docs/foundation/` directory. |
| [docs/foundation/core-laws-and-product-dna.md](core-laws-and-product-dna.md) | Core Laws & Product DNA — the top of the Decision Hierarchy (Core Laws §4). |
| [docs/foundation/platform-foundation-roadmap.md](platform-foundation-roadmap.md) | Platform Architecture Principles level: engineering sequencing of platform components. |
| [docs/foundation/oruwa-portfolio-and-module-strategy.md](oruwa-portfolio-and-module-strategy.md) | Platform Architecture Principles level: what verticals and modules ORUWA builds, and in what order. |
| [docs/foundation/oruwa-engineering-principles-and-governance.md](oruwa-engineering-principles-and-governance.md) | Platform Architecture Principles level: how an engineering decision is proposed, approved, and verified. |
| [docs/adr/](../adr/) | Architecture Decision Records, numbered `0001`–`0010` at time of writing; no separate ADR index file exists, the directory itself is the catalogue. |
| [docs/architecture/](../architecture/) | Platform and module architecture detail (overview, multi-tenancy, RBAC, per-module data models). |
| [docs/security/security-requirements.md](../security/security-requirements.md) | Security requirements. |
| [docs/product/](../product/) | Vertical/product-level documents (Cafe principles, audits, acceptance reports, candidate backlog). |
| [docs/strategy/](../strategy/) | Longer-range strategic RFCs (e.g. `future-vertical-construction-os-rfc.md`). |
| [docs/operations/](../operations/) | Runbooks and deployment/operational checklists. |
| [docs/ai/](../ai/) | AI-agent operating context: `oaes-project-profile.md`, `current-task.md`. |
| [.cursor/rules/](../../.cursor/rules/) | Machine-enforced guardrails (architecture, security, database/RLS, git workflow, AI-agent workflow, legacy-migration boundaries). |

No other file is treated as a canonical entry point by this document. If a future document should become one, it is added here by an edit to this file, not by a new foundation document.

## 3. Documentation Levels

These levels describe the documents that already exist in this repository. They are a restatement, in file terms, of the Decision Hierarchy already accepted in Core Laws §4 — they do not create a second, competing hierarchy.

| Level | Represented by | Type of decision | Status today | Cannot override |
|---|---|---|---|---|
| Repository operating instructions | `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*` | How agents and contributors operate day to day | Living | Foundation, ADRs, security boundaries |
| Foundation | `docs/foundation/core-laws-and-product-dna.md` and this directory | Meta Principle, Purpose, Core Product Laws, Product DNA, Platform Architecture Principles | Core Laws: Accepted. `platform-foundation-roadmap.md`, `oruwa-portfolio-and-module-strategy.md`, `oruwa-engineering-principles-and-governance.md`: Accepted (items within them marked OPEN QUESTION, GOVERNANCE RECOMMENDATION, HYPOTHESIS, or FOUNDER REVIEW REQUIRED remain unresolved) | Nothing above Meta Principle exists; nothing below may override it |
| ADR / Architecture | `docs/adr/*`, `docs/architecture/*` | Accepted architecture decisions and current-state architecture description | Mixed — see each ADR's own status field | Foundation, security boundaries |
| Platform and Product Strategy | `platform-foundation-roadmap.md`, `oruwa-portfolio-and-module-strategy.md` (foundation-level); `docs/strategy/*` (vertical RFCs) | What gets built, in what order, at platform and portfolio scope | Draft for Founder Review / Accepted as reference (RFC) | Core Laws, Core Product Laws, ADRs |
| Product specifications | `docs/product/*` | Vertical-level product definition, principles, acceptance, backlog | Mixed | Foundation, platform/portfolio strategy |
| Security and Operations | `docs/security/*`, `docs/operations/*` | Security requirements, runbooks, deployment/incident process | Living | Foundation, ADRs |
| Phase plans / task specifications | `docs/ai/current-task.md`, product-level task/plan docs | Current verified stage, next gate, scoped task instructions | Temporary / Living | Everything above this level |
| Implementation and code | `apps/*`, `packages/*`, `supabase/migrations/*` | The running system | N/A | Everything above this level |

## 4. Conflict Resolution

When two documents appear to disagree, apply this procedure in order:

1. **Identify the level of each document** using Section 3 above (or Core Laws §4 directly).
2. **The higher level wins.** A document at a lower level never overrides a document at a higher level, regardless of which was written more recently.
3. **A newer document is not automatically more authoritative.** Recency only matters when comparing two documents at the *same* level; a 2026-08-06 task plan does not outrank a 2026-08-05 Core Law.
4. **A task or phase plan can never cancel a Core Law, an ADR, a security boundary, or a recorded Founder decision.** If a task plan appears to require this, the task plan is wrong and must be changed, not the higher-level document.
5. **A code comment never overrides a normative document.** Code and comments sit at the bottom of the hierarchy (Section 3); if code disagrees with a normative document, the code is the defect.
6. **A Historical or Superseded document is never treated as current source of truth**, even if it is easier to find or better written than the document that replaced it. Check the document's status (Section 5) before relying on it.
7. **A conflict must never be resolved silently by assumption.** Guessing which side is "obviously" correct and proceeding is a violation of Core Laws Law 12 (Confirmation Over Assumption).
8. **If, after applying steps 1–6, the conflict is still unresolved** — for example, two documents at the same level genuinely disagree and neither is clearly more fundamental — the conflict status is **BLOCKED / Founder Review Required**. Do not pick a side. Record the conflict and the two positions, and stop.
9. **The Founder does not automatically outrank every document by virtue of being the Founder.** The Founder changes the Foundation only through the Evolution Rules already defined in Core Laws §19, not through an informal statement that contradicts an already-accepted normative document. An informal Founder statement that conflicts with an accepted document is itself a case for step 8, resolved through the Evolution Rules, not by immediate override.

This mirrors an existing case already recorded in Core Laws §4.1: a client request (Functional Requirement level) asking for unconfirmed automated messaging cannot override Law 6 (Human Authority at High-Risk Boundaries, a Core Product Law) — the request is the one that must change.

## 5. Document Status Model

| Status | Meaning |
|---|---|
| **Accepted / Stable** | Normative for its level; current source of truth; changes go through that document's own change process (e.g. Core Laws' Evolution Rules). |
| **Living** | Actively maintained and current, but expected to change routinely as the system evolves (e.g. `AGENTS.md`, runbooks). Being "Living" does not lower its authority at its level. |
| **Draft** | Not yet accepted; represents a proposed position at its level. Treated as informative, not binding, until its status changes to Accepted. As of 2026-08-06, `platform-foundation-roadmap.md`, `oruwa-portfolio-and-module-strategy.md`, and `oruwa-engineering-principles-and-governance.md` have moved from Draft for Founder Review to Accepted; content within them explicitly marked OPEN QUESTION, GOVERNANCE RECOMMENDATION, HYPOTHESIS, or FOUNDER REVIEW REQUIRED remains at Draft weight (informative, not binding) even though the surrounding document is Accepted. |
| **Historical** | Describes a past state or past decision for reference; not current source of truth even if never formally superseded. |
| **Superseded** | Explicitly replaced by a newer document at the same level; the newer document is cited by name. |
| **Temporary** | Scoped to a specific task or time window (e.g. a phase plan); expected to be retired once its scope closes. |

Changing the status of an existing document is not authorized by this document. A status change is a change to that document itself and follows that document's own process.

## 6. Authority Matrix

| Decision type | Recorded in | Approved by | Changed by |
|---|---|---|---|
| Core Law / Product DNA | `docs/foundation/core-laws-and-product-dna.md` | Founder | Evolution Rules process (Core Laws §19) |
| Platform Architecture Principle (platform sequencing, portfolio/module strategy, engineering process) | `docs/foundation/*` (this directory, excluding Core Laws) | Founder / CTO | Founder Review, edit to the specific document |
| Architecture decision | `docs/adr/NNNN-*.md` | CTO / Founder, per ADR process | New ADR that supersedes the old one |
| Module / vertical scope | `docs/foundation/oruwa-portfolio-and-module-strategy.md`, ADR 0009/0010 | Founder / CTO | Founder Review of the strategy document or a new ADR |
| Product hypothesis / vertical principles | `docs/product/*` | Product Manager, within Core Laws bounds | Product Review |
| Implementation / phase plan | `docs/ai/current-task.md`, per-feature plan docs | CTO / task owner | Superseded by the next phase plan |
| Temporary task | Task branch notes, PR description | Task owner | Closed when the task closes |
| Operational runbook | `docs/operations/*` | CTO / Ops owner | Direct edit, reviewed like any operations doc |

Only roles and processes already confirmed elsewhere in this repository (Founder, CTO, Product Manager, ADR process, OAES process referenced by `docs/ai/oaes-project-profile.md`) are used in this table.

## 7. Rules for AI Agents

- Determine the decision's level (Section 3) before deciding which document governs it.
- Read the authoritative document for that level directly; do not infer its content from a summary or from memory of an earlier conversation.
- Do not mix a Historical or Superseded document into a current decision as if it were still source of truth.
- Do not create a new foundation-level document to solve a local, single-task problem — use the lower mechanism that already exists for it (ADR, RFC, product spec, roadmap, phase plan, task, runbook; see Section 9).
- If two governing documents conflict, report the conflict using Section 4's procedure instead of silently picking one.
- When citing a rule or decision, cite the real file and section it comes from.
- Never declare something a "Founder decision" without a document or explicit instruction as evidence.

This section is intentionally short. It does not restate the full AI Governance section already accepted in `docs/foundation/oruwa-engineering-principles-and-governance.md` §7 and Core Laws §13.

## 8. Foundation Freeze Rule

With the acceptance of this document and `docs/foundation/repository-maturity-roadmap.md`, **ORUWA Foundation v1.0 is Frozen.**

A new file may be added to `docs/foundation/` after this point only if **all** of the following hold:

1. It closes a system-level governance gap that is demonstrated, not hypothesized.
2. The gap cannot be adequately addressed as an ADR, RFC, product specification, roadmap, or runbook at a lower level.
3. It has been through Founder Review.
4. It states explicitly why the existing foundation documents (Section 2) are insufficient for the gap.

Ordinary product, architecture, and engineering decisions made after this Freeze belong below the Foundation, using the mechanisms that already exist for them:

- Architecture Decision Records (`docs/adr/`);
- RFCs (`docs/strategy/`);
- product research (`docs/product/` or a future `docs/research/`);
- product specifications (`docs/product/`);
- roadmaps below Foundation level (e.g. a Cafe roadmap);
- phase plans / tasks (`docs/ai/current-task.md`, feature-scoped plan docs);
- runbooks (`docs/operations/`).

## 9. Document Maintenance

- **Link checking**: before or after any edit to a foundation document, confirm every relative markdown link in the edited file resolves to a file that actually exists in the repository. No repository script for this exists today; use a manual or ad hoc read-only check (e.g. resolving each link against the filesystem) rather than adding new tooling as part of a documentation change.
- **Marking a document Superseded**: when a document is replaced, the new document states what it supersedes in its own Change Log / metadata, and the old document's Status field is updated to `Superseded`, pointing to the new document by name. This document does not perform that edit on any existing document — it only defines how the marking is done.
- **Avoiding duplication**: before adding new content to any document, check whether it is already covered at a higher or equal level (Section 3); if so, link to it instead of restating it, as this document does throughout.
- **Version / change log updates**: any accepted document that changes content increments its own Version field and adds a row to its own Change Log, per the pattern already used across foundation documents in this repository.
- **Moving a document to Historical**: a document moves to `Historical` when it no longer describes a current decision but is kept for record — this is a content decision made by that document's owner, not something this document schedules or automates.

---

**ORUWA Foundation v1.0 — Frozen.** The Foundation document set and accepted baseline are frozen as of 2026-08-06. Items explicitly marked OPEN QUESTION, GOVERNANCE RECOMMENDATION, HYPOTHESIS, or FOUNDER REVIEW REQUIRED remain unresolved until a separate recorded Founder decision. See Section 8 for the conditions under which a new `docs/foundation/` document may be added.
