# Operations module-ON smoke — Cloud DEV runbook (Step 4)

**Status:** ready to run · **Environment:** Supabase Cloud DEV **only**
(`line-business-os-dev` / `pehcoenozjtsjdvjietj`) · **Production:** do not touch.

## Purpose

Prove on Cloud DEV that the existing Operations foundation (migrations
`0099`–`0105`, `0111`, applied to Cloud DEV 2026-08-29) can be **enabled for a
dedicated smoke tenant** without breaking tenant isolation, location isolation,
RBAC, RLS, the module-entitlement boundary, existing Cafe behaviour, or any
other tenant.

This is **not** Operations UI, **not** Cafe HACCP content, **not** WP1
completion. It is the go/no-go gate before Manager/Staff Operations UX work.

## What "Operations ON" actually is

`core.has_module_access(tenant_id, 'operations')` (migration `0093`) is a pure
lookup of `core.tenant_modules.is_enabled` for `(tenant_id, module='operations')`.
It is **fail-closed**: no row ⇒ no access. It is ANDed with
`core.has_permission[_in_tenant](...)` and a domain/location rule on every
tenant-facing RLS policy, `api.*` view, and `api.operations_*` RPC.

`core.module_registry` lists `operations` as lifecycle `beta` (migration `0111`)
— that is metadata + the `core.can_enable_module()` pre-check only, **not** the
runtime gate. Entitlement/plan gating is deliberately **not** wired into
`has_module_access`.

So "enable Operations for smoke-tenant-b" =

```sql
insert into core.tenant_modules (tenant_id, module, is_enabled)
values ('<smoke-tenant-b uuid>', 'operations', true)
on conflict (tenant_id, module) do update set is_enabled = true;
```

and nothing else. `core` is **not** exposed to PostgREST, so this is a direct
Postgres write (psql), not an `api.*` call.

## Smoke tenant — resolved automatically, no Studio lookup

| Field | Value |
|---|---|
| tenant slug | `smoke-tenant-b` (stable identity; how the script finds it) |
| tenant uuid | `37088bfe-14f9-4604-af39-61dd09d37b0c` (cross-check anchor — must match the slug) |
| kind | `demo` (enforced) |
| location | the tenant's single `core.locations` row (auto-resolved) |

STEP 0b of the script resolves the tenant **by slug**, then requires: exactly
one match, `kind = 'demo'`, and that its id equals the recorded uuid anchor —
any disagreement **fails closed before any write**. The location is the tenant's
one `core.locations` row; 0 or >1 ⇒ fail (pass `-v smoke_location=<uuid>`). You
never open Supabase Studio to look anything up.

For a deliberately different smoke tenant, override slug **and** uuid together:
`-v smoke_tenant_slug=<slug> -v smoke_tenant=<uuid>`.

## Two-layer target guard — proves it is on Cloud DEV, not Production

Supabase exposes **no project-ref signal to the Session-pooler `postgres`
role**: `current_user` is plain `postgres` (Supavisor strips the `.<ref>`),
`_realtime.tenants` is not readable, and that role cannot `ALTER DATABASE …
SET` a marker. The target is therefore proven by **two layers**:

**LAYER 1 — `scripts/smoke/operations-cloud-dev-module-on-smoke.ps1` (the
wrapper the operator runs).** It reads the operator's existing gitignored Cloud
DEV connection string, and *client-side*:
- removes URI query parameters native `psql`/libpq rejects — notably
  `uselibpqcompat` (a **node-postgres** option, not a libpq one; libpq errors
  out on any unknown URI parameter). Only libpq-valid keys are kept.
- verifies the string contains the Cloud DEV ref `pehcoenozjtsjdvjietj`, does
  **not** contain the Production ref `jsgmmsdkuptdsxtcxhsv`, and has the
  Supabase pooler shape (`postgres.<ref>` user, `*.pooler.supabase.com` host,
  `:5432`/`:6543`, a db name).
- passes the verified ref to `psql` as `-v wrapper_verified_ref=<ref>`.

It never prints the URL or password and clears them from memory on exit.

**LAYER 2 — the SQL smoke (STEP 0a), before any `INSERT`/`UPDATE`.** It accepts
the wrapper's `wrapper_verified_ref` (still re-checked against the Production
ref), **plus** any database-side signal that happens to be available (an
`oruwa.cloud_target_ref` marker, the pooler username, `_realtime.tenants` — all
subject to a Production tripwire). Decision is **fail closed**: Production ref on
any signal ⇒ abort; any signal ≠ `pehcoenozjtsjdvjietj` ⇒ abort; expected ref
confirmed by the wrapper or a DB-side signal ⇒ proceed; nothing provable ⇒
abort. There is no bare "I promise this is DEV" flag — `wrapper_verified_ref` is
the wrapper's channel and the wrapper is a reviewed repo artifact.

## The smoke script — `scripts/smoke/operations-cloud-dev-module-on-smoke.sql`

Self-contained. **Commits nothing** — the whole run is one transaction that ends
in `ROLLBACK`. After the two STEP 0 gates it creates synthetic actors (a
tenant-wide Manager, an L1-scoped Employee, an L2-only Manager, a Manager on a
throw-away disabled tenant, and a Manager on a second throw-away *enabled*
tenant used to prove cross-tenant write denial past the module gate), seeds a
template into each throw-away tenant so the isolation assertions have real data
to hide, enables `operations` for the smoke tenant, runs every Step-4 scenario
as a real `authenticated` role-hop through the `api.*` facade, then rolls
everything back. No Supabase Auth users are created. No cleanup step is needed
because nothing is committed.

### Run it — ONE command (Founder / operator)

```powershell
# From the repo root. Reads .env.cloud.local -> MAME_TO_CHA_CLOUD_DATABASE_URL,
# fixes the URI for libpq, verifies DEV/Production refs, runs the smoke.
powershell -NoProfile -File scripts\smoke\operations-cloud-dev-module-on-smoke.ps1
```

Nothing prints the connection string or password. `psql` exit `0` + the
`ALL SCENARIOS PASSED` banner = PASS; any `ERROR:` (non-zero exit) names the
failing scenario and the transaction has rolled back, leaving Cloud DEV
untouched.

**Local mirror** (validating the mechanism against local Supabase):
`powershell -NoProfile -File scripts\smoke\operations-cloud-dev-module-on-smoke.ps1 -AllowLocal`
(or run `operations-cloud-dev-module-on-smoke.sql` directly with
`-v ON_ERROR_STOP=1 -v allow_local=1`). `pgTAP`
`supabase/tests/0055_operations_module_on_smoke.sql` is the other local check.

**psql only** for the `.sql` — it uses psql meta-commands and will not run in
the Studio SQL Editor.

### Expected output (stderr NOTICEs + final banner)

```
wrapper: connection string OK - Cloud DEV ref pehcoenozjtsjdvjietj present, Production ref absent, Supabase pooler structure verified.
wrapper: dropped non-libpq URI query parameter(s): uselibpqcompat
NOTICE:  CLOUD_TARGET = PASS (LAYER 1: connection string verified Cloud DEV ... by the repo wrapper ...)
NOTICE:  PREFLIGHT OK: tenant="smoke-tenant-b" id=37088bfe-... (kind=demo) location=...
NOTICE:  OPERATIONS_MODULE_ON = PASS
NOTICE:  ENABLED_TENANT = PASS (templates N -> N+1, expected_tasks callable)
NOTICE:  DISABLED_TENANT = PASS (explicit is_enabled=false: no facade read, no base-table read, write RPC fails closed)
NOTICE:  CROSS_TENANT_ISOLATION = PASS (no cross read; cross write denied by permission + RLS; N smoke rows visible)
NOTICE:  ROLE_BOUNDARY = PASS (employee: read yes, configure no, resolve no, execute yes)
NOTICE:  LOCATION_BOUNDARY = PASS (L1-scoped template invisible + immutable to an L2-only actor)

==================================================================
 OPERATIONS CLOUD DEV MODULE-ON SMOKE — ALL SCENARIOS PASSED
 ...
ROLLBACK
```

**PASS** = psql exits `0` and the banner prints. **FAIL** = any `RAISE
EXCEPTION` (non-zero exit); the message names the failing scenario. Because the
transaction rolls back, a failed run leaves Cloud DEV exactly as it was.

### Scenario ↔ Step-4 mapping

| Step-4 scenario | Script check | Category |
|---|---|---|
| A — enabled tenant | Manager reads `api.operations_templates`, creates a template via `api.operations_create_template`, calls `api.operations_expected_tasks` | `ENABLED_TENANT` |
| B — disabled tenant | synthetic tenant, **explicit `is_enabled = false`**, seeded with a real template: 0 rows via the facade **and** via the base table (RLS), **and** `api.operations_create_template` ⇒ `operations_module_disabled`. (The missing-row branch is covered by the local pgTAP.) | `DISABLED_TENANT` |
| C — cross-tenant | smoke Manager sees 0 rows of an unrelated OFF tenant *and* an unrelated **enabled** tenant (both seeded); unfiltered read returns only smoke rows; a cross-tenant create **into the enabled tenant** ⇒ `operations_permission_denied` (denied by permission/RLS, past the module gate); raw cross-tenant INSERT rejected by RLS `WITH CHECK` | `CROSS_TENANT_ISOLATION` |
| D — role boundary | Employee: read yes; `create_template` ⇒ `operations_permission_denied`; holds `task.execute`, not `exception.resolve` | `ROLE_BOUNDARY` |
| E — location boundary | L1-scoped template invisible to an L2-only Manager and 0 rows on his UPDATE | `LOCATION_BOUNDARY` |
| secret safety | by construction — no key/secret/PII column is read, no connection string echoed (not a runtime scenario) | — |

## If a persistent enable is ever wanted (NOT this step)

To click Operations through on Vercel Preview you would need a **committed**
`core.tenant_modules` row for the smoke tenant (and real Auth users). That is a
separate, explicitly Founder-approved action. These are plain SQL statements
(Studio SQL editor is fine). To do it and then undo it:

```sql
-- enable (persistent)
insert into core.tenant_modules (tenant_id, module, is_enabled)
values ('37088bfe-14f9-4604-af39-61dd09d37b0c', 'operations', true)
on conflict (tenant_id, module) do update set is_enabled = true;

-- ... verify ...

-- disable again (data is preserved, just hidden)
update core.tenant_modules set is_enabled = false
where tenant_id = '37088bfe-14f9-4604-af39-61dd09d37b0c' and module = 'operations';
```

`is_enabled = false` (not `delete`) matches the pgTAP-proven ON→OFF→ON
lifecycle: templates/items/history stay in storage, hidden, and reappear
unchanged if re-enabled.

## Local mirror

Two ways to exercise this locally:

- `supabase/tests/0055_operations_module_on_smoke.sql` — pgTAP, runs in
  `pnpm exec supabase test db`; the same Step-4 scenario matrix on a fixture
  shaped like the Cloud DEV smoke tenants.
- The Cloud script itself against local Supabase, with `-v allow_local=1`
  (honoured **only** when the target proves to be local Supabase — Realtime id
  `realtime-dev`; it can never let a Production or unknown target through):

  ```bash
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
    -v ON_ERROR_STOP=1 -q -v allow_local=1 \
    -f scripts/smoke/operations-cloud-dev-module-on-smoke.sql
  ```

  A local `smoke-tenant-b` (slug, `kind=demo`, one location) must exist first.

Keep the pgTAP mirror and the Cloud script scenario list in sync.
