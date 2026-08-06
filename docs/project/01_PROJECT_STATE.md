# ORUWA Project State

Status: **Living - evidence snapshot**

Verified: **2026-08-06**

<!-- AUTO:REPOSITORY_SNAPSHOT:START -->
## Automated repository snapshot

- Generated: 2026-08-06 14:35:36 +09:00.
- Checked-out branch: `dev`.
- HEAD: `52e801d02d39623422c91815ebbc56ab201bc7c7`.
- `origin/dev`: `52e801d02d39623422c91815ebbc56ab201bc7c7` - Merge pull request #195 from tantik/docs/project-state-staff-acceptance.
- Working tree: 4 tracked path(s) changed; 14 untracked path(s).
- Significant event: **FounderDecision** - Founder accepted ADR 0011: bounded Cafe v2.1 Preview audit exception.
- Evidence supplied by operator: Founder confirmation in project task on 2026-08-06; ADR 0011; full business audit events remain mandatory before Commercial Release.

Git identifiers above are repository evidence. Event meaning and evidence description are operator-supplied and must still obey the documentation hierarchy.
<!-- AUTO:REPOSITORY_SNAPSHOT:END -->

## Repository

- Project: ORUWA Business OS / LINE Business OS.
- Repository: `tantik/line-business-os`.
- Local path: `D:\Dev\line-business-os`.
- Integration branch: `dev`.
- Checked-out branch: `fix/cafe-v2-1-destructive-confirmations`.
- Local HEAD: `e2ae7baca3af1a06b9ee4ec1e454ac19643e94a1`.
- Verified `origin/dev`: `c078aa83ca121e0edee54f0e79d9c22adb1edb11`, merge of PR #186.

The checked-out branch points to PR #186's change commit and is one merge commit behind `origin/dev`. Do not infer a new task from the branch name.

## Current phase and task

Foundation v1.0 is Frozen. Cafe is the first active vertical. PR #185 (Cafe v2.1 Technical Baseline) and PR #186 (high-impact Manager confirmations) are merged. Cafe v2.1 is not yet fully accepted or commercially released.

Current task: close remaining Cafe v2.1 acceptance evidence gaps without starting Cafe v2.2 or Commercial Release work. See [`06_NEXT_TASK.md`](06_NEXT_TASK.md).

## Verified

- Foundation PR #184 merged at `3588a94`.
- PR #185 merged at `6d6c365`; its four-file Technical Baseline scope is present on `origin/dev`.
- PR #186 merged at `c078aa8`; its five-file confirmation scope is present on `origin/dev`.
- The Cafe v2.1 acceptance report explicitly says Cafe Freeze is not yet declared.
- Existing OAES Product Review and Architecture Review artifacts exist.
- No `docs/project/` equivalent existed before this task.

## Working tree outside this documentation task

The repository contains pre-existing untracked handoff, product/research documents, and `packages/db/src/types.generated.ts`. They are not part of this documentation change and must not be staged, restored, deleted, or rewritten implicitly.

## Pending or blocked

- Full Manager/Staff/Recipes acceptance matrix and critical regression smoke.
- Isolated authenticated Staff evidence.
- Remaining performance evidence, including Recipes.
- Live schedule-publish confirmation when an appropriate draft fixture exists.
- Founder decision on the P1-4 audit-logging conflict.
- Founder Freeze acceptance.
- [`docs/ai/current-task.md`](../ai/current-task.md) is stale (it still references PR #158) and was intentionally not changed because this task forbids editing it.

## Next milestone

Cafe Package v2.1 evidence-complete acceptance with honest PASS/FAIL/BLOCKED/N/A classification and the audit decision recorded. This is not the Cafe Commercial Release gate.

## Prohibited in the current documentation task

No app code, database, migrations, manifests, CI, `CLAUDE.md`, `AGENTS.md`, `.cursor/rules`, commit, push, PR, or merge. Do not touch pre-existing untracked files.
