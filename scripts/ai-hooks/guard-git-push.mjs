#!/usr/bin/env node
// PreToolUse guard for the Bash tool — autonomous `git push` scoping.
//
// `.claude/settings.json` keeps every `git push` in the `ask` tier. A glob
// allow rule cannot safely carve out "non-force push of a feature branch":
// a leading `*` absorbs arbitrary flags (`--mirror`, `--prune`) and a
// trailing `*` after `feature/` still absorbs a second refspec
// (`git push origin feature/x dev`), which would circumvent the DEV MERGE
// gate by landing code on `dev` without `scripts/ai-dev-merge.sh`.
//
// This hook does real token parsing and returns permissionDecision "allow"
// ONLY when the command is a plain, non-destructive push whose every target
// resolves to a sanctioned `feature/`-style branch on `origin`. Anything
// else falls through to the `ask` rule (a Founder prompt) — never a hard
// block, so a deliberate, explained push is still one confirmation away.
//
// Reference: docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md §9
// "Machine-enforced layer" (v1.8.0).

import { execSync } from "node:child_process";

const ALLOWED_BRANCH = /^(feature|feat|fix|chore|docs|harden|test|perf|refactor)\//;
const DANGER_FLAG =
  /^(--force|--force-with-lease.*|-f|--mirror|--prune|--delete|-d|--all|--tags|--follow-tags|--recurse-submodules=on-demand)$/;

let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    process.stdout.write("{}");
    return;
  }

  const command = input?.tool_input?.command ?? "";

  // Only weigh in on a single, simple `git push` invocation. If the command
  // is chained/piped/substituted, let the normal matcher handle each part.
  if (!/^\s*git\s+push\b/.test(command)) {
    process.stdout.write("{}");
    return;
  }
  if (/[;&|]|\$\(|`|>|<|\n/.test(command)) {
    process.stdout.write("{}");
    return;
  }

  const ask = (reason) =>
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: reason,
        },
      }),
    );

  const tokens = command.trim().split(/\s+/).slice(2); // drop "git push"
  const positionals = [];
  for (const t of tokens) {
    if (t === "--") continue;
    if (t.startsWith("-")) {
      if (DANGER_FLAG.test(t) || /^-[a-zA-Z]*[fd][a-zA-Z]*$/.test(t)) {
        ask(`git push flag '${t}' can force, delete, or mass-push refs — confirm manually.`);
        return;
      }
      continue; // a benign flag (e.g. -u, --set-upstream, --no-verify handled elsewhere)
    }
    positionals.push(t);
  }

  const remote = positionals[0];
  const refspecs = positionals.slice(1);

  if (remote && remote !== "origin") {
    ask(`git push targets remote '${remote}', not 'origin' — confirm manually.`);
    return;
  }

  const branchOk = (name) =>
    ALLOWED_BRANCH.test(name.replace(/^\+/, "").replace(/^refs\/heads\//, ""));

  const targets = [];
  if (refspecs.length === 0) {
    // No refspec: pushes the current branch (or configured push refspec).
    let head = "";
    try {
      head = execSync("git rev-parse --abbrev-ref HEAD", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      /* fall through to ask */
    }
    if (!head) {
      ask("could not resolve current branch for a no-refspec git push — confirm manually.");
      return;
    }
    targets.push(head);
  } else {
    for (const spec of refspecs) {
      if (spec.startsWith("+")) {
        ask(`git push refspec '${spec}' is a force push — confirm manually.`);
        return;
      }
      const [src, dst] = spec.split(":");
      // Destination decides where it lands; with no ':' src doubles as dst.
      targets.push(dst || src);
      targets.push(src);
    }
  }

  const bad = targets.find((t) => !branchOk(t));
  if (bad) {
    ask(
      `git push target '${bad}' is not a feature/feat/fix/chore/docs/harden/test/perf/refactor branch ` +
        `(e.g. dev or main) — this path is a Founder gate, confirm manually.`,
    );
    return;
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason:
          "Non-force push of a sanctioned feature-style branch to origin (GREEN tier, Operating Model §9).",
      },
    }),
  );
});
