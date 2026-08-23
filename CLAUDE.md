# CLAUDE.md - LINE Business OS

Pointer only. This file does not duplicate detailed project rules. Rule changes belong in AGENTS.md and .cursor/rules/* first.

## What this is

LINE Business OS is a single multi-tenant SaaS platform for Japanese SMBs.
Every product runs as a module inside one shared Core, never as an isolated project.

## Source of truth - read in this order

1. AGENTS.md - operating rules for AI agents and contributors.
2. docs/ai/oaes-project-profile.md - OAES stages, roles, artifacts, and approval gates for this repository.
3. docs/ai/current-task.md - current verified stage and next gate.
4. docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md - how a Claude Code session runs a mission: autonomy boundaries, context management, subagent use, evidence discipline, mission/handoff/completion-report formats. Adds no new rules; defers to the sources above and below on what is allowed.
5. .cursor/rules/* - machine-enforced guardrails for architecture, security, database/RLS, git workflow, AI-agent workflow, and legacy-migration boundaries.
6. docs/architecture/* - architecture detail.
7. docs/security/* - security requirements.
8. docs/operations/deployment-checklist.md - deployment and release safety.

If anything here ever conflicts with those sources, the sources above win.

## Founder communication language

Default language for all Founder-facing communication (explanations,
questions, plans, reports, approval requests, error/risk descriptions,
relayed subagent findings) is **Russian**. Code, identifiers, filenames,
commands, and other machine-readable content are never machine-translated.
Full rule and exceptions: AGENTS.md "Founder communication language".

## Highest-risk constraints

- Never expose service_role to the frontend or bundle it into apps/web.
- Never run Supabase Cloud writes such as db push, db pull, link, or migration repair without explicit human approval.
- Never run a production deploy without explicit human approval.
- Never touch customer data, billing, or LINE broadcast/mass messaging without explicit human approval.

## Changing rules

Make rule changes in AGENTS.md and .cursor/rules/*, not by expanding this file.
Keep .claude/ guardrails, including CLAUDE.md, .claude/settings.json, and .claude/skills/*, in sync with those sources. Do not let them drift.
