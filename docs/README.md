# Documentation

This directory holds all project documentation for LINE Business OS / ORUWA. It is organized so that the highest-authority, longest-lived documents sit at the top of the hierarchy and are rarely touched, while day-to-day working documents (plans, reports, runbooks) live in more specific subfolders and change often.

For a fast operational handoff or a new AI session, start at [Current Task](ai/current-task.md). It states the current verified stage and next gate, and links back to the normative sources below; it does not replace the Foundation or ADR hierarchy.

For the authoritative order in which to read project documentation, see the root [CLAUDE.md](../CLAUDE.md) "Source of truth" list. This file describes the shape of `docs/`, not the operating rules themselves.

## Documentation Hierarchy

```
docs
 ├── foundation      Highest-authority normative documents (Core Laws & Product DNA).
 ├── product         Product-level docs: vertical principles, audits, roadmaps, acceptance reports.
 ├── architecture     Platform and module architecture: multi-tenancy, RBAC, data models.
 ├── research         (create as needed) Market, competitive, and validation research.
 ├── sales            Sales and go-to-market materials: pitches, pricing, demo scripts.
 ├── security         Security requirements and policy.
 ├── operations       Runbooks, deployment checklists, incident response, environment inventory.
 ├── ai               AI-agent operating context: project profile, current task, operating model.
 ├── adr              Architecture Decision Records.
 ├── strategy         Longer-range strategic RFCs (e.g. future verticals).
 └── development       Contributor-facing process docs (e.g. acceptance workflow).
```

Folders are added as needed; the list above reflects what exists today plus the `research` folder called out in this README's suggested structure (create it when the first research document is written).

## Folder Purposes

- **`foundation/`** — The highest normative layer. Core Laws & Product DNA, the documentation and decision hierarchy, the repository maturity roadmap, and platform-level governance documents live here. Everything else in `docs/` must comply with this layer. **ORUWA Foundation v1.0 is Frozen as of 2026-08-06** — see [docs/foundation/documentation-and-decision-hierarchy.md](foundation/documentation-and-decision-hierarchy.md) §8 for the conditions under which a new foundation document may be added. See [docs/foundation/README.md](foundation/README.md).
- **`product/`** — Product definition, vertical principles (e.g. Cafe), audits, competitive comparisons, backlogs, and acceptance reports. Governed by `foundation/`.
- **`architecture/`** — Platform and module architecture: multi-tenancy, RBAC, data models, and per-module architecture reviews.
- **`research/`** — Market, customer, and competitive research, and validation plans. Create this folder when the first research document is written.
- **`sales/`** — Sales enablement: pilot packages, pricing notes, demo scripts, client-facing messaging.
- **`security/`** — Security requirements and policy documents.
- **`operations/`** — Runbooks, deployment checklists, backup/DR, incident response, environment inventory.
- **`ai/`** — Operating context for AI agents working in this repository: project profile, current task, the ORUWA AI Engineering Operating Model, and mission handoffs/completion reports.
- **`adr/`** — Architecture Decision Records, numbered sequentially.
- **`strategy/`** — Longer-range strategic proposals, such as future vertical RFCs.
- **`development/`** — Process documents for contributors, such as the product acceptance workflow.

## Priority Rule

If any document outside `foundation/` conflicts with a document inside `foundation/`, the document outside `foundation/` is wrong and must be changed. See [docs/foundation/README.md](foundation/README.md) for the full priority order and for how new documents should reference Core Laws.
