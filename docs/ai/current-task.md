# LINE Business OS - Current Task Handoff

## 1. Current stage

Phase 1H Stage 5B - AI handoff context docs.

This is a documentation-only stage.

## 2. Current branch

Expected branch:

```text
feature/phase-1h-stage-5b-ai-handoff-context-docs
```

Base branch:

```text
dev
```

Latest known dev baseline before this stage:

```text
0975b9f Merge pull request #46 from tantik/feature/phase-1h-stage-5a-real-customer-onboarding-design
```

## 3. Goal

Create AI handoff documentation so ChatGPT, VS Code, Codex, future Cursor Agent, and other AI tools can understand the project faster and work with lower risk.

Files expected in this stage:

```text
docs/ai/project-context.md
docs/ai/current-task.md
```

## 4. Scope

Documentation only.

Allowed:

- create docs/ai/project-context.md;
- create docs/ai/current-task.md;
- document current architecture, workflow, safety rules, and current stage.

Forbidden:

- code changes;
- migrations;
- Supabase config changes;
- app changes;
- Cloud access;
- production/customer onboarding;
- service_role usage;
- secrets;
- real customer data;
- destructive SQL;
- billing changes;
- LINE broadcast;
- autonomous agent workflow implementation.

## 5. Current completed stages

Completed onboarding stages:

- Stage 4A: pure preflight aggregator;
- Stage 4B: report-only preflight CLI;
- Stage 4C: preflight before local dry-run;
- Stage 4D: preflight before local commit;
- Stage 4E: final operator report and cleanup UX;
- Stage 5A: real customer onboarding design/review document.

Current local dry-run chain:

```text
preflight
-> local transaction
-> rollback
-> final operator report
```

Current local commit chain:

```text
commit gates
-> preflight
-> backup artifact gate
-> local commit transaction
-> final operator report
```

## 6. Current manual workflow

Cursor Agent is paused because the monthly usage limit has been reached.

Current workflow:

```text
ChatGPT = CTO / Architect / Reviewer
VS Code = editor
PowerShell = execution
GitHub PR = control point
Cursor Agent = paused
Codex in VS Code = rare emergency tool only
```

Codex should not be used for this stage.

## 7. Validation commands for this stage

Run from repository root:

```text
git status --short
git --no-pager diff --check
```

Expected result:

```text
Only docs/ai/project-context.md and docs/ai/current-task.md should be new or modified.
diff check should print no errors.
```

Hidden/bidi Unicode scan:

```text
Run the current project-approved hidden/bidi Unicode scan from the active ChatGPT review instructions.
Expected result: NO_HIDDEN_OR_BIDI_UNICODE_FOUND.
```

Secret-like value scan:

```text
Run the current project-approved secret-like value scan from the active ChatGPT review instructions.
Expected result: NO_SECRET_LIKE_VALUES_FOUND.
Do not store suspicious token patterns directly in this handoff document.
```

Email/UUID scan:

```text
Run the current project-approved email/UUID scan from the active ChatGPT review instructions.
Expected result: NO_EMAIL_OR_UUID_FOUND.
```

Non-ASCII scan:

```text
Run the current project-approved non-ASCII scan from the active ChatGPT review instructions.
Expected result: NO_NON_ASCII_FOUND.
```

## 8. Commit commands

After validation passes:

```text
git add docs/ai/project-context.md docs/ai/current-task.md
git --no-pager diff --cached --stat
git --no-pager diff --cached --check
git commit -m "docs: add AI handoff context"
git push -u origin feature/phase-1h-stage-5b-ai-handoff-context-docs
```

## 9. PR

Open PR into:

```text
dev
```

PR title:

```text
docs: add AI handoff context
```

PR body:

```text
Summary:
This PR adds AI handoff context documents for LINE Business OS.

Scope:
Documentation only.

No code changes.
No migrations.
No Supabase config changes.
No app changes.
No Cloud access.
No production/customer onboarding.
No service_role usage.
No secrets.

Safety:
The documents define project context, current workflow, current stage, AI tool usage boundaries, and validation expectations.

Validation:
- git diff check passed
- hidden/bidi scan passed
- secret-like value scan passed
- email/UUID scan passed
- non-ASCII scan passed
```

## 10. Merge policy

Do not merge until reviewed.

After merge:

```text
git checkout dev
git pull origin dev
git log -1 --oneline
git status --short
git branch -d feature/phase-1h-stage-5b-ai-handoff-context-docs
git push origin --delete feature/phase-1h-stage-5b-ai-handoff-context-docs
```

## 11. Next expected stage

Recommended next stage:

```text
Phase 1H Stage 5C - AI agent roles and review modes
```

Expected file:

```text
docs/ai/agent-roles.md
```

That stage should define role-based review modes, not a fully autonomous multi-agent system.