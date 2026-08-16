---
name: linebos-pre-pr-verify
description: Pre-PR verification checklist for LINE Business OS changes.
disable-model-invocation: true
---

# Pre-PR Verification - LINE Business OS

Human-invoked checklist. Never run Supabase Cloud commands or production deploys from this skill.

## Steps

1. Check the current branch with git branch --show-current. Confirm it is a feature branch off dev, never main.
2. Check working tree status with git status --short.
3. Inspect the diff stat with git diff --stat to see which files changed.
4. Based on the affected files, run the appropriate local checks. Do not run all checks unconditionally:
   - pnpm typecheck or pnpm exec turbo run typecheck for TypeScript changes.
   - pnpm lint for lint-sensitive changes.
   - pnpm test for logic or behavior changes.
   - pnpm build for build-affecting changes.
5. Only run checks relevant to the changed files. Ask first only if a check installs dependencies, resets a local database, uses an external service, or crosses another approval boundary in `docs/ai/oaes-project-profile.md`.

## Report

Produce a report with these fields, per .cursor/rules/03-git-workflow.mdc:

- Scope - what changed and why.
- Files changed - from the diff stat.
- Build/lint/test status - only for checks actually run; state clearly if a check was skipped or not run.
- Security impact - tenant isolation, service_role exposure, PII, LINE webhook verification, AI propose/approve/apply.
- Migration impact - new or changed migrations, RLS, rollback considerations.
- Tenant isolation impact - any change to tenant_id, location_id, or RLS scoping.
- Rollback note - how to revert this change if needed.

## Hard limits

- Never run supabase link, supabase db push, supabase db pull, supabase migration repair, or any production deploy command.
- Never push to main.
- Local read-only checks are allowed. Installing packages, resetting a local database,
  executing migrations, or touching Supabase Cloud requires explicit human approval.
