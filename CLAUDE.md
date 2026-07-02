# CLAUDE.md - LINE Business OS

Pointer only. This file does not duplicate detailed project rules. Rule changes belong in AGENTS.md and .cursor/rules/* first.

## What this is

LINE Business OS is a single multi-tenant SaaS platform for Japanese SMBs.
Every product runs as a module inside one shared Core, never as an isolated project.

## Source of truth - read in this order

1. AGENTS.md - operating rules for AI agents and contributors.
2. .cursor/rules/* - machine-enforced guardrails for architecture, security, database/RLS, git workflow, AI-agent workflow, and legacy-migration boundaries.
3. docs/architecture/* - architecture detail.
4. docs/security/* - security requirements.
5. docs/operations/deployment-checklist.md - deployment and release safety.

If anything here ever conflicts with those sources, the sources above win.

## Highest-risk constraints

- Never expose service_role to the frontend or bundle it into apps/web.
- Never run Supabase Cloud writes such as db push, db pull, link, or migration repair without explicit human approval.
- Never run a production deploy without explicit human approval.
- Never touch customer data, billing, or LINE broadcast/mass messaging without explicit human approval.

## Changing rules

Make rule changes in AGENTS.md and .cursor/rules/*, not by expanding this file.
Keep .claude/ guardrails, including CLAUDE.md, .claude/settings.json, and .claude/skills/*, in sync with those sources. Do not let them drift.
