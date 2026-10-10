// node --test scripts/ai-hooks/guard-supabase-cloud.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const hook = join(here, "guard-supabase-cloud.mjs");
const DEV = "pehcoenozjtsjdvjietj";
const PROD = "jsgmmsdkuptdsxtcxhsv";

const run = (command) => {
  const r = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf8",
  });
  const out = JSON.parse(r.stdout || "{}");
  return out.hookSpecificOutput?.permissionDecision ?? "none";
};

const deploy = "supabase functions deploy";

test("DEV deploy of one named function is allowed", () => {
  assert.equal(run(`pnpm exec ${deploy} invite-employee --project-ref ${DEV}`), "allow");
  assert.equal(run(`${deploy} invite-employee --project-ref=${DEV}`), "allow");
});

test("production ref is denied anywhere, also when split by quoting", () => {
  assert.equal(run(`pnpm exec ${deploy} invite-employee --project-ref ${PROD}`), "deny");
  assert.equal(run(`pnpm exec supabase db push --db-url postgres://x@db.${PROD}.supabase.co`), "deny");
  const split = `${PROD.slice(0, 10)}""${PROD.slice(10)}`;
  assert.equal(run(`SUPABASE_PROJECT_ID=${split} supabase db push`), "deny");
  assert.equal(run(`SUPABASE_PROJECT_ID=${PROD.slice(0, 10)}\\${PROD.slice(10)} supabase db push`), "deny");
});

test("retargeting tricks never get allow (review 2026-10-10)", () => {
  assert.equal(run("SUPABASE_WORKDIR=/tmp/x supabase db push"), "ask");
  assert.equal(run("SUPABASE_PROJECT_ID=other supabase db push"), "ask");
  assert.equal(run("X=$P pnpm db:migrate"), "ask");
  assert.equal(run("cd ../other && supabase db push"), "ask");
  assert.equal(run(`cd D:/Dev/line-business-os && pnpm exec ${deploy} invite-employee --project-ref ${DEV}`), "ask");
  assert.equal(run(`${deploy} 'liff-entry' --project-ref ${DEV}`), "ask");
  assert.equal(run("supabase --workdir /tmp/x db push"), "ask");
  assert.equal(run(`supabase --workdir /tmp/x functions deploy invite-employee --project-ref ${DEV}`), "ask");
  assert.equal(run(`npx supabase@2 ${deploy.slice(9)} invite-employee --project-ref ${DEV}`), "ask");
  assert.equal(run("pnpm db:migrate -- --db-url postgres://x"), "ask");
  assert.equal(run("pnpm exec supabase db push --include-roles"), "ask");
  assert.equal(run("pnpm exec supabase db push extra"), "ask");
});

test("non-DEV-scoped or risky deploy forms fall back to ask", () => {
  assert.equal(run(`pnpm exec ${deploy} invite-employee`), "ask");
  assert.equal(run(`pnpm exec ${deploy} --project-ref ${DEV}`), "ask");
  assert.equal(run(`pnpm exec ${deploy} liff-entry --project-ref ${DEV}`), "ask");
  assert.equal(run(`pnpm exec ${deploy} a b --project-ref ${DEV}`), "ask");
  assert.equal(run(`pnpm exec ${deploy} invite-employee --project-ref ${DEV} --no-verify-jwt`), "ask");
  assert.equal(run(`pnpm exec ${deploy} invite-employee --project-ref ${DEV} && echo x`), "ask");
  assert.equal(run(`pnpm exec ${deploy} invite-employee --project-ref ${DEV}; ${deploy} x`), "ask");
});

test("db push: target overrides ask; linked-ref decides the rest", () => {
  assert.equal(run("pnpm exec supabase db push --db-url postgres://x"), "ask");
  assert.equal(run("pnpm exec supabase db push --local"), "ask");
  const refFile = join(here, "..", "..", "supabase", ".temp", "project-ref");
  const linked = existsSync(refFile) ? readFileSync(refFile, "utf8").trim() : "";
  const expected = linked === DEV ? "allow" : linked === PROD ? "deny" : "ask";
  assert.equal(run("pnpm exec supabase db push --dry-run"), expected);
  assert.equal(run("pnpm db:migrate"), expected);
});

test("unrelated commands are untouched", () => {
  assert.equal(run("git status"), "none");
  assert.equal(run("pnpm exec supabase migration list"), "none");
});
