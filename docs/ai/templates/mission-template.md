# Mission: <short title>

Governed by [`docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`](../ORUWA_AI_ENGINEERING_OPERATING_MODEL.md).
Fill in every section; delete none. If a section genuinely does not apply,
write "None" and say why in one clause.

## Objective

One sentence: the outcome this mission produces.

## Scope

What is in bounds. Be concrete (files, modules, routes, doc directories).

## Out of scope

Named explicitly. Anything not listed here that turns out to be tempting
mid-mission is still out of scope unless this file is updated.

## Source of truth

Which documents govern this mission (subset of: `AGENTS.md`, the Operating
Model, `docs/ai/oaes-project-profile.md`, relevant ADRs/architecture docs,
`docs/security/security-requirements.md`). Read order for the executing
session.

## Constraints

What this mission must not touch or change, even if it seems related
(e.g. "do not modify DB/RLS/Auth/Preview/Production configuration").

## Mission size

Small task / Standard mission / High-risk mission / Research-audit mission —
per Operating Model §17. This determines how much process below actually
applies.

## Definition of Done

Restate `oruwa-engineering-principles-and-governance.md` §8's baseline where
relevant, plus anything mission-specific. Never fewer checks than the
baseline.

## Verification requirements

Which QA gates apply (Operating Model §11), sized to the mission size above.

## Escalation boundaries

Which approval boundaries (Operating Model §9) this mission is likely to
hit, named in advance so the executing session recognizes them instead of
discovering them mid-task.

## Stop condition

What "this mission is complete" means, concretely — the state that triggers
Operating Model §16 (Stop discipline).

## Operating mode

State explicitly what the executing session may do autonomously and what
requires asking first, using Operating Model §3–§9 as the default and naming
any mission-specific tightening or loosening (with reasoning) here.
