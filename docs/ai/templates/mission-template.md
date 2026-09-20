# Mission: <short title>

Governed by [`docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`](../ORUWA_AI_ENGINEERING_OPERATING_MODEL.md).
Fill in every section; delete none. If a section genuinely does not apply,
write "None" and say why in one clause.

## Objective

One sentence: the outcome this mission produces.

## Prompt Review

Only when the mission came from an external brief (ChatGPT or any party
without repository access), per Operating Model §18. Otherwise write "None —
Founder-originated" and continue.

- **Verdict:** ACCEPT / ACCEPT WITH AMENDMENTS / REJECT / NEEDS FOUNDER DECISION.
- **Facts checked:** each repository fact the brief asserted, marked VERIFIED
  (with evidence) or ASSUMED.
- **Discrepancies:** brief said / repository shows / amendment.
- **Coverage dimensions the brief omitted:** (from §19).
- **Better approach, if any:**

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

## Coverage matrix (planned)

Operating Model §19. Fill in **every** row at planning time. Each row is
VERIFIED-by-plan (say how), N/A (one-clause reason), or NOT TESTED (then it
needs a `DEBT-###` row and a trigger before the mission can close). Silence is
not allowed.

| # | Dimension | Status and plan |
|---|---|---|
| 1 | Tenant and location isolation | |
| 2 | Roles and permissions (Manager, Staff, no-role; negatives) | |
| 3 | Live role QA (real session per role, one real mutation per role) | |
| 4 | JA and EN (both toggled, empty/error text, fixed-locale formatting) | |
| 5 | Viewports 320 / 375 / 768 / 1440 | |
| 6 | States (loading, empty, error, denied, module-off, double-submit) | |
| 7 | Data realism (0/1/many, long values, timezones, QA data cleanup) | |
| 8 | Accessibility and keyboard (focus trap, focus restore, Escape) | |
| 9 | Performance (instrumented, duplicate requests) | |
| 10 | Design system (`@line-os/ui` reuse, no new legacy theme) | |
| 11 | Security and privacy | |
| 12 | Compatibility and rollout (additive, rollback, entitlements, Cloud gate) | |
| 13 | Extension impact (second vertical/tenant/location/language) | |
| 14 | Neighbouring regressions | |
| 15 | Docs and state (handoff, current-task §5, debt register, test list) | |

## Extension impact

Which reusable capability this belongs to; what a second vertical or tenant
would need from it; anything Cafe-specific that must become configuration or
data instead of code (Core Laws: configuration over forks).

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
