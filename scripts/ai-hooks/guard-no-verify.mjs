#!/usr/bin/env node
// PreToolUse guard for the Bash tool.
//
// .claude/settings.json denies any command containing the literal substring
// "--no-verify" so a `git commit`/`git push` cannot silently skip hooks.
// That glob-based deny cannot catch git's short-flag form: `-n` (alone, or
// combined with other single-letter flags, e.g. `-an`, `-na`) is documented
// git shorthand for `--no-verify` on `git commit`. This hook does real
// token parsing (a glob pattern cannot express "a short-flag cluster that
// contains the letter n") and falls back to asking the Founder rather than
// silently allowing a hook-skipping commit through the broader
// `Bash(git commit*)` allow rule. False positives (a flag that happens to
// contain "n" for an unrelated reason) just produce an extra confirmation
// prompt, never a silent skip and never a hard block.
//
// Reference: docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md v1.6.0,
// "Permission gap cleanup mission" changelog entry.

let data = "";
process.stdin.on("data", (chunk) => {
  data += chunk;
});

process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    process.stdout.write("{}");
    return;
  }

  const command = input?.tool_input?.command ?? "";
  const isGitCommit = /\bgit\s+commit\b/.test(command);

  if (isGitCommit) {
    const tokens = command.split(/\s+/);
    // A short-flag token (single leading dash, not double) that contains
    // the letter n anywhere is a candidate for combined -n / -an / -na etc.
    const skipsHooks = tokens.some((token) => /^-(?!-)[a-zA-Z]*n[a-zA-Z]*$/.test(token));

    if (skipsHooks) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason:
              "git commit command contains a short-flag token containing 'n' " +
              "(e.g. -n, -an, -na), which git treats as shorthand for " +
              "--no-verify. Confirm this is not intended to skip commit " +
              "hooks before proceeding.",
          },
        }),
      );
      return;
    }
  }

  process.stdout.write("{}");
});
