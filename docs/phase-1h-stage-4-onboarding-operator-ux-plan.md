# Phase 1H Stage 4 — Local onboarding operator UX / safety wrapper (PLAN / REVIEW only)

> **Status: PLAN / REVIEW only. No code, migrations, Supabase config, tests, or
> new scripts are added by this document.** It inspects the existing onboarding
> tooling and proposes a staged plan for a safer, more ergonomic **local-only**
> operator workflow. Nothing here is executed. Cloud/prod onboarding is **out of
> scope**.

Read first for context:

- `docs/operations/client-onboarding-runbook.md` (esp. §12 procedure, §13 Stage
  3e execution report + §13.I hardened QA checklist).
- `docs/operations/backup-dr-runbook.md` (backup tool + freshness contract).
- `docs/operations/env-inventory.md` (env variable names, local vs Cloud).
- `docs/operations/incident-response-runbook.md`.
- `docs/phase-1-core-db.md` (local-first DB phase, command risk table).

Baseline: `dev` at merge commit `9f95d9a` (PR #39). Phase 1H Stage 3e is fully
closed: the **first real local owner onboarding** was executed and verified, and
the runbook was hardened. Stage 4 builds on that **without** changing any Stage
3c-4a/3c-4b gate, the dry-run rollback contract, or the commit semantics.

## Stage 4 goal

Design a **safer and more ergonomic local onboarding operator workflow** that
reduces manual mistakes. This is an **operator-safety / repeatability** effort,
**not** a new product feature. The recurring manual failure modes (all observed
or guarded in Stage 3e) it must reduce:

- local vs Cloud target confusion;
- stale PostgREST schema exposure (internal schemas leaking via the Data API);
- wrong Auth/Data API key type (Storage Access Key vs anon; never `service_role`);
- missing `pg_dump` on `PATH`;
- failed or stale backup artifact;
- relative backup artifact path;
- dry-run / commit sequencing;
- explicit commit flags;
- dashboard verification before and after onboarding;
- post-run cleanup (env restore, temp variable clearing).

---

## 1. Current state

### 1.1 Onboarding CLI / script entrypoints (all `packages/db/scripts/`)

- **`onboard-tenant.ts`** — the operator entrypoint and **driver-free** router.
  Contains the pure validators/planner (`parseOnboardingInput`,
  `buildOnboardingPlan`, `redactOnboardingSummary`), the CLI arg parser
  (`parseOnboardingCliArgs`), the mode resolver (`resolveOnboardingMode`), the
  **strict commit gates** (`validateCommitGates`), the **local DB guard**
  (`assertLocalDatabaseUrl`), the routing function (`runOnboardingCli`), and the
  thin `main` wrapper. Reaches the DB-touching modules only via lazy imports.
- **`onboard-db.ts`** — the **read-only**, local-only state loader
  (`loadExistingOnboardingState`, `openLocalReadConnection`,
  `withLocalReadConnection`) with a SELECT-only query catalog
  (`ONBOARD_DB_QUERIES`). Pins the session read-only; never writes.
- **`onboard-write.ts`** — write **SQL builders** + executor
  (`executeOnboardingWritePlan`, `validateWritablePlanOrThrow`,
  `prepareOwnerEmailPII`) and the **local dry-run transaction** that **always
  `ROLLBACK`s** (`runOnboardingDryRunTransactionFromEnv` /
  `withLocalDryRunTransaction`). Permanently `COMMIT`-free.
- **`onboard-commit.ts`** — the **only** file that carries the transaction-
  finalizing `commit` token (`runOnboardingCommitTransactionFromEnv`,
  `withLocalCommitTransaction`, `ONBOARD_COMMIT_TX_SQL`). Local-only, gated,
  commits only when something changed, otherwise rolls back as a no-op.
- **`onboard-backup-gate.ts`** — pure **backup-artifact validation**
  (`validateBackupArtifactForCommit`): metadata-only freshness / name / size /
  extension checks. Never reads, decrypts, or uploads the file.
- **`backup.ts`** — the encrypted `pg_dump` backup tool (`pnpm db:backup`);
  exports the canonical `BACKUP_FILENAME_REGEX` reused by the gate.
- **`seed.ts`** — local seed (not part of onboarding, listed for completeness).

### 1.2 Package scripts relevant to onboarding / backup / checks / tests

Root `package.json`:

- `db:onboard-tenant` → `pnpm --filter @line-os/db onboard-tenant`
- `db:backup` → `pnpm --filter @line-os/db backup`
- `db:start` / `db:stop` / `db:status` (local stack lifecycle)
- `db:reset` → `supabase db reset` (**destructive; not used in Stage 4**)
- `db:migrate` → `supabase db push` (**not used in Phase 1 local-first**)
- `db:seed`, `db:diff`, `db:test`, `test`, `lint`, `typecheck`, `build`

`packages/db/package.json`:

- `onboard-tenant`, `backup`, `seed`, `gen:types`
- `test` → runs the six `node --test` suites listed in §1.4
- `lint`, `typecheck`

### 1.3 Existing helper modules by responsibility

| Responsibility | Where it lives today |
| -------------- | -------------------- |
| Local DB guard | `assertLocalDatabaseUrl` in `onboard-tenant.ts` (loopback host + port 54322; rejects `*.supabase.co` / `*.pooler.supabase.com`) |
| State loader | `loadExistingOnboardingState` / `openLocalReadConnection` in `onboard-db.ts` (SELECT-only, read-only session) |
| SQL builders | `ONBOARD_WRITE_SQL` / `executeOnboardingWritePlan` in `onboard-write.ts` |
| Dry-run transaction | `runOnboardingDryRunTransactionFromEnv` / `withLocalDryRunTransaction` in `onboard-write.ts` (always `ROLLBACK`) |
| Commit gate | `validateCommitGates` (pure flags) in `onboard-tenant.ts`; the gated transaction in `onboard-commit.ts` |
| Backup artifact validation | `validateBackupArtifactForCommit` in `onboard-backup-gate.ts` |
| Audit logging | changed-only audit writes inside `executeOnboardingWritePlan` (`onboard-write.ts`); system actor, redacted metadata |
| Output / reporting | `redactOnboardingSummary` + the `lines`/`errors` assembled by `runOnboardingCli` in `onboard-tenant.ts` |

### 1.4 Existing tests + docs

- Tests: `onboard-tenant.test.ts`, `onboard-db.test.ts`, `onboard-write.test.ts`,
  `onboard-backup-gate.test.ts`, `onboard-commit.test.ts`, `backup.test.ts`
  (all `node --import tsx --test`, fake `QueryRunner`/`Client`, **no real DB**).
- Docs: the four operations runbooks listed at the top, plus the phase docs.

---

## 2. Problem (why Stage 4 is needed after Stage 3e)

Stage 3e proved the **local onboarding path is usable end-to-end** and is
strictly gated **at commit time**. But it also surfaced that **everything around
the commit is still a manual, human-followed checklist** (`§13.I`). The CLI
enforces the commit flags, the local URL guard, and the backup artifact gate —
but the operator must still, by hand and in the right order:

- confirm the local Supabase stack exposes only the **safe `api` facade**
  (`PGRST_DB_SCHEMAS=public,api`), because Stage 3e found a **stale** runtime
  state exposing internal schemas through the Data API;
- confirm `NEXT_PUBLIC_SUPABASE_URL` points at **local**, not Cloud (host only,
  never printing keys);
- confirm the right **anon/publishable** key type (not the Storage Access Key,
  never `service_role`);
- confirm `pg_dump` is on `PATH` (Stage 3e backup initially failed because it
  was not);
- create a **fresh** backup and pass its **absolute** path (a relative path
  caused a real failed-commit safety case in Stage 3e §13.E);
- run a **dry-run first** and eyeball that every tracked-table delta is zero;
- verify the dashboard **empty state before** and **active tenant after**;
- perform **cleanup** (restore the Cloud web env, clear `DATABASE_URL`,
  `PGPASSWORD`, `BACKUP_ENCRYPTION_KEY`, and temp shell variables).

Each manual step is a place a tired operator can make a mistake — and several of
these are **safety-critical** (Cloud target confusion, internal schema exposure,
secret handling). Stage 4 reduces that manual surface by turning the
human checklist into a **guided, fail-safe, local-only operator wrapper** while
keeping every existing gate and the dry-run/commit contracts unchanged. This is
about **repeatability and safety**, not new features.

---

## 3. MVP solution (smallest safe Stage 4)

A **local-only preflight + guided wrapper** that runs the existing checklist for
the operator and **fails closed** before any DB interaction. Smallest viable
shape:

- A **local-only operator command** (a new `db:onboard` preflight/wrapper that
  composes the existing modules; it does **not** replace `onboard-tenant.ts`).
- **Explicit target confirmation**: requires `--target local`; reuses
  `assertLocalDatabaseUrl`; refuses anything Cloud-like, never echoing the bad
  value.
- A **preflight checklist** that aggregates the existing pure guards into a
  single pass/fail report (local URL guard, backup artifact freshness,
  `pg_dump` availability probe, `NEXT_PUBLIC_SUPABASE_URL` host-only check,
  PostgREST exposed-schema check).
- **Backup artifact validation** via the existing `onboard-backup-gate.ts`
  (metadata only).
- **Absolute path enforcement** for `--backup-artifact` (reject relative paths
  up front with a clear message, before the freshness check).
- **Dry-run first**: the wrapper runs (or requires) a dry-run and confirms zero
  deltas before it will offer the commit step.
- **Commit only with explicit flags**: unchanged from Stage 3c-4b
  (`--commit --yes --i-understand-this-writes-local-db --backup-artifact
  <abs path> --target local`).
- A **structured final report** (redacted, no PII/secrets/UUIDs), reusing the
  redaction discipline already in place.
- **Cleanup reminders** printed at the end (env restore + temp variable list).

MVP keeps all I/O behind the **existing** helpers and adds only orchestration +
a structured report. No new SQL, no new transaction control, no schema changes.

---

## 4. Professional solution (cleaner, still local-only)

A tidier implementation suitable for real SaaS operations later, but still
local-only for now:

- A **structured preflight result object** (`PreflightReport`) with one entry
  per check: `{ id, title, status: 'pass' | 'fail' | 'skip', detail }`, where
  `detail` is always redacted (host-only, basename-only, booleans, counts).
- **Reusable safety-check modules**: each check is a small pure function with
  **injectable dependencies** (env reader, `statSync`, a `pg_dump --version`
  probe, a PostgREST schema probe) so they are unit-testable without real I/O —
  mirroring the existing fake-`QueryRunner` pattern.
- A **machine-readable JSON report** (opt-in `--report-json <path>`) alongside
  the human lines, for future automation and audit, containing only safe fields.
- **Stronger negative tests** (see §8) covering every failure mode as an
  expected, zero-side-effect outcome.
- An **operator run id** (a random, non-identifying token generated per run)
  threaded through the human + JSON report to correlate preflight → dry-run →
  commit lines for one session. It is **not** PII and must not embed identity.
- **Improved docs links**: the wrapper prints the relevant runbook section
  anchors (e.g. backup §12.C, cleanup §13.H) next to each failed check.

Still **no** Cloud, **no** `service_role`, **no** internal-schema exposure, and
**no** change to the commit/rollback contracts.

---

## 5. Scalable solution (what must exist *before* real Cloud/prod onboarding)

**Do not implement in Stage 4.** Real Cloud/prod customer onboarding is a
separate, future, explicitly-approved program. Before it can happen, at minimum:

- a **separate approved design** (its own phase doc + ADR), not an extension of
  this local runbook;
- **backup and rollback** that are proven against the Cloud target (the current
  backup tool is local and has **no restore**);
- an **audit / privacy / legal review** (PII handling, data residency, consent);
- **stricter access controls** (least-privilege operator credentials, scoped and
  time-boxed);
- explicit **human approval** as a hard gate per onboarding run;
- **no frontend `service_role`** — ever (anon key + RLS only in `apps/web`);
- **no internal schema exposure** — the Data API exposes only the safe `api`
  facade (`public,api`); `core/audit/workforce/booking/ai` stay internal;
- **tenant isolation verification** as an automated, repeatable check (a
  non-member must never see another tenant's data; RLS proven, not assumed).

This section is a guardrail list, not a task list.

---

## 6. Proposed files for future implementation

Indicative only — to be confirmed at implementation time.

**Likely code files (additive; existing modules reused, not rewritten):**

- `packages/db/scripts/onboard-preflight.ts` — new pure preflight aggregator +
  check modules (composes existing guards).
- `packages/db/scripts/onboard-tenant.ts` — *minimal additive* wiring only (e.g.
  an optional preflight branch / `--preflight`); the existing routing, gates,
  and redaction stay intact.
- `packages/db/package.json` — add a preflight/wrapper script entry.
- `package.json` (root) — add a `db:onboard` (or `db:onboard-preflight`) script.

**Likely test files:**

- `packages/db/scripts/onboard-preflight.test.ts` — pure, fake-dependency tests
  incl. the negative cases in §8.

**Likely docs files:**

- `docs/operations/client-onboarding-runbook.md` — document the wrapper and map
  each preflight check to the existing §13.I checklist items.
- `docs/phase-1h-stage-4-onboarding-operator-ux-plan.md` — this plan (status
  updates only).
- `docs/operations/env-inventory.md` — only if a new safe env variable **name**
  is introduced (placeholders only).

**Files that MUST NOT be touched in Stage 4:**

- `supabase/migrations/**` — no migrations.
- `supabase/config.toml` and any Supabase config — no config changes.
- `apps/web/**` — no `service_role`, no app changes for this ops tooling.
- `onboard-commit.ts` commit semantics — the single-`COMMIT` contract is frozen;
  at most consume its existing API.
- `onboard-write.ts` dry-run/rollback contract — must remain `COMMIT`-free.
- Anything that would alter existing tests' guarantees (extend, never weaken).

---

## 7. Safety gates (exact checks a future implementation must include)

Each gate must **fail closed** and produce **zero side effects** on failure.

1. **`git status` clean before run** — refuse to run a commit path with a dirty
   tree (onboarding must change no tracked files).
2. **Local target guard** — `--target local` required; `assertLocalDatabaseUrl`
   passes (loopback host + port 54322); Cloud-like hosts rejected, value never
   echoed.
3. **Local PostgREST schema check** — the local Data API exposes only
   `public,api` (`PGRST_DB_SCHEMAS=public,api`); a stale internal-schema list
   fails the gate with a restart hint.
4. **`NEXT_PUBLIC_SUPABASE_URL` host-only check** — confirm the intended host
   (local for testing); **host/origin only, never print keys**.
5. **No `service_role`** — assert no `service_role` key is present in the
   environment used by the wrapper; never read/print it.
6. **`pg_dump` available** — `pg_dump --version` succeeds (probe only).
7. **Fresh backup artifact exists** — passes
   `validateBackupArtifactForCommit` (exists, regular, non-empty, canonical
   `linebos-YYYYMMDD-HHmmss.dump.enc` name, modified within 24h).
8. **Backup path is absolute** — reject a relative `--backup-artifact` before
   the freshness check (the Stage 3e §13.E failure mode).
9. **Dry-run deltas are zero** — a preceding dry-run leaves every tracked table
   delta at 0 (counts only; never rows/ids/PII).
10. **Failed commit gate → zero deltas** — any blocked/failed commit leaves all
    deltas at 0 (gate runs before any DB interaction).
11. **Commit expected deltas** — a real first commit persists exactly the §12.F
    deltas (`+1` tenant/user/location/membership/role_assignment, `+2`
    tenant_modules, `+8` audit rows for `core,workforce`, no email).
12. **Dashboard empty state before onboarding** — owner with no membership sees
    *No workspace yet* via the `api` facade.
13. **Dashboard active tenant after onboarding** — owner sees the active tenant
    via the `api` facade (anon key + RLS), no internal schema read.
14. **Cleanup: env restore + temp var clearing** — restore the Cloud web env;
    clear `DATABASE_URL`, `PGPASSWORD`, `BACKUP_ENCRYPTION_KEY` and the temp
    shell variables; verify `git status` clean afterward.

---

## 8. Testing plan (for a later implementation stage)

All tests stay **pure** (fake env/`fs`/probe dependencies; no real DB, no real
Cloud), matching the existing fake-`QueryRunner`/`Client` pattern. Every test
must also assert the output **never** contains an email, a UUID, a key/JWT, the
`DATABASE_URL`, or the backup encryption key.

Positive: a fully-passing preflight produces an all-`pass` report; a clean
dry-run reports zero deltas; the commit report matches the §12.F deltas.

Negative cases (each must fail closed with **zero side effects**):

- **Stale PostgREST schema** — exposed-schema probe returns the internal-schema
  list → fail with restart hint, no connection.
- **Cloud-looking target** — `*.supabase.co` / `*.pooler.supabase.com` host →
  rejected; value never echoed.
- **Missing backup** — artifact path missing/not found → fail.
- **Relative backup path** — non-absolute `--backup-artifact` → fail before the
  freshness check.
- **Failed backup** — empty/zero-byte or non-regular artifact → fail.
- **Missing `pg_dump`** — version probe throws → fail with a PATH hint.
- **Wrong key type** — Storage Access Key (or any non-anon) where anon is
  required, or any `service_role` present → fail; never print the key.
- **Dry-run persistence attempt** — dry-run path must remain `COMMIT`-free and
  report rolled-back / nothing persisted (guard against any future regression).
- **Commit without explicit flags** — missing any of
  `--commit/--yes/--i-understand-this-writes-local-db/--backup-artifact/
  --target local` → refuse before any DB interaction.
- **Dashboard not showing tenant after commit** — verification step records a
  `fail` (and the run report flags it) rather than silently passing.

---

## 9. Risks and mitigations

| Risk | Mitigation |
| ---- | ---------- |
| **Accidental Cloud write** | Keep `assertLocalDatabaseUrl` + `--target local` as hard, pre-connection gates; add the `NEXT_PUBLIC_SUPABASE_URL` host-only and PostgREST exposed-schema checks; never add a Cloud code path in this stage. |
| **Secret exposure** | Reuse the existing redaction discipline: host-only, basename-only, booleans/counts; never read or print keys, `DATABASE_URL`, `PGPASSWORD`, or `BACKUP_ENCRYPTION_KEY`; static, value-free error messages. |
| **Internal schema exposure** | Make the PostgREST `public,api`-only check a first-class gate; the app/wrapper reads through the `api` facade only; internal schemas stay internal. |
| **Tenant isolation regression** | Do not change RLS, the facade, or write SQL; keep the non-member isolation check in the verification step; treat any isolation failure as a hard `fail`. |
| **Destructive local DB operation** | No `db reset`, no migrations, no destructive SQL; preflight is read-only/metadata-only; the only writer remains the frozen, gated `onboard-commit.ts`. |
| **Overengineering** | Ship the smallest slice (§10); compose existing modules instead of rewriting; defer JSON report, run id, and richer UX to the professional tier; no Cloud abstractions yet. |

---

## 10. Recommended next implementation slice (Stage 4A)

Keep it minimal and reviewable:

**Stage 4A — pure preflight aggregator (no I/O side effects, not wired into the
commit path).**

- Add `packages/db/scripts/onboard-preflight.ts` exporting a **pure**
  `buildPreflightReport(inputs, deps)` that returns a structured
  `PreflightReport` (per-check `pass`/`fail`/`skip` + redacted `detail`) by
  composing the **existing** pure guards: `assertLocalDatabaseUrl`,
  `validateBackupArtifactForCommit`, an **absolute-path** check, and a
  host-only `NEXT_PUBLIC_SUPABASE_URL` check. All external effects
  (`pg_dump`/PostgREST probes, env reads) are **injected** and **stubbed** in
  Stage 4A — no real probes yet.
- Add `packages/db/scripts/onboard-preflight.test.ts` covering the all-pass case
  and the §8 negative cases that are expressible without live probes
  (relative path, missing/empty backup, Cloud-like target, missing flags),
  asserting redaction.
- **No** CLI wiring, **no** new runtime probes, **no** changes to
  `onboard-commit.ts` / `onboard-write.ts`, **no** package-script change yet.

This delivers the structured safety core with zero operational risk; the wrapper
command, live probes, JSON report, and runbook updates follow in later slices
(4B+) once 4A is reviewed.
