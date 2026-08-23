#!/usr/bin/env bash
# ai-dev-merge.sh — deterministic guardrail for AI CTO autonomous merges.
#
# Enforces, mechanically, before ever calling `gh pr merge`:
#   1. PR exists
#   2. base branch is exactly "dev" (never main, never anything else)
#   3. PR is not a draft
#   4. PR state is OPEN
#   5. PR is mergeable, with no conflicts and no force operation required
#   6. every required CI check has passed (none failing, none pending)
#   7. no changed file touches a known RED-operation path (migrations,
#      secrets, env files, key/cert material)
#
# Judgment gates that cannot be mechanically verified from PR metadata
# (implementation complete, CTO review, Independent Reviewer PASS where
# required, no unresolved blocking review findings) are the Lead Agent's
# responsibility to confirm BEFORE invoking this script — see
# docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md §9 "DEV MERGE".
#
# This script only ever merges into `dev`. It has no flag or code path that
# can target `main` or any other branch — that restriction is not a runtime
# check that a caller could argue around, it is structural.
#
# Uses gh's own built-in `-q` JSON query (no external jq dependency).

set -euo pipefail

PR="${1:-}"

if [[ ! "$PR" =~ ^[0-9]+$ ]]; then
  echo "BLOCK: usage: ai-dev-merge.sh <PR_NUMBER> (numeric PR number only)" >&2
  exit 1
fi

echo "== ai-dev-merge guardrail: PR #$PR =="

if ! gh pr view "$PR" >/dev/null 2>&1; then
  echo "BLOCK: could not read PR #$PR (does it exist?)." >&2
  exit 1
fi

base="$(gh pr view "$PR" --json baseRefName -q .baseRefName)"
if [[ "$base" != "dev" ]]; then
  echo "BLOCK: PR #$PR base branch is '$base', not 'dev'. This script never merges into any branch other than dev — main/production merges require direct Founder action." >&2
  exit 1
fi

is_draft="$(gh pr view "$PR" --json isDraft -q .isDraft)"
if [[ "$is_draft" == "true" ]]; then
  echo "BLOCK: PR #$PR is a draft." >&2
  exit 1
fi

state="$(gh pr view "$PR" --json state -q .state)"
if [[ "$state" != "OPEN" ]]; then
  echo "BLOCK: PR #$PR state is '$state', not OPEN." >&2
  exit 1
fi

mergeable="$(gh pr view "$PR" --json mergeable -q .mergeable)"
if [[ "$mergeable" != "MERGEABLE" ]]; then
  echo "BLOCK: PR #$PR mergeable state is '$mergeable' (conflicts or unknown) — cannot auto-merge without a force/manual resolution." >&2
  exit 1
fi

merge_state_status="$(gh pr view "$PR" --json mergeStateStatus -q .mergeStateStatus)"
if [[ "$merge_state_status" == "DIRTY" || "$merge_state_status" == "BLOCKED" ]]; then
  echo "BLOCK: PR #$PR mergeStateStatus is '$merge_state_status'." >&2
  exit 1
fi

red_paths_regex='(^|/)(supabase/migrations/|\.env|backups/)|\.pem$|\.key$'
red_hit="$(gh pr view "$PR" --json files -q '.files[].path' | grep -E "$red_paths_regex" || true)"
if [[ -n "$red_hit" ]]; then
  echo "BLOCK: PR #$PR touches RED-operation path(s), requires Founder approval:" >&2
  echo "$red_hit" >&2
  exit 1
fi

checks_count="$(gh pr checks "$PR" --json name -q 'length')"
if [[ "$checks_count" -eq 0 ]]; then
  echo "BLOCK: PR #$PR has no CI checks reported — cannot confirm required checks PASS." >&2
  exit 1
fi

not_passing="$(gh pr checks "$PR" --json name,bucket -q '.[] | select(.bucket != "pass") | .name')"
if [[ -n "$not_passing" ]]; then
  echo "BLOCK: PR #$PR has non-passing checks:" >&2
  echo "$not_passing" >&2
  exit 1
fi

echo "All mechanical gates PASS: base=dev, not draft, OPEN, MERGEABLE, $checks_count check(s) all pass, no RED-operation paths touched."
echo "Merging PR #$PR into dev (squash)..."
gh pr merge "$PR" --squash
echo "Merged PR #$PR into dev."
