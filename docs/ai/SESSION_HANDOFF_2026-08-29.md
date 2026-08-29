# Session Handoff — 2026-08-29 (Operations WP1 close-out → Platform Foundation reconciliation → Cloud DEV rollout → service_role security closeout)

This session ran one long thread. It is now paused because the chat is full.
Everything below is the state to resume from. Read `docs/ai/current-task.md` §5
first, then this file.

## 1. What shipped this session (all merged to `dev` unless noted)

| PR | What | State |
|---|---|---|
| #462 / #463 | Operations schedule effective-dated versioning + guard-floor (`0102`/`0103`) | merged |
| #464 | Operations template retirement dating (`0104`) — fixes template-deactivation history erasure | merged |
| #465 | Operations Configuration API (`0105`) — 9 `api.*` config RPCs; F2 raw-backdated-schedule + `effective_to` elapsed-forward + `is_active`/`retired_on` coherence + `response_type` freeze | merged (`d9907ea`) |
| #466 | **Platform Foundation ↔ dev reconciliation** — forward-only migrations `0106`–`0113` | merged (`ae515fd`) |
| #467 | docs: record #466 independent-review PASS | merged (`7fda53f`) |
| **#468** | **Supabase legacy `service_role` → current Secret API Key — Phase 1 (dual-support code)** | **OPEN — awaiting Founder merge** |
| this file | session handoff | on branch `docs/session-handoff-2026-08-29`, PR pending |

## 2. Platform Foundation reconciliation — DONE and APPLIED to Cloud DEV

Full record: `docs/ai/PLATFORM_FOUNDATION_RECONCILIATION_HANDOFF_2026-08-29.md`.

- **Forensic finding:** `main`'s historical `0069`–`0073` Platform Foundation
  (Entitlements, Module Registry, Shared Settings, Notifications, Event Bus)
  was pushed to Cloud DEV 2026-08-16, then `migration repair --status reverted
  0060 0070 0071 0072 0073` (PR #329, 2026-08-20) hid it in Cloud DEV's
  **ledger** while every schema object stayed physically present (verified
  byte-exact). Side effect: `dev`'s own `0069`
  (`my_pending_employee_invitations` workforce identity-leak fix — a
  *different* migration) never reached Cloud DEV.
- **Founder decision:** Option A — `dev` is authoritative; re-express the
  retained Foundation as new forward-only migrations `0106`–`0113`; no
  `migration repair`, no restoring old files, no historical edits; `main`
  reconciliation is a separate future task.
- **`0106`–`0113`** (all dual-target: fresh `db reset` creates, Cloud DEV
  converges idempotently — verified):
  - `0106` entitlements — **`core.has_module_access` deliberately NOT changed**
    (dev's `0093` simple form is canonical; plan-lifecycle wiring deferred).
  - `0107` module_registry (+ nav cols) + `can_enable_module` (pre-check, NOT
    the runtime gate).
  - `0108` `core.tenant_settings` + `core.settings.manage`.
  - `0109` notifications outbox · `0110` events append-only bus.
  - `0111` register `operations` in `module_registry` (`beta`, no deps, nav
    NULL) — **does NOT enable it for any tenant**.
  - `0112` re-home dev `0069`'s `my_pending_employee_invitations` RPCs.
  - `0113` current-dev-`0081` `upsert_workforce_recipe` body + one-line
    tenant-wide `location_id IS NULL` fix (keeps `archived` status).
- Independent review: **PASS, no P0/P1/P2** (3 non-blocking P3s in the handoff §13).
- **Cloud DEV: `0099`–`0113` APPLIED by the Founder** (`supabase db push`).
  Post-apply verification **PASSED** — ledger head `0113`, Operations schema +
  6 tables + 16 `api.operations_*` fns + 5 views present, `operations`
  `module_registry` row = `beta`, **zero `operations` `tenant_modules` rows
  (no tenant enabled)**, `has_module_access` still the simple `0093` form, all
  9 Foundation tables + 18 RLS policies intact, `tenant_plans` (4, all
  `standard/active`) + `entitlement_plans` (3) untouched, `/api/health` 200,
  Workforce/Inventory/Purchases row counts unchanged.

**Cloud DEV is now fully reconciled with `dev` through `0113`.** The ledger
still marks `0060`/`0070`–`0073` reverted (cosmetic — those objects are now
covered by `0106`–`0110`'s content); a future `supabase db diff` / `db pull`
against Cloud DEV will still be noisy on those 5 numbers.

## 3. Operations module — where it stands

- Backend + config API complete, migrations `0099`–`0113` on `dev` AND Cloud
  DEV. `operations` registered as `beta` in `module_registry`.
- **Module OFF for every tenant** — no `core.tenant_modules` `operations`
  row anywhere. `has_module_access` fail-closed.
- **Module-ON functional smoke was NOT performed** — this session had no
  Cloud DEV write path (agent is permission-denied from `db push`/`link`,
  and there is no `supabase db execute`). The exact enable→smoke→cleanup→disable
  runbook is in `docs/ai` (the "OPERATIONS CLOUD DEV MODULE-ON SMOKE REPORT"
  produced this session) — the safe test tenant is **`smoke-tenant-b`**
  (`37088bfe-14f9-4604-af39-61dd09d37b0c`, `kind=demo`, has one location
  `Smoke Cafe B` `a902c7f6…`; needs a plain `employee`-role user added for the
  Staff-denial sub-test, and a `core.billing.manage` holder or `postgres`
  access for the `tenant_modules` insert). **Founder-run or a Cloud-write
  session must do this before Operations is considered proven on Cloud.**
- **NOT started:** Cafe HACCP preset content; Manager/Staff Operations UI;
  Manager Attention integration. Each its own Founder prompt.

## 4. Supabase service_role security closeout — IN PROGRESS

Full record: `docs/operations/supabase-secret-key-migration-runbook.md` +
memory `project_supabase_secret_key_migration`.

- **Why:** a Cloud DEV `service_role` key was displayed in an earlier Claude
  session → treated as exposed. Founder decision: do **NOT** rotate the legacy
  JWT signing secret; migrate privileged backend usage to Supabase's current
  **Secret API Key** (`sb_secret_*`) model, then disable the exposed legacy key
  once all dependents are migrated. Do **NOT** touch production, the JWT
  signing secret, or the legacy `anon` key.
- **Dependency inventory (done, read-only):** the DEV service_role is used by
  (a) the 2 Cloud Edge Functions `liff-entry` / `invite-employee` (Supabase
  auto-injects it), and (b) manually-run operator scripts (`seed`,
  `oruwa-cafe-fixture`). **NOT** used by `apps/web` runtime, CI, or any
  deployed `apps/api`/`apps/worker`. Founder verified **Vercel has NO
  `SUPABASE_SERVICE_ROLE_KEY`** → no Vercel change needed. DEV
  (`pehcoenozjtsjdvjietj`) and prod (`jsgmmsdkuptdsxtcxhsv`) are separate
  projects with independent per-project keys.
- **Mame To Cha** (`packages/db/scripts/mame-to-cha-cloud-*` + `MAME_TO_CHA_*`
  env vars): Founder — retired pilot, not current architecture. **Left
  untouched**; documented in the runbook as deprecated tooling / cleanup-PR
  candidate.
- **PR #468 (Phase 1, code only, OPEN):**
  - `@line-os/config` `serverEnv()` accepts `SUPABASE_SECRET_KEY` (preferred)
    OR legacy `SUPABASE_SERVICE_ROLE_KEY` (fallback); exactly one required.
    `serverEnv().supabasePrivilegedKey` + `.supabasePrivilegedKeySource`.
    `packages/db` `createServiceClient()` uses it.
  - Edge resolver `supabase/functions/_shared/supabase-secret-key.ts` (pure
    TS): `SUPABASE_SECRET_KEYS` JSON `"default"` → legacy fallback →
    value-free fail-closed; never logs the secret. Both functions use it.
  - ESLint guard extended (`SUPABASE_SECRET_KEY`/`SECRET_KEYS`); `apps/web`
    restricted to `@line-os/config/env/public`.
  - **Fixed the prior P3:** split browser-safe env into
    `@line-os/config/env/public` — the server-env zod schema no longer bundles
    into client chunks (verified clean in `.next/static/**`).
  - **No legacy removal** (dual support). Independent review: **PASS, no
    P0/P1/P2**; P3-c fixed, P3-a kept intentional, P3-b (config test refs a
    `supabase/functions` test file across the package boundary — a glob fix
    broke discovery under pnpm/turbo on Windows, so the explicit 2-file list
    stays) documented.
  - `turbo run typecheck lint build test` — **30/30**.
- **Phases A–F (Founder-run Cloud steps) — NOT started:** A create DEV
  `sb_secret_*` → B update operator local secret store → C set
  `SUPABASE_SECRET_KEYS` on the DEV Edge Functions + `supabase functions
  deploy liff-entry invite-employee` → D verify → E disable the exposed
  legacy `service_role` → F later PR removes the fallback from the repo +
  deletes the deprecated mame-to-cha tooling.

## 5. Immediate next steps (pick up here)

1. **Merge PR #468** (Founder review — RED-path-ish? No: pure code/config, no
   migration, no Cloud write. Standard review + merge).
2. **Merge this handoff doc PR** (`docs/session-handoff-2026-08-29`).
3. **Founder runs secret-key migration Phases A–E** per the runbook (create
   `sb_secret_*`, update operator local store, set `SUPABASE_SECRET_KEYS` +
   deploy the 2 Edge Functions, verify, disable the exposed legacy key).
4. **Operations module-ON smoke on Cloud DEV** (`smoke-tenant-b`) — Founder-run
   or a Cloud-write session, per the smoke runbook from this session.
5. **Then** the product backlog: Cafe HACCP presets and/or Manager/Staff
   Operations UI (each its own Founder prompt), OR whatever the Founder
   prioritises.
6. **Deferred / tracked:**
   - Phase F cleanup PR: remove the secret-key legacy fallback + delete
     `packages/db/scripts/mame-to-cha-cloud-*` + `MAME_TO_CHA_*` env vars.
   - `main` branch reconciliation / release governance (separate future task).
   - The 3 Foundation-reconciliation P3s (handoff §13) → mandatory inputs for
     the future Operations Configuration write-path / a tenant-limit-view UI.
   - Operations schedule `effective_to` forward-advance-once-elapsed asymmetry
     (sibling of the P2 fixed in `0104`) — for the Operations Config API slice.
   - `response_type` freeze enforcement + schedule raw-INSERT F2 — for the
     same Config API slice.

## 6. Hard rules carried into the next session

- Founder-facing language: **Russian** (AGENTS.md).
- **No autonomous merge of a RED-path (migration) PR.** #468 is not RED-path
  but still leave the final merge to the Founder.
- **No Cloud DEV writes** by the agent — `db push` / `link` / `db pull` /
  `migration repair` are permission-denied and every Cloud write this project
  has ever done was Founder-run.
- **No `main` changes. No production. No JWT signing-secret rotation. No
  `anon` key changes.**
- **Do not extend the `MAME_TO_CHA_*` convention** — it is deprecated.
- Cloud DEV backup from this session:
  `D:\Dev\oruwa-backups\2026-08-29-pre-platform-reconciliation\`
  (schema + data + roles; **NOT** Storage object bytes).
