# Supabase Legacy service_role → Current Secret API Key — Migration Runbook

- Status: **Active — Phase 1 (dual-support code) merged; Cloud steps not yet run.**
- Scope: **Cloud DEV only** (`line-business-os-dev` / `pehcoenozjtsjdvjietj`).
  Production is a separate project with its own independent keys and is **not
  touched** by this migration.
- Trigger: a DEV `service_role` credential was displayed in a Claude session
  and is treated as exposed. Founder decision (2026-08): do **not** rotate the
  legacy JWT signing secret; instead migrate privileged backend usage to the
  current **Secret API Key** model (`sb_secret_*`), then disable the exposed
  legacy `service_role` once all dependents are on the new key.

> **Do NOT rotate the JWT signing secret. Do NOT touch production. Do NOT
> disable the legacy `anon` key** — the browser + Preview app rely on it and
> it is not part of this closeout.

## 0. Dependency map (from the Phase 1 inventory)

| Consumer | Uses | After migration |
|---|---|---|
| `apps/web` (Preview + build) | **nothing** — anon key + RLS only. Founder verified Vercel has **no** `SUPABASE_SERVICE_ROLE_KEY`. | no change |
| CI / GitHub Actions | nothing — `.github/workflows/ci.yml` passes no Supabase secret | no change |
| `apps/api` / `apps/worker` deployed | not deployed anywhere (no deploy config in repo) | n/a |
| Edge Functions `liff-entry`, `invite-employee` | `SUPABASE_SERVICE_ROLE_KEY` (auto-injected) for Auth-Admin / pre-session reads | resolver prefers `SUPABASE_SECRET_KEYS["default"]`, falls back to legacy |
| Operator scripts `seed`, `oruwa-cafe-fixture` | `SUPABASE_SERVICE_ROLE_KEY` via `serverEnv()` → `createServiceClient()` | `SUPABASE_SECRET_KEY` preferred, legacy fallback |
| Local Supabase (`supabase start`) | the universal local-dev demo `service_role` JWT (non-secret) | **not migrated** — it is not a real credential |
| `packages/db/scripts/mame-to-cha-cloud-*` (`MAME_TO_CHA_CLOUD_*` vars) | legacy: `MAME_TO_CHA_CLOUD_SUPABASE_SERVICE_ROLE_KEY` | **NOT migrated.** Mame To Cha is a historical prototype/pilot, not part of the current ORUWA architecture (Founder, 2026-08). These scripts + `MAME_TO_CHA_*` env vars are deprecated tooling from a completed one-off provisioning campaign; not referenced by CI or any runtime (only their unit tests run, with fake clients / no real credentials). Do not add new `MAME_TO_CHA_*` secret variables. Candidate for deletion in a separate cleanup PR. |

## 1. What Phase 1 (this PR) changed — code only, no keys

- **Node/operator** (`@line-os/config`): `serverEnv()` now accepts **either**
  `SUPABASE_SECRET_KEY` (preferred, one `sb_secret_*` value) **or** the legacy
  `SUPABASE_SERVICE_ROLE_KEY` (temporary fallback). **At least one** must be
  set — a value-free config error otherwise. If **both** are set,
  `SUPABASE_SECRET_KEY` wins and the legacy key stays as an untriggered
  fallback (this is the intended rollback shape during the migration).
  `serverEnv().supabasePrivilegedKey` resolves it (secret key first);
  `supabasePrivilegedKeySource` records which was used. `packages/db`'s
  `createServiceClient()` reads `supabasePrivilegedKey`.
- **Edge Functions**: a shared `supabase/functions/_shared/supabase-secret-key.ts`
  resolver — reads `SUPABASE_SECRET_KEYS` (JSON), uses the `"default"` entry,
  falls back to `SUPABASE_SERVICE_ROLE_KEY`, fails closed with a value-free
  error, never logs the secret. Both `liff-entry` and `invite-employee` use it.
- **`mame-to-cha-cloud-*`**: deliberately **not touched** — deprecated,
  customer-specific pilot tooling (see the table above). Its unit tests still
  pass unchanged.
- **Guards**: the ESLint `no-restricted-syntax` guard now also blocks
  `process.env.SUPABASE_SECRET_KEY` / `SUPABASE_SECRET_KEYS`; `apps/web` may
  no longer import `@line-os/config/env` (only `@line-os/config/env/public`,
  browser-safe).
- **Bundle hygiene (was P3)**: the browser-safe schema is split into
  `@line-os/config/env/public`, so a client route can no longer drag the
  server-env zod schema (with the privileged-key field names) into the web
  bundle. Verified: those names no longer appear in `apps/web/.next/static/**`.
- **`.env.example`** / `supabase/functions/.env.example` document the new vars.

**Legacy support is NOT removed in Phase 1** — this is dual support so the
Cloud rollout can happen incrementally.

## 2. Cloud rollout — DO EACH PHASE, VERIFY, THEN PROCEED

> Every dashboard action is marked `[verify]` — confirm against the **current**
> Supabase dashboard / docs before doing it; the API-key UI and the exact
> behaviour of "disable legacy key" evolve.

### Phase A — create the DEV Secret API Key
1. `[verify]` Supabase dashboard → **project `pehcoenozjtsjdvjietj`** → Project
   Settings → API Keys → create a new **Secret key** (`sb_secret_*`).
2. Capture the value **directly into the password manager**. Never into a
   terminal, an editor buffer an assistant can read, a screenshot, a log, or
   chat.
3. Do **not** disable or delete anything yet.

### Phase B — update the operator local secret store

> **Which file.** The generic ORUWA server/operator secret store is the
> repo-root **`.env`** (gitignored by the `.env` / `.env.*` rules; only
> `.env.example` is tracked). It carries the generic, tenant-neutral variable
> names documented in `.env.example` and `docs/operations/env-inventory.md`;
> Cloud DEV uses those **same names** with Cloud DEV values.
>
> The repo-root **`.env.local`** and **`.env.cloud.local`** are **deprecated
> Mame To Cha tooling** (`MAME_TO_CHA_LOCAL_*` / `MAME_TO_CHA_CLOUD_*`), not
> generic ORUWA operator env files — do **not** put `SUPABASE_SECRET_KEY` in
> them and do **not** extend them (see §0). Nothing in `packages/db` loads any
> env file automatically; `serverEnv()` reads `process.env`, so the operator
> populates the environment themselves (e.g. a dot-sourced `.env`, or
> PowerShell session vars from the password manager).

4. In the repo-root gitignored **`.env`** (create it from `.env.example` if it
   does not exist): set `SUPABASE_SECRET_KEY=<new sb_secret_*>` alongside the
   other generic Cloud DEV values (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `DATABASE_URL`, `PII_ENCRYPTION_KEY`, `PII_HASH_PEPPER`, `LINE_*`). Leave
   `SUPABASE_SERVICE_ROLE_KEY` in place for now — with both set,
   `SUPABASE_SECRET_KEY` is used and the legacy key is the untriggered
   rollback fallback.
5. Smoke one privileged operator path with the new key, e.g.
   `pnpm exec supabase migration list --linked` (unchanged) plus a dry-run of
   an onboarding/seed script if practical. Confirm success (the diagnostic
   `supabasePrivilegedKeySource` should read `secret_key`).

### Phase C — Edge Functions on the new resolver
6. Merge this PR (Phase 1 code) to `dev`.
7. `[verify]` Set the DEV project's Edge Function secret **`SUPABASE_SECRET_KEYS`**
   to a JSON object with a `"default"` entry pointing at the new secret key —
   via the Supabase dashboard (Edge Functions → Secrets) or
   `supabase secrets set SUPABASE_SECRET_KEYS='{"default":"<new-secret-key>"}'`
   (Founder-run; the agent cannot). If the platform already injects
   `SUPABASE_SECRET_KEYS` automatically for the new key, `[verify]` its shape
   and skip the manual set.
8. `[verify]` Deploy both functions from `dev`:
   `supabase functions deploy liff-entry invite-employee` (Founder-run).
9. The resolver will now pick `SUPABASE_SECRET_KEYS["default"]`; the legacy
   env var remains as an untriggered fallback.

### Phase D — verify (see §3)

### Phase E — disable the exposed legacy `service_role`
10. Only after §3 fully passes: `[verify]` in the DEV project's dashboard,
    disable/revoke the **legacy `service_role` key** (NOT the JWT signing
    secret; NOT the `anon` key). If the legacy system only supports a JWT
    signing-secret roll (which also invalidates `anon`), **STOP and escalate
    to the Founder** — that is a different, wider operation than this closeout
    authorises.
11. Re-run §3. The Edge Functions and operator scripts must still work purely
    on the new key.
12. Remove `SUPABASE_SERVICE_ROLE_KEY` from the operator local store (repo-root
    `.env`) and the DEV Edge Function secrets.

### Phase F — later: remove the fallback from the repo
13. A follow-up PR deletes the legacy branch from `resolveSupabaseSecretKey`,
    makes `SUPABASE_SECRET_KEY` required in `serverEnv()`, drops
    `SUPABASE_SERVICE_ROLE_KEY` from the schema / `.env.example` / `turbo.json`,
    and tightens the ESLint guard message. Only after Cloud DEV has run clean
    on the new key for a sensible bake period. **Separately** (or in the same
    cleanup PR): delete the deprecated `packages/db/scripts/mame-to-cha-cloud-*`
    tooling + `MAME_TO_CHA_*` env vars — Mame To Cha is a retired pilot, not
    current architecture.

## 3. Verification checklist (run after Phase C, again after Phase E)

- **Preview `/api/health`** → `200` `{app/config/supabase: ok}` (catches an
  accidental `anon` break too).
- **App login** on Preview → succeeds; a protected dashboard page renders real
  tenant-scoped data (browser anon + RLS path).
- **`invite-employee`** → invite a test employee on a DEV smoke tenant →
  succeeds (proves the new privileged key reached the function).
- **`liff-entry`** → exercise the LIFF entry path if practical → succeeds.
- **Operator script** → run one privileged path (`supabase migration list
  --linked`, or a seed/onboarding dry-run) with only `SUPABASE_SECRET_KEY` set
  → succeeds.
- **Browser has no privileged key** → grep the deployed Preview client bundle
  / check DevTools for any `sb_secret_` or 3-part JWT with a privileged role →
  only the public anon key is present.
- **Production untouched** → `supabase projects list` shows `jsgmmsdkuptdsxtcxhsv`
  unchanged; no production deploy triggered.

## 4. Rollback

- Phase C fails: the resolver's legacy fallback still works — unset/clear
  `SUPABASE_SECRET_KEYS` (or fix its JSON) and the functions revert to the
  legacy key. Re-deploy if needed.
- Phase B fails: in repo-root `.env`, clear or comment out `SUPABASE_SECRET_KEY`
  and keep `SUPABASE_SERVICE_ROLE_KEY` set — `serverEnv()` falls back to
  `legacy_service_role` with no other change.
- Phase E is the only irreversible step. Do not do it until §3 has passed
  twice and the new key has baked. If it is done and something breaks,
  create a fresh `sb_secret_*` key (Phase A again) rather than un-disabling.

## 5. Explicit non-goals

- **No JWT signing-secret rotation.**
- **No production project change.**
- **No `anon` key change.**
- **No `db push` / `migration repair` / RLS / migration change.**
- **No removal of legacy support in this phase** (that is Phase F).
