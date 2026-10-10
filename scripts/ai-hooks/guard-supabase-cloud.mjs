#!/usr/bin/env node
// PreToolUse guard for the Bash tool — pre-release Cloud DEV autonomy.
//
// Founder decision 2026-10-10 (Operating Model §9 "Pre-release Cloud DEV
// authority"): until the production release the Lead Agent deploys Edge
// Functions and applies migrations to Cloud DEV itself, with verification
// before and after. Production stays a hard Founder gate.
//
// `.claude/settings.json` keeps `supabase functions deploy` / `supabase db
// push` / `pnpm db:migrate` in the `ask` tier and hard-denies any command that
// names the production project ref. A glob rule cannot tell which project a
// command targets (db push follows the local link), so this hook does real
// parsing and returns "allow" ONLY for:
//
//   - `[pnpm exec] supabase functions deploy <name> --project-ref <DEV_REF>`
//     (one named function, never a deploy-everything, never `liff-entry`);
//   - `[pnpm exec] supabase db push [--dry-run] [--include-all] [--linked]
//     [--yes]` or `pnpm db:migrate [same flags]`, when the repo's local link
//     (supabase/.temp/project-ref) is DEV_REF.
//
// Allowed forms must be a single plain invocation from the session cwd: no
// `cd` prefix, env-var assignment, quotes, `$`, chaining or redirection
// (independent review 2026-10-10 showed each could retarget the CLI).
// Production ref anywhere in the command (also after stripping quotes) →
// "deny". Anything else mentioning these commands → "ask" (a Founder prompt).

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEV_REF = "pehcoenozjtsjdvjietj";
const PROD_REF = "jsgmmsdkuptdsxtcxhsv";
const NEVER_DEPLOY = new Set(["liff-entry"]);

const decide = (permissionDecision, permissionDecisionReason) =>
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision,
        permissionDecisionReason,
      },
    }),
  );

const linkedRef = () => {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return readFileSync(join(root, "supabase", ".temp", "project-ref"), "utf8").trim();
  } catch {
    return "";
  }
};

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

  // Shell quoting/escaping can split the ref (`jsgm""mds…`), so also compare
  // with quotes and backslashes stripped.
  if (command.includes(PROD_REF) || command.replace(/['"\\`^]/g, "").includes(PROD_REF)) {
    decide("deny", "Command names the PRODUCTION Supabase project — production is a Founder-only gate.");
    return;
  }

  // Broad detection: any mention, including global flags before the
  // subcommand (`supabase --workdir x db push`), must at least reach "ask".
  const isDeploy = /\bsupabase\b[\s\S]*\bfunctions\b[\s\S]*\bdeploy\b/.test(command);
  const isPush =
    /\bsupabase\b[\s\S]*\bdb\b[\s\S]*\bpush\b/.test(command) || /\bdb:migrate\b/.test(command);
  if (!isDeploy && !isPush) {
    process.stdout.write("{}");
    return;
  }

  // Allow-listed forms are a single plain invocation from the session's cwd:
  // no `cd` prefix (the CLI would read a different project link), no env-var
  // assignments, quoting, expansion, chaining or redirection.
  const body = command.trim();
  if (/[;&|<>`$'"\\%^\r\n(){}]/.test(body)) {
    decide("ask", "Supabase Cloud command with shell metacharacters, quoting or chaining — confirm manually.");
    return;
  }
  const tokens = body.split(/\s+/);
  if (tokens.some((t) => t.includes("=") && !t.startsWith("--"))) {
    decide("ask", "Supabase Cloud command with an environment/assignment token — confirm manually.");
    return;
  }

  let i = 0;
  if (tokens[0] === "pnpm" && tokens[1] === "exec") i = 2;

  if (isDeploy) {
    if (tokens[i] !== "supabase" || tokens[i + 1] !== "functions" || tokens[i + 2] !== "deploy") {
      decide("ask", "Unrecognised functions-deploy form — confirm manually.");
      return;
    }
    const rest = tokens.slice(i + 3);
    const names = [];
    let ref = "";
    for (let k = 0; k < rest.length; k++) {
      const t = rest[k];
      if (t === "--project-ref") ref = rest[++k] ?? "";
      else if (t.startsWith("--project-ref=")) ref = t.slice("--project-ref=".length);
      else if (t === "--no-verify-jwt" || t === "--import-map" || t === "--use-api" || t === "--use-docker") {
        decide("ask", `functions deploy flag '${t}' changes how the function is built or secured — confirm manually.`);
        return;
      } else if (t.startsWith("-")) {
        decide("ask", `Unrecognised functions-deploy flag '${t}' — confirm manually.`);
        return;
      } else names.push(t);
    }
    if (ref !== DEV_REF) {
      decide("ask", `functions deploy must name --project-ref ${DEV_REF} (Cloud DEV) explicitly — confirm manually.`);
      return;
    }
    if (names.length !== 1 || NEVER_DEPLOY.has(names[0])) {
      decide("ask", "Deploy exactly one named function (never all, never liff-entry) — confirm manually.");
      return;
    }
    decide("allow", `Edge Function '${names[0]}' deploy to Cloud DEV (pre-release Cloud DEV authority, Operating Model §9).`);
    return;
  }

  // db push / db:migrate — exact shapes only.
  let rest;
  if (tokens[i] === "supabase" && tokens[i + 1] === "db" && tokens[i + 2] === "push") rest = tokens.slice(i + 3);
  else if (i === 0 && tokens[0] === "pnpm" && tokens[1] === "db:migrate") rest = tokens.slice(2);
  else {
    decide("ask", "Unrecognised db push form — confirm manually.");
    return;
  }
  if (rest.some((t) => !t.startsWith("-"))) {
    decide("ask", "db push with positional arguments — confirm manually.");
    return;
  }
  const flags = rest;
  const okFlag = (t) => t === "--dry-run" || t === "--include-all" || t === "--linked" || t === "--yes";
  const bad = flags.find((t) => !okFlag(t));
  if (bad) {
    decide("ask", `db push flag '${bad}' is outside the autonomous set (--dry-run, --include-all, --linked, --yes) — confirm manually.`);
    return;
  }
  const ref = linkedRef();
  if (ref !== DEV_REF) {
    decide(
      ref === PROD_REF ? "deny" : "ask",
      ref === PROD_REF
        ? "Local Supabase link points at PRODUCTION — db push is a Founder-only gate."
        : `Local Supabase link is '${ref || "unknown"}', not Cloud DEV (${DEV_REF}) — confirm manually.`,
    );
    return;
  }
  decide("allow", "Migration apply to linked Cloud DEV (pre-release Cloud DEV authority, Operating Model §9).");
});
