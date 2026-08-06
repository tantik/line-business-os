# ORUWA Project State — Operational Index

Status: **Living operational index**

Last verified: **2026-08-06**

This directory is a compact projection of repository evidence for session continuity. It is not a new normative layer and does not replace Foundation, ADRs, product specifications, architecture reviews, security rules, or OAES artifacts.

## Read order for a new chat or agent

1. Read repository rules: [`AGENTS.md`](../../AGENTS.md).
2. Read the OAES profile: [`docs/ai/oaes-project-profile.md`](../ai/oaes-project-profile.md).
3. Read [current state](01_PROJECT_STATE.md) and [next task](06_NEXT_TASK.md).
4. Use [decisions](03_DECISIONS.md), [products](04_PRODUCTS.md), [research](05_RESEARCH_INDEX.md), and [risks](08_RISKS.md) only as indexes; follow their links to canonical sources.
5. Read the task-specific product/architecture/acceptance documents named in `06_NEXT_TASK.md`.

Do not reconstruct current state from chat history when repository evidence is available. Time-sensitive claims about branches, PRs, deployments, Cloud, or live Preview must be reverified.

## Authority

- Normative hierarchy: [`docs/foundation/documentation-and-decision-hierarchy.md`](../foundation/documentation-and-decision-hierarchy.md).
- Core product laws: [`docs/foundation/core-laws-and-product-dna.md`](../foundation/core-laws-and-product-dna.md).
- Architecture decisions: [`docs/adr/`](../adr/).
- Current product acceptance: [`docs/product/`](../product/).
- OAES task artifact: [`docs/ai/current-task.md`](../ai/current-task.md). It remains canonical for its scoped task, but is currently stale and must be updated before it can represent the active gate.

If this operational projection conflicts with a higher-authority source, the higher-authority source wins and this projection must be corrected.

## Update protocol

After a significant merged PR, Founder decision, stage transition, release gate, or completed research slice, update:

1. `01_PROJECT_STATE.md`;
2. `06_NEXT_TASK.md` (exactly one active task);
3. `07_CHANGELOG.md`.

Update the other files only when their subject changes. Verify Git first, record facts only, separate verified from pending, preserve risks, check links, and run `git diff --check`. Do not delay an emergency fix solely because this projection is stale; use a follow-up documentation change.

### One-action update

After a significant event, run:

```powershell
pnpm project:handoff
```

The command asks for the event, its evidence, and exactly one next task. It reads Git facts itself, updates only marked auto-sections in Project State and Next Task, adds one project-level changelog entry, and regenerates `CURRENT_HANDOFF.md`. It does not stage, commit, push, create a PR, merge, or modify application/DB files.

Read-only validation:

```powershell
pnpm project:handoff -- -Check
```

Use it for significant merges, Founder decisions, stage transitions, release gates, and completed research slices—not for every small edit.

## Start prompt

```text
Work in D:\Dev\line-business-os. Read AGENTS.md, docs/ai/oaes-project-profile.md,
docs/project/01_PROJECT_STATE.md, and docs/project/06_NEXT_TASK.md. First run a
read-only Git preflight (branch, status, recent log, HEAD, origin/dev). Treat
repository evidence as current and chat history as historical. Follow the
linked normative sources, preserve tenant/location isolation and all approval
boundaries, change only the active task scope, and report verified, pending,
blocked, and Founder-decision items separately.
```
